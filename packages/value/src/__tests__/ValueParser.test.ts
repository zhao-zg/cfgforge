/**
 * Tests for ValueParser (T4.2d).
 * Java source: configgen.value.ValueParser.java (538 lines)
 *
 * Tests cover:
 * - Primitive type parsing (bool/int/long/float/str/text)
 * - Struct parsing (auto/pack/sep fmt, empty)
 * - Interface parsing (named impl, default impl, pack)
 * - List parsing (pack/sep fmt, empty)
 * - Map parsing (pack fmt, duplicate key detection)
 * - parseField dispatching and mustFill
 * - Error collection (NotMatchFieldType, MustFillButCellEmpty, MapKeyDuplicated, etc.)
 * - BlockParser / dummyBlockParser / ParseContext / CellsWithRowIndex
 */

import { describe, it, expect } from 'vitest';
import {
  ValueParser,
  ParseContext,
  dummyBlockParser,
  CellsWithRowIndex,
  type BlockParser,
} from '../ValueParser';
import { CfgValueErrs } from '../CfgValueErrs';
import {
  VBool, VInt, VLong, VFloat, VString, VText,
  VStruct, VInterface, VList, VMap,
} from '../CfgValue';
import { DCell, DRowId, HeadRows, ParseBoolResult } from '@cfgforge/data';
import {
  Primitive, StructRef, FList, FMap,
  FieldSchema, StructSchema, InterfaceSchema,
  AutoOrPack, Sep, Block,
  Metadata, Metadata_of, TAG,
  type FieldType, type FieldFormat,
} from '@cfgforge/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCell(value: string, row = 0, col = 0): DCell {
  return new DCell(value, new DRowId('test.csv', '', row), col, 0);
}

function makeField(
  name: string,
  type: FieldType,
  fmt: FieldFormat = AutoOrPack.AUTO,
  spanVal?: number,
): FieldSchema {
  const meta = Metadata_of();
  if (spanVal !== undefined) meta.putSpan(spanVal);
  return new FieldSchema(name, type, fmt, meta);
}

function makeMustFillField(
  name: string,
  type: FieldType,
  fmt: FieldFormat = AutoOrPack.AUTO,
): FieldSchema {
  const meta = new Metadata(new Map([['mustFill', TAG]]));
  return new FieldSchema(name, type, fmt, meta);
}

function makeStruct(
  name: string,
  fields: FieldSchema[],
  fmt: FieldFormat = AutoOrPack.AUTO,
  spanVal?: number,
): StructSchema {
  const meta = Metadata_of();
  if (spanVal !== undefined) meta.putSpan(spanVal);
  return new StructSchema(name, fmt, meta, fields, []);
}

function makeInterface(
  name: string,
  impls: StructSchema[],
  fmt: FieldFormat = AutoOrPack.AUTO,
): InterfaceSchema {
  const meta = Metadata_of();
  return new InterfaceSchema(name, '', '', fmt, meta, impls);
}

function makeParser(errs?: CfgValueErrs): ValueParser {
  return new ValueParser(errs ?? CfgValueErrs.of(), HeadRows.A2_Default, dummyBlockParser);
}

function makeCtx(name: string, pack = false, canBeEmpty = false, row = 0): ParseContext {
  return new ParseContext(name, pack, canBeEmpty, row);
}

// ---------------------------------------------------------------------------
// CellsWithRowIndex
// ---------------------------------------------------------------------------

describe('CellsWithRowIndex', () => {
  it('holds cells and rowIndex', () => {
    const cells = [makeCell('a'), makeCell('b')];
    const cwr = new CellsWithRowIndex(cells, 5);
    expect(cwr.cells).toBe(cells);
    expect(cwr.rowIndex).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// BlockParser / dummyBlockParser
// ---------------------------------------------------------------------------

describe('dummyBlockParser', () => {
  it('wraps cells into a single CellsWithRowIndex', () => {
    const cells = [makeCell('x'), makeCell('y')];
    const result = dummyBlockParser.parseBlock(cells, 3);
    expect(result.length).toBe(1);
    expect(result[0].cells).toBe(cells);
    expect(result[0].rowIndex).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// ParseContext
// ---------------------------------------------------------------------------

describe('ParseContext', () => {
  it('stores all fields', () => {
    const ctx = new ParseContext('MyStruct', true, false, 7);
    expect(ctx.nameable).toBe('MyStruct');
    expect(ctx.pack).toBe(true);
    expect(ctx.canBeEmpty).toBe(false);
    expect(ctx.curRowIndex).toBe(7);
  });

  it('throws on null nameable', () => {
    expect(() => new ParseContext(null as unknown as string, false, false, 0)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// parseSimpleType — primitives
// ---------------------------------------------------------------------------

describe('parseSimpleType — primitives', () => {
  it('parses bool true', () => {
    const field = makeField('flag', Primitive.BOOL);
    const result = makeParser().parseSimpleType(
      Primitive.BOOL, [makeCell('true')], Primitive.BOOL, makeCtx('test'), field,
    );
    expect(result).toBeInstanceOf(VBool);
    expect((result as VBool).value).toBe(true);
  });

  it('parses bool false', () => {
    const field = makeField('flag', Primitive.BOOL);
    const result = makeParser().parseSimpleType(
      Primitive.BOOL, [makeCell('false')], Primitive.BOOL, makeCtx('test'), field,
    );
    expect(result).toBeInstanceOf(VBool);
    expect((result as VBool).value).toBe(false);
  });

  it('parses bool 1 as true', () => {
    const field = makeField('flag', Primitive.BOOL);
    const result = makeParser().parseSimpleType(
      Primitive.BOOL, [makeCell('1')], Primitive.BOOL, makeCtx('test'), field,
    );
    expect(result).toBeInstanceOf(VBool);
    expect((result as VBool).value).toBe(true);
  });

  it('parses bool 0 as false', () => {
    const field = makeField('flag', Primitive.BOOL);
    const result = makeParser().parseSimpleType(
      Primitive.BOOL, [makeCell('0')], Primitive.BOOL, makeCtx('test'), field,
    );
    expect(result).toBeInstanceOf(VBool);
    expect((result as VBool).value).toBe(false);
  });

  it('records NotMatchFieldType for invalid bool', () => {
    const errs = CfgValueErrs.of();
    const field = makeField('flag', Primitive.BOOL);
    const result = new ValueParser(errs, HeadRows.A2_Default, dummyBlockParser)
      .parseSimpleType(Primitive.BOOL, [makeCell('xyz')], Primitive.BOOL, makeCtx('test'), field);
    expect(result).toBeInstanceOf(VBool);
    expect((result as VBool).value).toBe(false);
    expect(errs.errs.length).toBe(1);
    expect(errs.errs[0]._tag).toBe('NotMatchFieldType');
  });

  it('parses int decimal', () => {
    const field = makeField('count', Primitive.INT);
    const result = makeParser().parseSimpleType(
      Primitive.INT, [makeCell('42')], Primitive.INT, makeCtx('test'), field,
    );
    expect(result).toBeInstanceOf(VInt);
    expect((result as VInt).value).toBe(42);
  });

  it('parses int hex 0x', () => {
    const field = makeField('count', Primitive.INT);
    const result = makeParser().parseSimpleType(
      Primitive.INT, [makeCell('0xFF')], Primitive.INT, makeCtx('test'), field,
    );
    expect(result).toBeInstanceOf(VInt);
    expect((result as VInt).value).toBe(255);
  });

  it('parses int hex #', () => {
    const field = makeField('count', Primitive.INT);
    const result = makeParser().parseSimpleType(
      Primitive.INT, [makeCell('#FF')], Primitive.INT, makeCtx('test'), field,
    );
    expect(result).toBeInstanceOf(VInt);
    expect((result as VInt).value).toBe(255);
  });

  it('parses empty int as 0', () => {
    const field = makeField('count', Primitive.INT);
    const result = makeParser().parseSimpleType(
      Primitive.INT, [makeCell('')], Primitive.INT, makeCtx('test'), field,
    );
    expect(result).toBeInstanceOf(VInt);
    expect((result as VInt).value).toBe(0);
  });

  it('records NotMatchFieldType for invalid int', () => {
    const errs = CfgValueErrs.of();
    const field = makeField('count', Primitive.INT);
    const result = new ValueParser(errs, HeadRows.A2_Default, dummyBlockParser)
      .parseSimpleType(Primitive.INT, [makeCell('abc')], Primitive.INT, makeCtx('test'), field);
    expect(result).toBeInstanceOf(VInt);
    expect((result as VInt).value).toBe(0);
    expect(errs.errs.length).toBe(1);
    expect(errs.errs[0]._tag).toBe('NotMatchFieldType');
  });

  it('parses long', () => {
    const field = makeField('id', Primitive.LONG);
    const result = makeParser().parseSimpleType(
      Primitive.LONG, [makeCell('9999999999')], Primitive.LONG, makeCtx('test'), field,
    );
    expect(result).toBeInstanceOf(VLong);
    expect((result as VLong).value).toBe(9999999999n);
  });

  it('parses empty long as 0n', () => {
    const field = makeField('id', Primitive.LONG);
    const result = makeParser().parseSimpleType(
      Primitive.LONG, [makeCell('')], Primitive.LONG, makeCtx('test'), field,
    );
    expect(result).toBeInstanceOf(VLong);
    expect((result as VLong).value).toBe(0n);
  });

  it('parses float', () => {
    const field = makeField('price', Primitive.FLOAT);
    const result = makeParser().parseSimpleType(
      Primitive.FLOAT, [makeCell('3.14')], Primitive.FLOAT, makeCtx('test'), field,
    );
    expect(result).toBeInstanceOf(VFloat);
    expect((result as VFloat).value).toBeCloseTo(3.14);
  });

  it('parses empty float as 0', () => {
    const field = makeField('price', Primitive.FLOAT);
    const result = makeParser().parseSimpleType(
      Primitive.FLOAT, [makeCell('')], Primitive.FLOAT, makeCtx('test'), field,
    );
    expect(result).toBeInstanceOf(VFloat);
    expect((result as VFloat).value).toBe(0);
  });

  it('parses string', () => {
    const field = makeField('name', Primitive.STRING);
    const result = makeParser().parseSimpleType(
      Primitive.STRING, [makeCell('hello')], Primitive.STRING, makeCtx('test'), field,
    );
    expect(result).toBeInstanceOf(VString);
    expect((result as VString).value).toBe('hello');
  });

  it('parses text', () => {
    const field = makeField('desc', Primitive.TEXT);
    const result = makeParser().parseSimpleType(
      Primitive.TEXT, [makeCell('description')], Primitive.TEXT, makeCtx('test'), field,
    );
    expect(result).toBeInstanceOf(VText);
    expect((result as VText).value).toBe('description');
  });
});

// ---------------------------------------------------------------------------
// parseStructural
// ---------------------------------------------------------------------------

describe('parseStructural — auto fmt', () => {
  it('parses struct with two fields', () => {
    const f1 = makeField('id', Primitive.INT);
    const f2 = makeField('name', Primitive.STRING);
    const struct = makeStruct('MyStruct', [f1, f2], AutoOrPack.AUTO, 2);
    const cells = [makeCell('42'), makeCell('hello')];
    const result = makeParser().parseStructural(struct, cells, struct, makeCtx('test'));
    expect(result).toBeInstanceOf(VStruct);
    expect(result!.values.length).toBe(2);
    expect((result!.values[0] as VInt).value).toBe(42);
    expect((result!.values[1] as VString).value).toBe('hello');
  });

  it('parses struct with three fields', () => {
    const f1 = makeField('a', Primitive.INT);
    const f2 = makeField('b', Primitive.STRING);
    const f3 = makeField('c', Primitive.BOOL);
    const struct = makeStruct('S', [f1, f2, f3], AutoOrPack.AUTO, 3);
    const cells = [makeCell('1'), makeCell('x'), makeCell('true')];
    const result = makeParser().parseStructural(struct, cells, struct, makeCtx('test'));
    expect(result).toBeInstanceOf(VStruct);
    expect(result!.values.length).toBe(3);
    expect((result!.values[0] as VInt).value).toBe(1);
    expect((result!.values[1] as VString).value).toBe('x');
    expect((result!.values[2] as VBool).value).toBe(true);
  });
});

describe('parseStructural — pack fmt', () => {
  it('parses pack struct with two fields', () => {
    const f1 = makeField('id', Primitive.INT);
    const f2 = makeField('name', Primitive.STRING);
    const struct = makeStruct('MyStruct', [f1, f2], AutoOrPack.PACK);
    const cell = makeCell('42,hello');
    const result = makeParser().parseStructural(struct, [cell], struct, makeCtx('test', true));
    expect(result).toBeInstanceOf(VStruct);
    expect(result!.values.length).toBe(2);
    expect((result!.values[0] as VInt).value).toBe(42);
    expect((result!.values[1] as VString).value).toBe('hello');
  });

  it('parses pack struct with nested struct', () => {
    const innerField = makeField('x', Primitive.INT);
    const innerStruct = makeStruct('Inner', [innerField], AutoOrPack.PACK);
    const outerField = makeField('inner', new StructRef('Inner'), AutoOrPack.PACK);
    outerField.type.obj = innerStruct;
    const outerStruct = makeStruct('Outer', [outerField], AutoOrPack.PACK);
    const cell = makeCell('42');
    const result = makeParser().parseStructural(outerStruct, [cell], outerStruct, makeCtx('test', true));
    expect(result).toBeInstanceOf(VStruct);
    expect(result!.values.length).toBe(1);
    const inner = result!.values[0] as VStruct;
    expect(inner.schema).toBe(innerStruct);
    expect((inner.values[0] as VInt).value).toBe(42);
  });

  it('throws when pack struct gets multiple cells', () => {
    const struct = makeStruct('S', [makeField('x', Primitive.INT)], AutoOrPack.PACK);
    expect(() =>
      makeParser().parseStructural(struct, [makeCell('1'), makeCell('2')], struct, makeCtx('test', true)),
    ).toThrow();
  });
});

describe('parseStructural — sep fmt', () => {
  it('parses sep struct with two fields', () => {
    const f1 = makeField('id', Primitive.INT);
    const f2 = makeField('name', Primitive.STRING);
    const struct = makeStruct('MyStruct', [f1, f2], new Sep(';'));
    const cell = makeCell('42;hello');
    const result = makeParser().parseStructural(struct, [cell], struct, makeCtx('test'));
    expect(result).toBeInstanceOf(VStruct);
    expect(result!.values.length).toBe(2);
    expect((result!.values[0] as VInt).value).toBe(42);
    expect((result!.values[1] as VString).value).toBe('hello');
  });
});

describe('parseStructural — empty handling', () => {
  it('parses empty pack struct when canBeEmpty', () => {
    const f1 = makeField('id', Primitive.INT);
    const f2 = makeField('name', Primitive.STRING);
    const struct = makeStruct('S', [f1, f2], AutoOrPack.PACK);
    const cell = makeCell('');
    const result = makeParser().parseStructural(struct, [cell], struct, makeCtx('test', true, true));
    expect(result).toBeInstanceOf(VStruct);
    expect(result!.values.length).toBe(2);
    expect((result!.values[0] as VInt).value).toBe(0);
    expect((result!.values[1] as VString).value).toBe('');
  });

  it('parses empty sep struct when canBeEmpty', () => {
    const f1 = makeField('id', Primitive.INT);
    const f2 = makeField('name', Primitive.STRING);
    const struct = makeStruct('S', [f1, f2], new Sep(';'));
    const cell = makeCell('');
    const result = makeParser().parseStructural(struct, [cell], struct, makeCtx('test', false, true));
    expect(result).toBeInstanceOf(VStruct);
    expect(result!.values.length).toBe(2);
    expect((result!.values[0] as VInt).value).toBe(0);
    expect((result!.values[1] as VString).value).toBe('');
  });
});

// ---------------------------------------------------------------------------
// parseInterface
// ---------------------------------------------------------------------------

describe('parseInterface — pack fmt', () => {
  it('parses interface with named impl', () => {
    const implA = makeStruct('ImplA', [makeField('x', Primitive.INT)], AutoOrPack.PACK);
    const implB = makeStruct('ImplB', [makeField('y', Primitive.STRING)], AutoOrPack.PACK);
    const iface = makeInterface('MyIface', [implA, implB], AutoOrPack.PACK);

    const cell = makeCell('ImplA(42)');
    const result = makeParser().parseInterface(iface, [cell], iface, makeCtx('test', true));
    expect(result).toBeInstanceOf(VInterface);
    expect(result!.child.schema).toBe(implA);
    expect((result!.child.values[0] as VInt).value).toBe(42);
  });

  it('parses interface with different impl', () => {
    const implA = makeStruct('ImplA', [makeField('x', Primitive.INT)], AutoOrPack.PACK);
    const implB = makeStruct('ImplB', [makeField('y', Primitive.STRING)], AutoOrPack.PACK);
    const iface = makeInterface('MyIface', [implA, implB], AutoOrPack.PACK);

    const cell = makeCell('ImplB(hello)');
    const result = makeParser().parseInterface(iface, [cell], iface, makeCtx('test', true));
    expect(result).toBeInstanceOf(VInterface);
    expect(result!.child.schema).toBe(implB);
    expect((result!.child.values[0] as VString).value).toBe('hello');
  });

  it('records InterfaceCellImplNotFound for unknown impl', () => {
    const errs = CfgValueErrs.of();
    const implA = makeStruct('ImplA', [makeField('x', Primitive.INT)], AutoOrPack.PACK);
    const iface = makeInterface('MyIface', [implA], AutoOrPack.PACK);

    const cell = makeCell('Unknown(42)');
    const result = new ValueParser(errs, HeadRows.A2_Default, dummyBlockParser)
      .parseInterface(iface, [cell], iface, makeCtx('test', true));
    expect(result).toBeNull();
    expect(errs.errs.length).toBe(1);
    expect(errs.errs[0]._tag).toBe('InterfaceCellImplNotFound');
  });

  it('parses interface with empty cell using default impl when canBeEmpty', () => {
    const implA = makeStruct('ImplA', [makeField('x', Primitive.INT)], AutoOrPack.PACK);
    const iface = makeInterface('MyIface', [implA], AutoOrPack.PACK);

    // Empty cell + canBeEmpty triggers isEmpty path, uses default impl (impls[0])
    const cell = makeCell('');
    const result = makeParser().parseInterface(iface, [cell], iface, makeCtx('test', true, true));
    expect(result).toBeInstanceOf(VInterface);
    expect(result!.child.schema).toBe(implA);
    // Field value should be 0 (empty int defaults to 0)
    expect((result!.child.values[0] as VInt).value).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseList
// ---------------------------------------------------------------------------

describe('parseList — pack fmt', () => {
  it('parses pack list of ints', () => {
    const field = makeField('ids', new FList(Primitive.INT), AutoOrPack.PACK);
    const cell = makeCell('1,2,3');
    const result = makeParser().parseList(field, [cell], field, makeCtx('test', true));
    expect(result).toBeInstanceOf(VList);
    expect(result!.valueList.length).toBe(3);
    expect((result!.valueList[0] as VInt).value).toBe(1);
    expect((result!.valueList[1] as VInt).value).toBe(2);
    expect((result!.valueList[2] as VInt).value).toBe(3);
  });

  it('parses pack list of strings', () => {
    const field = makeField('names', new FList(Primitive.STRING), AutoOrPack.PACK);
    const cell = makeCell('a,b,c');
    const result = makeParser().parseList(field, [cell], field, makeCtx('test', true));
    expect(result).toBeInstanceOf(VList);
    expect(result!.valueList.length).toBe(3);
    expect((result!.valueList[0] as VString).value).toBe('a');
    expect((result!.valueList[1] as VString).value).toBe('b');
    expect((result!.valueList[2] as VString).value).toBe('c');
  });

  it('returns empty list for empty cell', () => {
    const field = makeField('ids', new FList(Primitive.INT), AutoOrPack.PACK);
    const cell = makeCell('');
    const result = makeParser().parseList(field, [cell], field, makeCtx('test', true));
    expect(result).toBeInstanceOf(VList);
    expect(result!.valueList.length).toBe(0);
  });

  it('parses single-element pack list', () => {
    const field = makeField('ids', new FList(Primitive.INT), AutoOrPack.PACK);
    const cell = makeCell('42');
    const result = makeParser().parseList(field, [cell], field, makeCtx('test', true));
    expect(result).toBeInstanceOf(VList);
    expect(result!.valueList.length).toBe(1);
    expect((result!.valueList[0] as VInt).value).toBe(42);
  });
});

describe('parseList — sep fmt', () => {
  it('parses sep list of ints', () => {
    const field = makeField('ids', new FList(Primitive.INT), new Sep(';'));
    const cell = makeCell('1;2;3');
    const result = makeParser().parseList(field, [cell], field, makeCtx('test', false));
    expect(result).toBeInstanceOf(VList);
    expect(result!.valueList.length).toBe(3);
    expect((result!.valueList[0] as VInt).value).toBe(1);
    expect((result!.valueList[1] as VInt).value).toBe(2);
    expect((result!.valueList[2] as VInt).value).toBe(3);
  });

  it('returns empty list for empty sep cell', () => {
    const field = makeField('ids', new FList(Primitive.INT), new Sep(';'));
    const cell = makeCell('');
    const result = makeParser().parseList(field, [cell], field, makeCtx('test', false));
    expect(result).toBeInstanceOf(VList);
    expect(result!.valueList.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseMap
// ---------------------------------------------------------------------------

describe('parseMap — pack fmt', () => {
  it('parses pack map of str->int', () => {
    const field = makeField('config', new FMap(Primitive.STRING, Primitive.INT), AutoOrPack.PACK);
    const cell = makeCell('a,1,b,2');
    const result = makeParser().parseMap(field, [cell], field, makeCtx('test', true));
    expect(result).toBeInstanceOf(VMap);
    expect(result!.valueMap.size).toBe(2);
  });

  it('returns empty map for empty cell', () => {
    const field = makeField('config', new FMap(Primitive.STRING, Primitive.INT), AutoOrPack.PACK);
    const cell = makeCell('');
    const result = makeParser().parseMap(field, [cell], field, makeCtx('test', true));
    expect(result).toBeInstanceOf(VMap);
    expect(result!.valueMap.size).toBe(0);
  });

  it('records MapKeyDuplicated for duplicate keys', () => {
    const errs = CfgValueErrs.of();
    const field = makeField('config', new FMap(Primitive.STRING, Primitive.INT), AutoOrPack.PACK);
    const cell = makeCell('a,1,a,2');
    const result = new ValueParser(errs, HeadRows.A2_Default, dummyBlockParser)
      .parseMap(field, [cell], field, makeCtx('test', true));
    expect(result).toBeInstanceOf(VMap);
    expect(errs.errs.length).toBe(1);
    expect(errs.errs[0]._tag).toBe('MapKeyDuplicated');
  });
});

// ---------------------------------------------------------------------------
// parseField — dispatching
// ---------------------------------------------------------------------------

describe('parseField — dispatching', () => {
  it('dispatches primitive to parseSimpleType', () => {
    const field = makeField('count', Primitive.INT);
    const result = makeParser().parseField(field, [makeCell('42')], field, makeCtx('test'));
    expect(result).toBeInstanceOf(VInt);
    expect((result as VInt).value).toBe(42);
  });

  it('dispatches FList to parseList', () => {
    const field = makeField('ids', new FList(Primitive.INT), AutoOrPack.PACK);
    const result = makeParser().parseField(field, [makeCell('1,2,3')], field, makeCtx('test', true));
    expect(result).toBeInstanceOf(VList);
    expect((result as VList).valueList.length).toBe(3);
  });

  it('dispatches FMap to parseMap', () => {
    const field = makeField('cfg', new FMap(Primitive.STRING, Primitive.INT), AutoOrPack.PACK);
    const result = makeParser().parseField(field, [makeCell('a,1')], field, makeCtx('test', true));
    expect(result).toBeInstanceOf(VMap);
    expect((result as VMap).valueMap.size).toBe(1);
  });

  it('dispatches StructRef to parseStructural', () => {
    const innerStruct = makeStruct('Inner', [makeField('x', Primitive.INT)], AutoOrPack.PACK);
    const ref = new StructRef('Inner');
    ref.obj = innerStruct;
    const field = makeField('inner', ref, AutoOrPack.PACK);
    const result = makeParser().parseField(field, [makeCell('42')], field, makeCtx('test', true));
    expect(result).toBeInstanceOf(VStruct);
    expect((result as VStruct).schema).toBe(innerStruct);
  });
});

// ---------------------------------------------------------------------------
// parseField — mustFill
// ---------------------------------------------------------------------------

describe('parseField — mustFill', () => {
  it('records MustFillButCellEmpty for empty mustFill primitive', () => {
    const errs = CfgValueErrs.of();
    const field = makeMustFillField('flag', Primitive.BOOL);
    const result = new ValueParser(errs, HeadRows.A2_Default, dummyBlockParser)
      .parseField(field, [makeCell('')], field, makeCtx('test'));
    expect(result).toBeInstanceOf(VBool);
    expect(errs.errs.length).toBe(1);
    expect(errs.errs[0]._tag).toBe('MustFillButCellEmpty');
  });

  it('records MustFillButCellEmpty for empty mustFill list', () => {
    const errs = CfgValueErrs.of();
    const field = makeMustFillField('ids', new FList(Primitive.INT), AutoOrPack.PACK);
    const result = new ValueParser(errs, HeadRows.A2_Default, dummyBlockParser)
      .parseField(field, [makeCell('')], field, makeCtx('test', true));
    expect(result).toBeInstanceOf(VList);
    expect((result as VList).valueList.length).toBe(0);
    expect(errs.errs.length).toBe(1);
    expect(errs.errs[0]._tag).toBe('MustFillButCellEmpty');
  });

  it('does not record error when mustFill field has value', () => {
    const errs = CfgValueErrs.of();
    const field = makeMustFillField('count', Primitive.INT);
    const result = new ValueParser(errs, HeadRows.A2_Default, dummyBlockParser)
      .parseField(field, [makeCell('42')], field, makeCtx('test'));
    expect(result).toBeInstanceOf(VInt);
    expect((result as VInt).value).toBe(42);
    expect(errs.errs.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
  it('records ParsePackErr for malformed pack content', () => {
    const errs = CfgValueErrs.of();
    const struct = makeStruct('S', [makeField('x', Primitive.INT)], AutoOrPack.PACK);
    // parsePack on "a(b,c)" would return ["a", "b,c"] — 2 cells for 1 field
    // This causes a mismatch — the struct has 1 field but parsePack returns 2 cells
    // The extra cell triggers FieldCellNotUsed
    const result = new ValueParser(errs, HeadRows.A2_Default, dummyBlockParser)
      .parseStructural(struct, [makeCell('1,2')], struct, makeCtx('test', true));
    // parsePack("1,2") = ["1", "2"], struct has 1 field, so 1 cell unused
    expect(result).not.toBeNull();
    expect(errs.errs.length).toBe(1);
    expect(errs.errs[0]._tag).toBe('FieldCellNotUsed');
  });

  it('throws AssertionError when too few cells for auto struct fields', () => {
    const errs = CfgValueErrs.of();
    const f1 = makeField('a', Primitive.INT);
    const f2 = makeField('b', Primitive.STRING);
    const f3 = makeField('c', Primitive.BOOL);
    const struct = makeStruct('S', [f1, f2, f3], AutoOrPack.AUTO, 3);
    // Only 2 cells for 3-field struct — require(2 === 3) throws
    expect(() =>
      new ValueParser(errs, HeadRows.A2_Default, dummyBlockParser)
        .parseStructural(struct, [makeCell('1'), makeCell('x')], struct, makeCtx('test')),
    ).toThrow();
  });

  it('throws AssertionError when too many cells for auto struct fields', () => {
    const errs = CfgValueErrs.of();
    const f1 = makeField('a', Primitive.INT);
    const struct = makeStruct('S', [f1], AutoOrPack.AUTO, 1);
    // 2 cells for 1-field struct — require(2 === 1) throws
    expect(() =>
      new ValueParser(errs, HeadRows.A2_Default, dummyBlockParser)
        .parseStructural(struct, [makeCell('1'), makeCell('2')], struct, makeCtx('test')),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Custom BlockParser
// ---------------------------------------------------------------------------

describe('custom BlockParser', () => {
  it('uses custom block parser for block fmt list', () => {
    // Create a custom block parser that splits cells into 2 blocks
    const customBlockParser: BlockParser = {
      parseBlock(cells: DCell[], curRowIndex: number): CellsWithRowIndex[] {
        // Split cells into pairs
        const blocks: CellsWithRowIndex[] = [];
        for (let i = 0; i < cells.length; i += 2) {
          const block = cells.slice(i, i + 2);
          if (block.length > 0) {
            blocks.push(new CellsWithRowIndex(block, curRowIndex));
          }
        }
        return blocks;
      },
    };

    const errs = CfgValueErrs.of();
    // Use Block fmt with fix=1 (each block has 1 item)
    const field = new FieldSchema('items', new FList(Primitive.INT), new Block(1), Metadata_of());
    const cells = [makeCell('1'), makeCell('2'), makeCell('3'), makeCell('4')];
    const parser = new ValueParser(errs, HeadRows.A2_Default, customBlockParser);
    const result = parser.parseList(field, cells, field, makeCtx('test', false));
    // customBlockParser splits 4 cells into 2 blocks of 2 cells each
    // forEachItem with itemSpan=1 processes each cell in each block
    expect(result).toBeInstanceOf(VList);
    expect(result!.valueList.length).toBe(4);
  });
});
