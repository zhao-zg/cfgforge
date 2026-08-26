/**
 * ExcelTableFile — TypeScript port of Java `configgen.write.AbstractExcelTableFile`
 * + `ExcelTableFile` (row mode) + `ColumnModeExcelTableFile` (column mode).
 *
 * Per the design doc (§4.7), the three Java classes are merged into one.
 * Row mode and column mode share the same skeleton (emptyRows /
 * insertRecordBlock); direction-specific operations are dispatched via
 * the `_isColumnMode` flag.
 *
 * Key difference from Java:
 * - Java uses Apache POI (synchronous). TS uses ExcelJS (async I/O).
 * - Construction is via a static async factory `create()`.
 * - `saveAndClose()` is async (writes to temp file, then atomic move).
 *
 * ExcelJS row/column indices are 1-based (same as POI).
 *
 * Java sources:
 *   AbstractExcelTableFile.java (234 lines)
 *   ExcelTableFile.java (78 lines)
 *   ColumnModeExcelTableFile.java (89 lines)
 */

import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import type { RecordBlockTransformed } from '../RecordBlock';
import type { TableFile } from '../TableFile';
import { getDefaultFileSystem } from '@cfggen/shared';

export class ExcelTableFile implements TableFile {
  private readonly _filePath: string;
  private readonly _workbook: ExcelJS.Workbook;
  private readonly _sheet: ExcelJS.Worksheet;
  private readonly _headRow: number;
  private readonly _isColumnMode: boolean;

  private constructor(
    filePath: string,
    workbook: ExcelJS.Workbook,
    sheet: ExcelJS.Worksheet,
    headRow: number,
    isColumnMode: boolean,
  ) {
    this._filePath = filePath;
    this._workbook = workbook;
    this._sheet = sheet;
    this._headRow = headRow;
    this._isColumnMode = isColumnMode;
  }

  /**
   * Static async factory: opens an existing Excel file and returns
   * an ExcelTableFile bound to the specified sheet.
   */
  static async create(
    filePath: string,
    sheetName: string,
    headRow: number,
    isColumnMode: boolean,
  ): Promise<ExcelTableFile> {
    const dfs = getDefaultFileSystem();
    if (!(await dfs.exists(filePath))) {
      throw new Error('Excel file does not exist: ' + filePath);
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);

    const sheet = wb.getWorksheet(sheetName);
    if (!sheet) {
      throw new Error('Sheet does not exist: ' + sheetName + ' in ' + filePath);
    }

    return new ExcelTableFile(filePath, wb, sheet, headRow, isColumnMode);
  }

  // -------------------------------------------------------------------------
  // TableFile interface
  // -------------------------------------------------------------------------

  emptyRows(startLine: number, count: number, fieldIndices: number[] | null): void {
    if (startLine < 0 || count <= 0) {
      return;
    }

    const lastLineNum = this.lastLineNum();
    if (startLine > lastLineNum) {
      return;
    }

    const end = Math.min(startLine + count, lastLineNum + 1);
    for (let i = startLine; i < end; i++) {
      if (i === startLine && fieldIndices !== null) {
        for (const cellIndex of fieldIndices) {
          this.blankCell(i, cellIndex);
        }
      } else {
        this.blankLine(i);
      }
    }
  }

  insertRecordBlock(
    startLine: number,
    emptyLineCount: number,
    content: RecordBlockTransformed,
  ): void {
    const contentLineCount = content.getRowCount();
    if (contentLineCount <= 0) {
      return;
    }

    let actualStartLine: number;
    if (startLine === -1) {
      actualStartLine = Math.max(this.appendLineNum(), this._headRow);
    } else {
      actualStartLine = startLine;
    }

    if (contentLineCount > emptyLineCount && startLine !== -1) {
      this.shiftLines(actualStartLine + emptyLineCount, contentLineCount - emptyLineCount);
    }

    for (let lineOffset = 0; lineOffset < contentLineCount; lineOffset++) {
      this.writeLine(actualStartLine + lineOffset, content.getRow(lineOffset));
    }
  }

  async saveAndClose(): Promise<void> {
    const dfs = getDefaultFileSystem();
    const tempPath = this._filePath + '.tmp';
    try {
      await this._workbook.xlsx.writeFile(tempPath);
    } catch (e) {
      throw new Error('Failed to save to temp file: ' + (e as Error).message);
    }

    // Atomic move (or fallback to regular move on Windows)
    try {
      await dfs.rename(tempPath, this._filePath);
    } catch (e) {
      // rename may fail across drives; fallback to copy+delete
      const data = await dfs.readFile(tempPath);
      await dfs.writeFile(this._filePath, data);
      await dfs.remove(tempPath);
    }
  }

  // -------------------------------------------------------------------------
  // Direction-dispatched helpers ("line" = row or column depending on mode)
  // -------------------------------------------------------------------------

  private lastLineNum(): number {
    if (this._isColumnMode) {
      return this.getColumnCount() - 1;
    }
    // ExcelJS: rowCount is 1-based, lastRowNum = rowCount - 1
    // But sheet.rowCount includes phantom rows; use actualRowCount
    return this._sheet.actualRowCount - 1;
  }

  private blankCell(line: number, index: number): void {
    if (this._isColumnMode) {
      // Column mode: line=column, index=row
      // ExcelJS uses 1-based indices
      const row = this._sheet.getRow(index + 1);
      const cell = row.getCell(line + 1);
      cell.value = null;
    } else {
      // Row mode: line=row, index=column
      const row = this._sheet.getRow(line + 1);
      const cell = row.getCell(index + 1);
      cell.value = null;
    }
  }

  private blankLine(line: number): void {
    if (this._isColumnMode) {
      // Column mode: blank `line`-th column in every row
      this._sheet.eachRow({ includeEmpty: true }, (row) => {
        const cell = row.getCell(line + 1);
        cell.value = null;
      });
    } else {
      // Row mode: blank all cells in the row
      const row = this._sheet.getRow(line + 1);
      const cellCount = row.cellCount;
      for (let c = 1; c <= cellCount; c++) {
        const cell = row.getCell(c);
        cell.value = null;
      }
    }
  }

  private appendLineNum(): number {
    if (this._isColumnMode) {
      return this.getColumnCount();
    }
    return this._sheet.actualRowCount;
  }

  private shiftLines(from: number, count: number): void {
    if (this._isColumnMode) {
      // Column mode: shift columns right
      const maxCols = this.getColumnCount();
      if (from >= maxCols) {
        return;
      }
      // ExcelJS doesn't have shiftColumns; we manually move cells
      // Move columns from maxCols-1 down to `from` right by `count`
      for (let c = maxCols - 1; c >= from; c--) {
        this._sheet.eachRow({ includeEmpty: true }, (row) => {
          const srcCell = row.getCell(c + 1);
          const dstCell = row.getCell(c + 1 + count);
          dstCell.value = srcCell.value;
          srcCell.value = null;
        });
      }
    } else {
      // Row mode: shift rows down
      const lastRowNum = this._sheet.actualRowCount - 1;
      if (from > lastRowNum) {
        return;
      }
      // ExcelJS: we need to manually shift rows since there's no shiftRows
      // Move rows from lastRowNum down to `from` downward by `count`
      for (let r = lastRowNum; r >= from; r--) {
        const srcRow = this._sheet.getRow(r + 1);
        const dstRow = this._sheet.getRow(r + 1 + count);
        const cellCount = srcRow.cellCount;
        for (let c = 1; c <= cellCount; c++) {
          dstRow.getCell(c).value = srcRow.getCell(c).value;
        }
        // Clear source row
        for (let c = 1; c <= cellCount; c++) {
          srcRow.getCell(c).value = null;
        }
      }
    }
  }

  private writeLine(lineNum: number, lineData: (string | null)[] | null): void {
    if (this._isColumnMode) {
      // Column mode: lineNum=column, lineData[row] → cells[row][column]
      if (lineData === null) {
        return;
      }
      for (let row = 0; row < lineData.length; row++) {
        const cellValue = lineData[row];
        if (cellValue !== null) {
          const sheetRow = this._sheet.getRow(row + 1);
          sheetRow.getCell(lineNum + 1).value = cellValue;
        }
      }
    } else {
      // Row mode: lineNum=row, lineData[col] → cells[row][col]
      const row = this._sheet.getRow(lineNum + 1);
      if (lineData !== null) {
        for (let col = 0; col < lineData.length; col++) {
          const cellValue = lineData[col];
          if (cellValue !== null) {
            row.getCell(col + 1).value = cellValue;
          }
        }
      }
    }
  }

  private getColumnCount(): number {
    let maxCols = 0;
    this._sheet.eachRow({ includeEmpty: true }, (row) => {
      // row.cellCount gives the number of cells including empty ones
      if (row.cellCount > maxCols) {
        maxCols = row.cellCount;
      }
    });
    return maxCols;
  }
}
