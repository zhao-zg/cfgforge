/**
 * ValueToCsv — TypeScript port of Java `configgen.value.ValueToCsv`.
 *
 * Converts VTable rows to CSV format for display/editing.
 *
 * writeAsCsv(sb, vTable, fieldNames, offset, limit):
 *   - Writes header row (field names) + data rows
 *   - Paginates with offset/limit
 *   - StringValue fields use value(), others use packStr()
 *
 * Java source: configgen.value.ValueToCsv.java (44 lines)
 */

import { VStruct, VTable } from './CfgValue';
import { ValueUtil } from './ValueUtil';
import { writeCSV, type CSVRow } from '@cfgforge/shared';
import type { StringValue } from './CfgValue';
import { VString, VText } from './CfgValue';

export class ValueToCsv {

  static writeAsCsv(
    sb: string[],
    vTable: VTable,
    fieldNames: Set<string>,
    offset: number,
    limit: number,
  ): void {
    if (offset < 0 || limit <= 0 || offset >= vTable.valueList.length) {
      return;
    }

    let actualLimit = limit;
    if (offset + actualLimit > vTable.valueList.length) {
      actualLimit = vTable.valueList.length - offset;
    }

    const result: CSVRow[] = [];
    // Header row
    result.push(Array.from(fieldNames));

    // Data rows
    for (let i = offset; i < offset + actualLimit; i++) {
      const vStruct = vTable.valueList[i];
      const line: string[] = [];
      for (const fieldName of fieldNames) {
        line.push(ValueToCsv.getFieldValueStr(vStruct, fieldName));
      }
      result.push(line);
    }

    writeCSV(sb, result);
  }

  private static getFieldValueStr(vStruct: VStruct, fieldName: string): string {
    const fv = ValueUtil.extractFieldValue(vStruct, fieldName);
    if (fv === null) {
      return '';
    }
    if (fv instanceof VString || fv instanceof VText) {
      return (fv as StringValue).value;
    } else {
      return fv.packStr();
    }
  }
}
