/**
 * DTable — TypeScript port of Java `configgen.data.CfgData.DTable`.
 *
 * A logical table assembled from one or more DRawSheet (for CSV/Excel) or
 * JSON files. Contains:
 *   - fields: header info (by HeadParser)
 *   - rows: parsed cell data (by CellParser)
 *   - rawSheets: original sheet data (by CfgDataReader)
 *   - nullableAddTag: optional tag filter (-client, -server)
 */

import type { DField } from './DField.js';
import type { DCell, DRowId } from './DCell.js';
import type { DRawSheet } from './DRawSheet.js';

export class DTable {
  readonly tableName: string;
  fields: DField[];
  rows: DCell[][];
  readonly rawSheets: DRawSheet[];
  readonly nullableAddTag: string | null;

  constructor(
    tableName: string,
    fields: DField[],
    rows: DCell[][],
    rawSheets: DRawSheet[],
    nullableAddTag: string | null,
  ) {
    this.tableName = tableName;
    this.fields = fields;
    this.rows = rows;
    this.rawSheets = rawSheets;
    this.nullableAddTag = nullableAddTag;
  }

  static of(tableName: string, rawSheets: DRawSheet[]): DTable;
  static of(tableName: string, rawSheets: DRawSheet[], nullableAddTag: string | null): DTable;
  static of(tableName: string, rawSheets: DRawSheet[], nullableAddTag?: string | null): DTable {
    return new DTable(tableName, [], [], rawSheets, nullableAddTag ?? null);
  }

  getSheetByRowId(rowId: DRowId): DRawSheet {
    for (const sheet of this.rawSheets) {
      if (sheet.relativeFilePath === rowId.fileName && sheet.sheetName === rowId.sheetName) {
        return sheet;
      }
    }
    throw new Error(`Cannot find DRawSheet by DRowId: ${rowId.fileName}[${rowId.sheetName}]`);
  }
}
