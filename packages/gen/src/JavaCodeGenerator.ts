/**
 * JavaCodeGenerator — TypeScript port of Java `configgen.genjava.code.JavaCodeGenerator`.
 *
 * Generates Java code (structs, interfaces, tables, enum/entry classes,
 * ConfigMgr, ConfigLoader, ConfigMgrLoader, optional Text) into `dir/pkg/` directory.
 *
 * Differences from Java:
 * - `generate(ctx)` is async (Promise<void>)
 * - No concurrency (TS single-threaded; Java used work-stealing pool)
 * - No COPY_FILES copy (TS version only generates template code, not runtime sources)
 * - No configgenDir copy (not needed in TS)
 * - No GenConfigCodeSchema.generateAll (not ported)
 * - No schemaNumPerFile (not ported)
 *
 * Java source: configgen.genjava.code.JavaCodeGenerator.java (283 lines)
 */

import * as path from 'path';
import * as fs from 'fs';

import { CachedFiles } from '@cfggen/shared';
import type { Context } from '@cfggen/context';
import type { CfgValue, VTable } from '@cfggen/value';
import type { CfgData } from '@cfggen/data';
import { StructSchema, InterfaceSchema, isEEnum, isENo } from '@cfggen/schema';
import type { EntryBase } from './JavaEntryOrEnumModel';
import type { LangSwitchable } from '@cfggen/i18n';
import type { Parameter } from './Parameter';
import { GeneratorWithTag } from './GeneratorWithTag';
import {
  NameableName,
  setCodeTopPkg,
  setBeautifulName,
  setIsSealedInterface,
  setIsLangSwitch,
  isEnumAndHasOnlyPrimaryKeyAndEnumStr,
  getCodeTopPkg,
} from './JavaName';
import { sourceCommentOf } from './JavaSourceComment';
import { JavaStructuralClassModel } from './JavaStructuralClassModel';
import { JavaInterfaceModel } from './JavaInterfaceModel';
import { JavaEntryOrEnumModel } from './JavaEntryOrEnumModel';
import { JavaConfigMgrLoaderModel } from './JavaConfigMgrLoaderModel';
import { JavaTextModel } from './JavaTextModel';
import {
  genStructuralClass,
  genInterface,
  genEntryOrEnumClass,
  genConfigMgr,
  genConfigLoader,
  genConfigMgrLoader,
  genTableBuilder,
  genText,
} from './javaTemplates';

export class JavaCodeGenerator extends GeneratorWithTag {
  readonly dir: string;
  readonly pkg: string;
  readonly encoding: string;
  readonly sealed: boolean;
  readonly beautifulName: boolean;
  readonly buildersFilename: string | null;

  private dstDir!: string;
  private needBuilderTables: Set<string> | null = null;

  constructor(parameter: Parameter) {
    super(parameter);
    this.dir = parameter.get('dir', 'config');
    this.pkg = parameter.get('pkg', 'config');
    this.encoding = parameter.get('encoding', 'UTF-8');
    this.sealed = !parameter.has('noSealed');
    this.beautifulName = parameter.has('beautifulName');
    this.buildersFilename = parameter.getOrNull('builders');
  }

  async generate(ctx: Context): Promise<void> {
    const cfgValue: CfgValue = ctx.makeValueWithTag(this.tag);
    const cfgData = ctx.cfgData();
    this.dstDir = path.join(this.dir, this.pkg.replace('.', '/'));

    // Set static state for name resolution
    setCodeTopPkg(this.pkg);
    setIsSealedInterface(this.sealed);
    setBeautifulName(this.beautifulName);
    const isLangSwitch = ctx.nullableLangSwitch() !== null;
    setIsLangSwitch(isLangSwitch);

    // Read builder tables file if specified
    if (this.buildersFilename !== null) {
      this.readNeedBuilderTables();
    }

    // Collect table data names and setAllRefs in order
    const tableDataNames: NameableName[] = [];
    const setAllRefsInMgrLoader: string[] = [];

    // Generate struct/interface classes (sequential, no concurrency needed)
    for (const nameable of cfgValue.schema.items()) {
      if (nameable instanceof StructSchema) {
        this.generateStructClass(nameable);
      } else if (nameable instanceof InterfaceSchema) {
        this.generateInterfaceClass(nameable);
        for (const impl of nameable.impls()) {
          this.generateStructClass(impl);
        }
      }
      // TableSchema: skip (handled in table loop below)
    }

    // Generate table classes
    for (const vtable of cfgValue.tables()) {
      this.generateTableClass(vtable, cfgData, tableDataNames, setAllRefsInMgrLoader);
    }

    // Generate Text.java if multi-language
    if (isLangSwitch) {
      const langSwitch = ctx.nullableLangSwitch()!;
      this.generateTextFile(langSwitch);
    }

    // Generate ConfigMgr.java
    {
      const content = genConfigMgr(getCodeTopPkg(), tableDataNames);
      this.writeCode('ConfigMgr.java', content);
    }

    // Generate ConfigLoader.java
    {
      const content = genConfigLoader(getCodeTopPkg());
      this.writeCode('ConfigLoader.java', content);
    }

    // Generate ConfigMgrLoader.java
    {
      const model = new JavaConfigMgrLoaderModel(cfgValue, setAllRefsInMgrLoader);
      const content = genConfigMgrLoader(model);
      this.writeCode('ConfigMgrLoader.java', content);
    }

    // Clean up files not in keep set
    CachedFiles.keepMetaAndDeleteOtherFiles(this.dstDir);
  }

  private readNeedBuilderTables(): void {
    const fn = this.buildersFilename!;
    if (fs.existsSync(fn)) {
      try {
        this.needBuilderTables = new Set();
        const content = fs.readFileSync(fn, 'utf-8');
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed.length > 0) {
            this.needBuilderTables.add(trimmed);
          }
        }
      } catch {
        // Ignore read errors (Java logs and continues)
      }
    }
  }

  private generateStructClass(struct: StructSchema): void {
    const name = new NameableName(struct);
    const model = new JavaStructuralClassModel(
      struct,
      name,
      false,
      sourceCommentOf(struct, null),
    );
    const content = genStructuralClass(model);
    this.writeCode(name.path, content);
  }

  private generateInterfaceClass(iface: InterfaceSchema): void {
    const name = new NameableName(iface);
    const model = new JavaInterfaceModel(iface, name);
    const content = genInterface(model);
    this.writeCode(name.path, content);
  }

  private generateTableClass(
    vTable: VTable,
    cfgData: CfgData,
    tableDataNames: NameableName[],
    setAllRefsInMgrLoader: string[],
  ): void {
    let isNeedReadData = true;
    let dataPostfix = '';
    const schema = vTable.schema;

    // Get raw sheet IDs for source comment
    const dTable = cfgData.getDTable(vTable.name());
    const rawSheetIds = dTable
      ? dTable.rawSheets.map((s) => s.id())
      : [];
    const sourceComment = sourceCommentOf(schema, rawSheetIds);

    // Check if entry is EEntry or EEnum (not ENo)
    if (!isENo(schema.entry)) {
      const entryBase = schema.entry as EntryBase;
      let entryPostfix = '';
      const isEnum = isEEnum(entryBase);
      if (isEnum) {
        if (isEnumAndHasOnlyPrimaryKeyAndEnumStr(schema)) {
          isNeedReadData = false;
        } else {
          dataPostfix = '_Detail';
        }
      } else {
        entryPostfix = '_Entry';
      }

      const name = new NameableName(schema, entryPostfix);
      if (isNeedReadData) {
        setAllRefsInMgrLoader.push(name.fullName);
      }
      const dataName = new NameableName(schema, dataPostfix);
      const model = new JavaEntryOrEnumModel(
        vTable,
        entryBase,
        name,
        isNeedReadData,
        dataName,
        sourceComment,
      );
      const content = genEntryOrEnumClass(model);
      this.writeCode(name.path, content);
    }

    if (isNeedReadData) {
      const name = new NameableName(schema, dataPostfix);
      tableDataNames.push(name);
      const isTableNeedBuilder =
        this.needBuilderTables !== null &&
        this.needBuilderTables.has(vTable.name());

      const model = new JavaStructuralClassModel(
        schema,
        name,
        isTableNeedBuilder,
        sourceComment,
      );
      const content = genStructuralClass(model);
      this.writeCode(name.path, content);

      if (isTableNeedBuilder) {
        // Builder file: replace .java suffix with Builder.java
        const builderPath =
          name.path.substring(0, name.path.length - 5) + 'Builder.java';
        const builderContent = genTableBuilder(schema, name);
        this.writeCode(builderPath, builderContent);
      }
    }
  }

  private generateTextFile(langSwitch: LangSwitchable): void {
    const languages = langSwitch.languages().map((l) => l.toLowerCase());
    const model = new JavaTextModel(getCodeTopPkg(), languages);
    const content = genText(model);
    this.writeCode('Text.java', content);
  }

  private writeCode(fn: string, content: string): void {
    const filePath = path.join(this.dstDir, fn);
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    CachedFiles.writeFile(filePath, Buffer.from(content, 'utf-8'));
  }
}
