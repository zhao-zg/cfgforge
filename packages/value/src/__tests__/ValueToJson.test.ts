/**
 * ValueToJson tests — T4.8
 *
 * Tests JSON serialization of Value tree:
 * - Primitive values (VBool, VInt, VLong, VFloat, VString, VText)
 * - VStruct with $type, fields
 * - VStruct with $note, $fold, embedFields
 * - VInterface delegates to child
 * - VList as JSON array
 * - VMap as JSON array of entries
 * - isSaveDefault behavior
 * - $refs collection
 * - toJsonStr static convenience
 */

import { describe, it, expect } from 'vitest';
import {
  VBool,
  VInt,
  VLong,
  VFloat,
  VString,
  VText,
  VStruct,
  VInterface,
  VList,
  VMap,
  VTable,
  CfgValue,
  CfgValueStat,
  type Value,
  type SimpleValue,
} from '../CfgValue';
import { ValueToJson } from '../ValueToJson';
import { ValueRefCollector, type RefId, type FieldRef } from '../ValueRefCollector';
import { DCellList, DFile, DCell } from '@cfgforge/data';
import type { Source } from '@cfgforge/data';
import {
  TableSchema,
  StructSchema,
  KeySchema,
  FieldSchema,
  ForeignKeySchema,
  Metadata,
  Metadata_of,
  Primitive,
  AutoOrPack,
  ENo,
  FList,
  FMap,
  StructRef,
  RefPrimary,
  InterfaceSchema,
  type Structural,
} from '@cfgforge/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_SOURCE: Source = DCellList.of();

function makeFieldSchema(name: string, type: any): FieldSchema {
  return new FieldSchema(name, type, AutoOrPack.AUTO, Metadata_of());
}

function makeTableSchema(
  name: string,
  fields: FieldSchema[],
  primaryKey: KeySchema,
  foreignKeys: ForeignKeySchema[] = [],
): TableSchema {
  const pkFieldSchemas = primaryKey.fields().map((fName) => {
    const found = fields.find((f) => f.name === fName);
    if (!found) throw new Error(`field ${fName} not found for key`);
    return found;
  });
  primaryKey.setFieldSchemas(pkFieldSchemas);

  for (const fk of foreignKeys) {
    const indices: number[] = [];
    for (const fName of fk.key.fields()) {
      const idx = fields.findIndex((f) => f.name === fName);
      if (idx === -1) throw new Error(`field ${fName} not found for fk`);
      indices.push(idx);
    }
    fk.setKeyIndices(indices);
  }

  return new TableSchema(
    name,
    primaryKey,
    ENo.NO,
    false,
    Metadata_of(),
    fields,
    foreignKeys,
    [],
  );
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

function makeCfgValue(tables: VTable[]): CfgValue {
  const vTableMap = new Map<string, VTable>();
  for (const t of tables) {
    vTableMap.set(t.name(), t);
  }
  return new CfgValue({} as any, vTableMap, new CfgValueStat());
}

function makeForeignKey(
  name: string,
  keyFields: string[],
  refTable: string,
  refKey: any,
  localFields: FieldSchema[],
): ForeignKeySchema {
  const fkKey = new KeySchema(keyFields);
  fkKey.setFieldSchemas(localFields);
  return new ForeignKeySchema(name, fkKey, refTable, refKey, Metadata_of());
}

function linkForeignKeys(cfgValue: CfgValue): void {
  for (const vt of cfgValue.tables()) {
    for (const fk of vt.schema.foreignKeys()) {
      const refTable = cfgValue.getTable(fk.refTable);
      if (refTable) {
        fk.setRefTableSchema(refTable.schema);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ValueToJson', () => {

  // -------------------------------------------------------------------------
  // Primitive values
  // -------------------------------------------------------------------------

  it('serializes VBool', () => {
    const toJson = new ValueToJson();
    expect(toJson.toJson(new VBool(true, EMPTY_SOURCE))).toBe(true);
    expect(toJson.toJson(new VBool(false, EMPTY_SOURCE))).toBe(false);
  });

  it('serializes VInt', () => {
    const toJson = new ValueToJson();
    expect(toJson.toJson(new VInt(42, EMPTY_SOURCE))).toBe(42);
  });

  it('serializes VLong', () => {
    const toJson = new ValueToJson();
    expect(toJson.toJson(new VLong(999n, EMPTY_SOURCE))).toBe(999);
  });

  it('serializes VFloat', () => {
    const toJson = new ValueToJson();
    expect(toJson.toJson(new VFloat(3.14, EMPTY_SOURCE))).toBe(3.14);
  });

  it('serializes VString', () => {
    const toJson = new ValueToJson();
    expect(toJson.toJson(new VString('hello', EMPTY_SOURCE))).toBe('hello');
  });

  it('serializes VText using original() not value()', () => {
    const vText = new VText('original text', EMPTY_SOURCE);
    vText.setTranslated('translated text');
    const toJson = new ValueToJson();
    expect(toJson.toJson(vText)).toBe('original text');
  });

  // -------------------------------------------------------------------------
  // VStruct
  // -------------------------------------------------------------------------

  it('serializes VStruct with $type and fields', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('name', Primitive.STRING),
    ], new KeySchema(['id']));
    const vStruct = makeVStruct(schema, [
      new VInt(1, EMPTY_SOURCE),
      new VString('sword', EMPTY_SOURCE),
    ]);

    const toJson = new ValueToJson();
    const json = toJson.toJson(vStruct) as Record<string, unknown>;
    expect(json['$type']).toBe('item');
    expect(json['id']).toBe(1);
    expect(json['name']).toBe('sword');
  });

  it('serializes VStruct with $note', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const vStruct = makeVStruct(schema, [new VInt(1, EMPTY_SOURCE)]);
    vStruct.setNote('a note');

    const toJson = new ValueToJson();
    const json = toJson.toJson(vStruct) as Record<string, unknown>;
    expect(json['$note']).toBe('a note');
  });

  it('serializes VStruct with $fold', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const vStruct = makeVStruct(schema, [new VInt(1, EMPTY_SOURCE)]);
    vStruct.setFold(true);

    const toJson = new ValueToJson();
    const json = toJson.toJson(vStruct) as Record<string, unknown>;
    expect(json['$fold']).toBe(true);
  });

  it('serializes VStruct with embedFields', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('name', Primitive.STRING),
    ], new KeySchema(['id']));
    const vStruct = makeVStruct(schema, [
      new VInt(1, EMPTY_SOURCE),
      new VString('sword', EMPTY_SOURCE),
    ]);
    // embedFields keys are like $embed_<fieldName> per Java comment
    vStruct.setEmbedFields(new Map([['$embed_name', true]]));

    const toJson = new ValueToJson();
    const json = toJson.toJson(vStruct) as Record<string, unknown>;
    expect(json['$embed_name']).toBe(true);
    expect(json['name']).toBe('sword');
  });

  it('serializes VStruct without $note when note is undefined', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const vStruct = makeVStruct(schema, [new VInt(1, EMPTY_SOURCE)]);

    const toJson = new ValueToJson();
    const json = toJson.toJson(vStruct) as Record<string, unknown>;
    expect(json['$note']).toBeUndefined();
  });

  it('serializes VStruct without $fold when fold is false', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const vStruct = makeVStruct(schema, [new VInt(1, EMPTY_SOURCE)]);

    const toJson = new ValueToJson();
    const json = toJson.toJson(vStruct) as Record<string, unknown>;
    expect(json['$fold']).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // isSaveDefault behavior
  // -------------------------------------------------------------------------

  it('skips default values when isSaveDefault is false', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('count', Primitive.INT),
    ], new KeySchema(['id']));
    // count=0 is default for INT
    const vStruct = makeVStruct(schema, [
      new VInt(1, EMPTY_SOURCE),
      new VInt(0, EMPTY_SOURCE),
    ]);

    const toJson = new ValueToJson();
    toJson.setSaveDefault(false);
    const json = toJson.toJson(vStruct) as Record<string, unknown>;
    expect(json['id']).toBe(1);
    expect(json['count']).toBeUndefined();
  });

  it('includes default values when isSaveDefault is true', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('count', Primitive.INT),
    ], new KeySchema(['id']));
    const vStruct = makeVStruct(schema, [
      new VInt(1, EMPTY_SOURCE),
      new VInt(0, EMPTY_SOURCE),
    ]);

    const toJson = new ValueToJson();
    toJson.setSaveDefault(true);
    const json = toJson.toJson(vStruct) as Record<string, unknown>;
    expect(json['id']).toBe(1);
    expect(json['count']).toBe(0);
  });

  // -------------------------------------------------------------------------
  // VInterface
  // -------------------------------------------------------------------------

  it('serializes VInterface by delegating to child VStruct', () => {
    const childSchema = new StructSchema('IShape.Circle', AutoOrPack.AUTO, Metadata_of(), [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('radius', Primitive.INT),
    ], []);
    const childStruct = makeVStruct(childSchema, [
      new VInt(1, EMPTY_SOURCE),
      new VInt(5, EMPTY_SOURCE),
    ]);

    const iface = new InterfaceSchema('IShape', '', 'Circle', AutoOrPack.AUTO, Metadata_of(), [childSchema]);
    const vInterface = new VInterface(iface, childStruct, EMPTY_SOURCE);

    const toJson = new ValueToJson();
    const json = toJson.toJson(vInterface) as Record<string, unknown>;
    expect(json['$type']).toBe('IShape.Circle');
    expect(json['id']).toBe(1);
    expect(json['radius']).toBe(5);
  });

  // -------------------------------------------------------------------------
  // VList
  // -------------------------------------------------------------------------

  it('serializes VList as JSON array', () => {
    const vList = new VList([
      new VInt(1, EMPTY_SOURCE),
      new VInt(2, EMPTY_SOURCE),
      new VInt(3, EMPTY_SOURCE),
    ], EMPTY_SOURCE);

    const toJson = new ValueToJson();
    const json = toJson.toJson(vList) as unknown[];
    expect(json).toEqual([1, 2, 3]);
  });

  it('serializes VList of VString', () => {
    const vList = new VList([
      new VString('a', EMPTY_SOURCE),
      new VString('b', EMPTY_SOURCE),
    ], EMPTY_SOURCE);

    const toJson = new ValueToJson();
    const json = toJson.toJson(vList) as unknown[];
    expect(json).toEqual(['a', 'b']);
  });

  // -------------------------------------------------------------------------
  // VMap
  // -------------------------------------------------------------------------

  it('serializes VMap as array of $entry objects', () => {
    const vMap = new VMap(new Map<SimpleValue, SimpleValue>([
      [new VInt(10, EMPTY_SOURCE), new VString('ten', EMPTY_SOURCE)],
      [new VInt(20, EMPTY_SOURCE), new VString('twenty', EMPTY_SOURCE)],
    ]), EMPTY_SOURCE);

    const toJson = new ValueToJson();
    const json = toJson.toJson(vMap) as Record<string, unknown>[];
    expect(json.length).toBe(2);
    expect(json[0]['$type']).toBe('$entry');
    expect(json[0]['key']).toBe(10);
    expect(json[0]['value']).toBe('ten');
    expect(json[1]['$type']).toBe('$entry');
    expect(json[1]['key']).toBe(20);
    expect(json[1]['value']).toBe('twenty');
  });

  it('serializes VMap with $embed_value, $fold, $note', () => {
    const key1 = new VInt(10, EMPTY_SOURCE);
    const vMap = new VMap(new Map<SimpleValue, SimpleValue>([
      [key1, new VString('ten', EMPTY_SOURCE)],
    ]), EMPTY_SOURCE);
    vMap.setEntryEmbeds(new Map([[key1, true]]));
    vMap.setFoldedEntries(new Set([key1]));
    vMap.setEntryNotes(new Map([[key1, 'a note']]));

    const toJson = new ValueToJson();
    const json = toJson.toJson(vMap) as Record<string, unknown>[];
    expect(json[0]['$embed_value']).toBe(true);
    expect(json[0]['$fold']).toBe(true);
    expect(json[0]['$note']).toBe('a note');
  });

  // -------------------------------------------------------------------------
  // $refs collection
  // -------------------------------------------------------------------------

  it('includes $refs when refIdToRecordMap is provided', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('name', Primitive.STRING),
    ], new KeySchema(['id']));
    const monsterStruct = makeVStruct(monsterSchema, [
      new VInt(1, EMPTY_SOURCE),
      new VString('goblin', EMPTY_SOURCE),
    ]);
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: monsterStruct },
    ]);

    const idField = makeFieldSchema('id', Primitive.INT);
    const monsterIdField = makeFieldSchema('monsterId', Primitive.INT);
    const dropFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(false), [monsterIdField]);
    const dropSchema = makeTableSchema('drop', [idField, monsterIdField], new KeySchema(['id']), [dropFk]);

    const dropStruct = makeVStruct(dropSchema, [
      new VInt(100, EMPTY_SOURCE),
      new VInt(1, EMPTY_SOURCE),
    ]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: dropStruct },
    ]);

    const cfgValue = makeCfgValue([monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const refIdToRecordMap = new Map<RefId, VStruct>();
    const toJson = new ValueToJson(cfgValue, refIdToRecordMap);
    const json = toJson.toJson(dropStruct) as Record<string, unknown>;
    expect(json['$refs']).toBeDefined();
    const refs = json['$refs'] as unknown[];
    expect(refs.length).toBe(1);
  });

  it('does not include $refs when refIdToRecordMap is null (default constructor)', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const vStruct = makeVStruct(schema, [new VInt(1, EMPTY_SOURCE)]);

    const toJson = new ValueToJson();
    const json = toJson.toJson(vStruct) as Record<string, unknown>;
    expect(json['$refs']).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // toJsonStr static
  // -------------------------------------------------------------------------

  it('toJsonStr returns pretty JSON string', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('name', Primitive.STRING),
    ], new KeySchema(['id']));
    const vStruct = makeVStruct(schema, [
      new VInt(1, EMPTY_SOURCE),
      new VString('sword', EMPTY_SOURCE),
    ]);

    const jsonStr = ValueToJson.toJsonStr(vStruct);
    expect(typeof jsonStr).toBe('string');
    const parsed = JSON.parse(jsonStr);
    expect(parsed['$type']).toBe('item');
    expect(parsed['id']).toBe(1);
    expect(parsed['name']).toBe('sword');
  });

  it('toJsonStr skips default values', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('count', Primitive.INT),
    ], new KeySchema(['id']));
    const vStruct = makeVStruct(schema, [
      new VInt(1, EMPTY_SOURCE),
      new VInt(0, EMPTY_SOURCE),
    ]);

    const jsonStr = ValueToJson.toJsonStr(vStruct);
    const parsed = JSON.parse(jsonStr);
    expect(parsed['id']).toBe(1);
    expect(parsed['count']).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Default isSaveDefault is true
  // -------------------------------------------------------------------------

  it('default isSaveDefault is true (includes default values)', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('count', Primitive.INT),
    ], new KeySchema(['id']));
    const vStruct = makeVStruct(schema, [
      new VInt(1, EMPTY_SOURCE),
      new VInt(0, EMPTY_SOURCE),
    ]);

    const toJson = new ValueToJson();
    const json = toJson.toJson(vStruct) as Record<string, unknown>;
    expect(json['id']).toBe(1);
    expect(json['count']).toBe(0);
  });
});
