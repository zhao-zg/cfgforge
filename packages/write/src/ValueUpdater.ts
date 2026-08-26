/**
 * ValueUpdater — TypeScript port of Java `configgen.write.ValueUpdater`.
 *
 * After a record is written to a file (via VTableStorage or VTableJsonStorage),
 * ValueUpdater rebuilds the in-memory CfgValue to reflect the change.
 *
 * Three update strategies:
 * - updateByReloadTableData: re-reads CSV/Excel file, re-parses entire table
 * - updateByJsonFileAddOrUpdate: parses the single new JSON record file,
 *   updates primaryKeyMap, re-creates VTable from the new record list
 * - updateByJsonFileDelete: removes a record from primaryKeyMap,
 *   re-creates VTable from the remaining records
 *
 * Key difference from Java:
 * - updateByReloadTableData is async because DataUpdater.updateByReloadTable
 *   is async (ExcelJS reads async).
 * - Java uses `schema()` / `vTableMap()` / `valueStat()` method calls;
 *   TS uses `schema` / `vTableMap` / `valueStat` property access.
 *
 * Java source: configgen.write.ValueUpdater.java (129 lines)
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Context } from '@cfgforge/context';
import { DataUpdater } from '@cfgforge/context';
import type { CfgData } from '@cfgforge/data';
import { DFile } from '@cfgforge/data';
import { getDefaultFileSystem } from '@cfgforge/shared';
import {
  CfgValue,
  type VTable,
  type VStruct,
  type Value,
  CfgValueErrs,
  CfgValueStat,
  VTableParser,
  VTableCreator,
  RefValidator,
  TextValue,
  ValueJsonParser,
  ValueUtil,
} from '@cfgforge/value';

export class ValueUpdater {
  readonly newCfgValue: CfgValue;
  readonly newCfgData: CfgData;
  readonly errStrList: string[];

  private constructor(newCfgValue: CfgValue, newCfgData: CfgData, errStrList: string[]) {
    this.newCfgValue = newCfgValue;
    this.newCfgData = newCfgData;
    this.errStrList = errStrList;
  }

  /**
   * Reload a CSV/Excel table's data and re-parse its values.
   * Used after VTableStorage.addOrUpdateRecord / deleteRecord.
   */
  static async updateByReloadTableData(
    context: Context,
    cfgValue: CfgValue,
    vTable: VTable,
  ): Promise<ValueUpdater> {
    const schema = cfgValue.schema;
    if (schema.isPartial()) {
      throw new Error('update only supports full value');
    }

    const dTable = context.cfgData().getDTable(vTable.name());
    if (dTable === undefined) {
      throw new Error(`DTable not found: ${vTable.name()}`);
    }

    const newDataResult = await DataUpdater.updateByReloadTable(context, dTable);
    const newCfgData = newDataResult.newCfgData;

    const errs = CfgValueErrs.of();
    const newDTable = newCfgData.getDTable(vTable.name())!;
    const parser = new VTableParser(
      vTable.schema,
      newDTable,
      vTable.schema,
      context.contextCfg().headRow,
      errs,
    );
    const newVTable = parser.parseTable();
    TextValue.setTranslatedForTable(newVTable, context.nullableLangTextFinder());

    const newTables = new Map(cfgValue.vTableMap);
    newTables.set(newVTable.name(), newVTable);
    const newCfgValue = new CfgValue(schema, newTables, cfgValue.valueStat);
    new RefValidator(newCfgValue, errs).validate();
    errs.checkErrors('validate', true);

    const errStrList = [...newDataResult.errStrList, ...errs.errs.map((e) => e.msg())];
    return new ValueUpdater(newCfgValue, newCfgData, errStrList);
  }

  /**
   * Update CfgValue after a JSON record file is added or updated.
   * Reads the new JSON file, parses it, and updates the primaryKeyMap.
   */
  static updateByJsonFileAddOrUpdate(
    context: Context,
    cfgValue: CfgValue,
    vTable: VTable,
    relativeJsonPath: string,
  ): ValueUpdater {
    const schema = cfgValue.schema;
    if (schema.isPartial()) {
      throw new Error('update only supports full value');
    }

    const fullPath = path.resolve(context.rootDir(), relativeJsonPath);
    const jsonStr = fs.readFileSync(fullPath, 'utf8');

    const parseErrs = CfgValueErrs.of();
    const source = DFile.of(relativeJsonPath, vTable.name());
    const vStruct = new ValueJsonParser(vTable.schema, parseErrs).fromJson(jsonStr, source);
    const pkValue = ValueUtil.extractPrimaryKeyValue(vStruct, vTable.schema);
    const id = pkValue.packStr();

    const newPrimaryKeyMap = new Map(vTable.primaryKeyMap);
    newPrimaryKeyMap.set(pkValue, vStruct);
    const newRecordList = Array.from(newPrimaryKeyMap.values());

    const newCfgValueStat = cfgValue.valueStat.newAddLastModified(
      vTable.name(),
      id,
      BigInt(Math.floor(fs.statSync(fullPath).mtimeMs)),
    );

    return ValueUpdater.updateByNewRecords(context, cfgValue, vTable, newRecordList, newCfgValueStat);
  }

  /**
   * Async variant of updateByJsonFileAddOrUpdate.
   * Uses CfgFileSystem abstraction for file I/O (Tauri/WebView compatible).
   */
  static async updateByJsonFileAddOrUpdateAsync(
    context: Context,
    cfgValue: CfgValue,
    vTable: VTable,
    relativeJsonPath: string,
  ): Promise<ValueUpdater> {
    const schema = cfgValue.schema;
    if (schema.isPartial()) {
      throw new Error('update only supports full value');
    }

    const fullPath = path.resolve(context.rootDir(), relativeJsonPath);
    const dfs = getDefaultFileSystem();
    const bytes = await dfs.readFile(fullPath);
    const jsonStr = Buffer.from(bytes).toString('utf8');

    const parseErrs = CfgValueErrs.of();
    const source = DFile.of(relativeJsonPath, vTable.name());
    const vStruct = new ValueJsonParser(vTable.schema, parseErrs).fromJson(jsonStr, source);
    const pkValue = ValueUtil.extractPrimaryKeyValue(vStruct, vTable.schema);
    const id = pkValue.packStr();

    const newPrimaryKeyMap = new Map(vTable.primaryKeyMap);
    newPrimaryKeyMap.set(pkValue, vStruct);
    const newRecordList = Array.from(newPrimaryKeyMap.values());

    const newCfgValueStat = cfgValue.valueStat.newAddLastModified(
      vTable.name(),
      id,
      BigInt(Math.floor(await dfs.lastModified(fullPath))),
    );

    return ValueUpdater.updateByNewRecords(context, cfgValue, vTable, newRecordList, newCfgValueStat);
  }

  /**
   * Update CfgValue after a JSON record file is deleted.
   * Removes the record from primaryKeyMap and re-creates the VTable.
   */
  static updateByJsonFileDelete(
    context: Context,
    cfgValue: CfgValue,
    vTable: VTable,
    pkValue: Value,
    id: string,
  ): ValueUpdater {
    const schema = cfgValue.schema;
    if (schema.isPartial()) {
      throw new Error('update only supports full value');
    }

    const newPrimaryKeyMap = new Map(vTable.primaryKeyMap);
    newPrimaryKeyMap.delete(pkValue);
    const newRecordList = Array.from(newPrimaryKeyMap.values());

    const newCfgValueStat = cfgValue.valueStat.newRemoveLastModified(vTable.name(), id);

    return ValueUpdater.updateByNewRecords(context, cfgValue, vTable, newRecordList, newCfgValueStat);
  }

  /**
   * Re-create a VTable from a new record list, then rebuild CfgValue.
   * Used by both JSON add/update and JSON delete paths.
   */
  private static updateByNewRecords(
    context: Context,
    cfgValue: CfgValue,
    vTable: VTable,
    newRecordList: VStruct[],
    newCfgValueStat: CfgValueStat,
  ): ValueUpdater {
    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(vTable.schema, errs);
    const newVTable = creator.create(newRecordList);
    TextValue.setTranslatedForTable(newVTable, context.nullableLangTextFinder());

    const newTables = new Map(cfgValue.vTableMap);
    newTables.set(newVTable.name(), newVTable);
    const newCfgValue = new CfgValue(cfgValue.schema, newTables, newCfgValueStat);
    new RefValidator(newCfgValue, errs).validate();
    errs.checkErrors('validate', true);

    const errStrList = errs.errs.map((e) => e.msg());
    return new ValueUpdater(newCfgValue, context.cfgData(), errStrList);
  }
}
