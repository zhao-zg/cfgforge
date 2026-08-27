/**
 * AddOrUpdateService — TypeScript port of Java `configgen.write.AddOrUpdateService`.
 *
 * High-level service: add or update a record in a table.
 * - For JSON tables: writes a new JSON record file, then rebuilds CfgValue.
 * - For CSV/Excel tables: writes the record into the sheet, then reloads
 *   the entire table data and re-parses values.
 *
 * Key differences from Java:
 * - CSV/Excel path is async (VTableStorage.addOrUpdateRecord and
 *   ValueUpdater.updateByReloadTableData are both async in TS).
 * - Java uses `recordId` parameter name; TS uses `recordId` consistently.
 * - Java `CfgValueErrs.VErr::toString` → TS `VErr.msg()`.
 * - Java IOException → TS regular Error (fs operations are sync in TS
 *   via fs.writeFileSync, but VTableStorage uses ExcelJS which is async).
 *
 * Java source: configgen.write.AddOrUpdateService.java (99 lines)
 */

import type { Context } from '@cfgforge/context';
import type { CfgValue, Value } from '@cfgforge/value';
import { CfgValueErrs, ValueJsonParser, ValueUtil, valueEquals } from '@cfgforge/value';
import { VTableStorage, VTableJsonStorage, ValueUpdater } from './index';
import { Logger } from '@cfgforge/shared';

export enum AddOrUpdateErrorCode {
  AddOK,
  UpdateOK,
  PartialNotEditable,
  TableNotFound,
  RecordParseError,
  IOException,
}

export class AddOrUpdateRecordResult {
  readonly errorCode: AddOrUpdateErrorCode;
  readonly recordId: string | null;
  readonly newCfgValue: CfgValue | null;
  readonly errorMessages: string[];

  constructor(
    errorCode: AddOrUpdateErrorCode,
    recordId: string | null,
    newCfgValue: CfgValue | null,
    errorMessages: string[],
  ) {
    this.errorCode = errorCode;
    this.recordId = recordId;
    this.newCfgValue = newCfgValue;
    this.errorMessages = errorMessages;
  }
}

export class AddOrUpdateService {
  /**
   * Add or update a record in a table.
   *
   * @param context      the Context (provides cfgData, rootDir, sourceStructure)
   * @param cfgValue     the current CfgValue
   * @param tableName    the table to modify
   * @param recordJsonStr  JSON string of the record to add/update
   * @returns result with error code, record id, new CfgValue, and error messages
   */
  static async addOrUpdateRecord(
    context: Context,
    cfgValue: CfgValue,
    tableName: string,
    recordJsonStr: string,
  ): Promise<AddOrUpdateRecordResult> {
    if (cfgValue.schema.isPartial()) {
      return new AddOrUpdateRecordResult(
        AddOrUpdateErrorCode.PartialNotEditable, null, null, [],
      );
    }

    const vTable = cfgValue.getTable(tableName);
    if (vTable === undefined) {
      return new AddOrUpdateRecordResult(
        AddOrUpdateErrorCode.TableNotFound, null, null, [],
      );
    }

    const tableSchema = vTable.schema;
    const parseErrs = CfgValueErrs.of();
    const thisValue = new ValueJsonParser(tableSchema, parseErrs).fromJson(recordJsonStr);
    parseErrs.checkErrors('check json', true, true);
    if (parseErrs.errs.length > 0) {
      return new AddOrUpdateRecordResult(
        AddOrUpdateErrorCode.RecordParseError, null, null,
        parseErrs.errs.map((e) => e.msg()),
      );
    }

    const pkValue: Value = ValueUtil.extractPrimaryKeyValue(thisValue, tableSchema);
    const id = pkValue.packStr();

    // Check if this key already exists (using valueEquals, not Map.has
    // which uses reference equality — Java's Map.containsKey uses Value.equals).
    let exists = false;
    for (const k of vTable.primaryKeyMap.keys()) {
      if (valueEquals(k, pkValue)) {
        exists = true;
        break;
      }
    }
    const code = exists
      ? AddOrUpdateErrorCode.UpdateOK
      : AddOrUpdateErrorCode.AddOK;

    try {
      let nr: { newCfgValue: CfgValue; newCfgData: import('@cfgforge/data').CfgData; errStrList: string[] };

      if (tableSchema.isJson()) {
        const relativeJsonPath = VTableJsonStorage.addOrUpdateRecord(
          thisValue, tableName, id,
          context.rootDir(), context.sourceStructure(),
        );

        nr = ValueUpdater.updateByJsonFileAddOrUpdate(
          context, cfgValue, vTable, relativeJsonPath,
        );

        context.sourceStructure().addJsonFile(tableName, relativeJsonPath);
      } else {
        const dTable = context.cfgData().getDTable(tableName);
        if (dTable === undefined) {
          throw new Error(`DTable not found: ${tableName}`);
        }
        await VTableStorage.addOrUpdateRecord(
          context, vTable, dTable, pkValue, thisValue,
        );

        nr = await ValueUpdater.updateByReloadTableData(context, cfgValue, vTable);

        await context.sourceStructure().updateExcelFileLastModifiedAsync(
          dTable.rawSheets[0].relativeFilePath,
        );
      }

      context.updateDataAndValue(nr.newCfgData, nr.newCfgValue);

      Logger.log('addOrUpdateRecord: table=%s, id=%s, result=%s', tableName, id, AddOrUpdateErrorCode[code]);
      return new AddOrUpdateRecordResult(
        code, id, nr.newCfgValue, nr.errStrList,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.log('Failed to addOrUpdate table=%s, id=%s, error=%s', tableName, id, msg);
      return new AddOrUpdateRecordResult(
        AddOrUpdateErrorCode.IOException, id, null, [msg],
      );
    }
  }
}
