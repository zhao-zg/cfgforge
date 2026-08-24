/**
 * Tests for ValueJsonParser — TypeScript port of Java `configgen.value.ValueJsonParser`.
 *
 * ValueJsonParser parses JSON strings into VStruct values, with full support for:
 *   - All primitive types (bool, int, long, float, str, text)
 *   - Struct references (nested structs and interfaces)
 *   - Lists (FList) and Maps (FMap, as arrays of {key, value} entries)
 *   - cfgeditor metadata ($note, $fold, $embed_*, $type, $entry $embed_value, $fold, $note)
 *   - Extra field validation (JsonHasExtraFields warning)
 *   - Error handling (empty JSON, parse errors, type mismatches)
 */

import { describe, test, expect } from 'vitest';
import { ValueJsonParser } from '../ValueJsonParser';
import { ValueDefault } from '../ValueDefault';
import { CfgValueErrs } from '../CfgValueErrs';
import {
  VBool, VInt, VLong, VFloat, VString, VText,
  VStruct, VInterface, VList, VMap,
} from '../CfgValue';
import { DFile } from '@cfggen/data';
import {
  Primitive, FList, FMap, StructRef,
  StructSchema, TableSchema, InterfaceSchema,
  Metadata_of, AutoOrPack,
  ENo, KeySchema,
  type Structural,
} from '@cfggen/schema';
import { FieldSchema } from '@cfggen/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFieldSchema(name: string, type: any): FieldSchema {
  return new FieldSchema(name, type, AutoOrPack.AUTO, Metadata_of());
}

function makeStructSchema(name: string, fields: FieldSchema[]): StructSchema {
  return new StructSchema(
    name, AutoOrPack.AUTO, Metadata_of(),
    fields, [],
  );
}

function makeTableSchema(name: string, fields: FieldSchema[], pkName: string = 'id'): TableSchema {
  return new TableSchema(
    name,
    new KeySchema([pkName]),
    ENo.NO,
    false,
    Metadata_of(),
    fields,
    [],
    [],
  );
}

function makeInterfaceSchema(name: string, impls: StructSchema[]): InterfaceSchema {
  return new InterfaceSchema(
    name, 'enumRef', impls[0].name(),
    AutoOrPack.AUTO, Metadata_of(),
    impls,
  );
}

function makeErrs(): CfgValueErrs {
  return CfgValueErrs.of();
}

function makeParser(tableSchema: TableSchema, errs: CfgValueErrs, isPartial: boolean = false): ValueJsonParser {
  return new ValueJsonParser(tableSchema, isPartial, errs);
}

// ---------------------------------------------------------------------------
// fromJson — primitive fields
// ---------------------------------------------------------------------------

describe('ValueJsonParser.fromJson — primitive fields', () => {
  test('parses bool field', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('flag', Primitive.BOOL)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"flag": true}');
    expect(v).toBeInstanceOf(VStruct);
    expect((v.values[0] as VBool).value).toBe(true);
  });

  test('parses int field', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('count', Primitive.INT)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"count": 42}');
    expect((v.values[0] as VInt).value).toBe(42);
  });

  test('parses long field', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('big', Primitive.LONG)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"big": 9999999999}');
    expect((v.values[0] as VLong).value).toBe(9999999999n);
  });

  test('parses float field', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('pi', Primitive.FLOAT)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"pi": 3.14}');
    expect((v.values[0] as VFloat).value).toBeCloseTo(3.14);
  });

  test('parses string field', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('name', Primitive.STRING)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"name": "hello"}');
    expect((v.values[0] as VString).value).toBe('hello');
  });

  test('parses text field', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('desc', Primitive.TEXT)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"desc": "description"}');
    expect((v.values[0] as VText).value).toBe('description');
  });

  test('missing field uses default value', () => {
    const ts = makeTableSchema('T', [
      makeFieldSchema('a', Primitive.INT),
      makeFieldSchema('b', Primitive.STRING),
    ]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"a": 5}');
    expect((v.values[0] as VInt).value).toBe(5);
    expect((v.values[1] as VString).value).toBe('');
  });

  test('string field with lowercase meta gets lowercased', () => {
    const field = new FieldSchema('name', Primitive.STRING, AutoOrPack.AUTO, Metadata_of());
    field.meta.isLowercase(); // just check method exists
    // Set lowercase tag
    field.meta.data().set('lowercase', true);
    const ts = makeTableSchema('T', [field]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"name": "HELLO"}');
    expect((v.values[0] as VString).value).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// fromJson — bool parsing edge cases
// ---------------------------------------------------------------------------

describe('ValueJsonParser.fromJson — bool edge cases', () => {
  test('bool from number 1 is true', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('flag', Primitive.BOOL)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"flag": 1}');
    expect((v.values[0] as VBool).value).toBe(true);
  });

  test('bool from number 0 is false', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('flag', Primitive.BOOL)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"flag": 0}');
    expect((v.values[0] as VBool).value).toBe(false);
  });

  test('bool from string reports error and returns false', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('flag', Primitive.BOOL)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"flag": "yes"}');
    expect((v.values[0] as VBool).value).toBe(false);
    expect(errs.errs.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// fromJson — number type mismatches
// ---------------------------------------------------------------------------

describe('ValueJsonParser.fromJson — number type mismatches', () => {
  test('int from string reports error', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('count', Primitive.INT)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"count": "abc"}');
    expect((v.values[0] as VInt).value).toBe(0);
    expect(errs.errs.length).toBeGreaterThan(0);
  });

  test('long from string reports error', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('big', Primitive.LONG)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"big": "abc"}');
    expect((v.values[0] as VLong).value).toBe(0n);
    expect(errs.errs.length).toBeGreaterThan(0);
  });

  test('float from string reports error', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('pi', Primitive.FLOAT)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"pi": "abc"}');
    expect((v.values[0] as VFloat).value).toBe(0);
    expect(errs.errs.length).toBeGreaterThan(0);
  });

  test('string from number reports error', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('name', Primitive.STRING)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"name": 123}');
    expect((v.values[0] as VString).value).toBe('');
    expect(errs.errs.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// fromJson — struct reference fields
// ---------------------------------------------------------------------------

describe('ValueJsonParser.fromJson — struct reference', () => {
  test('parses nested struct via StructRef', () => {
    const innerStruct = makeStructSchema('Inner', [
      makeFieldSchema('x', Primitive.INT),
    ]);
    const ref = new StructRef('Inner');
    ref.obj = innerStruct;
    const ts = makeTableSchema('T', [makeFieldSchema('inner', ref)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"inner": {"x": 7}}');
    expect(v.values[0]).toBeInstanceOf(VStruct);
    expect(((v.values[0] as VStruct).values[0] as VInt).value).toBe(7);
  });

  test('nested struct with missing field uses default', () => {
    const innerStruct = makeStructSchema('Inner', [
      makeFieldSchema('x', Primitive.INT),
      makeFieldSchema('y', Primitive.STRING),
    ]);
    const ref = new StructRef('Inner');
    ref.obj = innerStruct;
    const ts = makeTableSchema('T', [makeFieldSchema('inner', ref)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"inner": {"x": 7}}');
    const inner = v.values[0] as VStruct;
    expect((inner.values[0] as VInt).value).toBe(7);
    expect((inner.values[1] as VString).value).toBe('');
  });

  test('interface field parses with $type', () => {
    const impl1 = makeStructSchema('Impl1', [makeFieldSchema('a', Primitive.INT)]);
    const impl2 = makeStructSchema('Impl2', [makeFieldSchema('b', Primitive.STRING)]);
    const iface = makeInterfaceSchema('Iface', [impl1, impl2]);
    const ref = new StructRef('Iface');
    ref.obj = iface;
    const ts = makeTableSchema('T', [makeFieldSchema('obj', ref)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"obj": {"$type": "Impl2", "b": "hello"}}');
    expect(v.values[0]).toBeInstanceOf(VInterface);
    const vi = v.values[0] as VInterface;
    expect(vi.child.schema).toBe(impl2);
    expect((vi.child.values[0] as VString).value).toBe('hello');
  });

  test('interface with $type containing prefix is handled', () => {
    const impl1 = makeStructSchema('Impl1', [makeFieldSchema('a', Primitive.INT)]);
    const iface = makeInterfaceSchema('Iface', [impl1]);
    const ref = new StructRef('Iface');
    ref.obj = iface;
    const ts = makeTableSchema('T', [makeFieldSchema('obj', ref)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"obj": {"$type": "Iface.Impl1", "a": 3}}');
    expect(v.values[0]).toBeInstanceOf(VInterface);
    const vi = v.values[0] as VInterface;
    expect(vi.child.schema).toBe(impl1);
    expect((vi.child.values[0] as VInt).value).toBe(3);
  });

  test('interface with non-existent $type reports error', () => {
    const impl1 = makeStructSchema('Impl1', [makeFieldSchema('a', Primitive.INT)]);
    const iface = makeInterfaceSchema('Iface', [impl1]);
    const ref = new StructRef('Iface');
    ref.obj = iface;
    const ts = makeTableSchema('T', [makeFieldSchema('obj', ref)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"obj": {"$type": "Unknown", "a": 3}}');
    expect(errs.errs.length).toBeGreaterThan(0);
  });

  test('interface without $type reports error', () => {
    const impl1 = makeStructSchema('Impl1', [makeFieldSchema('a', Primitive.INT)]);
    const iface = makeInterfaceSchema('Iface', [impl1]);
    const ref = new StructRef('Iface');
    ref.obj = iface;
    const ts = makeTableSchema('T', [makeFieldSchema('obj', ref)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"obj": {"a": 3}}');
    expect(errs.errs.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// fromJson — list fields (FList)
// ---------------------------------------------------------------------------

describe('ValueJsonParser.fromJson — FList', () => {
  test('parses list of ints', () => {
    const fList = new FList(Primitive.INT);
    const ts = makeTableSchema('T', [makeFieldSchema('items', fList)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"items": [1, 2, 3]}');
    expect(v.values[0]).toBeInstanceOf(VList);
    const list = v.values[0] as VList;
    expect(list.valueList).toHaveLength(3);
    expect((list.valueList[0] as VInt).value).toBe(1);
    expect((list.valueList[1] as VInt).value).toBe(2);
    expect((list.valueList[2] as VInt).value).toBe(3);
  });

  test('parses list of structs', () => {
    const innerStruct = makeStructSchema('Inner', [makeFieldSchema('x', Primitive.INT)]);
    const ref = new StructRef('Inner');
    ref.obj = innerStruct;
    const fList = new FList(ref);
    const ts = makeTableSchema('T', [makeFieldSchema('items', fList)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"items": [{"x": 1}, {"x": 2}]}');
    expect(v.values[0]).toBeInstanceOf(VList);
    const list = v.values[0] as VList;
    expect(list.valueList).toHaveLength(2);
    expect((list.valueList[0] as VStruct).values[0] as VInt).toHaveProperty('value', 1);
  });

  test('non-array value for list reports error', () => {
    const fList = new FList(Primitive.INT);
    const ts = makeTableSchema('T', [makeFieldSchema('items', fList)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"items": "not an array"}');
    expect(v.values[0]).toBeInstanceOf(VList);
    expect((v.values[0] as VList).valueList).toHaveLength(0);
    expect(errs.errs.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// fromJson — map fields (FMap)
// ---------------------------------------------------------------------------

describe('ValueJsonParser.fromJson — FMap', () => {
  test('parses map of string->int', () => {
    const fMap = new FMap(Primitive.STRING, Primitive.INT);
    const ts = makeTableSchema('T', [makeFieldSchema('m', fMap)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"m": [{"key": "a", "value": 1}, {"key": "b", "value": 2}]}');
    expect(v.values[0]).toBeInstanceOf(VMap);
    const map = v.values[0] as VMap;
    expect(map.valueMap.size).toBe(2);
  });

  test('non-array value for map reports error', () => {
    const fMap = new FMap(Primitive.STRING, Primitive.INT);
    const ts = makeTableSchema('T', [makeFieldSchema('m', fMap)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"m": "not an array"}');
    expect(v.values[0]).toBeInstanceOf(VMap);
    expect((v.values[0] as VMap).valueMap.size).toBe(0);
    expect(errs.errs.length).toBeGreaterThan(0);
  });

  test('map entry without key reports error', () => {
    const fMap = new FMap(Primitive.STRING, Primitive.INT);
    const ts = makeTableSchema('T', [makeFieldSchema('m', fMap)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"m": [{"value": 1}]}');
    expect(errs.errs.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// fromJson — cfgeditor metadata
// ---------------------------------------------------------------------------

describe('ValueJsonParser.fromJson — cfgeditor metadata', () => {
  test('parses $note on struct', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('a', Primitive.INT)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"a": 1, "$note": "my note"}');
    expect(v.note).toBe('my note');
  });

  test('parses $fold on struct', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('a', Primitive.INT)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"a": 1, "$fold": true}');
    expect(v.isFold()).toBe(true);
  });

  test('parses $embed_ fields', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('a', Primitive.INT)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"a": 1, "$embed_a": true}');
    expect(v.embedFields).toBeDefined();
    expect(v.embedFields!.get('$embed_a')).toBe(true);
  });

  test('parses $entry $embed_value in map', () => {
    const fMap = new FMap(Primitive.STRING, Primitive.INT);
    const ts = makeTableSchema('T', [makeFieldSchema('m', fMap)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"m": [{"key": "a", "value": 1, "$embed_value": true}]}');
    const map = v.values[0] as VMap;
    expect(map.entryEmbeds).toBeDefined();
    expect(map.entryEmbeds!.size).toBe(1);
  });

  test('parses $entry $fold in map', () => {
    const fMap = new FMap(Primitive.STRING, Primitive.INT);
    const ts = makeTableSchema('T', [makeFieldSchema('m', fMap)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"m": [{"key": "a", "value": 1, "$fold": true}]}');
    const map = v.values[0] as VMap;
    expect(map.foldedEntries).toBeDefined();
    expect(map.foldedEntries!.size).toBe(1);
  });

  test('parses $entry $note in map', () => {
    const fMap = new FMap(Primitive.STRING, Primitive.INT);
    const ts = makeTableSchema('T', [makeFieldSchema('m', fMap)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"m": [{"key": "a", "value": 1, "$note": "entry note"}]}');
    const map = v.values[0] as VMap;
    expect(map.entryNotes).toBeDefined();
    expect(map.entryNotes!.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// fromJson — extra fields warning
// ---------------------------------------------------------------------------

describe('ValueJsonParser.fromJson — extra fields', () => {
  test('extra field triggers warning when not partial', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('a', Primitive.INT)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs, false);
    const v = parser.fromJson('{"a": 1, "unknown": 2}');
    expect(errs.warns.length).toBeGreaterThan(0);
  });

  test('extra field does NOT trigger warning when partial', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('a', Primitive.INT)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs, true);
    const v = parser.fromJson('{"a": 1, "unknown": 2}');
    expect(errs.warns.length).toBe(0);
  });

  test('$type, $note, $fold, $refs are not treated as extra', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('a', Primitive.INT)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs, false);
    const v = parser.fromJson('{"a": 1, "$note": "n", "$fold": true, "$refs": "r"}');
    expect(errs.warns.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// fromJson — error handling
// ---------------------------------------------------------------------------

describe('ValueJsonParser.fromJson — error handling', () => {
  test('empty JSON string reports JsonStrEmpty error', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('a', Primitive.INT)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('');
    expect(errs.errs.length).toBeGreaterThan(0);
    // Returns default struct
    expect(v).toBeInstanceOf(VStruct);
    expect((v.values[0] as VInt).value).toBe(0);
  });

  test('invalid JSON reports JsonParseException error', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('a', Primitive.INT)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{invalid}');
    expect(errs.errs.length).toBeGreaterThan(0);
    expect(v).toBeInstanceOf(VStruct);
  });

  test('fromJson with default source uses table name', () => {
    const ts = makeTableSchema('MyTable', [makeFieldSchema('a', Primitive.INT)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const v = parser.fromJson('{"a": 1}');
    expect(v).toBeInstanceOf(VStruct);
    expect((v.source as DFile).fileName).toBe('<server>');
    expect((v.source as DFile).inStruct).toBe('MyTable');
  });

  test('fromJson with explicit source uses provided DFile', () => {
    const ts = makeTableSchema('MyTable', [makeFieldSchema('a', Primitive.INT)]);
    const errs = makeErrs();
    const parser = makeParser(ts, errs);
    const src = DFile.of('data/MyTable/1.json', 'MyTable');
    const v = parser.fromJson('{"a": 1}', src);
    expect((v.source as DFile).fileName).toBe('data/MyTable/1.json');
  });
});
