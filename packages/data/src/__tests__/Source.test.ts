/**
 * Source/DFile tests — TypeScript port of Java `configgen.data.Source`.
 *
 * DFile is the source marker for JSON-origin values (vs DCell/DCellList for
 * Excel/CSV). It tracks the file name, current struct name, and a field path
 * for error reporting.
 */

import { describe, it, expect } from 'vitest';
import { DFile } from '../Source';

describe('DFile', () => {
  describe('of() factory', () => {
    it('creates DFile with empty path', () => {
      const f = DFile.of('buff/_buff/0.json', 'buff.buff');
      expect(f.fileName).toBe('buff/_buff/0.json');
      expect(f.inStruct).toBe('buff.buff');
      expect(f.path).toEqual([]);
    });
  });

  describe('child()', () => {
    it('appends field to path', () => {
      const f = DFile.of('0.json', 'buff.buff');
      const c = f.child('Logic');
      expect(c.path).toEqual(['Logic']);
      expect(c.fileName).toBe('0.json');
      expect(c.inStruct).toBe('buff.buff');
    });

    it('appends multiple fields', () => {
      const f = DFile.of('0.json', 'buff.buff');
      const c = f.child('Logic').child('sendDamageIncAdd');
      expect(c.path).toEqual(['Logic', 'sendDamageIncAdd']);
    });

    it('does not mutate original', () => {
      const f = DFile.of('0.json', 'buff.buff');
      const c = f.child('Logic');
      expect(f.path).toEqual([]);
      expect(c.path).toEqual(['Logic']);
    });
  });

  describe('inStruct()', () => {
    it('changes struct keeping path', () => {
      const f = DFile.of('0.json', 'buff.buff');
      const c = f.child('Logic').withInStruct('buff.BuffLogic.DamageModifier');
      expect(c.inStruct).toBe('buff.BuffLogic.DamageModifier');
      expect(c.path).toEqual(['Logic']);
    });
  });

  describe('parent()', () => {
    it('returns parent when path is non-empty', () => {
      const f = DFile.of('0.json', 'buff.buff');
      const c = f.child('Logic').child('sendDamageIncAdd');
      const p = c.parent();
      expect(p.path).toEqual(['Logic']);
      expect(p.fileName).toBe('0.json');
    });

    it('returns self when path is empty', () => {
      const f = DFile.of('0.json', 'buff.buff');
      const p = f.parent();
      expect(p).toBe(f);
      expect(p.path).toEqual([]);
    });
  });

  describe('lastAppend()', () => {
    it('appends to empty path', () => {
      const f = DFile.of('0.json', 'buff.buff');
      const r = f.lastAppend('.DamageModifier');
      expect(r.path).toEqual(['.DamageModifier']);
    });

    it('appends suffix to last element of non-empty path', () => {
      const f = DFile.of('0.json', 'buff.buff');
      const r = f.child('Logic').lastAppend('.DamageModifier');
      expect(r.path).toEqual(['Logic.DamageModifier']);
    });

    it('appends to multi-level path', () => {
      const f = DFile.of('0.json', 'buff.buff');
      const r = f.child('a').child('b').lastAppend('.X');
      expect(r.path).toEqual(['a', 'b.X']);
    });
  });
});
