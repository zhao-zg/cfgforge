/**
 * TextValue tests — T4.9
 *
 * Tests:
 * - hasText() for various Value types:
 *   - VText → true
 *   - VInt/VBool → false
 *   - VString → false (VString is not VText)
 *   - VStruct with VText field → true
 *   - VStruct with no VText field → false
 *   - VStruct with hasText=false schema → false (skips checking)
 *   - VInterface with VText in child → true
 *   - VList with VText → true
 *   - VMap with VText value → true
 * - setTranslated with null langFinder → no-op
 * - setTranslated with non-null but no TextFinder for table → no-op
 * - setTranslated with TextFinder → sets translated text
 * - setTranslatedForTable directly
 */

import { describe, it, expect } from 'vitest';
import {
  VString,
  VText,
  VInt,
  VBool,
  VStruct,
  VInterface,
  VList,
  VMap,
  VTable,
  CfgValue,
  CfgValueStat,
  type Value,
  type SimpleValue,
  type PrimitiveValue,
} from '../CfgValue';
import { TextValue } from '../TextValue';
import { LangTextFinder, type TextFinder, type TextVisitor } from '../LangTextFinder';
import { DCellList, DFile } from '@cfggen/data';
import type { Source } from '@cfggen/data';
import {
  TableSchema,
  StructSchema,
  InterfaceSchema,
  KeySchema,
  FieldSchema,
  Metadata,
  Metadata_of,
  Primitive,
  AutoOrPack,
  ENo,
  hasText,
  type Structural,
} from '@cfggen/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_SOURCE: Source = DCellList.of();
const FILE_SOURCE: Source = DFile.of('<server>', 'test');

function makeFieldSchema(name: string, type: any): FieldSchema {
  return new FieldSchema(name, type, AutoOrPack.AUTO, Metadata_of());
}

function makeTableSchema(
  name: string,
  fields: FieldSchema[],
  primaryKey: KeySchema,
  hasTextValue: boolean = true,
  foreignKeys: any[] = [],
  uniqueKeys: KeySchema[] = [],
): TableSchema {
  const pkFieldSchemas = primaryKey.fields().map((fName) => {
    const found = fields.find((f) => f.name === fName);
    if (!found) throw new Error(`field ${fName} not found for key`);
    return found;
  });
  primaryKey.setFieldSchemas(pkFieldSchemas);

  for (const uk of uniqueKeys) {
    const ukFieldSchemas = uk.fields().map((fName) => {
      const found = fields.find((f) => f.name === fName);
      if (!found) throw new Error(`field ${fName} not found for unique key`);
      return found;
    });
    uk.setFieldSchemas(ukFieldSchemas);
  }

  const ts = new TableSchema(
    name,
    primaryKey,
    ENo.NO,
    false,
    Metadata_of(),
    fields,
    foreignKeys,
    uniqueKeys,
  );
  // Set hasText meta (normally done by preCalculateAllHasText)
  ts.meta().putHasText(hasTextValue);
  return ts;
}

function makeStructSchema(
  name: string,
  fields: FieldSchema[],
  hasTextValue: boolean = true,
): StructSchema {
  const ss = new StructSchema(
    name,
    AutoOrPack.AUTO,
    Metadata_of(),
    fields,
    [],
  );
  ss.meta().putHasText(hasTextValue);
  return ss;
}

function makeInterfaceSchema(
  name: string,
  impls: StructSchema[],
  hasTextValue: boolean = true,
): InterfaceSchema {
  const is = new InterfaceSchema(
    name,
    '',
    impls[0]?.name() ?? '',
    AutoOrPack.AUTO,
    Metadata_of(),
    impls,
  );
  is.meta().putHasText(hasTextValue);
  return is;
}

function makeVStruct(schema: Structural, values: Value[]): VStruct {
  return new VStruct(schema, values, EMPTY_SOURCE);
}

function makeVTable(
  schema: TableSchema,
  records: Array<{ pk: Value; vStruct: VStruct }>,
): VTable {
  const valueList: VStruct[] = [];
  const primaryKeyMap = new Map<Value, VStruct>();
  for (const r of records) {
    valueList.push(r.vStruct);
    primaryKeyMap.set(r.pk, r.vStruct);
  }
  return new VTable(
    schema,
    valueList,
    primaryKeyMap,
    new Map<string[], Map<Value, VStruct>>(),
  );
}

function makeCfgValue(tables: VTable[], schema?: any): CfgValue {
  const vTableMap = new Map<string, VTable>();
  for (const t of tables) {
    vTableMap.set(t.name(), t);
  }
  return new CfgValue(schema ?? ({} as any), vTableMap, new CfgValueStat());
}

// ---------------------------------------------------------------------------
// Mock TextFinder for testing
// ---------------------------------------------------------------------------

class MockTextFinder implements TextFinder {
  private _translations: Map<string, string> = new Map();
  visited: Array<{ pk: string; fieldChain: string[]; original: string }> = [];

  addTranslation(pk: string, fieldChain: string[], original: string, translated: string): void {
    this._translations.set(`${pk}|${fieldChain.join('.')}`, translated);
  }

  findText(pk: string, fieldChain: string[], original: string): string | null {
    this.visited.push({ pk, fieldChain: [...fieldChain], original });
    return this._translations.get(`${pk}|${fieldChain.join('.')}`) ?? null;
  }

  foreachText(_visitor: TextVisitor): void {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TextValue', () => {

  // -------------------------------------------------------------------------
  // hasText — primitive values
  // -------------------------------------------------------------------------

  it('hasText should return true for VText', () => {
    expect(TextValue.hasText(new VText('hello', EMPTY_SOURCE))).toBe(true);
  });

  it('hasText should return false for VInt', () => {
    expect(TextValue.hasText(new VInt(42, EMPTY_SOURCE))).toBe(false);
  });

  it('hasText should return false for VBool', () => {
    expect(TextValue.hasText(new VBool(true, EMPTY_SOURCE))).toBe(false);
  });

  it('hasText should return false for VString (not VText)', () => {
    expect(TextValue.hasText(new VString('hello', EMPTY_SOURCE))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // hasText — VStruct
  // -------------------------------------------------------------------------

  it('hasText should return true for VStruct with VText field', () => {
    const nameField = makeFieldSchema('name', Primitive.TEXT);
    const ss = makeStructSchema('inner', [nameField], true);
    const vs = makeVStruct(ss, [new VText('hello', EMPTY_SOURCE)]);
    expect(TextValue.hasText(vs)).toBe(true);
  });

  it('hasText should return false for VStruct with only VInt fields', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const ss = makeStructSchema('inner', [idField], true);
    const vs = makeVStruct(ss, [new VInt(1, EMPTY_SOURCE)]);
    expect(TextValue.hasText(vs)).toBe(false);
  });

  it('hasText should return false when schema hasText=false (short-circuit)', () => {
    const nameField = makeFieldSchema('name', Primitive.TEXT);
    const ss = makeStructSchema('inner', [nameField], false); // hasText=false
    const vs = makeVStruct(ss, [new VText('hello', EMPTY_SOURCE)]);
    expect(TextValue.hasText(vs)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // hasText — VInterface
  // -------------------------------------------------------------------------

  it('hasText should return true for VInterface with VText in child', () => {
    const rField = makeFieldSchema('r', Primitive.TEXT);
    const circleSchema = makeStructSchema('Circle', [rField], true);
    const shapeInterface = makeInterfaceSchema('IShape', [circleSchema], true);

    const child = makeVStruct(circleSchema, [new VText('round', EMPTY_SOURCE)]);
    const vi = new VInterface(shapeInterface, child, EMPTY_SOURCE);
    expect(TextValue.hasText(vi)).toBe(true);
  });

  it('hasText should return false for VInterface with hasText=false schema', () => {
    const rField = makeFieldSchema('r', Primitive.INT);
    const circleSchema = makeStructSchema('Circle', [rField], true);
    const shapeInterface = makeInterfaceSchema('IShape', [circleSchema], false);

    const child = makeVStruct(circleSchema, [new VInt(5, EMPTY_SOURCE)]);
    const vi = new VInterface(shapeInterface, child, EMPTY_SOURCE);
    expect(TextValue.hasText(vi)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // hasText — VList
  // -------------------------------------------------------------------------

  it('hasText should return true for VList containing VText', () => {
    const vList = new VList(
      [new VText('a', EMPTY_SOURCE), new VText('b', EMPTY_SOURCE)],
      EMPTY_SOURCE,
    );
    expect(TextValue.hasText(vList)).toBe(true);
  });

  it('hasText should return false for VList with only VInt', () => {
    const vList = new VList(
      [new VInt(1, EMPTY_SOURCE), new VInt(2, EMPTY_SOURCE)],
      EMPTY_SOURCE,
    );
    expect(TextValue.hasText(vList)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // hasText — VMap
  // -------------------------------------------------------------------------

  it('hasText should return true for VMap with VText value', () => {
    const vMap = new VMap(
      new Map<SimpleValue, SimpleValue>([
        [new VInt(1, EMPTY_SOURCE), new VText('hello', EMPTY_SOURCE)],
      ]),
      EMPTY_SOURCE,
    );
    expect(TextValue.hasText(vMap)).toBe(true);
  });

  it('hasText should return false for VMap with only VInt values', () => {
    const vMap = new VMap(
      new Map<SimpleValue, SimpleValue>([
        [new VInt(1, EMPTY_SOURCE), new VInt(2, EMPTY_SOURCE)],
      ]),
      EMPTY_SOURCE,
    );
    expect(TextValue.hasText(vMap)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // setTranslated — null langFinder
  // -------------------------------------------------------------------------

  it('setTranslated with null langFinder should be a no-op', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.TEXT);
    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('item', [idField, nameField], pk, true);

    const record = makeVStruct(tableSchema, [
      new VInt(1, EMPTY_SOURCE),
      new VText('sword', EMPTY_SOURCE),
    ]);

    const vTable = makeVTable(tableSchema, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: record }]);
    const cfgValue = makeCfgValue([vTable]);

    TextValue.setTranslated(cfgValue, null);

    // VText value should be unchanged (still 'sword')
    expect((record.values[1] as VText).value).toBe('sword');
    expect((record.values[1] as VText).translated).toBe('');
  });

  // -------------------------------------------------------------------------
  // setTranslated — non-null but no TextFinder for table
  // -------------------------------------------------------------------------

  it('setTranslated with langFinder but no TextFinder for table should be no-op', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.TEXT);
    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('item', [idField, nameField], pk, true);

    const record = makeVStruct(tableSchema, [
      new VInt(1, EMPTY_SOURCE),
      new VText('sword', EMPTY_SOURCE),
    ]);

    const vTable = makeVTable(tableSchema, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: record }]);
    const cfgValue = makeCfgValue([vTable]);

    const langFinder = new LangTextFinder(); // no TextFinder set for any table
    TextValue.setTranslated(cfgValue, langFinder);

    expect((record.values[1] as VText).value).toBe('sword');
  });

  // -------------------------------------------------------------------------
  // setTranslated — sets translated text
  // -------------------------------------------------------------------------

  it('setTranslated should set translated text on VText values', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.TEXT);
    const descField = makeFieldSchema('desc', Primitive.TEXT);
    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('item', [idField, nameField, descField], pk, true);

    const record = makeVStruct(tableSchema, [
      new VInt(1, EMPTY_SOURCE),
      new VText('sword', EMPTY_SOURCE),
      new VText('a sharp sword', EMPTY_SOURCE),
    ]);

    const vTable = makeVTable(tableSchema, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: record }]);
    const cfgValue = makeCfgValue([vTable]);

    const langFinder = new LangTextFinder();
    const textFinder = new MockTextFinder();
    // Add translations for pk=1, fieldChain=['name'], original='sword'
    textFinder.addTranslation('1', ['name'], 'sword', '剣');
    // Add translations for pk=1, fieldChain=['desc'], original='a sharp sword'
    textFinder.addTranslation('1', ['desc'], 'a sharp sword', '鋭い剣');
    langFinder.setTextFinder('item', textFinder);

    TextValue.setTranslated(cfgValue, langFinder);

    // VText value should be updated
    expect((record.values[1] as VText).translated).toBe('剣');
    expect((record.values[1] as VText).value).toBe('剣');
    expect((record.values[2] as VText).translated).toBe('鋭い剣');
    expect((record.values[2] as VText).value).toBe('鋭い剣');
  });

  // -------------------------------------------------------------------------
  // setTranslated — TextFinder returns null (no translation found)
  // -------------------------------------------------------------------------

  it('setTranslated should not modify VText when TextFinder returns null', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.TEXT);
    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('item', [idField, nameField], pk, true);

    const record = makeVStruct(tableSchema, [
      new VInt(1, EMPTY_SOURCE),
      new VText('sword', EMPTY_SOURCE),
    ]);

    const vTable = makeVTable(tableSchema, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: record }]);
    const cfgValue = makeCfgValue([vTable]);

    const langFinder = new LangTextFinder();
    const textFinder = new MockTextFinder(); // no translations added → findText returns null
    langFinder.setTextFinder('item', textFinder);

    TextValue.setTranslated(cfgValue, langFinder);

    // VText value should be unchanged
    expect((record.values[1] as VText).translated).toBe('');
    expect((record.values[1] as VText).value).toBe('sword');
  });

  // -------------------------------------------------------------------------
  // setTranslatedForTable — directly
  // -------------------------------------------------------------------------

  it('setTranslatedForTable should set translated text on single table', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.TEXT);
    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('item', [idField, nameField], pk, true);

    const record = makeVStruct(tableSchema, [
      new VInt(1, EMPTY_SOURCE),
      new VText('sword', EMPTY_SOURCE),
    ]);

    const vTable = makeVTable(tableSchema, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: record }]);

    const langFinder = new LangTextFinder();
    const textFinder = new MockTextFinder();
    textFinder.addTranslation('1', ['name'], 'sword', '剣');
    langFinder.setTextFinder('item', textFinder);

    TextValue.setTranslatedForTable(vTable, langFinder);

    expect((record.values[1] as VText).translated).toBe('剣');
    expect((record.values[1] as VText).value).toBe('剣');
  });

  // -------------------------------------------------------------------------
  // setTranslatedForTable — table schema hasText=false
  // -------------------------------------------------------------------------

  it('setTranslatedForTable should skip when table schema hasText=false', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.TEXT);
    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('item', [idField, nameField], pk, false); // hasText=false

    const record = makeVStruct(tableSchema, [
      new VInt(1, EMPTY_SOURCE),
      new VText('sword', EMPTY_SOURCE),
    ]);

    const vTable = makeVTable(tableSchema, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: record }]);

    const langFinder = new LangTextFinder();
    const textFinder = new MockTextFinder();
    textFinder.addTranslation('1', ['name'], 'sword', '剣');
    langFinder.setTextFinder('item', textFinder);

    TextValue.setTranslatedForTable(vTable, langFinder);

    // Should be no-op because hasText=false
    expect((record.values[1] as VText).translated).toBe('');
    expect((record.values[1] as VText).value).toBe('sword');
  });

  // -------------------------------------------------------------------------
  // setTranslated — multiple records
  // -------------------------------------------------------------------------

  it('setTranslated should handle multiple records', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.TEXT);
    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('item', [idField, nameField], pk, true);

    const r1 = makeVStruct(tableSchema, [new VInt(1, EMPTY_SOURCE), new VText('a', EMPTY_SOURCE)]);
    const r2 = makeVStruct(tableSchema, [new VInt(2, EMPTY_SOURCE), new VText('b', EMPTY_SOURCE)]);

    const vTable = makeVTable(tableSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: r1 },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: r2 },
    ]);
    const cfgValue = makeCfgValue([vTable]);

    const langFinder = new LangTextFinder();
    const textFinder = new MockTextFinder();
    textFinder.addTranslation('1', ['name'], 'a', 'A');
    textFinder.addTranslation('2', ['name'], 'b', 'B');
    langFinder.setTextFinder('item', textFinder);

    TextValue.setTranslated(cfgValue, langFinder);

    expect((r1.values[1] as VText).translated).toBe('A');
    expect((r2.values[1] as VText).translated).toBe('B');
  });

  // -------------------------------------------------------------------------
  // setTranslated — fieldChain with nested struct
  // -------------------------------------------------------------------------

  it('setTranslated should pass correct fieldChain for nested VStruct', () => {
    const xField = makeFieldSchema('x', Primitive.TEXT);
    const innerSchema = makeStructSchema('inner', [xField], true);

    const idField = makeFieldSchema('id', Primitive.INT);
    const innerField = makeFieldSchema('inner', innerSchema);
    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('test', [idField, innerField], pk, true);

    const innerStruct = makeVStruct(innerSchema, [new VText('hello', EMPTY_SOURCE)]);
    const record = makeVStruct(tableSchema, [
      new VInt(1, EMPTY_SOURCE),
      innerStruct,
    ]);

    const vTable = makeVTable(tableSchema, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: record }]);
    const cfgValue = makeCfgValue([vTable]);

    const langFinder = new LangTextFinder();
    const textFinder = new MockTextFinder();
    textFinder.addTranslation('1', ['inner', 'x'], 'hello', 'こんにちは');
    langFinder.setTextFinder('test', textFinder);

    TextValue.setTranslated(cfgValue, langFinder);

    expect((innerStruct.values[0] as VText).translated).toBe('こんにちは');

    // Verify the fieldChain was passed correctly
    expect(textFinder.visited).toHaveLength(1);
    expect(textFinder.visited[0].fieldChain).toEqual(['inner', 'x']);
    expect(textFinder.visited[0].original).toBe('hello');
  });

  // -------------------------------------------------------------------------
  // setTranslated — empty CfgValue
  // -------------------------------------------------------------------------

  it('setTranslated should handle empty CfgValue gracefully', () => {
    const cfgValue = makeCfgValue([]);
    const langFinder = new LangTextFinder();
    TextValue.setTranslated(cfgValue, langFinder);
    // Should not throw
  });

  // -------------------------------------------------------------------------
  // setTranslated — VList with VText elements
  // -------------------------------------------------------------------------

  it('setTranslated should handle VList with VText elements', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const tagsField = makeFieldSchema('tags', { kind: 'list', item: Primitive.TEXT });
    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('item', [idField, tagsField], pk, true);

    const vList = new VList(
      [new VText('a', EMPTY_SOURCE), new VText('b', EMPTY_SOURCE)],
      EMPTY_SOURCE,
    );
    const record = makeVStruct(tableSchema, [new VInt(1, EMPTY_SOURCE), vList]);

    const vTable = makeVTable(tableSchema, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: record }]);
    const cfgValue = makeCfgValue([vTable]);

    const langFinder = new LangTextFinder();
    const textFinder = new MockTextFinder();
    textFinder.addTranslation('1', ['tags', '0'], 'a', 'A');
    textFinder.addTranslation('1', ['tags', '1'], 'b', 'B');
    langFinder.setTextFinder('item', textFinder);

    TextValue.setTranslated(cfgValue, langFinder);

    expect((vList.valueList[0] as VText).translated).toBe('A');
    expect((vList.valueList[1] as VText).translated).toBe('B');
  });

  // -------------------------------------------------------------------------
  // setTranslated — VMap with VText values
  // -------------------------------------------------------------------------

  it('setTranslated should handle VMap with VText values', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const mapField = makeFieldSchema('m', {
      kind: 'map',
      key: Primitive.INT,
      value: Primitive.TEXT,
    });
    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('item', [idField, mapField], pk, true);

    const vMap = new VMap(
      new Map<SimpleValue, SimpleValue>([
        [new VInt(1, EMPTY_SOURCE), new VText('hello', EMPTY_SOURCE)],
      ]),
      EMPTY_SOURCE,
    );
    const record = makeVStruct(tableSchema, [new VInt(1, EMPTY_SOURCE), vMap]);

    const vTable = makeVTable(tableSchema, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: record }]);
    const cfgValue = makeCfgValue([vTable]);

    const langFinder = new LangTextFinder();
    const textFinder = new MockTextFinder();
    textFinder.addTranslation('1', ['m', '0v'], 'hello', '你好');
    langFinder.setTextFinder('item', textFinder);

    TextValue.setTranslated(cfgValue, langFinder);

    // Get the map value VText
    const mapVals = [...vMap.valueMap.values()];
    expect((mapVals[0] as VText).translated).toBe('你好');
  });

  // -------------------------------------------------------------------------
  // setTranslated — VInterface child VStruct
  // -------------------------------------------------------------------------

  it('setTranslated should handle VInterface child VStruct VText', () => {
    const rField = makeFieldSchema('r', Primitive.TEXT);
    const circleSchema = makeStructSchema('Circle', [rField], true);
    const shapeInterface = makeInterfaceSchema('IShape', [circleSchema], true);

    const idField = makeFieldSchema('id', Primitive.INT);
    const shapeField = makeFieldSchema('shape', shapeInterface);
    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('test', [idField, shapeField], pk, true);

    const child = makeVStruct(circleSchema, [new VText('round', EMPTY_SOURCE)]);
    const vi = new VInterface(shapeInterface, child, EMPTY_SOURCE);
    const record = makeVStruct(tableSchema, [new VInt(1, EMPTY_SOURCE), vi]);

    const vTable = makeVTable(tableSchema, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: record }]);
    const cfgValue = makeCfgValue([vTable]);

    const langFinder = new LangTextFinder();
    const textFinder = new MockTextFinder();
    textFinder.addTranslation('1', ['shape', 'r'], 'round', '丸い');
    langFinder.setTextFinder('test', textFinder);

    TextValue.setTranslated(cfgValue, langFinder);

    expect((child.values[0] as VText).translated).toBe('丸い');
  });
});
