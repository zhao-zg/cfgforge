/**
 * DCell tests — TypeScript port of Java `configgen.data.CfgData.DCell`.
 */

import { describe, it, expect } from 'vitest';
import { DCell } from '../DCell';
import { DRowId } from '../DRowId';

describe('DCell', () => {
  describe('constructor', () => {
    it('constructs with value, rowId, col, mode', () => {
      const rowId = new DRowId('test.csv', '', 2);
      const cell = new DCell('hello', rowId, 0, 0);
      expect(cell.value()).toBe('hello');
      expect(cell.rowId()).toBe(rowId);
      expect(cell.col()).toBe(0);
      expect(cell.mode()).toBe(0);
    });
  });

  describe('of() factory', () => {
    it('creates a fake cell from content and fileName', () => {
      const cell = DCell.of('test_value', 'test.json');
      expect(cell.value()).toBe('test_value');
      expect(cell.rowId().fileName).toBe('test.json');
      expect(cell.rowId().sheetName).toBe('');
      expect(cell.rowId().row).toBe(0);
      expect(cell.col()).toBe(0);
      expect(cell.mode()).toBe(DCell.CELL_FAKE);
    });
  });

  describe('modeOf()', () => {
    it('returns 0 for row mode', () => {
      expect(DCell.modeOf(false)).toBe(0);
    });
    it('returns COLUMN_MODE for column mode', () => {
      expect(DCell.modeOf(true)).toBe(DCell.COLUMN_MODE);
    });
  });

  describe('isCellEmpty()', () => {
    it('returns true for empty value', () => {
      const rowId = new DRowId('test.csv', '', 0);
      const cell = new DCell('', rowId, 0, 0);
      expect(cell.isCellEmpty()).toBe(true);
    });
    it('returns false for non-empty value', () => {
      const rowId = new DRowId('test.csv', '', 0);
      const cell = new DCell('x', rowId, 0, 0);
      expect(cell.isCellEmpty()).toBe(false);
    });
  });

  describe('createSub()', () => {
    it('creates a new cell with sub value, same rowId/col/mode', () => {
      const rowId = new DRowId('test.csv', '', 2);
      const cell = new DCell('a,b', rowId, 1, 0);
      const sub = cell.createSub('a');
      expect(sub.value()).toBe('a');
      expect(sub.rowId()).toBe(rowId);
      expect(sub.col()).toBe(1);
      expect(sub.mode()).toBe(0);
    });
  });

  describe('setModePackOrSep() / isModePackOrSep()', () => {
    it('starts not pack/sep', () => {
      const rowId = new DRowId('t', '', 0);
      const cell = new DCell('x', rowId, 0, 0);
      expect(cell.isModePackOrSep()).toBe(false);
    });
    it('can be set to pack/sep', () => {
      const rowId = new DRowId('t', '', 0);
      const cell = new DCell('x', rowId, 0, 0);
      cell.setModePackOrSep();
      expect(cell.isModePackOrSep()).toBe(true);
    });
  });

  describe('displayRow() / displayCol()', () => {
    it('displayRow returns 1-based row in row mode', () => {
      const rowId = new DRowId('t', '', 3);
      const cell = new DCell('x', rowId, 5, DCell.modeOf(false));
      expect(cell.displayRow()).toBe(4); // 3+1
    });
    it('displayRow returns 1-based col in column mode', () => {
      const rowId = new DRowId('t', '', 3);
      const cell = new DCell('x', rowId, 5, DCell.modeOf(true));
      // In column mode, displayRow uses col
      expect(cell.displayRow()).toBe(6); // 5+1
    });
    it('displayCol returns Excel column letter in row mode', () => {
      const rowId = new DRowId('t', '', 0);
      const cell = new DCell('x', rowId, 0, DCell.modeOf(false));
      expect(cell.displayCol()).toBe('A');
    });
    it('displayCol returns Excel column letter for col 25', () => {
      const rowId = new DRowId('t', '', 0);
      const cell = new DCell('x', rowId, 25, DCell.modeOf(false));
      expect(cell.displayCol()).toBe('Z');
    });
    it('displayCol returns Excel column letter for col 26', () => {
      const rowId = new DRowId('t', '', 0);
      const cell = new DCell('x', rowId, 26, DCell.modeOf(false));
      expect(cell.displayCol()).toBe('AA');
    });
    it('displayCol uses row in column mode', () => {
      const rowId = new DRowId('t', '', 0);
      const cell = new DCell('x', rowId, 5, DCell.modeOf(true));
      // In column mode, displayCol uses rowId.row
      expect(cell.displayCol()).toBe('A');
    });
  });
});
