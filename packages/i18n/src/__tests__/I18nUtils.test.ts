/**
 * I18nUtils tests — T5.1
 *
 * Tests:
 * - normalize: \r\n → \n
 * - fieldChainStr: single element, multiple elements
 */

import { describe, it, expect } from 'vitest';
import { normalize, fieldChainStr } from '../I18nUtils';

describe('I18nUtils', () => {
  describe('normalize', () => {
    it('converts \\r\\n to \\n', () => {
      expect(normalize('hello\r\nworld')).toBe('hello\nworld');
    });

    it('converts multiple \\r\\n', () => {
      expect(normalize('a\r\nb\r\nc')).toBe('a\nb\nc');
    });

    it('leaves \\n unchanged', () => {
      expect(normalize('hello\nworld')).toBe('hello\nworld');
    });

    it('leaves plain text unchanged', () => {
      expect(normalize('hello world')).toBe('hello world');
    });

    it('handles empty string', () => {
      expect(normalize('')).toBe('');
    });

    it('handles lone \\r without \\n (not replaced)', () => {
      // Java pattern is "\r\n" only, lone \r is preserved
      expect(normalize('hello\rworld')).toBe('hello\rworld');
    });

    it('handles mixed line endings', () => {
      expect(normalize('a\r\nb\nc\r\nd')).toBe('a\nb\nc\nd');
    });
  });

  describe('fieldChainStr', () => {
    it('single element returns as-is', () => {
      expect(fieldChainStr(['name'])).toBe('name');
    });

    it('two elements joined with -', () => {
      expect(fieldChainStr(['person', 'name'])).toBe('person-name');
    });

    it('three elements joined with -', () => {
      expect(fieldChainStr(['a', 'b', 'c'])).toBe('a-b-c');
    });

    it('empty array returns empty string', () => {
      expect(fieldChainStr([])).toBe('');
    });
  });
});
