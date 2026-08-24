/**
 * CfgDataReader tests — TypeScript port of Java `configgen.data.CfgDataReader`.
 *
 * Tests the two-phase data reading pipeline:
 * Phase 1: Read all CSV/Excel files into DRawSheet → DTable
 * Phase 2: Parse headers (HeadParser) and data cells (CellParser)
 *
 * Uses mock reader functions to avoid filesystem dependencies.
 */

import { describe, it, expect, vi } from 'vitest';
import { CfgDataReader, type ExcelFileInfo } from '../CfgDataReader';
import { DTable } from '../DTable';
import { DRawSheet } from '../DRawSheet';
import type { DRawRow } from '../DRawRow';
import { ReadResult, OneSheet } from '../ReadResult';
import { CfgDataStat } from '../CfgDataStat';
import { HeadRows } from '../HeadRows';
import { FileFmt, getTableNameIndex } from '../DataUtil';
import type { HeadRow } from '../HeadRows';

// Helper: create a simple DRawRow from an array of strings
function makeRow(cells: string[]): DRawRow {
  return {
    cell(c: number): string {
      return c >= 0 && c < cells.length ? cells[c] : '';
    },
    count(): number {
      return cells.length;
    },
  };
}

// Helper: create a DRawSheet with given rows
function makeSheet(
  relativeFilePath: string,
  sheetName: string,
  index: number,
  rows: string[][],
): DRawSheet {
  return new DRawSheet(relativeFilePath, sheetName, index, rows.map(makeRow), []);
}

// Mock CSV reader that returns a ReadResult from given rows
function makeCsvReader(rows: string[][], tableName: string) {
  return (
    filePath: string,
    relativePath: string,
    tblName: string,
    index: number,
    fieldSeparator: string,
    nullableAddTag: string | null,
  ): ReadResult => {
    const sheet = makeSheet(relativePath, '', index, rows);
    const stat = new CfgDataStat();
    stat.cellCsvCount = rows.length;
    return new ReadResult([new OneSheet(tblName, sheet)], stat, nullableAddTag);
  };
}

// Mock Excel reader that returns a ReadResult from given sheets
function makeExcelReader(sheetsData: { tableName: string; sheet: DRawSheet }[]) {
  return (
    filePath: string,
    relativePath: string,
    sheetNameFilter: string | null,
  ): ReadResult => {
    const stat = new CfgDataStat();
    stat.excelCount = 1;  // Excel reader sets excelCount internally (like Java ReadByFastExcel)
    stat.sheetCount = sheetsData.length;
    const oneSheets = sheetsData.map(d => new OneSheet(d.tableName, d.sheet));
    return new ReadResult(oneSheets, stat, null);
  };
}

describe('CfgDataReader', () => {
  describe('readCfgData — Phase 1 (file reading)', () => {
    it('reads CSV files and creates DTables', () => {
      const csvRows = [
        ['c1', 'c2'],
        ['Id', 'Name'],
        ['1', 'foo'],
      ];
      const csvReader = makeCsvReader(csvRows, 'test');
      const excelReader = makeExcelReader([]);
      const reader = new CfgDataReader(
        HeadRows.A2_Default,
        csvReader,
        excelReader,
      );

      const files: ExcelFileInfo[] = [
        {
          lastModified: 0,
          path: '/data/test.csv',
          relativePath: 'test.csv',
          fmt: FileFmt.CSV,
          nullableAddTag: null,
        },
      ];

      const data = reader.readCfgData(files, null, { addErr: () => {}, merge: () => {} } as any);

      expect(data.tables.size).toBe(1);
      const table = data.getDTable('test')!;
      expect(table).toBeDefined();
      expect(table.rawSheets.length).toBe(1);
      expect(data.stat.csvCount).toBe(1); // counted by CfgDataReader, not by mock reader
    });

    it('reads Excel files and creates DTables', () => {
      const sheet = makeSheet('test.xlsx', 'Sheet1', 0, [
        ['c1', 'c2'],
        ['Id', 'Name'],
      ]);
      const csvReader = makeCsvReader([], '');
      const excelReader = makeExcelReader([{ tableName: 'Sheet1', sheet }]);
      const reader = new CfgDataReader(
        HeadRows.A2_Default,
        csvReader,
        excelReader,
      );

      const files: ExcelFileInfo[] = [
        {
          lastModified: 0,
          path: '/data/test.xlsx',
          relativePath: 'test.xlsx',
          fmt: FileFmt.EXCEL,
          nullableAddTag: null,
        },
      ];

      const data = reader.readCfgData(files, null, { addErr: () => {}, merge: () => {} } as any);

      expect(data.tables.size).toBe(1);
      expect(data.stat.excelCount).toBe(1); // counted by CfgDataReader, not by mock reader
    });

    it('skips CSV files with invalid names (ignoredCsvCount)', () => {
      const csvReader = makeCsvReader([], '');
      const excelReader = makeExcelReader([]);
      const reader = new CfgDataReader(
        HeadRows.A2_Default,
        csvReader,
        excelReader,
      );

      const files: ExcelFileInfo[] = [
        {
          lastModified: 0,
          path: '/data/123bad.csv',
          relativePath: '123bad.csv',
          fmt: FileFmt.CSV,
          nullableAddTag: null,
        },
      ];

      const data = reader.readCfgData(files, null, { addErr: () => {}, merge: () => {} } as any);

      expect(data.tables.size).toBe(0);
      expect(data.stat.ignoredCsvCount).toBe(1);
    });

    it('merges multiple sheets into one DTable by tableName', () => {
      const sheet1 = makeSheet('test_0.csv', '', 0, [['c1'], ['Id'], ['1']]);
      const sheet2 = makeSheet('test_1.csv', '', 1, [['c1'], ['Id'], ['2']]);
      const csvReader = makeCsvReader([], '');
      const excelReader = makeExcelReader([
        { tableName: 'test', sheet: sheet1 },
        { tableName: 'test', sheet: sheet2 },
      ]);
      const reader = new CfgDataReader(
        HeadRows.A2_Default,
        csvReader,
        excelReader,
      );

      const files: ExcelFileInfo[] = [
        {
          lastModified: 0,
          path: '/data/test.xlsx',
          relativePath: 'test.xlsx',
          fmt: FileFmt.EXCEL,
          nullableAddTag: null,
        },
      ];

      const data = reader.readCfgData(files, null, { addErr: () => {}, merge: () => {} } as any);

      expect(data.tables.size).toBe(1);
      const table = data.getDTable('test')!;
      expect(table.rawSheets.length).toBe(2);
    });

    it('passes nullableAddTag to DTable', () => {
      const csvReader = makeCsvReader([['c1'], ['Id'], ['1']], 'test');
      const excelReader = makeExcelReader([]);
      const reader = new CfgDataReader(
        HeadRows.A2_Default,
        csvReader,
        excelReader,
      );

      const files: ExcelFileInfo[] = [
        {
          lastModified: 0,
          path: '/data/test.csv',
          relativePath: 'test.csv',
          fmt: FileFmt.CSV,
          nullableAddTag: '-client',
        },
      ];

      const data = reader.readCfgData(files, null, { addErr: () => {}, merge: () => {} } as any);

      const table = data.getDTable('test')!;
      expect(table.nullableAddTag).toBe('-client');
    });
  });

  describe('readCfgData — Phase 2 (head & cell parsing)', () => {
    it('parses headers and cells after reading', () => {
      const csvRows = [
        ['c1', 'c2'],
        ['Id', 'Name'],
        ['1', 'foo'],
        ['2', 'bar'],
      ];
      const csvReader = makeCsvReader(csvRows, 'test');
      const excelReader = makeExcelReader([]);
      const reader = new CfgDataReader(
        HeadRows.A2_Default,
        csvReader,
        excelReader,
      );

      const files: ExcelFileInfo[] = [
        {
          lastModified: 0,
          path: '/data/test.csv',
          relativePath: 'test.csv',
          fmt: FileFmt.CSV,
          nullableAddTag: null,
        },
      ];

      const data = reader.readCfgData(files, null, { addErr: () => {}, merge: () => {} } as any);

      const table = data.getDTable('test')!;
      expect(table.fields.length).toBe(2);
      expect(table.fields[0].name).toBe('Id');
      expect(table.fields[1].name).toBe('Name');
      expect(table.rows.length).toBe(2);
      expect(table.rows[0][0].value()).toBe('1');
      expect(table.rows[0][1].value()).toBe('foo');
      expect(table.rows[1][0].value()).toBe('2');
    });

    it('reports emptyTableCount for tables with no data rows', () => {
      const csvRows = [
        ['c1', 'c2'],
        ['Id', 'Name'],
      ];
      const csvReader = makeCsvReader(csvRows, 'empty');
      const excelReader = makeExcelReader([]);
      const reader = new CfgDataReader(
        HeadRows.A2_Default,
        csvReader,
        excelReader,
      );

      const files: ExcelFileInfo[] = [
        {
          lastModified: 0,
          path: '/data/empty.csv',
          relativePath: 'empty.csv',
          fmt: FileFmt.CSV,
          nullableAddTag: null,
        },
      ];

      const data = reader.readCfgData(files, null, { addErr: () => {}, merge: () => {} } as any);

      expect(data.stat.emptyTableCount).toBe(1);
      const table = data.getDTable('empty')!;
      expect(table.rows.length).toBe(0);
    });

    it('updates tableCount stat', () => {
      const csvReader = makeCsvReader([['c1'], ['Id'], ['1']], 'test');
      const excelReader = makeExcelReader([]);
      const reader = new CfgDataReader(
        HeadRows.A2_Default,
        csvReader,
        excelReader,
      );

      const files: ExcelFileInfo[] = [
        {
          lastModified: 0,
          path: '/data/test.csv',
          relativePath: 'test.csv',
          fmt: FileFmt.CSV,
          nullableAddTag: null,
        },
      ];

      const data = reader.readCfgData(files, null, { addErr: () => {}, merge: () => {} } as any);

      expect(data.stat.tableCount).toBe(1);
    });

    it('uses A4 headRow when provided', () => {
      const csvRows = [
        ['Id', 'Name'],           // name row (0)
        ['int', 'string'],        // type row (1)
        ['1', 'foo'],             // data (2)
        ['ID注释', 'Name注释'],   // comment row (3)
      ];
      const csvReader = makeCsvReader(csvRows, 'test');
      const excelReader = makeExcelReader([]);
      const reader = new CfgDataReader(
        HeadRows.A4,
        csvReader,
        excelReader,
      );

      const files: ExcelFileInfo[] = [
        {
          lastModified: 0,
          path: '/data/test.csv',
          relativePath: 'test.csv',
          fmt: FileFmt.CSV,
          nullableAddTag: null,
        },
      ];

      const data = reader.readCfgData(files, null, { addErr: () => {}, merge: () => {} } as any);

      const table = data.getDTable('test')!;
      expect(table.fields.length).toBe(2);
      expect(table.fields[0].name).toBe('Id');
      expect(table.fields[0].comment).toBe('ID注释');
      expect(table.fields[0].suggestedType).toBe('int');
      expect(table.rows.length).toBe(0); // headRow=4, only 4 rows → no data
    });
  });

  describe('readCfgData — TXT_AS_TSV format', () => {
    it('reads TXT files as TSV', () => {
      const csvReader = makeCsvReader([['c1', 'c2'], ['Id', 'Name'], ['1', 'foo']], 'test');
      const excelReader = makeExcelReader([]);
      const reader = new CfgDataReader(
        HeadRows.A2_Default,
        csvReader,
        excelReader,
      );

      const files: ExcelFileInfo[] = [
        {
          lastModified: 0,
          path: '/data/test.txt',
          relativePath: 'test.txt',
          fmt: FileFmt.TXT_AS_TSV,
          nullableAddTag: null,
        },
      ];

      const data = reader.readCfgData(files, null, { addErr: () => {}, merge: () => {} } as any);

      expect(data.tables.size).toBe(1);
      expect(data.stat.csvCount).toBe(1); // TXT counted as csv
    });
  });

  describe('readCfgData — error handling', () => {
    it('propagates read errors as RuntimeException', () => {
      const csvReader = () => { throw new Error('read failed'); };
      const excelReader = makeExcelReader([]);
      const reader = new CfgDataReader(
        HeadRows.A2_Default,
        csvReader as any,
        excelReader,
      );

      const files: ExcelFileInfo[] = [
        {
          lastModified: 0,
          path: '/data/test.csv',
          relativePath: 'test.csv',
          fmt: FileFmt.CSV,
          nullableAddTag: null,
        },
      ];

      expect(() => reader.readCfgData(files, null, { addErr: () => {}, merge: () => {} } as any))
        .toThrow();
    });
  });
});
