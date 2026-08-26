/**
 * GdCodeGenerator — TypeScript port of Java `configgen.gengd.GdCodeGenerator`.
 *
 * Generates GDScript code (structs, interfaces, tables, ConfigProcessor)
 * plus copies runtime .gd files into the output directory.
 *
 * Differences from Java:
 * - `generate(ctx)` is async (Promise<void>)
 * - No concurrency (TS single-threaded; Java used work-stealing pool)
 * - Resource file copy via fs.copyFileSync instead of Java FileUtil.copyFileIfNotExist
 * - CachedFiles.keepMetaAndDeleteOtherFiles for directory cleanup
 *
 * Java source: configgen.gengd.GdCodeGenerator.java (144 lines)
 */

import * as fs from 'fs';
import * as path from 'path';

import { CachedFiles, Logger } from '@cfgforge/shared';
import type { Context } from '@cfgforge/context';
import type { CfgValue } from '@cfgforge/value';
import type { CfgSchema, Structural } from '@cfgforge/schema';
import { StructSchema, InterfaceSchema } from '@cfgforge/schema';
import type { VTable } from '@cfgforge/value';
import type { Parameter } from './Parameter';
import { GeneratorWithTag } from './GeneratorWithTag';
import { GdStructModel } from './GdStructModel';
import { GdInterfaceModel } from './GdInterfaceModel';
import { GdProcessorModel } from './GdProcessorModel';
import { genStruct, genInterface, genProcessor } from './gdTemplates';

const COPY_FILES = [
  'ConfigStream.gd',
  'ConfigLoader.gd',
  'ConfigErrors.gd',
  'TextPoolManager.gd',
];

const CLIENT_TEXT_FILE = 'ConfigText.gd';

const ENCODING = 'utf-8';

export class GdCodeGenerator extends GeneratorWithTag {
  readonly dir: string;
  readonly prefix: string;

  private dstDir!: string;
  isLangSwitch = false;

  constructor(parameter: Parameter) {
    super(parameter);
    this.dir = parameter.get('dir', 'config');
    this.prefix = parameter.get('prefix', 'Data');
  }

  async generate(ctx: Context): Promise<void> {
    const cfgValue: CfgValue = ctx.makeValueWithTag(this.tag);
    const cfgSchema: CfgSchema = cfgValue.schema;

    this.dstDir = this.dir;
    this.isLangSwitch = ctx.nullableLangSwitch() !== null;

    // Copy runtime .gd files
    this.copyRuntimeFiles();

    // Generate ConfigProcessor
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

    // Clean up files not in keep set
    CachedFiles.keepMetaAndDeleteOtherFiles(this.dstDir);
  }

  private copyRuntimeFiles(): void {
    const needCopyFiles = [...COPY_FILES];
    if (this.isLangSwitch) {
      needCopyFiles.push(CLIENT_TEXT_FILE);
    }
    for (const fn of needCopyFiles) {
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
          throw new Error('GDScript runtime resource not found at ' + resourcePath);
        }
      }
      CachedFiles.keepFile(targetPath);
    }
  }

  private generateInterface(sInterface: InterfaceSchema): void {
    const model = new GdInterfaceModel(this, sInterface);
    const content = genInterface(model);
    this.writeCode(model.name.path, content);
  }

  private generateStruct(structural: Structural, vTable: VTable | null = null): void {
    const model = new GdStructModel(this, structural, vTable);
    const content = genStruct(model);
    this.writeCode(model.name.path, content);
  }

  private generateTable(vTable: VTable): void {
    this.generateStruct(vTable.schema, vTable);
  }

  private generateProcessor(cfgSchema: CfgSchema): void {
    const model = new GdProcessorModel(this, cfgSchema.sortedTables());
    const content = genProcessor(model);
    this.writeCode('ConfigProcessor.gd', content);
  }

  private writeCode(fn: string, content: string): void {
    const filePath = path.join(this.dstDir, fn);
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    CachedFiles.writeFile(filePath, Buffer.from(content, ENCODING));
  }
}
