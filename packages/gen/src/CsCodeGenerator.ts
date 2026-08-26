/**
 * CsCodeGenerator — TypeScript port of Java `configgen.gencs.CsCodeGenerator`.
 *
 * Generates C# code (structs, interfaces, tables, processor, module loaders,
 * optional Text class) into `dir/pkg/` directory.
 *
 * Differences from Java:
 * - `generate(ctx)` is async (Promise<void>)
 * - No concurrency (TS single-threaded; Java used work-stealing pool)
 * - Resource file copy via fs.copyFileSync instead of Java FileUtil.copyFileIfNotExist
 * - CachedFiles.keepMetaAndDeleteOtherFiles for directory cleanup
 *
 * Java source: configgen.gencs.CsCodeGenerator.java (193 lines)
 */

import * as fs from 'fs';
import * as path from 'path';

import { CachedFiles, Logger, upper1 } from '@cfggen/shared';
import type { Context } from '@cfggen/context';
import type { CfgValue } from '@cfggen/value';
import type { CfgSchema } from '@cfggen/schema';
import { StructSchema, InterfaceSchema } from '@cfggen/schema';
import type { TableSchema } from '@cfggen/schema';
import type { VTable } from '@cfggen/value';
import type { LangSwitchable } from '@cfggen/i18n';
import type { Parameter } from './Parameter';
import { GeneratorWithTag } from './GeneratorWithTag';
import { CsStructModel } from './CsStructModel';
import { CsInterfaceModel } from './CsInterfaceModel';
import { CsModuleModel } from './CsModuleModel';
import { CsProcessorModel } from './CsProcessorModel';
import { CsName } from './CsName';
import {
  genStruct,
  genInterface,
  genProcessor,
  genServerText,
  genClientText,
  genModuleLoader,
} from './csTemplates';

export class CsCodeGenerator extends GeneratorWithTag {
  readonly dir: string;
  readonly pkg: string;
  readonly encoding: string;
  readonly prefix: string;
  readonly serverText: boolean;
  readonly unity: boolean;

  private dstDir!: string;
  isLangSwitch = false;

  constructor(parameter: Parameter) {
    super(parameter);
    this.dir = parameter.get('dir', 'Config');
    this.pkg = parameter.get('pkg', 'Config');
    this.encoding = parameter.get('encoding', 'UTF-8');
    this.prefix = parameter.get('prefix', 'D');
    this.serverText = parameter.has('serverText');
    this.unity = parameter.has('unity');
  }

  async generate(ctx: Context): Promise<void> {
    const cfgValue: CfgValue = ctx.makeValueWithTag(this.tag);
    const cfgSchema: CfgSchema = cfgValue.schema;

    this.dstDir = path.join(this.dir, this.pkg.replace('.', '/'));

    this.isLangSwitch = ctx.nullableLangSwitch() !== null;

    // Copy Loader.cs (or Loader.unity.cs for unity mode)
    this.copyLoaderFile();

    // Generate Processor.cs
    this.generateProcessor(cfgSchema);

    // Generate struct/interface/table files (sequential, no concurrency needed)
    for (const fieldable of cfgSchema.sortedFieldables()) {
      if (fieldable instanceof StructSchema) {
        this.generateStruct(fieldable);
      } else if (fieldable instanceof InterfaceSchema) {
        const iface = fieldable as InterfaceSchema;
        this.generateInterface(iface);
        for (const impl of iface.impls()) {
          this.generateStruct(impl);
        }
      }
    }

    for (const vTable of cfgValue.sortedTables()) {
      this.generateTable(vTable);
    }

    // Generate module loader files
    this.generateModuleLoaders(cfgSchema, cfgValue);

    // Generate Text.cs if multi-language
    if (this.isLangSwitch) {
      const langSwitch = ctx.nullableLangSwitch()!;
      this.generateText(langSwitch);
    }

    // Clean up files not in keep set
    CachedFiles.keepMetaAndDeleteOtherFiles(this.dstDir);
  }

  private copyLoaderFile(): void {
    const loaderSrc = this.unity ? 'Loader.unity.cs' : 'Loader.cs';
    const targetPath = path.join(this.dstDir, 'Loader.cs');

    if (!fs.existsSync(targetPath)) {
      const resourcePath = path.join(__dirname, 'resources', loaderSrc);
      if (fs.existsSync(resourcePath)) {
        // Ensure directory exists
        if (!fs.existsSync(this.dstDir)) {
          fs.mkdirSync(this.dstDir, { recursive: true });
        }
        fs.copyFileSync(resourcePath, targetPath);
        Logger.log('create file: ' + targetPath);
      } else {
        throw new Error('Loader resource not found at ' + resourcePath);
      }
    }

    // Keep the file so it won't be deleted by cleanup
    CachedFiles.keepFile(targetPath);
  }

  private generateInterface(sInterface: InterfaceSchema): void {
    const model = new CsInterfaceModel(this, sInterface);
    const content = genInterface(model);
    this.writeCode(model.name.path, content);
  }

  private generateStruct(structSchema: StructSchema): void {
    this.generateStructOrTable(structSchema, null);
  }

  private generateTable(vTable: VTable): void {
    this.generateStructOrTable(vTable.schema, vTable);
  }

  private generateStructOrTable(structural: StructSchema | TableSchema, nullableVTable: VTable | null): void {
    const model = new CsStructModel(this, structural, nullableVTable);
    const content = genStruct(model);
    this.writeCode(model.name.path, content);
  }

  private generateProcessor(cfgSchema: CfgSchema): void {
    const model = new CsProcessorModel(this, cfgSchema.sortedTables());
    const content = genProcessor(model);
    this.writeCode('Processor.cs', content);
  }

  private generateText(langSwitch: LangSwitchable): void {
    const languages = langSwitch.languages().map(upper1);
    const content = this.serverText
      ? genServerText(this.pkg, languages, this.unity)
      : genClientText(this.pkg, this.unity);
    this.writeCode('Text.cs', content);
  }

  private generateModuleLoaders(cfgSchema: CfgSchema, cfgValue: CfgValue): void {
    const modules = new Map<string, CsModuleModel>();

    // Process fieldables (structs, interfaces, interface impls)
    for (const fieldable of cfgSchema.sortedFieldables()) {
      if (fieldable instanceof StructSchema) {
        const sm = new CsStructModel(this, fieldable, null);
        const key = this.getModuleKey(sm.name);
        let mm = modules.get(key);
        if (!mm) {
          mm = new CsModuleModel(this, key);
          modules.set(key, mm);
        }
        mm.addStruct(sm);
      } else if (fieldable instanceof InterfaceSchema) {
        const im = new CsInterfaceModel(this, fieldable);
        const key = this.getModuleKey(im.name);
        let mm = modules.get(key);
        if (!mm) {
          mm = new CsModuleModel(this, key);
          modules.set(key, mm);
        }
        mm.addInterface(im);
        for (const impl of fieldable.impls()) {
          const sm = new CsStructModel(this, impl, null);
          mm.addStruct(sm);
        }
      }
    }

    // Process tables
    for (const vTable of cfgValue.sortedTables()) {
      const sm = new CsStructModel(this, vTable.schema, vTable);
      const key = this.getModuleKey(sm.name);
      let mm = modules.get(key);
      if (!mm) {
        mm = new CsModuleModel(this, key);
        modules.set(key, mm);
      }
      mm.addStruct(sm);
    }

    // Generate module loader files
    for (const mm of modules.values()) {
      const content = genModuleLoader(mm);
      this.writeCode(mm.outputFilePath(), content);
    }
  }

  private getModuleKey(name: CsName): string {
    const p = name.path;
    const slash = p.indexOf('/');
    return slash < 0 ? '' : p.substring(0, slash);
  }

  private writeCode(fn: string, content: string): void {
    const filePath = path.join(this.dstDir, fn);
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    CachedFiles.writeFile(filePath, Buffer.from(content, this.encoding as BufferEncoding));
  }
}
