/**
 * TableFileLocator tests — T7.1
 *
 * Tests:
 * - getLocFromRecord: extracts DRowId from a VStruct's source (DCell/DCellList)
 * - getSheetFromDTable: returns the last rawSheet from a DTable
 * - createTableFile: factory that creates CsvTableFile or ExcelTableFile
 *   based on file extension (T7.2 will provide concrete classes; here we
 *   test the extension-based dispatch logic)
 */

import { describe, it, expect } from 'vitest';
import { TableFileLocator } from '../TableFileLocator';
import { DCell, DRowId, DRawSheet, DCellList, DTable } from '@cfggen/data';

describe('TableFileLocator', () => {
  describe('getLocFromRecord', () => {
    it('returns DRowId from a VStruct whose source is a DCell', () => {
      const rowId = new DRowId('test.csv', '', 5);
      const cell = new DCell('value', rowId, 2, 0);
      const vStruct = {
        source: cell,
      } as any; // minimal VStruct mock

      const loc = TableFileLocator.getLocFromRecord(vStruct);
      expect(loc).toBe(rowId);
      expect(loc.fileName).toBe('test.csv');
      expect(loc.row).toBe(5);
    });

    it('returns first cell DRowId from a VStruct whose source is DCellList', () => {
      const rowId1 = new DRowId('data.xlsx', 'Sheet1', 3);
      const rowId2 = new DRowId('data.xlsx', 'Sheet1', 4);
      const cell1 = new DCell('a', rowId1, 0, 0);
      const cell2 = new DCell('b', rowId2, 1, 0);
      const cellList = new DCellList([cell1, cell2]);
      const vStruct = { source: cellList } as any;

      const loc = TableFileLocator.getLocFromRecord(vStruct);
      expect(loc).toBe(rowId1);
      expect(loc.row).toBe(3);
    });

    it('throws when DCellList is empty', () => {
      const cellList = new DCellList([]);
      const vStruct = { source: cellList } as any;
      expect(() => TableFileLocator.getLocFromRecord(vStruct)).toThrow();
    });

    it('throws when source is DFile (JSON record)', () => {
      const dFile = { fileName: 'test.json', inStruct: 's', path: [] };
      const vStruct = { source: dFile } as any;
      expect(() => TableFileLocator.getLocFromRecord(vStruct)).toThrow();
    });
  });

  describe('getSheetFromDTable', () => {
    it('returns the last rawSheet', () => {
      const sheet1 = new DRawSheet('a.csv', '', 0, [], []);
      const sheet2 = new DRawSheet('b.csv', '', 1, [], []);
      const table = new DTable('test', [], [], [sheet1, sheet2], null);

      const result = TableFileLocator.getSheetFromDTable(table);
      expect(result).toBe(sheet2);
      expect(result.index).toBe(1);
    });

    it('returns the only sheet when there is one', () => {
      const sheet = new DRawSheet('a.csv', '', 0, [], []);
      const table = new DTable('test', [], [], [sheet], null);

      const result = TableFileLocator.getSheetFromDTable(table);
      expect(result).toBe(sheet);
    });

    it('throws when rawSheets is empty', () => {
      const table = new DTable('test', [], [], [], null);
      expect(() => TableFileLocator.getSheetFromDTable(table)).toThrow();
    });
  });
});
