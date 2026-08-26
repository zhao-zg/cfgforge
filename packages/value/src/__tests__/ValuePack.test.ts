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
import { CfgValueErrs } from '../CfgValueErrs';
import { DCell, DCellList } from '@cfgforge/data';
import type { Structural, InterfaceSchema } from '@cfgforge/schema';
import {
  Primitive, FList, FMap, StructRef,
  FieldSchema, StructSchema, TableSchema, KeySchema,
  AutoOrPack, Metadata_of, ENo,
} from '@cfgforge/schema';

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

// ---------------------------------------------------------------------------
// unpack tests
// ---------------------------------------------------------------------------

describe('ValuePack.unpack', () => {
  it('unpacks int string', () => {
    const errs = CfgValueErrs.of();
    const result = ValuePack.unpack('42', Primitive.INT, errs);
    expect(result).toBeInstanceOf(VInt);
    expect((result as VInt).value).toBe(42);
    expect(errs.errs.length).toBe(0);
  });

  it('unpacks string', () => {
    const errs = CfgValueErrs.of();
    const result = ValuePack.unpack('hello', Primitive.STRING, errs);
    expect(result).toBeInstanceOf(VString);
    expect((result as VString).value).toBe('hello');
  });

  it('unpacks bool', () => {
    const errs = CfgValueErrs.of();
    const result = ValuePack.unpack('true', Primitive.BOOL, errs);
    expect(result).toBeInstanceOf(VBool);
    expect((result as VBool).value).toBe(true);
  });

  it('unpacks pack list of ints', () => {
    const errs = CfgValueErrs.of();
    const result = ValuePack.unpack('1,2,3', new FList(Primitive.INT), errs);
    expect(result).toBeInstanceOf(VList);
    expect((result as VList).valueList.length).toBe(3);
    expect(((result as VList).valueList[0] as VInt).value).toBe(1);
    expect(((result as VList).valueList[1] as VInt).value).toBe(2);
    expect(((result as VList).valueList[2] as VInt).value).toBe(3);
  });

  it('unpacks pack struct', () => {
    const errs = CfgValueErrs.of();
    const f1 = new FieldSchema('id', Primitive.INT, AutoOrPack.AUTO, Metadata_of());
    const f2 = new FieldSchema('name', Primitive.STRING, AutoOrPack.AUTO, Metadata_of());
    const struct = new StructSchema('MyStruct', AutoOrPack.PACK, Metadata_of(), [f1, f2], []);
    const ref = new StructRef('MyStruct');
    ref.obj = struct;
    const result = ValuePack.unpack('42,hello', ref, errs);
    expect(result).toBeInstanceOf(VStruct);
    expect((result as VStruct).values.length).toBe(2);
    expect(((result as VStruct).values[0] as VInt).value).toBe(42);
    expect(((result as VStruct).values[1] as VString).value).toBe('hello');
  });
});

describe('ValuePack.unpackTablePrimaryKey', () => {
  it('unpacks single primary key (int)', () => {
    const errs = CfgValueErrs.of();
    const pkField = new FieldSchema('id', Primitive.INT, AutoOrPack.AUTO, Metadata_of());
    const pk = new KeySchema(['id']);
    pk.setFieldSchemas([pkField]);
    const table = new TableSchema('MyTable', pk, ENo.NO, false, Metadata_of(), [pkField], [], []);
    const result = ValuePack.unpackTablePrimaryKey('42', table, errs);
    expect(result).toBeInstanceOf(VInt);
    expect((result as VInt).value).toBe(42);
  });

  it('unpacks single primary key (string)', () => {
    const errs = CfgValueErrs.of();
    const pkField = new FieldSchema('name', Primitive.STRING, AutoOrPack.AUTO, Metadata_of());
    const pk = new KeySchema(['name']);
    pk.setFieldSchemas([pkField]);
    const table = new TableSchema('MyTable', pk, ENo.NO, false, Metadata_of(), [pkField], [], []);
    const result = ValuePack.unpackTablePrimaryKey('hello', table, errs);
    expect(result).toBeInstanceOf(VString);
    expect((result as VString).value).toBe('hello');
  });

  it('unpacks multi primary key as VList', () => {
    const errs = CfgValueErrs.of();
    const pkField1 = new FieldSchema('id', Primitive.INT, AutoOrPack.AUTO, Metadata_of());
    const pkField2 = new FieldSchema('name', Primitive.STRING, AutoOrPack.AUTO, Metadata_of());
    const pk = new KeySchema(['id', 'name']);
    pk.setFieldSchemas([pkField1, pkField2]);
    const table = new TableSchema('MyTable', pk, ENo.NO, false, Metadata_of(), [pkField1, pkField2], [], []);
    // Multi-key: packStr for struct is "42,hello"
    const result = ValuePack.unpackTablePrimaryKey('42,hello', table, errs);
    expect(result).toBeInstanceOf(VList);
    expect((result as VList).valueList.length).toBe(2);
    expect(((result as VList).valueList[0] as VInt).value).toBe(42);
    expect(((result as VList).valueList[1] as VString).value).toBe('hello');
  });
});
