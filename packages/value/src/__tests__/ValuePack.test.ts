/**
 * Tests for ValuePack.pack (T4.2c).
 * Java source: configgen.value.ValuePack.java (103 lines)
 *
 * Note: Only pack() is tested here. unpack() depends on ValueParser (T4.2d)
 * and will be tested after ValueParser is implemented.
 */

import { describe, it, expect } from 'vitest';
import { ValuePack } from '../ValuePack';
import {
  VBool, VInt, VLong, VFloat, VString, VText, VStruct, VInterface, VList, VMap,
  type Value,
} from '../CfgValue';
import { DCell, DCellList } from '@cfggen/data';
import type { Structural, InterfaceSchema } from '@cfggen/schema';

function makeCell(value: string): DCell {
  return DCell.of(value, 'test');
}

describe('ValuePack', () => {
  describe('pack PrimitiveValue', () => {
    it('packs VBool', () => {
      expect(ValuePack.pack(new VBool(true, makeCell('true')))).toBe('true');
      expect(ValuePack.pack(new VBool(false, makeCell('false')))).toBe('false');
    });

    it('packs VInt', () => {
      expect(ValuePack.pack(new VInt(42, makeCell('42')))).toBe('42');
    });

    it('packs VLong', () => {
      expect(ValuePack.pack(new VLong(9999999999, makeCell('9999999999')))).toBe('9999999999');
    });

    it('packs VFloat', () => {
      const cell = makeCell('3.14');
      expect(ValuePack.pack(new VFloat(3.14, cell))).toBe('3.14');
    });

    it('packs VString', () => {
      expect(ValuePack.pack(new VString('hello', makeCell('hello')))).toBe('hello');
    });

    it('packs VText', () => {
      const vt = new VText('original', makeCell('original'));
      expect(ValuePack.pack(vt)).toBe('original');
    });
  });

  describe('pack VList', () => {
    it('packs empty list', () => {
      const vl = new VList([], DCellList.of());
      expect(ValuePack.pack(vl)).toBe('');
    });

    it('packs single element list', () => {
      const vl = new VList([new VInt(1, makeCell('1'))], DCellList.of());
      expect(ValuePack.pack(vl)).toBe('1');
    });

    it('packs multiple elements list', () => {
      const vl = new VList(
        [new VInt(1, makeCell('1')), new VInt(2, makeCell('2')), new VInt(3, makeCell('3'))],
        DCellList.of(),
      );
      expect(ValuePack.pack(vl)).toBe('1,2,3');
    });

    it('packs nested list (list of structs)', () => {
      const mockSchema: Structural = {
        name: () => 'Item',
        fields: () => [],
      } as unknown as Structural;
      const vs1 = new VStruct(mockSchema, [new VInt(1, makeCell('1')), new VString('a', makeCell('a'))], makeCell('test'));
      const vs2 = new VStruct(mockSchema, [new VInt(2, makeCell('2')), new VString('b', makeCell('b'))], makeCell('test'));
      const vl = new VList([vs1, vs2], DCellList.of());
      // Each struct is packed with parentheses: (1,a),(2,b)
      expect(ValuePack.pack(vl)).toBe('(1,a),(2,b)');
    });
  });

  describe('pack VMap', () => {
    it('packs single entry map', () => {
      const map = new Map<import('../CfgValue').SimpleValue, import('../CfgValue').SimpleValue>();
      map.set(new VString('key1', makeCell('key1')), new VInt(1, makeCell('1')));
      const vm = new VMap(map, DCellList.of());
      expect(ValuePack.pack(vm)).toBe('key1,1');
    });

    it('packs multi entry map', () => {
      const map = new Map<import('../CfgValue').SimpleValue, import('../CfgValue').SimpleValue>();
      map.set(new VString('a', makeCell('a')), new VInt(1, makeCell('1')));
      map.set(new VString('b', makeCell('b')), new VInt(2, makeCell('2')));
      const vm = new VMap(map, DCellList.of());
      expect(ValuePack.pack(vm)).toBe('a,1,b,2');
    });
  });

  describe('pack VStruct', () => {
    it('packs struct with primitive fields', () => {
      const mockSchema: Structural = {
        name: () => 'MyStruct',
        fields: () => [],
      } as unknown as Structural;
      const vs = new VStruct(mockSchema, [new VInt(1, makeCell('1')), new VString('hello', makeCell('hello'))], makeCell('test'));
      expect(ValuePack.pack(vs)).toBe('1,hello');
    });

    it('packs struct with nested struct', () => {
      const innerSchema: Structural = {
        name: () => 'Inner',
        fields: () => [],
      } as unknown as Structural;
      const inner = new VStruct(innerSchema, [new VInt(1, makeCell('1')), new VInt(2, makeCell('2'))], makeCell('test'));
      const outerSchema: Structural = {
        name: () => 'Outer',
        fields: () => [],
      } as unknown as Structural;
      const outer = new VStruct(outerSchema, [new VString('top', makeCell('top')), inner], makeCell('test'));
      // Inner struct gets parentheses: top,(1,2)
      expect(ValuePack.pack(outer)).toBe('top,(1,2)');
    });
  });

  describe('pack VInterface', () => {
    it('packs interface with impl name and values', () => {
      const innerSchema: Structural = {
        name: () => 'DamageModifier',
        fields: () => [],
        namespace: () => '',
        lastName: () => 'DamageModifier',
      } as unknown as Structural;
      const child = new VStruct(innerSchema, [new VInt(10, makeCell('10')), new VString('fire', makeCell('fire'))], makeCell('test'));

      const ifaceSchema: InterfaceSchema = {
        name: () => 'IAction',
        fields: () => [],
      } as unknown as InterfaceSchema;

      const vi = new VInterface(ifaceSchema, child, makeCell('DamageModifier(10,fire)'));
      expect(ValuePack.pack(vi)).toBe('DamageModifier(10,fire)');
    });
  });

  describe('pack complex nesting', () => {
    it('packs list of lists', () => {
      const list1 = new VList([new VInt(1, makeCell('1')), new VInt(2, makeCell('2'))], DCellList.of());
      const list2 = new VList([new VInt(3, makeCell('3'))], DCellList.of());
      const outer = new VList([list1, list2] as unknown as import('../CfgValue').SimpleValue[], DCellList.of());
      // Each inner list gets parentheses: (1,2),(3)
      expect(ValuePack.pack(outer)).toBe('(1,2),(3)');
    });

    it('packs struct containing list', () => {
      const mockSchema: Structural = {
        name: () => 'WithList',
        fields: () => [],
      } as unknown as Structural;
      const innerList = new VList([new VInt(1, makeCell('1')), new VInt(2, makeCell('2'))], DCellList.of());
      const vs = new VStruct(mockSchema, [new VString('name', makeCell('name')), innerList], makeCell('test'));
      // List gets parentheses: name,(1,2)
      expect(ValuePack.pack(vs)).toBe('name,(1,2)');
    });
  });
});
