/**
 * GoCodeGenerator — TypeScript port of Java `configgen.gengo.GoCodeGenerator`.
 *
 * Generates Go code (structs, interfaces, tables, CfgMgr, optional Text)
 * into `dir/pkg/` directory.
 *
 * Differences from Java:
 * - `generate(ctx)` is async (Promise<void>)
 * - No concurrency (TS single-threaded; Java used work-stealing pool)
 * - Resource file copy via fs.copyFileSync instead of Java FileUtil.copyFileIfNotExist
 * - CachedFiles.keepMetaAndDeleteOtherFiles for directory cleanup
 *
 * Java source: configgen.gengo.GoCodeGenerator.java (145 lines)
 */

import * as fs from 'fs';
import * as path from 'path';

import { CachedFiles, Logger, upper1, lower1 } from '@cfggen/shared';
import type { Context } from '@cfggen/context';
import type { CfgValue } from '@cfggen/value';
import type { CfgSchema } from '@cfggen/schema';
import { StructSchema, InterfaceSchema } from '@cfggen/schema';
import type { Structural } from '@cfggen/schema';
import type { VTable } from '@cfggen/value';
import type { LangSwitchable } from '@cfggen/i18n';
import type { Parameter } from './Parameter';
import { GeneratorWithTag } from './GeneratorWithTag';
import { GoName } from './GoName';
import { GoStructModel } from './GoStructModel';
import { GoInterfaceModel } from './GoInterfaceModel';
import { GoCfgMgrModel } from './GoCfgMgrModel';
import {
  genStruct,
  genInterface,
  genCfgMgr,
  genServerText,
  genClientText,
} from './goTemplates';

const COPY_FILES = ['stream.go', 'LoadErrors.go'];

export class GoCodeGenerator extends GeneratorWithTag {
  readonly dir: string;
  readonly pkg: string;
  readonly encoding: string;
  readonly serverText: boolean;

  private dstDir!: string;
  isLangSwitch = false;

  constructor(parameter: Parameter) {
    super(parameter);
    this.dir = parameter.get('dir', 'config');
    this.pkg = parameter.get('pkg', 'config');
    this.encoding = parameter.get('encoding', 'GBK');
    this.serverText = parameter.has('serverText');
    GoName.modName = parameter.getOrNull('mod');
  }

  async generate(ctx: Context): Promise<void> {
    const cfgValue: CfgValue = ctx.makeValueWithTag(this.tag);
    const cfgSchema: CfgSchema = cfgValue.schema;

    this.dstDir = path.join(this.dir, this.pkg.replace('.', '/'));
    this.isLangSwitch = ctx.nullableLangSwitch() !== null;

    // Copy runtime files (stream.go, LoadErrors.go)
    this.copyRuntimeFiles();

    // Generate CfgMgr file
    this.genCfgMgrFile(cfgValue);

    // Generate struct/interface/table files (sequential, no concurrency needed)
    for (const fieldable of cfgSchema.sortedFieldables()) {
      if (fieldable instanceof StructSchema) {
        this.generateStruct(fieldable, null);
      } else if (fieldable instanceof InterfaceSchema) {
        const iface = fieldable as InterfaceSchema;
        this.generateInterface(iface);
        for (const impl of iface.impls()) {
          this.generateStruct(impl, null);
        }
      }
    }

    for (const vTable of cfgValue.sortedTables()) {
      this.generateStruct(vTable.schema, vTable);
    }

    // Generate Text.go if multi-language
    if (this.isLangSwitch) {
      const langSwitch = ctx.nullableLangSwitch()!;
      this.generateText(langSwitch);
    }

    // Clean up files not in keep set
    CachedFiles.keepMetaAndDeleteOtherFiles(this.dstDir);
  }

  private copyRuntimeFiles(): void {
    for (const fn of COPY_FILES) {
      const targetPath = path.join(this.dstDir, fn);
      if (!fs.existsSync(targetPath)) {
        const resourcePath = path.join(__dirname, 'resources', fn);
        if (fs.existsSync(resourcePath)) {
          // Ensure directory exists
          if (!fs.existsSync(this.dstDir)) {
            fs.mkdirSync(this.dstDir, { recursive: true });
          }
          fs.copyFileSync(resourcePath, targetPath);
          Logger.log('create file: ' + targetPath);
        } else {
          throw new Error('Go runtime resource not found at ' + resourcePath);
        }
      }
      CachedFiles.keepFile(targetPath);
    }
  }

  private generateInterface(sInterface: InterfaceSchema): void {
    const name = new GoName(sInterface);
    const model = new GoInterfaceModel(this.pkg, name, sInterface);
    const content = genInterface(model);
    this.writeCode(name.filePath, content);
  }

  private generateStruct(structural: Structural, vTable: VTable | null): void {
    const name = new GoName(structural);
    const model = new GoStructModel(this, this.pkg, name, structural, vTable);
    const content = genStruct(model);
    this.writeCode(name.filePath, content);
  }

  private genCfgMgrFile(cfgValue: CfgValue): void {
    const mgrFileName = lower1(this.pkg) + 'mgr';
    const model = new GoCfgMgrModel(this.pkg, cfgValue);
    const content = genCfgMgr(model);
    this.writeCode(mgrFileName + '.go', content);
  }

  private generateText(langSwitch: LangSwitchable): void {
    const languages = langSwitch.languages().map(upper1);
    const content = this.serverText
      ? genServerText(this.pkg, languages)
      : genClientText(this.pkg);
    this.writeCode('Text.go', content);
  }

  private writeCode(fn: string, content: string): void {
    const filePath = path.join(this.dstDir, fn);
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Go source files are always UTF-8 (Node.js doesn't support GBK encoding;
    // Java used GBK by default but Go code is pure ASCII)
    CachedFiles.writeFile(filePath, Buffer.from(content, 'utf-8'));
  }
}
