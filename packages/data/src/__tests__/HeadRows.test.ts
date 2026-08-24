/**
 * HeadRow/HeadRows tests — TypeScript port of Java `configgen.data.HeadRow`/`HeadRows`.
 */

import { describe, it, expect } from 'vitest';
import { HeadRows, ParseBoolResult } from '../HeadRows';

describe('HeadRows', () => {
  describe('getById()', () => {
    it('returns A2_Default for "2"', () => {
      const hr = HeadRows.getById('2');
      expect(hr.rowCount()).toBe(2);
      expect(hr.commentRow()).toBe(0);
      expect(hr.nameRow()).toBe(1);
      expect(hr.suggestedTypeRow()).toBe(-1);
    });

    it('returns A3 for "3"', () => {
      const hr = HeadRows.getById('3');
      expect(hr.rowCount()).toBe(3);
      expect(hr.commentRow()).toBe(0);
      expect(hr.nameRow()).toBe(1);
      expect(hr.suggestedTypeRow()).toBe(-1);
    });

    it('returns A4 for "4"', () => {
      const hr = HeadRows.getById('4');
      expect(hr.rowCount()).toBe(4);
      expect(hr.commentRow()).toBe(3);
      expect(hr.nameRow()).toBe(0);
      expect(hr.suggestedTypeRow()).toBe(1);
    });

    it('throws for unknown name', () => {
      expect(() => HeadRows.getById('5')).toThrow();
    });
  });

  describe('A2_Default parseLong()', () => {
    const hr = HeadRows.A2_Default;

    it('parses decimal', () => {
      expect(hr.parseLong('42')).toBe(42);
    });

    it('parses zero', () => {
      expect(hr.parseLong('0')).toBe(0);
    });

    it('parses empty as 0', () => {
      expect(hr.parseLong('')).toBe(0);
    });

    it('parses *-prefixed (Excel anti-scientific-notation)', () => {
      expect(hr.parseLong('*12345678901234')).toBe(12345678901234);
    });

    it('parses hex 0x prefix', () => {
      expect(hr.parseLong('0x10')).toBe(16);
    });

    it('parses hex 0X prefix', () => {
      expect(hr.parseLong('0XFF')).toBe(255);
    });

    it('parses hex # prefix', () => {
      expect(hr.parseLong('#10')).toBe(16);
    });

    it('throws on invalid number', () => {
      expect(() => hr.parseLong('abc')).toThrow();
    });
  });

  describe('A2_Default parseBool()', () => {
    const hr = HeadRows.A2_Default;

    it('returns TRUE for "1"', () => {
      expect(hr.parseBool('1')).toBe(ParseBoolResult.TRUE);
    });

    it('returns TRUE for "true"', () => {
      expect(hr.parseBool('true')).toBe(ParseBoolResult.TRUE);
    });

    it('returns TRUE for "TRUE" (case-insensitive)', () => {
      expect(hr.parseBool('TRUE')).toBe(ParseBoolResult.TRUE);
    });

    it('returns FALSE for "0"', () => {
      expect(hr.parseBool('0')).toBe(ParseBoolResult.FALSE);
    });

    it('returns FALSE for "false"', () => {
      expect(hr.parseBool('false')).toBe(ParseBoolResult.FALSE);
    });

    it('returns FALSE for empty', () => {
      expect(hr.parseBool('')).toBe(ParseBoolResult.FALSE);
    });

    it('returns FALSE for null', () => {
      expect(hr.parseBool(null as unknown as string)).toBe(ParseBoolResult.FALSE);
    });

    it('returns INVALID for non-boolean string', () => {
      expect(hr.parseBool('yes')).toBe(ParseBoolResult.INVALID);
    });
  });

  describe('A4 parseBool()', () => {
    const hr = HeadRows.A4;

    it('returns FALSE for "0"', () => {
      expect(hr.parseBool('0')).toBe(ParseBoolResult.FALSE);
    });

    it('returns FALSE for "false" (case-insensitive)', () => {
      expect(hr.parseBool('False')).toBe(ParseBoolResult.FALSE);
    });

    it('returns FALSE for empty', () => {
      expect(hr.parseBool('')).toBe(ParseBoolResult.FALSE);
    });

    it('returns TRUE for anything non-zero/false (lenient)', () => {
      expect(hr.parseBool('1')).toBe(ParseBoolResult.TRUE);
      expect(hr.parseBool('yes')).toBe(ParseBoolResult.TRUE);
    });
  });
});
