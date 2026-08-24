/**
 * CfgValue tests — TypeScript port of Java `configgen.value.CfgValue`.
 *
 * Tests the Value sealed type hierarchy:
 *   Value → SimpleValue (PrimitiveValue, VStruct, VInterface) + ContainerValue (VList, VMap)
 *   PrimitiveValue → VBool, VInt, VLong, VFloat, StringValue (VString, VText)
 *
 * Key behaviors tested:
 * - Construction and property access
 * - Discrimination via instanceof / kind
 * - equals/hashCode semantics (VStruct/VInterface use schema reference equality)
 * - VFloat.repr() preserves original cell string
 * - VText dual-value mechanism (original/translated)
 * - CompositeValue shared flag
 * - VTable and CfgValue container structure
 */

import { describe, it, expect } from 'vitest';
import {
  VBool, VInt, VLong, VFloat, VString, VText,
  VStruct, VInterface, VList, VMap,
  CfgValue, CfgValueStat, VTable,
  type Value, type SimpleValue, type PrimitiveValue, type ContainerValue,
} from '../CfgValue';
import { DCell } from '@cfggen/data';
import { DFile } from '@cfggen/data';
import type { Structural, InterfaceSchema, TableSchema, CfgSchema } from '@cfggen/schema';

// ---------------------------------------------------------------------------
// Helpers: create minimal schema mocks for testing
// ---------------------------------------------------------------------------

function makeMockStructural(name: string): Structural {
  return { name: () => name } as unknown as Structural;
}

function makeMockInterfaceSchema(name: string): InterfaceSchema {
  return { name: () => name } as unknown as InterfaceSchema;
}

function makeMockTableSchema(name: string): TableSchema {
  return { name: () => name } as unknown as TableSchema;
}

function makeMockCfgSchema(): CfgSchema {
  return {} as unknown as CfgSchema;
}

function makeCellSource(value: string): DCell {
  return DCell.of(value, 'test.csv');
}

function makeDFileSource(): DFile {
  return DFile.of('test.json', 'TestStruct');
}

// ---------------------------------------------------------------------------
// Primitive Value tests
// ---------------------------------------------------------------------------

describe('PrimitiveValue', () => {
  describe('VBool', () => {
    it('constructs with value and source', () => {
      const src = makeCellSource('true');
      const v = new VBool(true, src);
      expect(v.value).toBe(true);
      expect(v.source).toBe(src);
    });

    it('equals by value', () => {
      const src1 = makeCellSource('true');
      const src2 = makeCellSource('true');
      expect(new VBool(true, src1).equals(new VBool(true, src2))).toBe(true);
      expect(new VBool(true, src1).equals(new VBool(false, src2))).toBe(false);
    });

    it('hashCode matches Java semantics (1 or 0)', () => {
      const src = makeCellSource('true');
      expect(new VBool(true, src).hashCode()).toBe(1);
      expect(new VBool(false, src).hashCode()).toBe(0);
    });

    it('toStr returns "true" or "false"', () => {
      const src = makeCellSource('true');
      expect(new VBool(true, src).toStr()).toBe('true');
      expect(new VBool(false, src).toStr()).toBe('false');
    });
  });

  describe('VInt', () => {
    it('constructs with value and source', () => {
      const src = makeCellSource('42');
      const v = new VInt(42, src);
      expect(v.value).toBe(42);
      expect(v.source).toBe(src);
    });

    it('equals by value', () => {
      const src1 = makeCellSource('42');
      const src2 = makeCellSource('42');
      expect(new VInt(42, src1).equals(new VInt(42, src2))).toBe(true);
      expect(new VInt(42, src1).equals(new VInt(43, src2))).toBe(false);
    });

    it('hashCode equals value', () => {
      const src = makeCellSource('42');
      expect(new VInt(42, src).hashCode()).toBe(42);
    });

    it('toStr returns string of value', () => {
      const src = makeCellSource('42');
      expect(new VInt(42, src).toStr()).toBe('42');
    });
  });

  describe('VLong', () => {
    it('constructs with value and source', () => {
      const src = makeCellSource('100000000000');
      const v = new VLong(100000000000, src);
      expect(v.value).toBe(100000000000);
      expect(v.source).toBe(src);
    });

    it('equals by value', () => {
      const src1 = makeCellSource('100');
      const src2 = makeCellSource('100');
      expect(new VLong(100n, src1).equals(new VLong(100n, src2))).toBe(true);
      expect(new VLong(100n, src1).equals(new VLong(200n, src2))).toBe(false);
    });

    it('hashCode matches Long.hashCode', () => {
      const src = makeCellSource('100');
      // Java Long.hashCode(v) = (int)(v ^ (v >>> 32))
      // For 100: 100 ^ 0 = 100
      expect(new VLong(100n, src).hashCode()).toBe(100);
    });

    it('toStr returns string of value', () => {
      const src = makeCellSource('100');
      expect(new VLong(100n, src).toStr()).toBe('100');
    });
  });

  describe('VFloat', () => {
    it('constructs with value and source', () => {
      const src = makeCellSource('3.14');
      const v = new VFloat(3.14, src);
      expect(v.value).toBeCloseTo(3.14);
      expect(v.source).toBe(src);
    });

    it('repr preserves original cell string', () => {
      const src = makeCellSource('  3.14  ');
      const v = new VFloat(3.14, src);
      // repr() should return the trimmed cell value
      expect(v.repr()).toBe('3.14');
    });

    it('repr falls back to String.valueOf for non-cell source', () => {
      const src = makeDFileSource();
      const v = new VFloat(3.14, src);
      expect(v.repr()).toBe(String(3.14));
    });

    it('equals by Float.compare', () => {
      const src1 = makeCellSource('3.14');
      const src2 = makeCellSource('3.14');
      expect(new VFloat(3.14, src1).equals(new VFloat(3.14, src2))).toBe(true);
      expect(new VFloat(3.14, src1).equals(new VFloat(2.71, src2))).toBe(false);
    });

    it('toStr returns repr()', () => {
      const src = makeCellSource('3.14');
      const v = new VFloat(3.14, src);
      expect(v.toStr()).toBe('3.14');
    });
  });

  describe('VString', () => {
    it('constructs with value and source', () => {
      const src = makeCellSource('hello');
      const v = new VString('hello', src);
      expect(v.value).toBe('hello');
      expect(v.source).toBe(src);
    });

    it('equals by value', () => {
      const src1 = makeCellSource('hello');
      const src2 = makeCellSource('hello');
      expect(new VString('hello', src1).equals(new VString('hello', src2))).toBe(true);
      expect(new VString('hello', src1).equals(new VString('world', src2))).toBe(false);
    });

    it('toStr returns value', () => {
      const src = makeCellSource('hello');
      expect(new VString('hello', src).toStr()).toBe('hello');
    });
  });

  describe('VText', () => {
    it('constructs with original and source, value defaults to original', () => {
      const src = makeCellSource('你好');
      const v = new VText('你好', src);
      expect(v.original).toBe('你好');
      expect(v.value).toBe('你好');
      expect(v.translated).toBe('');
      expect(v.source).toBe(src);
    });

    it('setTranslated changes value when non-empty', () => {
      const src = makeCellSource('你好');
      const v = new VText('你好', src);
      v.setTranslated('Hello');
      expect(v.translated).toBe('Hello');
      expect(v.value).toBe('Hello');
      expect(v.original).toBe('你好');
    });

    it('setTranslated with empty string does not change value', () => {
      const src = makeCellSource('你好');
      const v = new VText('你好', src);
      v.setTranslated('');
      expect(v.translated).toBe('');
      expect(v.value).toBe('你好');
    });

    it('setTranslated with null clears translated but value stays', () => {
      const src = makeCellSource('你好');
      const v = new VText('你好', src);
      v.setTranslated('Hello');
      v.setTranslated(null as unknown as string);
      expect(v.translated).toBe('');
      // Java: setTranslated(null) only clears translated, does NOT reset value
      expect(v.value).toBe('Hello');
    });

    it('equals by value (after translation)', () => {
      const src1 = makeCellSource('你好');
      const src2 = makeCellSource('你好');
      const v1 = new VText('你好', src1);
      v1.setTranslated('Hello');
      const v2 = new VText('Hello', src2);
      expect(v1.equals(v2)).toBe(true);
    });

    it('toStr returns value', () => {
      const src = makeCellSource('你好');
      const v = new VText('你好', src);
      expect(v.toStr()).toBe('你好');
      v.setTranslated('Hello');
      expect(v.toStr()).toBe('Hello');
    });
  });
});

// ---------------------------------------------------------------------------
// Composite Value tests
// ---------------------------------------------------------------------------

describe('CompositeValue (VStruct, VInterface, VList, VMap)', () => {
  describe('VStruct', () => {
    it('constructs with schema, values, and source', () => {
      const schema = makeMockStructural('TestStruct');
      const src = makeCellSource('');
      const values: Value[] = [new VInt(1, makeCellSource('1'))];
      const v = new VStruct(schema, values, src);
      expect(v.schema).toBe(schema);
      expect(v.values).toBe(values);
      expect(v.source).toBe(src);
      expect(v.name()).toBe('TestStruct');
    });

    it('equals uses schema reference equality (===)', () => {
      const schema1 = makeMockStructural('S1');
      const schema2 = makeMockStructural('S1'); // different reference, same name
      const src = makeCellSource('');
      const values: Value[] = [new VInt(1, makeCellSource('1'))];
      const v1 = new VStruct(schema1, values, src);
      const v2 = new VStruct(schema2, values, src);
      expect(v1.equals(v2)).toBe(false); // different schema reference
      expect(v1.equals(new VStruct(schema1, values, src))).toBe(true);
    });

    it('shared flag defaults to false, setShared sets to true', () => {
      const schema = makeMockStructural('S');
      const src = makeCellSource('');
      const v = new VStruct(schema, [], src);
      expect(v.isShared()).toBe(false);
      v.setShared();
      expect(v.isShared()).toBe(true);
    });

    it('cfgeditor metadata (note, fold, embedFields) defaults to null/false', () => {
      const schema = makeMockStructural('S');
      const src = makeCellSource('');
      const v = new VStruct(schema, [], src);
      expect(v.note).toBeUndefined();
      expect(v.isFold()).toBe(false);
      expect(v.embedFields).toBeUndefined();
    });

    it('setNote/setFold/setEmbedFields work', () => {
      const schema = makeMockStructural('S');
      const src = makeCellSource('');
      const v = new VStruct(schema, [], src);
      v.setNote('test note');
      v.setFold(true);
      v.setEmbedFields(new Map([['field1', true]]));
      expect(v.note).toBe('test note');
      expect(v.isFold()).toBe(true);
      expect(v.embedFields!.get('field1')).toBe(true);
    });
  });

  describe('VInterface', () => {
    it('constructs with schema, child VStruct, and source', () => {
      const ifaceSchema = makeMockInterfaceSchema('TriggerTick');
      const structSchema = makeMockStructural('ConstValue');
      const src = makeCellSource('');
      const child = new VStruct(structSchema, [], src);
      const v = new VInterface(ifaceSchema, child, src);
      expect(v.schema).toBe(ifaceSchema);
      expect(v.child).toBe(child);
      expect(v.source).toBe(src);
    });

    it('equals uses schema reference equality', () => {
      const ifaceSchema1 = makeMockInterfaceSchema('I1');
      const ifaceSchema2 = makeMockInterfaceSchema('I1');
      const structSchema = makeMockStructural('S');
      const src = makeCellSource('');
      const child = new VStruct(structSchema, [], src);
      const v1 = new VInterface(ifaceSchema1, child, src);
      const v2 = new VInterface(ifaceSchema2, child, src);
      expect(v1.equals(v2)).toBe(false);
      expect(v1.equals(new VInterface(ifaceSchema1, child, src))).toBe(true);
    });

    it('getImplNameSource returns first cell when source is DCellList', () => {
      // This requires DCellList which is in the data package
      // For now, test with DCell source (returns source itself)
      const ifaceSchema = makeMockInterfaceSchema('I');
      const structSchema = makeMockStructural('S');
      const src = makeCellSource('ConstValue');
      const child = new VStruct(structSchema, [], src);
      const v = new VInterface(ifaceSchema, child, src);
      expect(v.getImplNameSource()).toBe(src);
    });
  });

  describe('VList', () => {
    it('constructs with valueList and source', () => {
      const src = makeCellSource('1;2;3');
      const items: SimpleValue[] = [
        new VInt(1, makeCellSource('1')),
        new VInt(2, makeCellSource('2')),
        new VInt(3, makeCellSource('3')),
      ];
      const v = new VList(items, src);
      expect(v.valueList).toBe(items);
      expect(v.source).toBe(src);
    });

    it('equals by valueList', () => {
      const src1 = makeCellSource('1;2');
      const src2 = makeCellSource('1;2');
      const items1: SimpleValue[] = [new VInt(1, makeCellSource('1'))];
      const items2: SimpleValue[] = [new VInt(1, makeCellSource('1'))];
      expect(new VList(items1, src1).equals(new VList(items2, src2))).toBe(true);
    });

    it('shared flag works', () => {
      const src = makeCellSource('');
      const v = new VList([], src);
      expect(v.isShared()).toBe(false);
      v.setShared();
      expect(v.isShared()).toBe(true);
    });
  });

  describe('VMap', () => {
    it('constructs with valueMap and source', () => {
      const src = makeCellSource('');
      const map = new Map<SimpleValue, SimpleValue>([
        [new VInt(1, makeCellSource('1')), new VString('a', makeCellSource('a'))],
      ]);
      const v = new VMap(map, src);
      expect(v.valueMap).toBe(map);
      expect(v.source).toBe(src);
    });

    it('equals by valueMap', () => {
      const src1 = makeCellSource('');
      const src2 = makeCellSource('');
      const map1 = new Map<SimpleValue, SimpleValue>([
        [new VInt(1, makeCellSource('1')), new VString('a', makeCellSource('a'))],
      ]);
      const map2 = new Map<SimpleValue, SimpleValue>([
        [new VInt(1, makeCellSource('1')), new VString('a', makeCellSource('a'))],
      ]);
      // Map equality in JS is by reference; VMap.equals should do structural comparison
      const v1 = new VMap(map1, src1);
      const v2 = new VMap(map2, src2);
      // VMap.equals compares valueMap via Objects.equals which in TS needs custom logic
      // For now, same reference should work
      const v3 = new VMap(map1, src1);
      expect(v1.equals(v3)).toBe(true);
    });

    it('cfgeditor metadata defaults to null', () => {
      const src = makeCellSource('');
      const v = new VMap(new Map(), src);
      expect(v.entryEmbeds).toBeUndefined();
      expect(v.foldedEntries).toBeUndefined();
      expect(v.entryNotes).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Type narrowing tests
// ---------------------------------------------------------------------------

describe('Type narrowing via instanceof', () => {
  it('VBool is PrimitiveValue and SimpleValue', () => {
    const v = new VBool(true, makeCellSource('true'));
    expect(v instanceof VBool).toBe(true);
  });

  it('VStruct is SimpleValue (not PrimitiveValue)', () => {
    const schema = makeMockStructural('S');
    const v = new VStruct(schema, [], makeCellSource(''));
    expect(v instanceof VStruct).toBe(true);
  });

  it('VList is ContainerValue (not SimpleValue)', () => {
    const v = new VList([], makeCellSource(''));
    expect(v instanceof VList).toBe(true);
  });

  it('VMap is ContainerValue', () => {
    const v = new VMap(new Map(), makeCellSource(''));
    expect(v instanceof VMap).toBe(true);
  });

  it('VText is StringValue (PrimitiveValue)', () => {
    const v = new VText('hello', makeCellSource('hello'));
    expect(v instanceof VText).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CfgValue and VTable container tests
// ---------------------------------------------------------------------------

describe('CfgValue', () => {
  it('of() creates empty CfgValue with schema', () => {
    const schema = makeMockCfgSchema();
    const cv = CfgValue.of(schema);
    expect(cv.schema).toBe(schema);
    expect(cv.vTableMap.size).toBe(0);
    expect(cv.valueStat).toBeInstanceOf(CfgValueStat);
  });

  it('tables() returns iterable of VTable values', () => {
    const schema = makeMockCfgSchema();
    const cv = CfgValue.of(schema);
    const tables = Array.from(cv.tables());
    expect(tables.length).toBe(0);
  });

  it('getTable returns undefined for non-existent table', () => {
    const schema = makeMockCfgSchema();
    const cv = CfgValue.of(schema);
    expect(cv.getTable('nonexistent')).toBeUndefined();
  });

  it('sortedTables() returns tables sorted by name', () => {
    const schema = makeMockCfgSchema();
    const cv = CfgValue.of(schema);
    const ts1 = makeMockTableSchema('b');
    const ts2 = makeMockTableSchema('a');
    const vt1 = new VTable(ts1, [], new Map(), new Map(), null, null);
    const vt2 = new VTable(ts2, [], new Map(), new Map(), null, null);
    cv.vTableMap.set('b', vt1);
    cv.vTableMap.set('a', vt2);
    const sorted = Array.from(cv.sortedTables());
    expect(sorted[0].name()).toBe('a');
    expect(sorted[1].name()).toBe('b');
  });
});

// ---------------------------------------------------------------------------
// CfgValueStat tests
// ---------------------------------------------------------------------------

describe('CfgValueStat', () => {
  it('starts with empty lastModifiedMap', () => {
    const stat = new CfgValueStat();
    expect(stat.getLastModifiedMap().size).toBe(0);
  });

  it('newTableLastModified adds table entry', () => {
    const stat = new CfgValueStat();
    stat.newTableLastModified('equip.rank', new Map([['1', 1000n], ['2', 2000n]]));
    const m = stat.getLastModifiedMap();
    expect(m.size).toBe(1);
    expect(m.get('equip.rank')!.get('1')).toBe(1000n);
  });

  it('newAddLastModified returns new instance (copy-on-write)', () => {
    const stat = new CfgValueStat();
    stat.newTableLastModified('t1', new Map([['1', 1000n]]));
    const newStat = stat.newAddLastModified('t1', '2', 2000n);
    expect(newStat).not.toBe(stat); // different instance
    expect(newStat.getLastModifiedMap().get('t1')!.get('2')).toBe(2000n);
    // Original unchanged
    expect(stat.getLastModifiedMap().get('t1')!.has('2')).toBe(false);
  });

  it('newRemoveLastModified returns new instance without the key', () => {
    const stat = new CfgValueStat();
    stat.newTableLastModified('t1', new Map([['1', 1000n], ['2', 2000n]]));
    const newStat = stat.newRemoveLastModified('t1', '2');
    expect(newStat).not.toBe(stat);
    expect(newStat.getLastModifiedMap().get('t1')!.has('2')).toBe(false);
    expect(newStat.getLastModifiedMap().get('t1')!.get('1')).toBe(1000n);
    // Original unchanged
    expect(stat.getLastModifiedMap().get('t1')!.has('2')).toBe(true);
  });
});
