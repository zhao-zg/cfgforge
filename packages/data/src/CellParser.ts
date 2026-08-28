/**
 * CellParser — TypeScript port of Java `configgen.data.CellParser`.
 *
 * After HeadParser has populated sheet.fieldIndices and table.fields,
 * CellParser reads the data rows (skipping header rows, comment rows,
 * and all-empty rows) and assembles them into DCell[][] stored in
 * table.rows.
 *
 * In row mode: each physical row is a data row, each column is a field.
 * In column mode: each physical row is a "column", each column index
 * is a "row" (transposed).
 *
 * After parsing, each sheet's raw rows are cleared to free memory.
 */

import type { DTable } from './DTable.js';
import type { CfgDataStat } from './CfgDataStat.js';
import type { DRawSheet } from './DRawSheet.js';
import type { DRawRow } from './DRawRow.js';
import { DCell } from './DCell.js';
import { DRowId } from './DRowId.js';

export class CellParser {

  /**
   * Parse data cells from all rawSheets in the table.
   * Populates table.rows with DCell[][].
   * Clears each sheet's raw rows after processing.
   *
   * isColumnMode defaults to false (row mode).
   */
  static parse(
    table: DTable,
    stat: CfgDataStat,
    headRow: number,
    isColumnMode: boolean = false,
  ): void {
    let result: DCell[][] | null = null;

    if (!isColumnMode) {
      for (const sheet of table.rawSheets) {
        if (result === null) {
          result = [];
        }

        for (let rowIndex = headRow; rowIndex < sheet.rows.length; rowIndex++) {
          const rawRow: DRawRow = sheet.rows[rowIndex];
          if (rawRow.cell(0).startsWith('#')) {
            stat.ignoredRowCount++;
            continue;
          }

          const logicRow = CellParser.getCellsInRowMode(sheet, rawRow, rowIndex);
          if (CellParser.isLogicRowNotAllEmpty(logicRow)) {
            result.push(logicRow);
          } else {
            stat.ignoredRowCount++;
          }
        }
        sheet.rows.length = 0; // clear memory
      }
    } else {
      // column mode
      for (const sheet of table.rawSheets) {
        let maxRow = 0;
        for (const row of sheet.rows) {
          if (row.count() > maxRow) {
            maxRow = row.count();
          }
        }
        if (maxRow > headRow) {
          if (result === null) {
            result = [];
          }

          const rawRowFirst = sheet.rows[0];
          for (let logicRowIdx = headRow; logicRowIdx < maxRow; logicRowIdx++) {
            const d = rawRowFirst.cell(logicRowIdx);
            if (d.startsWith('#')) {
              stat.ignoredRowCount++;
              continue;
            }

            const logicRow = CellParser.getCellsInColumnMode(sheet, logicRowIdx);
            if (CellParser.isLogicRowNotAllEmpty(logicRow)) {
              result.push(logicRow);
            } else {
              stat.ignoredRowCount++;
            }
          }
        }
        sheet.rows.length = 0; // clear memory
      }
    }

    if (result === null || result.length === 0) {
      stat.emptyTableCount++;
    } else {
      stat.rowCount = result.length;
      table.rows = result;
    }
  }

  private static getCellsInColumnMode(
    sheet: DRawSheet,
    logicRowIdx: number,
  ): DCell[] {
    const logicRow: DCell[] = [];
    const logicRowId = new DRowId(sheet.relativeFilePath, sheet.sheetName, logicRowIdx);
    for (const col of sheet.fieldIndices) {
      const rawRow = sheet.rows[col];
      const val = rawRow.cell(logicRowIdx);
      logicRow.push(new DCell(val, logicRowId, col, DCell.modeOf(true)));
    }
    return logicRow;
  }

  private static getCellsInRowMode(
    sheet: DRawSheet,
    rawRow: DRawRow,
    rowIndex: number,
  ): DCell[] {
    const logicRow: DCell[] = [];
    const logicRowId = new DRowId(sheet.relativeFilePath, sheet.sheetName, rowIndex);
    for (const col of sheet.fieldIndices) {
      const val = rawRow.cell(col);
      logicRow.push(new DCell(val, logicRowId, col, DCell.modeOf(false)));
    }
    return logicRow;
  }

  private static isLogicRowNotAllEmpty(row: DCell[]): boolean {
    for (const c of row) {
      if (c.value().length > 0) {
        return true;
      }
    }
    return false;
  }
}
