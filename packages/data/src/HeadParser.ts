/**
 * HeadParser — TypeScript port of Java `configgen.data.HeadParser`.
 *
 * Parses the header rows of DRawSheet(s) within a DTable to:
 *   1. Populate table.fields with DField (name, comment, suggestedType)
 *   2. Populate sheet.fieldIndices (which columns are program-use fields)
 *
 * Works in both row mode (default: header is horizontal) and column mode
 * (header is vertical, transposed).
 */

import type { DTable } from './DTable';
import { DField } from './DField';
import type { DRawSheet } from './DRawSheet';
import type { CfgDataStat } from './CfgDataStat';
import type { HeadRow } from './HeadRows';
import { HeadRows } from './HeadRows';

// Minimal CfgSchemaErrs interface to avoid schema dependency
interface CfgSchemaErrsLike {
  addErr(err: unknown): void;
}

export class HeadParser {

  /** Simple overload: A2_Default, row mode, throw on errors. */
  static parse(table: DTable, stat: CfgDataStat): void;
  static parse(table: DTable, stat: CfgDataStat, headRow: HeadRow, isColumnMode: boolean): void;
  static parse(
    table: DTable,
    stat: CfgDataStat,
    headRow: HeadRow,
    isColumnMode: boolean,
    errs: CfgSchemaErrsLike,
  ): void;
  static parse(
    table: DTable,
    stat: CfgDataStat,
    headRow?: HeadRow,
    isColumnMode?: boolean,
    errs?: CfgSchemaErrsLike,
  ): void {
    const hr: HeadRow = headRow ?? HeadRows.A2_Default;
    const cm: boolean = isColumnMode ?? false;
    const errHandler: CfgSchemaErrsLike = errs ?? { addErr(_err: unknown): void { /* no-op */ } };

    let header: DField[] | null = null;
    let names: string[] | null = null;
    let headerSheet: DRawSheet | null = null;

    // Sort sheets by index if multiple
    if (table.rawSheets.length > 1) {
      table.rawSheets.sort((a, b) => a.index - b.index);
    }

    for (const sheet of table.rawSheets) {
      const comments = HeadParser.getLogicRow(sheet, hr.commentRow(), cm);
      const curNames = HeadParser.getLogicRow(sheet, hr.nameRow(), cm);
      const suggestedTypes = hr.suggestedTypeRow() >= 0
        ? HeadParser.getLogicRow(sheet, hr.suggestedTypeRow(), cm)
        : [];

      const h = HeadParser.parseFields(sheet, stat, comments, curNames, suggestedTypes);

      if (header === null) {
        names = curNames;
        header = h;
        headerSheet = sheet;
      } else if (curNames !== names && !arrayEquals(curNames, names!)) {
        // Multiple sheets with different headers → error but continue
        errHandler.addErr({
          sheetId: sheet.id(),
          curNames,
          headerSheetId: headerSheet!.id(),
          names: names!,
        });
      }
    }

    if (header !== null) {
      table.fields = header;
    }
  }

  /**
   * Extract a "logic row" from the sheet.
   * In row mode: the row at rowIndex, all cells.
   * In column mode: for each physical row, read the cell at columnIndex.
   * Trims trailing empty cells.
   */
  private static getLogicRow(
    sheet: DRawSheet,
    rowIndex: number,
    isColumnMode: boolean,
  ): string[] {
    const result: string[] = [];

    if (!isColumnMode) {
      if (rowIndex < sheet.rows.length) {
        const row = sheet.rows[rowIndex];
        for (let i = 0; i < row.count(); i++) {
          result.push(row.cell(i));
        }
      }
    } else {
      for (const row of sheet.rows) {
        result.push(row.cell(rowIndex));
      }
    }

    // Trim trailing empty cells
    let i = result.length - 1;
    for (; i >= 0; i--) {
      if (result[i].trim().length > 0) {
        break;
      }
    }
    if (i === result.length - 1) {
      return result;
    } else {
      return result.slice(0, i + 1);
    }
  }

  /**
   * Parse field names, comments, and suggested types into DField list.
   * Also populates sheet.fieldIndices.
   */
  private static parseFields(
    sheet: DRawSheet,
    stat: CfgDataStat,
    comments: string[],
    names: string[],
    suggestedTypes: string[],
  ): DField[] {
    const fields: DField[] = [];
    const size = names.length;
    const fieldIndices: number[] = [];

    for (let i = 0; i < size; i++) {
      let name = names[i];
      if (name == null) {
        stat.ignoredColumnCount++;
        continue;
      }
      name = HeadParser.getColumnName(name);
      if (name.length === 0) {
        stat.ignoredColumnCount++;
        continue;
      }
      stat.columnCount++;

      const comment = HeadParser.getComment(comments, i, name);

      let suggestedType = '';
      if (i < suggestedTypes.length) {
        suggestedType = suggestedTypes[i] ?? '';
      }

      const field = new DField(name, comment, suggestedType);
      fields.push(field);
      fieldIndices.push(i);
    }

    sheet.fieldIndices = fieldIndices;
    return fields;
  }

  private static getComment(comments: string[], i: number, name: string): string {
    let comment = '';
    if (i < comments.length) {
      comment = comments[i] ?? '';
      if (comment != null) {
        comment = comment.replace(/\r\n|\r|\n/g, '--');
        if (i === 0 && comment.startsWith('#')) {
          comment = comment.substring(1);
        }
        comment = comment.trim();
      } else {
        comment = '';
      }
    }
    if (comment.toLowerCase() === name.toLowerCase()) {
      comment = '';
    }
    return comment;
  }

  private static getColumnName(name: string): string {
    // Split on first ., @, or comma
    const match = name.split(/[.,@]/, 2);
    return match[0].trim();
  }
}

function arrayEquals(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
