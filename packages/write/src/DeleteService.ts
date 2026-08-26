/**
 * DeleteService — TypeScript port of Java `configgen.write.DeleteService`.
 *
 * High-level service: delete a record from a table.
 * - For JSON tables: deletes the JSON record file, then rebuilds CfgValue.
 * - For CSV/Excel tables: blanks the record rows in the sheet, then reloads
 *   the entire table data and re-parses values.
 *
 * Key differences from Java:
 * - CSV/Excel path is async (VTableStorage.deleteRecord and
 *   ValueUpdater.updateByReloadTableData are both async in TS).
 * - Java `CfgValueErrs.VErr::toString` → TS `VErr.msg()`.
 * - Java `ValuePack.unpackTablePrimaryKey` returns Value; TS returns
 *   `Value | null` — null means parse failed.
 * - Java `vTable.primaryKeyMap().get(pkValue)` uses Value.equals();
 *   TS Map uses ===, so we iterate with valueEquals to find the key.
 * - Java `context.sourceStructure().getJsonTableDir(tableName)` returns Path;
 *   TS returns `string | null`.
 *
 * Java source: configgen.write.DeleteService.java (87 lines)
 */

import type { Context } from '@cfggen/context';
import type { CfgValue, Value, VStruct } from '@cfggen/value';
import { CfgValueErrs, ValuePack, valueEquals } from '@cfggen/value';
import { VTableStorage, VTableJsonStorage, ValueUpdater } from './index';
import { Logger } from '@cfggen/shared';

export enum DeleteErrorCode {
  OK,
  PartialNotEditable,
  TableNotFound,
  RecordIdParseError,
  RecordIdNotFound,
  IOException,
}

export class DeleteRecordResult {
  readonly errorCode: DeleteErrorCode;
  readonly newCfgValue: CfgValue | null;
  readonly errorMessages: string[];

  constructor(
    errorCode: DeleteErrorCode,
    newCfgValue: CfgValue | null,
    errorMessages: string[],
  ) {
    this.errorCode = errorCode;
    this.newCfgValue = newCfgValue;
    this.errorMessages = errorMessages;
  }
}

export class DeleteService {
  /**
   * Delete a record from a table by its packed primary key string.
   *
   * @param context    the Context
   * @param cfgValue   the current CfgValue
   * @param tableName  the table to modify
   * @param recordId   the packed primary key string (e.g., "1" or "(1,2)")
   * @returns result with error code, new CfgValue, and error messages
   */
  static async deleteRecord(
    context: Context,
    cfgValue: CfgValue,
    tableName: string,
    recordId: string,
  ): Promise<DeleteRecordResult> {
    if (cfgValue.schema.isPartial()) {
      return new DeleteRecordResult(DeleteErrorCode.PartialNotEditable, null, []);
    }

    const vTable = cfgValue.getTable(tableName);
    if (vTable === undefined) {
      return new DeleteRecordResult(DeleteErrorCode.TableNotFound, null, []);
    }

    const errs = CfgValueErrs.of();
    const pkValue = ValuePack.unpackTablePrimaryKey(recordId, vTable.schema, errs);
    if (pkValue === null) {
      return new DeleteRecordResult(
        DeleteErrorCode.RecordIdParseError, null,
        errs.errs.map((e) => e.msg()),
      );
    }

    // Find the actual key in primaryKeyMap using valueEquals
    // (TS Map uses ===, Java Map.get uses Value.equals())
    let actualKey: Value | null = null;
    let oldRecord: VStruct | null = null;
    for (const [k, v] of vTable.primaryKeyMap) {
      if (valueEquals(k, pkValue)) {
        actualKey = k;
        oldRecord = v;
        break;
      }
    }
    if (oldRecord === null) {
      return new DeleteRecordResult(DeleteErrorCode.RecordIdNotFound, null, []);
    }

    try {
      let nr: { newCfgValue: CfgValue; newCfgData: import('@cfggen/data').CfgData; errStrList: string[] };

      if (vTable.schema.isJson()) {
        const relativeJsonPath = VTableJsonStorage.deleteRecord(
          tableName, recordId,
          context.rootDir(), context.sourceStructure(),
        );
        nr = ValueUpdater.updateByJsonFileDelete(
          context, cfgValue, vTable, actualKey!, recordId,
        );
        context.sourceStructure().removeJsonFile(tableName, relativeJsonPath);
      } else {
        const dTable = context.cfgData().getDTable(tableName);
        if (dTable === undefined) {
          throw new Error(`DTable not found: ${tableName}`);
        }
        await VTableStorage.deleteRecord(context, dTable, oldRecord);

        nr = await ValueUpdater.updateByReloadTableData(context, cfgValue, vTable);

        context.sourceStructure().updateExcelFileLastModified(
          dTable.rawSheets[0].relativeFilePath,
        );
      }

      context.updateDataAndValue(nr.newCfgData, nr.newCfgValue);

      Logger.log('Deleted record: table=%s, id=%s', tableName, recordId);
      return new DeleteRecordResult(DeleteErrorCode.OK, nr.newCfgValue, nr.errStrList);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.log('Failed to delete record: table=%s, id=%s, error=%s', tableName, recordId, msg);
      return new DeleteRecordResult(DeleteErrorCode.IOException, null, [msg]);
    }
  }
}
