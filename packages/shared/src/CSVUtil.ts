/**
 * CSV 读写工具。
 * 原 Java: configgen.util.CSVUtil
 *
 * 读：使用 csv-parse 库 + UnicodeReader (BOM 检测)
 * 写：RFC4180 转义
 *
 * T12.0b: 新增 readCSVAsync / writeCSVToFileAsync（异步版，走 CsvFileSystem 抽象）。
 */

import * as fs from 'fs';
import { parse as csvParseSync } from 'csv-parse/sync';
import { readFromBuffer, readTextFileAsync } from './UnicodeReader.js';
import { BomUtf8Writer, writeTextFileWithBomAsync } from './BomUtf8Writer.js';

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

/**
 * 异步读取 CSV 文件（Tauri/WebView 环境可用）。
 * @param filePath 文件路径
 * @param defaultEncoding 无 BOM 时的默认编码
 * @param fieldSeparator 字段分隔符（默认逗号）
 */
export async function readCSVAsync(
  filePath: string,
  defaultEncoding: string,
  fieldSeparator: string = ','
): Promise<CSVRow[]> {
  const text = await readTextFileAsync(filePath, defaultEncoding);

  const records = csvParseSync(text, {
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: false,
    comment: false,
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

/** 对已解析的行做列数补齐（短行补空串到 maxCols）。 */
function normalizeRows(rows: CSVRow[]): CSVRow[] {
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

/**
 * 异步读取并规范化 CSV（短行补齐到最大列数）。
 */
export async function readAndNormalizeCSVAsync(filePath: string, defaultEncoding: string): Promise<CSVRow[]> {
  const rows = await readCSVAsync(filePath, defaultEncoding);
  return normalizeRows(rows);
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

/**
 * 异步写入 CSV 文件（带 UTF-8 BOM），走 CfgFileSystem 抽象。
 * @param filePath 文件路径
 * @param rows 数据行
 */
export async function writeCSVToFileAsync(filePath: string, rows: CSVRow[]): Promise<void> {
  if (rows.length === 0) return;
  const sb: string[] = [];
  writeCSV(sb, rows);
  const text = sb.join('');
  // UTF-8 BOM + 内容，与同步 writeCSVToFile（BomUtf8Writer）保持一致
  await writeTextFileWithBomAsync(filePath, text);
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