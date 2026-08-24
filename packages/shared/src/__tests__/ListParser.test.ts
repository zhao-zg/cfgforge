import { describe, it, expect } from 'vitest';
import { parseList } from '../ListParser';

describe('ListParser', () => {
  describe('parseList', () => {
    it('parses simple comma-separated', () => {
      expect(parseList('a,b,c', ',')).toEqual(['a', 'b', 'c']);
    });

    it('handles single element', () => {
      expect(parseList('abc', ',')).toEqual(['abc']);
    });

    it('handles trailing separator (not counted)', () => {
      expect(parseList('a,b,c,', ',')).toEqual(['a', 'b', 'c']);
    });

    it('handles empty elements between separators', () => {
      expect(parseList('a,,c', ',')).toEqual(['a', '', 'c']);
    });

    it('handles leading separator', () => {
      expect(parseList(',a,b', ',')).toEqual(['', 'a', 'b']);
    });

    it('handles quoted field containing separator', () => {
      expect(parseList('"a,b",c', ',')).toEqual(['a,b', 'c']);
    });

    it('handles escaped quotes (doubled)', () => {
      expect(parseList('"a""b",c', ',')).toEqual(['a"b', 'c']);
    });

    it('handles custom separator', () => {
      expect(parseList('a;b;c', ';')).toEqual(['a', 'b', 'c']);
    });

    it('handles empty string', () => {
      expect(parseList('', ',')).toEqual([]);
    });

    it('handles quoted field with escaped quote at end', () => {
      expect(parseList('"a""",b', ',')).toEqual(['a"', 'b']);
    });
  });
});
