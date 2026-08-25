/**
 * CsvTableFile — TypeScript port of Java `configgen.write.AbstractCsvTableFile`
 * + `CsvTableFile` (row mode) + `ColumnModeCsvTableFile` (column mode).
 *
 * Per the design doc (§4.7), the three Java classes are merged into one.
 * Row mode and column mode share the same skeleton (emptyRows /
 * insertRecordBlock); direction-specific operations are dispatched via
 * the `_isColumnMode` flag:
 *   - Row mode:     "line" = row
 *   - Column mode:  "line" = column
 *
 * Java sources:
 *   AbstractCsvTableFile.java (168 lines)
 *   CsvTableFile.java (70 lines)
 *   ColumnModeCsvTableFile.java (98 lines)
 */

import * as path from 'path';
import { readAndNormalizeCSV, writeCSVToFile, type CSVRow } from '@cfggen/shared';
import type { RecordBlockTransformed } from '../RecordBlock';
import type { TableFile } from '../TableFile';

export class CsvTableFile implements TableFile {
  private readonly _filePath: string;
  private readonly _rows: CSVRow[];
  private readonly _headRow: number;
  private readonly _isColumnMode: boolean;
  private _fixedMaxColumnCount: number;
  private _modified = false;

  constructor(
    filePath: string,
    defaultEncoding: string,
    headRow: number,
    isColumnMode: boolean,
  ) {
    if (headRow < 0) {
      throw new Error('headRow must be non-negative');
    }

    this._filePath = filePath;
    this._headRow = headRow;
    this._isColumnMode = isColumnMode;

    try {
      this._rows = readAndNormalizeCSV(filePath, defaultEncoding);
    } catch (e) {
      throw new Error('Failed to read CSV file: ' + filePath + ' — ' + (e as Error).message);
    }

    if (this._rows.length === 0) {
      throw new Error('CSV file has no data: ' + filePath);
    }
    this._fixedMaxColumnCount = this._rows[0].length;
  }

  // -------------------------------------------------------------------------
  // TableFile interface
  // -----------------------------------------------------------------

  emptyRows(startLine: number, count: number, fieldIndices: number[] | null): void {
    const lineCount = this.lineCount();
    if (startLine < 0 || count <= 0 || startLine >= lineCount) {
      return;
    }

    const end = Math.min(startLine + count, lineCount);
    for (let i = startLine; i < end; i++) {
      if (i === startLine && fieldIndices !== null) {
        for (const cellIndex of fieldIndices) {
          this.emptyCell(i, cellIndex);
        }
      } else {
        this.emptyLine(i);
      }
    }
    this.markModified();
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
      actualStartLine = Math.max(this.lineCount(), this._headRow);
    } else {
      actualStartLine = startLine;
    }

    if (contentLineCount > emptyLineCount && startLine !== -1) {
      this.insertGapLines(actualStartLine + emptyLineCount, contentLineCount - emptyLineCount);
    }

    const required = actualStartLine + contentLineCount;
    this.ensureCapacity(required);

    for (let lineOffset = 0; lineOffset < contentLineCount; lineOffset++) {
      const lineData = content.getRow(lineOffset);
      if (lineData !== null) {
        this.writeLine(actualStartLine + lineOffset, lineData, required);
      }
    }
    this.markModified();
  }

  async saveAndClose(): Promise<void> {
    if (!this._modified) {
      return;
    }
    try {
      writeCSVToFile(this._filePath, this._rows);
      this._modified = false;
    } catch (e) {
      throw new Error('Failed to save CSV file: ' + this._filePath + ' — ' + (e as Error).message);
    }
  }

  // -------------------------------------------------------------------------
  // Direction-dispatched helpers ("line" = row or column depending on mode)
  // -------------------------------------------------------------------------

  private lineCount(): number {
    return this._isColumnMode ? this.getColumnCount() : this._rows.length;
  }

  private emptyCell(line: number, index: number): void {
    if (this._isColumnMode) {
      // Column mode: line=column, index=row
      if (index >= 0 && index < this._rows.length) {
        const row = this._rows[index];
        if (line < row.length) {
          row[line] = '';
        }
      }
    } else {
      // Row mode: line=row, index=column
      const row = this._rows[line];
      if (index >= 0 && index < row.length) {
        row[index] = '';
      }
    }
  }

  private emptyLine(line: number): void {
    if (this._isColumnMode) {
      // Column mode: clear `line`-th cell in every row
      for (const row of this._rows) {
        if (line < row.length) {
          row[line] = '';
        }
      }
    } else {
      // Row mode: clear all cells in the row
      const row = this._rows[line];
      for (let c = 0; c < row.length; c++) {
        row[c] = '';
      }
    }
  }

  private insertGapLines(from: number, count: number): void {
    if (this._isColumnMode) {
      for (let i = 0; i < count; i++) {
        this.insertColumn(from + i);
      }
    } else {
      for (let i = 0; i < count; i++) {
        this._rows.splice(from + i, 0, this.createEmptyRow());
      }
    }
  }

  private ensureCapacity(required: number): void {
    if (this._isColumnMode) {
      const currentMaxCols = this.getColumnCount();
      if (required <= currentMaxCols) {
        return;
      }
      for (const row of this._rows) {
        while (row.length < required) {
          row.push('');
        }
      }
    } else {
      while (this._rows.length < required) {
        this._rows.push(this.createEmptyRow());
      }
    }
  }

  private writeLine(lineNum: number, lineData: (string | null)[], capacity: number): void {
    if (this._isColumnMode) {
      const newRowColCount = Math.max(this.getColumnCount(), capacity);
      while (this._rows.length < lineData.length) {
        this._rows.push(this.createEmptyRow(newRowColCount));
      }
      for (let row = 0; row < lineData.length; row++) {
        const cellValue = lineData[row];
        if (cellValue !== null) {
          const rowData = this._rows[row];
          while (rowData.length <= lineNum) {
            rowData.push('');
          }
          rowData[lineNum] = cellValue;
        }
      }
    } else {
      const row = this._rows[lineNum];
      for (let col = 0; col < lineData.length; col++) {
        const cellValue = lineData[col];
        if (cellValue !== null) {
          row[col] = cellValue;
        }
      }
    }
  }

  private createEmptyRow(columnCount: number = this._fixedMaxColumnCount): CSVRow {
    return new Array(columnCount).fill('');
  }

  private insertColumn(colIndex: number): void {
    for (const row of this._rows) {
      if (colIndex < row.length) {
        row.splice(colIndex, 0, '');
      } else {
        row.push('');
      }
    }
  }

  private getColumnCount(): number {
    return this._rows.length === 0 ? 0 : this._rows[0].length;
  }

  private markModified(): void {
    this._modified = true;
  }
}
