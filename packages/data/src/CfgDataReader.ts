/**
 * CfgDataReader — TypeScript port of Java `configgen.data.CfgDataReader`.
 *
 * Two-phase data reading pipeline:
 *   Phase 1: Read all CSV/Excel files into DRawSheet → DTable
 *   Phase 2: Parse headers (HeadParser) and data cells (CellParser)
 *
 * Java uses work-stealing pool for concurrency; TS version is synchronous
 * (per design decision). Error handling: CfgSchemaErrs is passed in and
 * merged from per-table parsing.
 *
 * Dependencies: data → schema (allowed by architecture rules)
 */

import { CfgDataStat } from './CfgDataStat';
import { CfgData } from './CfgData';
import { DTable } from './DTable';
import type { DRawSheet } from './DRawSheet';
import { HeadParser } from './HeadParser';
import { CellParser } from './CellParser';
import type { HeadRow } from './HeadRows';
import type { ReadResult } from './ReadResult';
import { FileFmt, getTableNameIndex } from './DataUtil';
import { CfgSchemaErrs } from '@cfgforge/schema';

// Minimal CfgSchemaErrs interface to avoid tight coupling
export interface CfgSchemaErrsLike {
  addErr(err: unknown): void;
  merge(other: CfgSchemaErrsLike): void;
}

// Minimal CfgSchema interface for isColumnMode lookup
export interface CfgSchemaLike {
  requireResolved(): void;
  findTable(name: string): { isColumnMode: boolean } | undefined;
}

// ---------------------------------------------------------------------------
// ExcelFileInfo — TypeScript port of Java record
// ---------------------------------------------------------------------------

export interface ExcelFileInfo {
  lastModified: number;
  path: string;
  relativePath: string;
  fmt: FileFmt;
  nullableAddTag: string | null;
}

// ---------------------------------------------------------------------------
// ReadCsv / ReadExcel function types (port of Java functional interfaces)
// ---------------------------------------------------------------------------

export type ReadCsvFn = (
  filePath: string,
  relativePath: string,
  tableName: string,
  index: number,
  fieldSeparator: string,
  nullableAddTag: string | null,
) => ReadResult;

export type ReadExcelFn = (
  filePath: string,
  relativePath: string,
  sheetNameFilter: string | null,
) => ReadResult;

// ---------------------------------------------------------------------------
// SchemaUtil — isColumnMode helper (ported from Java SchemaUtil)
// ---------------------------------------------------------------------------

function isColumnMode(cfgSchema: CfgSchemaLike | null, tableName: string): boolean {
  if (cfgSchema === null) return false;
  cfgSchema.requireResolved();
  const table = cfgSchema.findTable(tableName);
  if (table !== undefined) {
    return table.isColumnMode;
  }
  return false;
}

// ---------------------------------------------------------------------------
// CfgDataReader
// ---------------------------------------------------------------------------

export class CfgDataReader {
  readonly headRow: HeadRow;
  readonly csvReader: ReadCsvFn;
  readonly excelReader: ReadExcelFn;

  constructor(headRow: HeadRow, csvReader: ReadCsvFn, excelReader: ReadExcelFn) {
    if (headRow === null || headRow === undefined) throw new Error('headRow is required');
    if (csvReader === null || csvReader === undefined) throw new Error('csvReader is required');
    if (excelReader === null || excelReader === undefined) throw new Error('excelReader is required');
    this.headRow = headRow;
    this.csvReader = csvReader;
    this.excelReader = excelReader;
  }

  readCfgData(
    excelFiles: ExcelFileInfo[],
    nullableCfgSchema: CfgSchemaLike | null,
    errs: CfgSchemaErrsLike,
  ): CfgData {
    const stat = new CfgDataStat();
    const tables = new Map<string, DTable>();
    const data = new CfgData(tables, stat);

    // Phase 1: read all csv/excel files
    for (const df of excelFiles) {
      if (df.fmt === FileFmt.CSV || df.fmt === FileFmt.TXT_AS_TSV) {
        const ti = getTableNameIndex(df.relativePath);
        if (ti === null) {
          stat.ignoredCsvCount++;
        } else {
          stat.csvCount++;
          const fieldSeparator = df.fmt === FileFmt.CSV ? ',' : '\t';
          try {
            const result = this.csvReader(
              df.path,
              df.relativePath,
              ti.tableName,
              ti.index,
              fieldSeparator,
              df.nullableAddTag,
            );
            for (const sheet of result.sheets) {
              this.addSheet(data, sheet.tableName, sheet.sheet, result.nullableAddTag);
            }
            stat.merge(result.stat);
          } catch (e) {
            throw new Error(`read csv failed: ${df.path}: ${(e as Error).message}`);
          }
        }
      } else if (df.fmt === FileFmt.EXCEL) {
        try {
          const result = this.excelReader(df.path, df.relativePath, null);
          for (const sheet of result.sheets) {
            this.addSheet(data, sheet.tableName, sheet.sheet, result.nullableAddTag);
          }
          stat.merge(result.stat);
        } catch (e) {
          throw new Error(`read excel failed: ${df.path}: ${(e as Error).message}`);
        }
      }
    }

    // Phase 2: parse head & data cell
    for (const table of data.tables.values()) {
      const tStat = new CfgDataStat();
      const tErrs = CfgSchemaErrs.of();
      const cm = isColumnMode(nullableCfgSchema, table.tableName);
      try {
        HeadParser.parse(table, tStat, this.headRow, cm, tErrs);
        CellParser.parse(table, tStat, this.headRow.rowCount(), cm);
      } catch (e) {
        throw new Error(`parse table failed: ${table.tableName}: ${(e as Error).message}`);
      }
      stat.merge(tStat);
      errs.merge(tErrs);
    }

    stat.tableCount = data.tables.size;
    return data;
  }

  private addSheet(
    cfgData: CfgData,
    tableName: string,
    sheetData: DRawSheet,
    nullableAddTag: string | null,
  ): void {
    const existing = cfgData.getDTable(tableName);
    if (existing !== undefined) {
      existing.rawSheets.push(sheetData);
    } else {
      const newTable = DTable.of(tableName, [sheetData], nullableAddTag);
      cfgData.tables.set(tableName, newTable);
    }
  }
}
