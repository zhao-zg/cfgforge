/**
 * CSV 读写工具。
 * 原 Java: configgen.util.CSVUtil
 *
 * 读：使用 csv-parse 库 + UnicodeReader (BOM 检测)
 * 写：RFC4180 转义
 */

import * as fs from 'fs';
import { parse as csvParseSync } from 'csv-parse/sync';
import { readFromBuffer } from './UnicodeReader';
import { BomUtf8Writer } from './BomUtf8Writer';

export type CSVRow = string[];

export function readCSV(filePath: string, defaultEncoding: string, fieldSeparator: string = ','): CSVRow[] {
  const buf = fs.readFileSync(filePath);
  const text = readFromBuffer(buf, defaultEncoding);

  const records = csvParseSync(text, {
    relax_quotes: true,        // allowExtraCharsAfterClosingQuote
    relax_column_count: true,  // FieldMismatchStrategy.IGNORE
    skip_empty_lines: false,
    comment: false,            // CommentStrategy.NONE
    delimiter: fieldSeparator,
  });

  return records as CSVRow[];
}

export function readAndNormalizeCSV(filePath: string, defaultEncoding: string): CSVRow[] {
  const rows = readCSV(filePath, defaultEncoding);
  if (rows.length === 0) return [];

  let maxCols = 0;
  for (const row of rows) {
    if (row.length > maxCols) maxCols = row.length;
  }

  const result: CSVRow[] = [];
  for (const row of rows) {
    const normalized: string[] = [];
    for (let c = 0; c < maxCols; c++) {
      normalized.push(c < row.length ? row[c] : '');
    }
    result.push(normalized);
  }
  return result;
}

export function writeCSV(sb: string[], rows: CSVRow[]): void {
  if (rows.length === 0) return;

  const columnCount = rows[0].length;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (row.length !== columnCount) {
      throw new Error(
        `CSV row ${r} has ${row.length} columns, but first row has ${columnCount} columns`
      );
    }

    for (let c = 0; c < row.length; c++) {
      let cell = row[c];
      let enclose = false;

      if (cell.includes('"')) {
        cell = cell.replace(/"/g, '""');
        enclose = true;
      } else if (cell.includes('\r\n') || cell.includes(',')) {
        enclose = true;
      } else if (cell.includes('\r') || cell.includes('\n')) {
        enclose = true;
      }

      if (enclose) {
        cell = '"' + cell + '"';
      }

      sb.push(cell);
      if (c !== row.length - 1) {
        sb.push(',');
      } else {
        sb.push('\r\n');
      }
    }
  }
}

export function writeCSVToFile(filePath: string, rows: CSVRow[]): void {
  const writer = new BomUtf8Writer(filePath);
  try {
    if (rows.length === 0) return;
    const sb: string[] = [];
    writeCSV(sb, rows);
    writer.write(sb.join(''));
  } finally {
    writer.close();
  }
}

export function escapeCsv(value: string | null | undefined): string {
  if (!value || value.length === 0) {
    return '';
  }
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}
