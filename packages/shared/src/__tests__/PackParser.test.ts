import { describe, it, expect } from 'vitest';
import { parsePack, parseFunction } from '../PackParser';

describe('PackParser', () => {
  describe('parsePack', () => {
    it('parses simple comma-separated', () => {
      expect(parsePack('b,c')).toEqual(['b', 'c']);
    });

    it('parses single element', () => {
      expect(parsePack('abc')).toEqual(['abc']);
    });

    it('handles trailing separator (not counted)', () => {
      expect(parsePack('a,b,c,')).toEqual(['a', 'b', 'c']);
    });

    it('handles semicolon separator', () => {
      expect(parsePack('a;b;c')).toEqual(['a', 'b', 'c']);
    });

    it('handles mixed separators', () => {
      expect(parsePack('a,b;c')).toEqual(['a', 'b', 'c']);
    });

    it('handles parenthesized group as single element', () => {
      expect(parsePack('(b,c)')).toEqual(['b,c']);
    });

    it('handles function-like syntax as single element', () => {
      expect(parsePack('a(b,c)')).toEqual(['a(b,c)']);
    });

    it('handles mixed plain and parenthesized', () => {
      expect(parsePack('a,(b,c)')).toEqual(['a', 'b,c']);
    });

    it('handles nested parentheses', () => {
      expect(parsePack('a,(b,(c1,c2)),d(e,f)')).toEqual([
        'a',
        'b,(c1,c2)',
        'd(e,f)',
      ]);
    });

    it('handles empty elements', () => {
      expect(parsePack('a,,c')).toEqual(['a', '', 'c']);
    });

    it('handles empty string', () => {
      expect(parsePack('')).toEqual([]);
    });

    it('handles whitespace (ignored at start)', () => {
      expect(parsePack(' a, b')).toEqual(['a', 'b']);
    });
  });

  describe('parseFunction', () => {
    it('parses function name and params', () => {
      expect(parseFunction('a(b,c)')).toEqual(['a', 'b,c']);
    });

    it('parses function with single param', () => {
      expect(parseFunction('func(x)')).toEqual(['func', 'x']);
    });

    it('parses function with nested parens in params', () => {
      expect(parseFunction('f(a(b,c))')).toEqual(['f', 'a(b,c)']);
    });

    it('throws on missing function name', () => {
      expect(() => parseFunction('(args)')).toThrow();
    });

    it('throws on extra chars after params', () => {
      expect(() => parseFunction('a(b)x')).toThrow();
    });

    it('throws on parameter count mismatch', () => {
      expect(() => parseFunction('incomplete')).toThrow();
    });
  });
});
