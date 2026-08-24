import { describe, it, expect } from 'vitest';
import { parseToIdAndMap, parseToMap, parseToSet } from '../ArgParser';

function mapToObj(m: Map<string, string | null>): Record<string, string | null> {
  const obj: Record<string, string | null> = {};
  for (const [k, v] of m) obj[k] = v;
  return obj;
}

describe('ArgParser', () => {
  describe('parseToIdAndMap', () => {
    it('parses id with key-value pairs', () => {
      const result = parseToIdAndMap('java,dir:src,encoding:UTF-8');
      expect(result.id).toBe('java');
      expect(mapToObj(result.map)).toEqual({ dir: 'src', encoding: 'UTF-8' });
    });

    it('parses id with = separator', () => {
      const result = parseToIdAndMap('cs,dir=src');
      expect(result.id).toBe('cs');
      expect(mapToObj(result.map)).toEqual({ dir: 'src' });
    });

    it('parses id only', () => {
      const result = parseToIdAndMap('lua');
      expect(result.id).toBe('lua');
      expect(result.map.size).toBe(0);
    });

    it('handles flag (key without value)', () => {
      const result = parseToIdAndMap('java,nested');
      expect(result.id).toBe('java');
      expect(mapToObj(result.map)).toEqual({ nested: null });
    });

    it('trims whitespace and lowercases keys', () => {
      const result = parseToIdAndMap('java, Dir : src ');
      expect(result.id).toBe('java');
      expect(mapToObj(result.map)).toEqual({ dir: 'src' });
    });
  });

  describe('parseToMap', () => {
    it('parses key-value pairs', () => {
      expect(mapToObj(parseToMap('dir:src,encoding:UTF-8'))).toEqual({
        dir: 'src',
        encoding: 'UTF-8',
      });
    });

    it('returns empty map for null/empty', () => {
      expect(parseToMap(null as any).size).toBe(0);
      expect(parseToMap('').size).toBe(0);
    });

    it('handles flag without value', () => {
      expect(mapToObj(parseToMap('flag1,flag2'))).toEqual({
        flag1: null,
        flag2: null,
      });
    });
  });

  describe('parseToSet', () => {
    it('parses comma-separated into Set', () => {
      const result = parseToSet('a,b,c');
      expect(result.size).toBe(3);
      expect(result.has('a')).toBe(true);
      expect(result.has('b')).toBe(true);
      expect(result.has('c')).toBe(true);
    });

    it('returns empty set for null/empty', () => {
      expect(parseToSet(null as any).size).toBe(0);
      expect(parseToSet('').size).toBe(0);
    });

    it('preserves insertion order', () => {
      const result = parseToSet('c,b,a');
      const entries = Array.from(result);
      expect(entries).toEqual(['c', 'b', 'a']);
    });
  });
});
