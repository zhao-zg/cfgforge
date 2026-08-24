/**
 * DTable tests — TypeScript port of Java `configgen.data.CfgData.DTable`.
 */

import { describe, it, expect } from 'vitest';
import { DTable } from '../DTable';
import { DRawSheet } from '../DRawSheet';
import { DField } from '../DField';

describe('DTable', () => {
  describe('of() factory', () => {
    it('creates DTable with empty fields and rows', () => {
      const rawSheets: DRawSheet[] = [];
      const table = DTable.of('buff.buff', rawSheets);
      expect(table.tableName).toBe('buff.buff');
      expect(table.fields).toEqual([]);
      expect(table.rows).toEqual([]);
      expect(table.rawSheets).toBe(rawSheets);
      expect(table.nullableAddTag).toBeNull();
    });

    it('creates DTable with nullableAddTag', () => {
      const table = DTable.of('buff.buff', [], '-client');
      expect(table.nullableAddTag).toBe('-client');
    });
  });

  describe('getSheetByRowId()', () => {
    it('finds sheet by fileName and sheetName', () => {
      const sheet1 = new DRawSheet('buff/buffclass.csv', '', 0, [], [0, 1]);
      const sheet2 = new DRawSheet('ai/ai.xlsx', 'AI_ACTION', 0, [], [0]);
      const table = DTable.of('test', [sheet1, sheet2]);
      
      const found = table.getSheetByRowId({ fileName: 'ai/ai.xlsx', sheetName: 'AI_ACTION', row: 5 });
      expect(found).toBe(sheet2);
    });

    it('throws when sheet not found', () => {
      const table = DTable.of('test', []);
      expect(() => table.getSheetByRowId({ fileName: 'none', sheetName: '', row: 0 })).toThrow();
    });
  });
});
