/**
 * ExcelReader — TypeScript port of Java
 * `configgen.data.ReadByFastExcel` (implements `configgen.data.ExcelReader`).
 *
 * Uses ExcelJS to read .xlsx files. For each sheet, produces a DRawSheet
 * containing DRawRow implementations backed by ExcelJS row data.
 *
 * Key differences from Java:
 * - ExcelJS uses 0-based row/column indices (Java FastExcel uses 1-based)
 * - ExcelJS getWorksheet() returns Worksheet objects with eachRow()
 * - We need to handle empty rows (Java fastexcel skips them; we use fillRows)
 */

import ExcelJS from 'exceljs';
import { type DRawRow, EMPTY_ROW } from './DRawRow';
import { DRawSheet } from './DRawSheet';
import { ReadResult, OneSheet } from './ReadResult';
import { CfgDataStat } from './CfgDataStat';
import { getTableNameIndex } from './DataUtil';
import { getDefaultFileSystem } from '@cfgforge/shared';

// ---------------------------------------------------------------------------
// DRawExcelRow — ExcelJS-backed implementation of DRawRow
// ---------------------------------------------------------------------------

class DRawExcelRow implements DRawRow {
  private readonly _values: string[];

  constructor(values: string[]) {
    this._values = values;
  }

  cell(c: number): string {
    if (c < 0 || c >= this._values.length) {
      return '';
    }
    return this._values[c];
  }

  count(): number {
    return this._values.length;
  }
}

// ---------------------------------------------------------------------------
// ExcelReader
// ---------------------------------------------------------------------------

/**
 * Read an .xlsx file and produce a ReadResult with one DRawSheet per valid sheet.
 *
 * @param filePath        absolute path to .xlsx file
 * @param relativePath    relative path from data root (used in DRawSheet)
 * @param readSheet      if non-null, only read sheets matching this name
 */
export async function readExcel(
  filePath: string,
  relativePath: string,
  readSheet: string | null,
): Promise<ReadResult> {
  const stat = new CfgDataStat();
  const sheets: OneSheet[] = [];

  stat.excelCount++;

  const wb = new ExcelJS.Workbook();
  const dfs = getDefaultFileSystem();
  if (dfs.isSyncSupported) {
    // Node environment: ExcelJS can use fs directly
    await wb.xlsx.readFile(filePath);
  } else {
    // Tauri/WebView environment: fs is externalized (empty stub),
    // so read file bytes via CfgFileSystem then load into ExcelJS
    const buf = await dfs.readFile(filePath);
    // ExcelJS.xlsx.load expects a Node Buffer; wrap the Uint8Array bytes.
    // Cast to any: ExcelJS type defs expect Buffer, but at runtime Uint8Array works.
    const nodeBuf = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
    await wb.xlsx.load(nodeBuf as any);
  }

  for (const worksheet of wb.worksheets) {
    const sheetName = worksheet.name.trim();
    const ti = getTableNameIndex(relativePath, sheetName);
    if (ti === null) {
      stat.ignoredSheetCount++;
      continue;
    }

    if (readSheet !== null && readSheet !== sheetName) {
      continue;
    }

    stat.sheetCount++;

    // Convert ExcelJS rows to DRawRow[]
    const rows: DRawRow[] = [];

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      // rowNumber is 1-based; fill gaps with EMPTY_ROW
      const rawRowIdx = rowNumber - 1; // 0-based
      while (rows.length < rawRowIdx) {
        rows.push(EMPTY_ROW);
      }

      // Extract cell values as trimmed strings
      const cellCount = row.cellCount;
      const values: string[] = [];
      for (let c = 1; c <= cellCount; c++) {
        const cell = row.getCell(c);
        values.push(cellToString(cell).trim());
      }

      rows.push(new DRawExcelRow(values));
    });

    // Fix empty rows at end - if the sheet had rows but they were all empty after content
    // Actually ExcelJS eachRow with includeEmpty:false already skips empty rows
    // We need to handle the gap-filling above

    const drs = new DRawSheet(
      relativePath,
      sheetName,
      ti.index,
      rows,
      [],
    );
    sheets.push(new OneSheet(ti.tableName, drs));
  }

  return new ReadResult(sheets, stat, null);
}

// ---------------------------------------------------------------------------
// Helper: convert ExcelJS cell to string
// ---------------------------------------------------------------------------

function cellToString(cell: ExcelJS.Cell): string {
  const t = cell.type;
  switch (t) {
    case ExcelJS.ValueType.Number:
      return String(cell.value as number);
    case ExcelJS.ValueType.String:
      return String(cell.value);
    case ExcelJS.ValueType.Boolean:
      return String(cell.value);
    case ExcelJS.ValueType.Formula:
      return String((cell.value as ExcelJS.CellFormulaValue).result ?? '');
    case ExcelJS.ValueType.Null:
    case ExcelJS.ValueType.Merge:
      return '';
    case ExcelJS.ValueType.RichText: {
      const rt = cell.value as ExcelJS.CellRichTextValue;
      return rt.richText.map((r) => r.text).join('');
    }
    case ExcelJS.ValueType.Hyperlink: {
      const hl = cell.value as ExcelJS.CellHyperlinkValue;
      if (typeof hl.text === 'string') return hl.text;
      if (typeof hl.text === 'object' && hl.text !== null) {
        const rt = hl.text as ExcelJS.CellRichTextValue;
        return rt.richText.map((r) => r.text).join('');
      }
      return String(hl.text ?? '');
    }
    case ExcelJS.ValueType.Error:
      return String(cell.value ?? '');
    default:
      return String(cell.value ?? '');
  }
}
