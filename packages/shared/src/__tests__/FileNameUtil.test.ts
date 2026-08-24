import { describe, it, expect } from 'vitest';
import { getCodeName, isFirstNotAzChar, findFirstHanIndex } from '../FileNameUtil';

describe('FileNameUtil', () => {
  describe('getCodeName', () => {
    it('returns null for empty string', () => {
      expect(getCodeName('')).toBeNull();
    });

    it('returns null if first char is not a-z/A-Z', () => {
      expect(getCodeName('1abc.xlsx')).toBeNull();
      expect(getCodeName('_test.xlsx')).toBeNull();
      expect(getCodeName('中文名.xlsx')).toBeNull();
    });

    it('strips extension and lowercases', () => {
      expect(getCodeName('hero.xlsx')).toBe('hero');
      expect(getCodeName('Hero.XLSX')).toBe('hero');
    });

    it('strips Chinese suffix from filename', () => {
      // "hero_英雄表.xlsx" -> "hero"
      expect(getCodeName('hero_英雄表.xlsx')).toBe('hero');
      // "hero英雄表.xlsx" -> "hero"
      expect(getCodeName('hero英雄表.xlsx')).toBe('hero');
    });

    it('returns lowercased name when no Chinese chars', () => {
      expect(getCodeName('Award.xlsx')).toBe('award');
      expect(getCodeName('item_list.csv')).toBe('item_list');
    });

    it('handles file with no extension', () => {
      expect(getCodeName('hero')).toBe('hero');
    });
  });

  describe('isFirstNotAzChar', () => {
    it('returns false for a-z', () => {
      expect(isFirstNotAzChar('abc')).toBe(false);
    });
    it('returns false for A-Z', () => {
      expect(isFirstNotAzChar('Abc')).toBe(false);
    });
    it('returns true for digits', () => {
      expect(isFirstNotAzChar('1bc')).toBe(true);
    });
    it('returns true for underscore', () => {
      expect(isFirstNotAzChar('_bc')).toBe(true);
    });
    it('returns true for Chinese', () => {
      expect(isFirstNotAzChar('中文')).toBe(true);
    });
  });

  describe('findFirstHanIndex', () => {
    it('returns -1 when no Han chars', () => {
      expect(findFirstHanIndex('abc123')).toBe(-1);
    });
    it('returns index of first Han char', () => {
      expect(findFirstHanIndex('abc英雄')).toBe(3);
    });
    it('returns 0 when string starts with Han', () => {
      expect(findFirstHanIndex('英雄abc')).toBe(0);
    });
  });
});
