/**
 * HeadParser tests — TypeScript port of Java `configgen.data.HeadParser`.
 *
 * Tests both row-mode and column-mode header parsing, including:
 * - name extraction (with .,/@ suffix stripping)
 * - comment extraction (with -- newline replacement, # prefix strip)
 * - field indices population
 * - multi-sheet header consistency check
 */

import { describe, it, expect } from 'vitest';
import { HeadParser } from '../HeadParser';
import { HeadRows } from '../HeadRows';
import { DTable } from '../DTable';
import { DRawSheet } from '../DRawSheet';
import type { DRawRow } from '../DRawRow';
import { CfgDataStat } from '../CfgDataStat';

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

// Helper: create a DRawSheet with given rows (array of arrays)
function makeSheet(
  relativeFilePath: string,
  sheetName: string,
  index: number,
  rows: string[][],
): DRawSheet {
  return new DRawSheet(
    relativeFilePath,
    sheetName,
    index,
    rows.map(makeRow),
    [],
  );
}

describe('HeadParser', () => {
  describe('parse() in row mode (A2_Default)', () => {
    it('parses simple header with name and comment rows', () => {
      const rows = [
        ['ID注释', 'Name注释', 'Hp注释'],  // comment row (row 0)
        ['Id', 'Name', 'Hp'],                // name row (row 1)
      ];
      const sheet = makeSheet('test.csv', '', 0, rows);
      const table = DTable.of('test', [sheet]);
      const stat = new CfgDataStat();
      const errs = { addErr: () => {} } as any;

      HeadParser.parse(table, stat, HeadRows.A2_Default, false, errs);

      expect(table.fields.length).toBe(3);
      expect(table.fields[0].name).toBe('Id');
      expect(table.fields[0].comment).toBe('ID注释');
      expect(table.fields[1].name).toBe('Name');
      expect(table.fields[1].comment).toBe('Name注释');
      expect(table.fields[2].name).toBe('Hp');
      expect(table.fields[2].comment).toBe('Hp注释');
    });

    it('populates fieldIndices on the sheet', () => {
      const rows = [
        ['c1', 'c2', 'c3'],
        ['Id', 'Name', 'Hp'],
      ];
      const sheet = makeSheet('test.csv', '', 0, rows);
      const table = DTable.of('test', [sheet]);
      const stat = new CfgDataStat();
      const errs = { addErr: () => {} } as any;

      HeadParser.parse(table, stat, HeadRows.A2_Default, false, errs);

      expect(sheet.fieldIndices).toEqual([0, 1, 2]);
    });

    it('skips empty name columns and updates ignoredColumnCount', () => {
      const rows = [
        ['c1', '', 'c3'],
        ['Id', '', 'Hp'],
      ];
      const sheet = makeSheet('test.csv', '', 0, rows);
      const table = DTable.of('test', [sheet]);
      const stat = new CfgDataStat();
      const errs = { addErr: () => {} } as any;

      HeadParser.parse(table, stat, HeadRows.A2_Default, false, errs);

      expect(table.fields.length).toBe(2);
      expect(table.fields[0].name).toBe('Id');
      expect(table.fields[1].name).toBe('Hp');
      expect(sheet.fieldIndices).toEqual([0, 2]);
      expect(stat.ignoredColumnCount).toBe(1);
      expect(stat.columnCount).toBe(2);
    });

    it('strips .,/@ suffixes from column names', () => {
      const rows = [
        ['', '', ''],
        ['Id', 'Name.0', 'Hp@type'],
      ];
      const sheet = makeSheet('test.csv', '', 0, rows);
      const table = DTable.of('test', [sheet]);
      const stat = new CfgDataStat();
      const errs = { addErr: () => {} } as any;

      HeadParser.parse(table, stat, HeadRows.A2_Default, false, errs);

      expect(table.fields[0].name).toBe('Id');
      expect(table.fields[1].name).toBe('Name');
      expect(table.fields[2].name).toBe('Hp');
    });

    it('replaces newlines in comments with --', () => {
      const rows = [
        ['line1\r\nline2', 'a\rb', 'c\nd'],
        ['Id', 'Name', 'Hp'],
      ];
      const sheet = makeSheet('test.csv', '', 0, rows);
      const table = DTable.of('test', [sheet]);
      const stat = new CfgDataStat();
      const errs = { addErr: () => {} } as any;

      HeadParser.parse(table, stat, HeadRows.A2_Default, false, errs);

      expect(table.fields[0].comment).toBe('line1--line2');
      expect(table.fields[1].comment).toBe('a--b');
      expect(table.fields[2].comment).toBe('c--d');
    });

    it('strips # prefix from first column comment', () => {
      const rows = [
        ['#This is a comment', 'normal', ''],
        ['Id', 'Name', 'Hp'],
      ];
      const sheet = makeSheet('test.csv', '', 0, rows);
      const table = DTable.of('test', [sheet]);
      const stat = new CfgDataStat();
      const errs = { addErr: () => {} } as any;

      HeadParser.parse(table, stat, HeadRows.A2_Default, false, errs);

      expect(table.fields[0].comment).toBe('This is a comment');
    });

    it('clears comment when it equals name', () => {
      const rows = [
        ['Id', 'Name', 'Hp'],
        ['Id', 'Name', 'Hp'],
      ];
      const sheet = makeSheet('test.csv', '', 0, rows);
      const table = DTable.of('test', [sheet]);
      const stat = new CfgDataStat();
      const errs = { addErr: () => {} } as any;

      HeadParser.parse(table, stat, HeadRows.A2_Default, false, errs);

      expect(table.fields[0].comment).toBe('');
      expect(table.fields[1].comment).toBe('');
      expect(table.fields[2].comment).toBe('');
    });

    it('trims trailing empty columns from the logic row', () => {
      const rows = [
        ['c1', 'c2', '', '', ''],
        ['Id', 'Name', '', '', ''],
      ];
      const sheet = makeSheet('test.csv', '', 0, rows);
      const table = DTable.of('test', [sheet]);
      const stat = new CfgDataStat();
      const errs = { addErr: () => {} } as any;

      HeadParser.parse(table, stat, HeadRows.A2_Default, false, errs);

      expect(table.fields.length).toBe(2);
      expect(sheet.fieldIndices).toEqual([0, 1]);
    });
  });

  describe('parse() with A4 head row', () => {
    it('parses header with suggestedType row', () => {
      // A4: commentRow=3, nameRow=0, suggestedTypeRow=1
      const rows = [
        ['Id', 'Name', 'Hp'],           // name row (row 0)
        ['int', 'string', 'float'],      // suggested type row (row 1)
        ['data1', 'data2', 'data3'],     // data row (row 2)
        ['ID注释', 'Name注释', 'Hp注释'], // comment row (row 3)
      ];
      const sheet = makeSheet('test.csv', '', 0, rows);
      const table = DTable.of('test', [sheet]);
      const stat = new CfgDataStat();
      const errs = { addErr: () => {} } as any;

      HeadParser.parse(table, stat, HeadRows.A4, false, errs);

      expect(table.fields.length).toBe(3);
      expect(table.fields[0].name).toBe('Id');
      expect(table.fields[0].comment).toBe('ID注释');
      expect(table.fields[0].suggestedType).toBe('int');
      expect(table.fields[1].suggestedType).toBe('string');
      expect(table.fields[2].suggestedType).toBe('float');
    });
  });

  describe('parse() in column mode', () => {
    it('reads header from columns instead of rows', () => {
      // Column mode: each row is a "column", each column is a "row"
      // Logic row at rowIndex reads from each row's cell at that index
      const rows = [
        makeRow(['Id', 'Name', 'Hp']),         // "column" 0: names
        makeRow(['c1', 'c2', 'c3']),            // "column" 1: comments
        makeRow(['1', 'foo', '100']),           // "column" 2: data
        makeRow(['2', 'bar', '200']),           // "column" 3: data
      ];
      const sheet = new DRawSheet('test.csv', '', 0, rows, []);
      const table = DTable.of('test', [sheet]);
      const stat = new CfgDataStat();
      const errs = { addErr: () => {} } as any;

      // A2_Default: commentRow=0, nameRow=1
      HeadParser.parse(table, stat, HeadRows.A2_Default, true, errs);

      // In column mode, getLogicRow reads cell(rowIndex) from each physical row:
      // - commentRow (0): cell(0) from each row → ['Id', 'c1', '1', '2']
      // - nameRow (1): cell(1) from each row → ['Name', 'c2', 'foo', 'bar']
      // All non-empty, so no trailing trim → 4 fields
      expect(table.fields.length).toBe(4);
      expect(table.fields[0].name).toBe('Name');
      expect(table.fields[1].name).toBe('c2');
      expect(table.fields[2].name).toBe('foo');
      expect(table.fields[3].name).toBe('bar');
    });
  });

  describe('parse() multi-sheet', () => {
    it('sorts sheets by index before parsing', () => {
      const rows1 = [['c1'], ['Field1']];
      const rows2 = [['c2'], ['Field2']];
      // sheet with index 1 comes before index 0 in insertion order
      const sheet2 = makeSheet('test_1.csv', '', 1, rows2);
      const sheet1 = makeSheet('test_0.csv', '', 0, rows1);
      const table = DTable.of('test', [sheet2, sheet1]);
      const stat = new CfgDataStat();
      const errs = { addErr: () => {}, addWarn: () => {} } as any;

      HeadParser.parse(table, stat, HeadRows.A2_Default, false, errs);

      // First header should be from sheet with index 0
      expect(table.fields[0].name).toBe('Field1');
    });

    it('reports warning when headers differ between sheets', () => {
      const rows1 = [['c1'], ['Field1']];
      const rows2 = [['c2'], ['DifferentName']];
      const sheet1 = makeSheet('test_0.csv', '', 0, rows1);
      const sheet2 = makeSheet('test_1.csv', '', 1, rows2);
      const table = DTable.of('test', [sheet1, sheet2]);
      const stat = new CfgDataStat();
      let addWarnCalled = false;
      const errs = {
        addErr: () => {},
        addWarn: () => { addWarnCalled = true; },
      } as any;

      HeadParser.parse(table, stat, HeadRows.A2_Default, false, errs);

      expect(addWarnCalled).toBe(true);
      // Uses first sheet's header
      expect(table.fields[0].name).toBe('Field1');
    });
  });

  describe('parse() simple overload', () => {
    it('parse(table, stat) uses A2_Default and row mode', () => {
      const rows = [['c1', 'c2'], ['Id', 'Name']];
      const sheet = makeSheet('test.csv', '', 0, rows);
      const table = DTable.of('test', [sheet]);
      const stat = new CfgDataStat();

      HeadParser.parse(table, stat);

      expect(table.fields.length).toBe(2);
      expect(table.fields[0].name).toBe('Id');
    });
  });
});
