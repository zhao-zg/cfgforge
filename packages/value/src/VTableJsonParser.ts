/**
 * VTableJsonParser — TypeScript port of Java `configgen.value.VTableJsonParser`.
 *
 * Reads JSON files from disk (via JsonTableFiles port), parses each into a
 * VStruct (using ValueJsonParser), extracts the primary key, tracks
 * lastModified times in CfgValueStat, and creates a VTable (via VTableCreator).
 *
 * Java source: configgen.value.VTableJsonParser.java (66 lines)
 */

import {
  DFile,
  type JsonTableFiles,
  type JsonFileInfo,
} from '@cfgforge/data';
import { getDefaultFileSystem } from '@cfgforge/shared';
import type { TableSchema } from '@cfgforge/schema';
import {
  type CfgValueErrs,
  jsonFileReadErr,
} from './CfgValueErrs.js';
import {
  type CfgValueStat,
  VTable,
  VStruct,
  type Value,
} from './CfgValue.js';
import { ValueJsonParser } from './ValueJsonParser.js';
import { VTableCreator } from './VTableCreator.js';
import { ValueUtil } from './ValueUtil.js';

export class VTableJsonParser {
  private readonly subTableSchema: TableSchema;
  private readonly tableSchema: TableSchema;
  private readonly errs: CfgValueErrs;
  private readonly parser: ValueJsonParser;
  private readonly valueStat: CfgValueStat;
  private readonly jsonTableFiles: JsonTableFiles;

  constructor(
    subTableSchema: TableSchema,
    isPartial: boolean,
    jsonTableFiles: JsonTableFiles,
    tableSchema: TableSchema,
    errs: CfgValueErrs,
    valueStat: CfgValueStat,
  ) {
    this.subTableSchema = subTableSchema;
    this.jsonTableFiles = jsonTableFiles;
    this.tableSchema = tableSchema;
    this.parser = new ValueJsonParser(subTableSchema, isPartial, errs);
    this.errs = errs;
    this.valueStat = valueStat;
  }

  parseTable(): VTable {
    const valueList: VStruct[] = [];
    const tableName = this.tableSchema.name();
    const idMap = new Map<string, bigint>();
    const jsonFiles: JsonFileInfo[] = this.jsonTableFiles.jsonFilesOf(tableName);

    for (const jf of jsonFiles) {
      let jsonStr: string | null = null;
      let modified = 0;
      try {
        const bytes = getDefaultFileSystem().readFileSync(jf.path);
        jsonStr = new TextDecoder().decode(bytes);
        modified = jf.lastModified;
      } catch (e) {
        this.errs.addErr(jsonFileReadErr(jf.path, (e as Error).message));
      }
      if (jsonStr !== null) {
        const vStruct = this.parser.fromJson(
          jsonStr,
          DFile.of(jf.relativePath, tableName),
        );

        valueList.push(vStruct);
        const pkValue: Value = ValueUtil.extractPrimaryKeyValue(vStruct, this.subTableSchema);
        const id = pkValue.packStr();
        idMap.set(id, BigInt(Math.trunc(modified)));
      }
    }

    this.valueStat.newTableLastModified(tableName, idMap);
    return new VTableCreator(this.subTableSchema, this.errs).create(valueList);
  }

  /**
   * Async variant of parseTable (via CfgFileSystem abstraction, for Tauri/WebView).
   * Reads JSON files asynchronously, otherwise identical logic.
   */
  async parseTableAsync(): Promise<VTable> {
    const valueList: VStruct[] = [];
    const tableName = this.tableSchema.name();
    const idMap = new Map<string, bigint>();
    const jsonFiles: JsonFileInfo[] = this.jsonTableFiles.jsonFilesOf(tableName);

    const dfs = getDefaultFileSystem();

    for (const jf of jsonFiles) {
      let jsonStr: string | null = null;
      let modified = 0;
      try {
        const bytes = await dfs.readFile(jf.path);
        jsonStr = new TextDecoder().decode(bytes);
        modified = jf.lastModified;
      } catch (e) {
        this.errs.addErr(jsonFileReadErr(jf.path, (e as Error).message));
      }
      if (jsonStr !== null) {
        const vStruct = this.parser.fromJson(
          jsonStr,
          DFile.of(jf.relativePath, tableName),
        );

        valueList.push(vStruct);
        const pkValue: Value = ValueUtil.extractPrimaryKeyValue(vStruct, this.subTableSchema);
        const id = pkValue.packStr();
        idMap.set(id, BigInt(Math.trunc(modified)));
      }
    }

    this.valueStat.newTableLastModified(tableName, idMap);
    return new VTableCreator(this.subTableSchema, this.errs).create(valueList);
  }
}
