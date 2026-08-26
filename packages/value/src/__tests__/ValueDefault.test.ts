/**
 * Tests for ValueDefault — TypeScript port of Java `configgen.value.ValueDefault`.
 *
 * ValueDefault provides:
 *   of(type, source) — create default Value for a FieldType
 *   isDefault(value) — check if a value is the default value
 *   ofNamable(nameable, source) — create default SimpleValue for a Nameable
 *   ofStructural(structural, source) — create default VStruct for a Structural
 *   ofInterface(interfaceSchema, source) — create default VInterface
 */

import { describe, test, expect } from 'vitest';
import { ValueDefault } from '../ValueDefault';
import {
  VBool, VInt, VLong, VFloat, VString, VText,
  VStruct, VInterface, VList, VMap,
  type Value, type SimpleValue,
} from '../CfgValue';
import { DFile } from '@cfgforge/data';
import {
  Primitive, FList, FMap, StructRef,
  StructSchema, InterfaceSchema,
  Metadata_of,
  AutoOrPack,
  type Nameable, type Structural,
  ENo, KeySchema,
} from '@cfgforge/schema';

// ---------------------------------------------------------------------------
// Helpers: create minimal schema objects for testing
// ---------------------------------------------------------------------------

function createMinimalStructSchema(name: string): StructSchema {
  return new StructSchema(
    name,             // name
    AutoOrPack.AUTO,  // fmt
    Metadata_of(),    // meta
    [],                // fields
    [],                // foreignKeys
  );
}

function createMinimalInterfaceSchema(name: string, impl: StructSchema): InterfaceSchema {
  return new InterfaceSchema(
    name,              // name
    'enumRef',          // enumRef
    impl.name(),        // defaultImpl
    AutoOrPack.AUTO,    // fmt
    Metadata_of(),      // meta
    [impl],             // impls
  );
}

const dummySource = new DFile('test.json', 'TestStruct');

// ---------------------------------------------------------------------------
// of(type, source) — primitive types
// ---------------------------------------------------------------------------

describe('ValueDefault.of — primitive types', () => {
  test('BOOL returns VBool(false)', () => {
    const v = ValueDefault.of(Primitive.BOOL, dummySource);
    expect(v).toBeInstanceOf(VBool);
    expect((v as VBool).value).toBe(false);
  });

  test('INT returns VInt(0)', () => {
    const v = ValueDefault.of(Primitive.INT, dummySource);
    expect(v).toBeInstanceOf(VInt);
    expect((v as VInt).value).toBe(0);
  });

  test('LONG returns VLong(0n)', () => {
    const v = ValueDefault.of(Primitive.LONG, dummySource);
    expect(v).toBeInstanceOf(VLong);
    expect((v as VLong).value).toBe(0n);
  });

  test('FLOAT returns VFloat(0)', () => {
    const v = ValueDefault.of(Primitive.FLOAT, dummySource);
    expect(v).toBeInstanceOf(VFloat);
    expect((v as VFloat).value).toBe(0);
  });

  test('STRING returns VString("")', () => {
    const v = ValueDefault.of(Primitive.STRING, dummySource);
    expect(v).toBeInstanceOf(VString);
    expect((v as VString).value).toBe('');
  });

  test('TEXT returns VText("")', () => {
    const v = ValueDefault.of(Primitive.TEXT, dummySource);
    expect(v).toBeInstanceOf(VText);
    expect((v as VText).value).toBe('');
  });
});

// ---------------------------------------------------------------------------
// of(type, source) — container types
// ---------------------------------------------------------------------------

describe('ValueDefault.of — container types', () => {
  test('FList returns VList with empty valueList', () => {
    const fList = new FList(Primitive.INT);
    const v = ValueDefault.of(fList, dummySource);
    expect(v).toBeInstanceOf(VList);
    expect((v as VList).valueList).toHaveLength(0);
  });

  test('FMap returns VMap with empty valueMap', () => {
    const fMap = new FMap(Primitive.STRING, Primitive.INT);
    const v = ValueDefault.of(fMap, dummySource);
    expect(v).toBeInstanceOf(VMap);
    expect((v as VMap).valueMap.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// of(type, source) — StructRef
// ---------------------------------------------------------------------------

describe('ValueDefault.of — StructRef', () => {
  test('StructRef to StructSchema returns VStruct via ofStructural', () => {
    const structSchema = createMinimalStructSchema('MyStruct');
    const ref = new StructRef('MyStruct');
    ref.obj = structSchema;
    const v = ValueDefault.of(ref, dummySource);
    expect(v).toBeInstanceOf(VStruct);
    expect((v as VStruct).schema).toBe(structSchema);
    expect((v as VStruct).values).toHaveLength(0);
  });

  test('StructRef to InterfaceSchema returns VInterface via ofInterface', () => {
    const implSchema = createMinimalStructSchema('MyImpl');
    const interfaceSchema = createMinimalInterfaceSchema('MyInterface', implSchema);
    const ref = new StructRef('MyInterface');
    ref.obj = interfaceSchema;
    const v = ValueDefault.of(ref, dummySource);
    expect(v).toBeInstanceOf(VInterface);
    expect((v as VInterface).schema).toBe(interfaceSchema);
    expect((v as VInterface).child).toBeInstanceOf(VStruct);
    expect((v as VInterface).child.schema).toBe(implSchema);
  });
});

// ---------------------------------------------------------------------------
// ofStructural(structural, source)
// ---------------------------------------------------------------------------

describe('ValueDefault.ofStructural', () => {
  test('creates VStruct with empty fields', () => {
    const structSchema = createMinimalStructSchema('EmptyStruct');
    const vStruct = ValueDefault.ofStructural(structSchema, dummySource);
    expect(vStruct).toBeInstanceOf(VStruct);
    expect(vStruct.schema).toBe(structSchema);
    expect(vStruct.values).toHaveLength(0);
    expect(vStruct.source).toBe(dummySource);
  });
});

// ---------------------------------------------------------------------------
// ofInterface(interfaceSchema, source)
// ---------------------------------------------------------------------------

describe('ValueDefault.ofInterface', () => {
  test('creates VInterface with default impl struct', () => {
    const implSchema = createMinimalStructSchema('DefaultImpl');
    const interfaceSchema = createMinimalInterfaceSchema('MyInterface', implSchema);

    const vInterface = ValueDefault.ofInterface(interfaceSchema, dummySource);
    expect(vInterface).toBeInstanceOf(VInterface);
    expect(vInterface.schema).toBe(interfaceSchema);
    expect(vInterface.child).toBeInstanceOf(VStruct);
    expect(vInterface.child.schema).toBe(implSchema);
    expect(vInterface.source).toBe(dummySource);
  });

  test('uses first impl when defaultImplStruct not set', () => {
    const impl1 = createMinimalStructSchema('Impl1');
    const impl2 = createMinimalStructSchema('Impl2');
    const interfaceSchema = new InterfaceSchema(
      'MyInterface', 'enumRef', 'Impl1',
      AutoOrPack.AUTO, Metadata_of(),
      [impl1, impl2],
    );

    const vInterface = ValueDefault.ofInterface(interfaceSchema, dummySource);
    expect(vInterface.child.schema).toBe(impl1);
  });
});

// ---------------------------------------------------------------------------
// ofNamable(nameable, source)
// ---------------------------------------------------------------------------

describe('ValueDefault.ofNamable', () => {
  test('Structural → ofStructural', () => {
    const structSchema = createMinimalStructSchema('MyStruct');
    const sv = ValueDefault.ofNamable(structSchema, dummySource);
    expect(sv).toBeInstanceOf(VStruct);
    expect((sv as VStruct).schema).toBe(structSchema);
  });

  test('InterfaceSchema → ofInterface', () => {
    const impl = createMinimalStructSchema('Impl');
    const interfaceSchema = createMinimalInterfaceSchema('MyIface', impl);
    const sv = ValueDefault.ofNamable(interfaceSchema, dummySource);
    expect(sv).toBeInstanceOf(VInterface);
    expect((sv as VInterface).schema).toBe(interfaceSchema);
  });
});

// ---------------------------------------------------------------------------
// isDefault(value)
// ---------------------------------------------------------------------------

describe('ValueDefault.isDefault', () => {
  test('VBool(false) is default', () => {
    expect(ValueDefault.isDefault(new VBool(false, dummySource))).toBe(true);
  });

  test('VBool(true) is not default', () => {
    expect(ValueDefault.isDefault(new VBool(true, dummySource))).toBe(false);
  });

  test('VInt(0) is default', () => {
    expect(ValueDefault.isDefault(new VInt(0, dummySource))).toBe(true);
  });

  test('VInt(5) is not default', () => {
    expect(ValueDefault.isDefault(new VInt(5, dummySource))).toBe(false);
  });

  test('VLong(0n) is default', () => {
    expect(ValueDefault.isDefault(new VLong(0n, dummySource))).toBe(true);
  });

  test('VLong(5n) is not default', () => {
    expect(ValueDefault.isDefault(new VLong(5n, dummySource))).toBe(false);
  });

  test('VFloat(0) is default', () => {
    expect(ValueDefault.isDefault(new VFloat(0, dummySource))).toBe(true);
  });

  test('VFloat(3.14) is not default', () => {
    expect(ValueDefault.isDefault(new VFloat(3.14, dummySource))).toBe(false);
  });

  test('VString("") is default', () => {
    expect(ValueDefault.isDefault(new VString('', dummySource))).toBe(true);
  });

  test('VString("hello") is not default', () => {
    expect(ValueDefault.isDefault(new VString('hello', dummySource))).toBe(false);
  });

  test('VText("") is default', () => {
    expect(ValueDefault.isDefault(new VText('', dummySource))).toBe(true);
  });

  test('VText("hello") is not default', () => {
    expect(ValueDefault.isDefault(new VText('hello', dummySource))).toBe(false);
  });

  test('VStruct is never default', () => {
    const structSchema = createMinimalStructSchema('S');
    const v = new VStruct(structSchema, [], dummySource);
    expect(ValueDefault.isDefault(v)).toBe(false);
  });

  test('VInterface is never default', () => {
    const impl = createMinimalStructSchema('Impl');
    const iface = createMinimalInterfaceSchema('I', impl);
    const childStruct = ValueDefault.ofStructural(impl, dummySource);
    const v = new VInterface(iface, childStruct, dummySource);
    expect(ValueDefault.isDefault(v)).toBe(false);
  });

  test('VList with empty list is default', () => {
    const v = new VList([], dummySource);
    expect(ValueDefault.isDefault(v)).toBe(true);
  });

  test('VList with items is not default', () => {
    const v = new VList([new VInt(1, dummySource)], dummySource);
    expect(ValueDefault.isDefault(v)).toBe(false);
  });

  test('VMap with empty map is default', () => {
    const v = new VMap(new Map(), dummySource);
    expect(ValueDefault.isDefault(v)).toBe(true);
  });

  test('VMap with entries is not default', () => {
    const m = new Map<SimpleValue, SimpleValue>();
    m.set(new VString('k', dummySource), new VInt(1, dummySource));
    const v = new VMap(m, dummySource);
    expect(ValueDefault.isDefault(v)).toBe(false);
  });
});
