/**
 * CsvReader — TypeScript port of Java `configgen.data.ReadCsv`.
 *
 * Uses shared/CSVUtil to read .csv files. Produces a DRawSheet with DRawCsvRow.
 *
 * Key differences from Java:
 * - Java uses fastcsv, TS uses csv-parse via @cfgforge/shared
 * - Java CsvRecord.getFieldCount() → array.length
 * - Java CsvRecord.getField(c) → array[c]
 */

import { readCSV, type CSVRow } from '@cfgforge/shared';
import { type DRawRow } from './DRawRow';
import { DRawSheet } from './DRawSheet';
import { ReadResult, OneSheet } from './ReadResult';
import { CfgDataStat } from './CfgDataStat';

// ---------------------------------------------------------------------------
// DRawCsvRow — CSV-backed implementation of DRawRow
// ---------------------------------------------------------------------------

class DRawCsvRow implements DRawRow {
  private readonly _row: string[];

  constructor(row: string[]) {
    this._row = row;
  }

  cell(c: number): string {
    if (c < 0 || c >= this._row.length) {
      return '';
    }
    return this._row[c].trim();
  }

  count(): number {
    return this._row.length;
  }
}

// ---------------------------------------------------------------------------
// CsvReader
// ---------------------------------------------------------------------------

/**
 * Read a .csv file and produce a ReadResult with one DRawSheet.
 *
 * @param filePath       absolute path to .csv file
 * @param relativePath   relative path from data root (used in DRawSheet)
 * @param tableName      resolved table name (e.g. 'buff.buffclass')
 * @param index          index for multi-file tables (default 0)
 * @param fieldSeparator field separator char (default ',')
 * @param defaultEncoding default encoding for non-BOM files (e.g. 'gbk')
 * @param nullableAddTag optional tag like "-client" or "-server"
 */
export function readCsv(
  filePath: string,
  relativePath: string,
  tableName: string,
  index: number = 0,
  fieldSeparator: string = ',',
  defaultEncoding: string = 'gbk',
  nullableAddTag: string | null = null,
): ReadResult {
  const stat = new CfgDataStat();
  const rows: DRawRow[] = [];

  const csvRows: CSVRow[] = readCSV(filePath, defaultEncoding, fieldSeparator);

  for (const csvRow of csvRows) {
    rows.push(new DRawCsvRow(csvRow));
    stat.cellCsvCount += csvRow.length;
  }

  const sheet = new DRawSheet(relativePath, '', index, rows, []);
  return new ReadResult([new OneSheet(tableName, sheet)], stat, nullableAddTag);
}
