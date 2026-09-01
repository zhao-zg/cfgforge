/**
 * VTableCreator tests — T4.2e
 *
 * Tests VTable creation from a list of VStruct values:
 * - Primary key extraction and indexing
 * - Unique key extraction and indexing
 * - Enum virtual data generation (OfEmpty / OfAssigned)
 * - Enum name collection (EEntry / EEnum)
 * - Primary key sorting (VInt keys sorted numerically)
 * - Seq field continuity validation
 * - Error: primary key duplicated
 * - Error: unique key duplicated
 * - Error: entry contains space
 * - Error: enum empty name (EEnum only)
 * - Error: entry duplicated
 * - Error: seq value not continuous
 */

import { describe, it, expect } from 'vitest';
import {
  VString,
  VInt,
  VText,
  VStruct,
  VTable,
  type Value,
  type SimpleValue,
} from '../CfgValue';
import { CfgValueErrs } from '../CfgValueErrs';
import { VTableCreator } from '../VTableCreator';
import { DCellList } from '@cfgforge/data';
import type { Source } from '@cfgforge/data';

import {
  TableSchema,
  KeySchema,
  FieldSchema,
  ForeignKeySchema,
  EntryType,
  ENo,
  EEntry,
  EEnum,
  Metadata,
  Metadata_of,
  Primitive,
  AutoOrPack,
  TAG,
  type FieldSchema as FS,
} from '@cfgforge/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_SOURCE: Source = DCellList.of();

function makeFieldSchema(name: string, type: any, tags: string[] = []): FieldSchema {
  const meta = Metadata_of();
  for (const tag of tags) {
    if (tag === 'seq') {
      // 'seq' is a reserved tag, must set directly via data map
      meta.data().set('seq', TAG);
    } else {
      meta.putTag(tag);
    }
  }
  return new FieldSchema(name, type, AutoOrPack.AUTO, meta);
}

function makeTableSchema(
  name: string,
  fields: FieldSchema[],
  primaryKey: KeySchema,
  entry: EntryType = ENo.NO,
  uniqueKeys: KeySchema[] = [],
  meta: Metadata = Metadata_of(),
  isColumnMode: boolean = false,
): TableSchema {
  // Set fieldSchemas on the key schemas
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

  // Set entry fieldSchema
  if (entry !== ENo.NO) {
    const entryBase = entry as { field: string; setFieldSchema: (fs: FieldSchema) => void };
    const entryField = fields.find((f) => f.name === entryBase.field);
    if (entryField) {
      entryBase.setFieldSchema(entryField);
    }
  }

  return new TableSchema(
    name,
    primaryKey,
    entry,
    isColumnMode,
    meta,
    fields,
    [],  // foreignKeys
    uniqueKeys,
  );
}

function makeVStruct(schema: TableSchema, values: Value[]): VStruct {
  return new VStruct(schema, values, EMPTY_SOURCE);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VTableCreator', () => {

  // -------------------------------------------------------------------------
  // Basic VTable creation
  // -------------------------------------------------------------------------

  it('creates VTable with empty valueList', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const ts = makeTableSchema('test', [idField, nameField], pk);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([]);

    expect(vt).toBeInstanceOf(VTable);
    expect(vt.valueList).toHaveLength(0);
    expect(vt.primaryKeyMap.size).toBe(0);
    expect(vt.uniqueKeyMaps.size).toBe(0);
    expect(vt.enumNames).toBeNull();
    expect(vt.enumNameToIntegerValueMap).toBeNull();
    expect(errs.errs).toHaveLength(0);
  });

  it('creates VTable with single row — primary key index populated', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const ts = makeTableSchema('test', [idField, nameField], pk);

    const v1 = makeVStruct(ts, [
      new VInt(1, EMPTY_SOURCE),
      new VString('Alice', EMPTY_SOURCE),
    ]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1]);

    expect(vt.valueList).toHaveLength(1);
    expect(vt.primaryKeyMap.size).toBe(1);

    // Key should be VInt(1)
    const keys = [...vt.primaryKeyMap.keys()];
    expect(keys.length).toBe(1);
    expect(keys[0]).toBeInstanceOf(VInt);
    expect((keys[0] as VInt).value).toBe(1);

    // Value should be the v1 struct
    expect(vt.primaryKeyMap.get(keys[0] as VInt)).toBe(v1);
  });

  it('creates VTable with multiple rows — primary key index populated', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const ts = makeTableSchema('test', [idField, nameField], pk);

    const v1 = makeVStruct(ts, [new VInt(1, EMPTY_SOURCE), new VString('A', EMPTY_SOURCE)]);
    const v2 = makeVStruct(ts, [new VInt(2, EMPTY_SOURCE), new VString('B', EMPTY_SOURCE)]);
    const v3 = makeVStruct(ts, [new VInt(3, EMPTY_SOURCE), new VString('C', EMPTY_SOURCE)]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1, v2, v3]);

    expect(vt.valueList).toHaveLength(3);
    expect(vt.primaryKeyMap.size).toBe(3);

    // Keys should be VInt(1), VInt(2), VInt(3)
    const keys = [...vt.primaryKeyMap.keys()];
    const ids = keys.map((k) => (k as VInt).value).sort((a, b) => a - b);
    expect(ids).toEqual([1, 2, 3]);
  });

  // -------------------------------------------------------------------------
  // Primary key sorting (VInt keys sorted numerically)
  // -------------------------------------------------------------------------

  it('sorts primary key map by int value when PK is VInt', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const ts = makeTableSchema('test', [idField, nameField], pk);

    // Insert out of order
    const v3 = makeVStruct(ts, [new VInt(3, EMPTY_SOURCE), new VString('C', EMPTY_SOURCE)]);
    const v1 = makeVStruct(ts, [new VInt(1, EMPTY_SOURCE), new VString('A', EMPTY_SOURCE)]);
    const v2 = makeVStruct(ts, [new VInt(2, EMPTY_SOURCE), new VString('B', EMPTY_SOURCE)]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v3, v1, v2]);

    // Keys should be sorted: 1, 2, 3
    const keys = [...vt.primaryKeyMap.keys()];
    expect((keys[0] as VInt).value).toBe(1);
    expect((keys[1] as VInt).value).toBe(2);
    expect((keys[2] as VInt).value).toBe(3);

    // valueList stays in original order
    expect(vt.valueList).toEqual([v3, v1, v2]);
  });

  it('does not sort when PK is string type', () => {
    const idField = makeFieldSchema('id', Primitive.STRING);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const ts = makeTableSchema('test', [idField, nameField], pk);

    const v1 = makeVStruct(ts, [new VString('Charlie', EMPTY_SOURCE), new VString('C', EMPTY_SOURCE)]);
    const v2 = makeVStruct(ts, [new VString('Alice', EMPTY_SOURCE), new VString('A', EMPTY_SOURCE)]);
    const v3 = makeVStruct(ts, [new VString('Bob', EMPTY_SOURCE), new VString('B', EMPTY_SOURCE)]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1, v2, v3]);

    // Keys should remain in insertion order
    const keys = [...vt.primaryKeyMap.keys()];
    expect((keys[0] as VString).value).toBe('Charlie');
    expect((keys[1] as VString).value).toBe('Alice');
    expect((keys[2] as VString).value).toBe('Bob');
  });

  it('does not sort when only one entry', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const ts = makeTableSchema('test', [idField, nameField], pk);

    const v1 = makeVStruct(ts, [new VInt(5, EMPTY_SOURCE), new VString('A', EMPTY_SOURCE)]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1]);

    const keys = [...vt.primaryKeyMap.keys()];
    expect((keys[0] as VInt).value).toBe(5);
  });

  // -------------------------------------------------------------------------
  // Unique key extraction
  // -------------------------------------------------------------------------

  it('extracts unique key map', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const uk = new KeySchema(['name']);
    const ts = makeTableSchema('test', [idField, nameField], pk, ENo.NO, [uk]);

    const v1 = makeVStruct(ts, [new VInt(1, EMPTY_SOURCE), new VString('Alice', EMPTY_SOURCE)]);
    const v2 = makeVStruct(ts, [new VInt(2, EMPTY_SOURCE), new VString('Bob', EMPTY_SOURCE)]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1, v2]);

    expect(vt.uniqueKeyMaps.size).toBe(1);

    // Find the unique key map for ['name']
    const ukKey = uk.fields();
    let ukMap: Map<Value, VStruct> | undefined;
    for (const [k, v] of vt.uniqueKeyMaps.entries()) {
      if (k.length === ukKey.length && k.every((f, i) => f === ukKey[i])) {
        ukMap = v;
        break;
      }
    }
    expect(ukMap).toBeDefined();
    expect(ukMap!.size).toBe(2);

    // Keys should be VString('Alice') and VString('Bob')
    const ukValues = [...ukMap!.keys()].map((k) => (k as VString).value).sort();
    expect(ukValues).toEqual(['Alice', 'Bob']);
  });

  it('extracts multi-field unique key', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const catField = makeFieldSchema('cat', Primitive.STRING);
    const subField = makeFieldSchema('sub', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const uk = new KeySchema(['cat', 'sub']);
    const ts = makeTableSchema('test', [idField, catField, subField], pk, ENo.NO, [uk]);

    const v1 = makeVStruct(ts, [
      new VInt(1, EMPTY_SOURCE),
      new VString('A', EMPTY_SOURCE),
      new VString('X', EMPTY_SOURCE),
    ]);
    const v2 = makeVStruct(ts, [
      new VInt(2, EMPTY_SOURCE),
      new VString('B', EMPTY_SOURCE),
      new VString('Y', EMPTY_SOURCE),
    ]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1, v2]);

    expect(vt.uniqueKeyMaps.size).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Enum virtual data generation
  // -------------------------------------------------------------------------

  it('generates enum virtual data for OfEmpty', () => {
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const descField = makeFieldSchema('desc', Primitive.TEXT);
    const pk = new KeySchema(['name']);
    const meta = Metadata_of();

    // Add enum values
    meta.putEnumValues({
      _tag: 'OfEmpty',
      values: [
        { name: 'RED', comment: 'Red color' },
        { name: 'GREEN', comment: 'Green color' },
        { name: 'BLUE', comment: 'Blue color' },
      ],
    });

    const ts = makeTableSchema('color', [nameField, descField], pk, ENo.NO, [], meta);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([]); // empty input — virtual data generated

    expect(vt.valueList).toHaveLength(3);
    expect(vt.valueList[0].values[0]).toBeInstanceOf(VString);
    expect((vt.valueList[0].values[0] as VString).value).toBe('RED');
    expect(vt.valueList[0].values[1]).toBeInstanceOf(VText);
    expect((vt.valueList[0].values[1] as VText).value).toBe('Red color');

    expect((vt.valueList[1].values[0] as VString).value).toBe('GREEN');
    expect((vt.valueList[2].values[0] as VString).value).toBe('BLUE');
  });

  it('generates enum virtual data for OfAssigned', () => {
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const numField = makeFieldSchema('num', Primitive.INT);
    const descField = makeFieldSchema('desc', Primitive.TEXT);
    const pk = new KeySchema(['name']);
    const meta = Metadata_of();

    meta.putEnumValues({
      _tag: 'OfAssigned',
      values: [
        { name: 'RED', comment: 'Red', number: 1 },
        { name: 'GREEN', comment: 'Green', number: 2 },
      ],
    });

    const ts = makeTableSchema('color', [nameField, numField, descField], pk, ENo.NO, [], meta);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([]);

    expect(vt.valueList).toHaveLength(2);
    expect((vt.valueList[0].values[0] as VString).value).toBe('RED');
    expect((vt.valueList[0].values[1] as VInt).value).toBe(1);
    expect((vt.valueList[0].values[2] as VText).value).toBe('Red');
  });

  // -------------------------------------------------------------------------
  // Enum name collection
  // -------------------------------------------------------------------------

  it('collects enum names with EEntry', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const entry = new EEntry('name');
    const ts = makeTableSchema('test', [idField, nameField], pk, entry);

    const v1 = makeVStruct(ts, [new VInt(1, EMPTY_SOURCE), new VString('Red', EMPTY_SOURCE)]);
    const v2 = makeVStruct(ts, [new VInt(2, EMPTY_SOURCE), new VString('Blue', EMPTY_SOURCE)]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1, v2]);

    expect(vt.enumNames).not.toBeNull();
    expect(vt.enumNames!.size).toBe(2);
    expect(vt.enumNames!.has('Red')).toBe(true);
    expect(vt.enumNames!.has('Blue')).toBe(true);
    // No enumNameToIntegerValueMap because pk field differs from entry field
    // but pk is not int? Actually pk is int ('id') and entry is 'name'
    // pkIdx should be set (pk field 'id' != entry field 'name'), and pk is INT
    expect(vt.enumNameToIntegerValueMap).not.toBeNull();
    expect(vt.enumNameToIntegerValueMap!.get('Red')).toBe(1);
    expect(vt.enumNameToIntegerValueMap!.get('Blue')).toBe(2);
  });

  it('collects enum names with EEnum', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const entry = new EEnum('name');
    const ts = makeTableSchema('test', [idField, nameField], pk, entry);

    const v1 = makeVStruct(ts, [new VInt(1, EMPTY_SOURCE), new VString('Red', EMPTY_SOURCE)]);
    const v2 = makeVStruct(ts, [new VInt(2, EMPTY_SOURCE), new VString('Blue', EMPTY_SOURCE)]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1, v2]);

    expect(vt.enumNames).not.toBeNull();
    expect(vt.enumNames!.size).toBe(2);
    expect(vt.enumNames!.has('Red')).toBe(true);
    expect(vt.enumNames!.has('Blue')).toBe(true);
  });

  it('does not collect enum names when entry is ENo', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const ts = makeTableSchema('test', [idField, nameField], pk, ENo.NO);

    const v1 = makeVStruct(ts, [new VInt(1, EMPTY_SOURCE), new VString('Red', EMPTY_SOURCE)]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1]);

    expect(vt.enumNames).toBeNull();
    expect(vt.enumNameToIntegerValueMap).toBeNull();
  });

  it('does not create enumNameToIntegerValueMap when pk field is the entry field', () => {
    const idField = makeFieldSchema('id', Primitive.STRING);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const entry = new EEnum('id'); // Same as pk field
    const ts = makeTableSchema('test', [idField, nameField], pk, entry);

    const v1 = makeVStruct(ts, [new VString('1', EMPTY_SOURCE), new VString('A', EMPTY_SOURCE)]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1]);

    expect(vt.enumNames).not.toBeNull();
    expect(vt.enumNames!.has('1')).toBe(true);
    // pkIdx should be -1 because pk field === entry field
    expect(vt.enumNameToIntegerValueMap).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Error cases
  // -------------------------------------------------------------------------

  it('reports error when primary key is duplicated', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const ts = makeTableSchema('test', [idField, nameField], pk);

    const v1 = makeVStruct(ts, [new VInt(1, EMPTY_SOURCE), new VString('A', EMPTY_SOURCE)]);
    const v2 = makeVStruct(ts, [new VInt(1, EMPTY_SOURCE), new VString('B', EMPTY_SOURCE)]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1, v2]);

    expect(errs.errs.length).toBeGreaterThanOrEqual(1);
    expect(errs.errs[0]._tag).toBe('PrimaryOrUniqueKeyDuplicated');
    // The second one should overwrite the first in the map
    expect(vt.primaryKeyMap.size).toBe(1);
    // The remaining entry should be v2 (last one wins, matching Java LinkedHashMap.putLast behavior)
    const remainingValue = [...vt.primaryKeyMap.values()][0];
    expect(remainingValue).toBe(v2);
  });

  it('reports error when unique key is duplicated', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const uk = new KeySchema(['name']);
    const ts = makeTableSchema('test', [idField, nameField], pk, ENo.NO, [uk]);

    const v1 = makeVStruct(ts, [new VInt(1, EMPTY_SOURCE), new VString('Same', EMPTY_SOURCE)]);
    const v2 = makeVStruct(ts, [new VInt(2, EMPTY_SOURCE), new VString('Same', EMPTY_SOURCE)]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1, v2]);

    expect(errs.errs.length).toBeGreaterThanOrEqual(1);
    const pkDupErr = errs.errs.find((e) => e._tag === 'PrimaryOrUniqueKeyDuplicated');
    expect(pkDupErr).toBeDefined();
  });

  it('reports error when entry contains space', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const entry = new EEntry('name');
    const ts = makeTableSchema('test', [idField, nameField], pk, entry);

    const v1 = makeVStruct(ts, [new VInt(1, EMPTY_SOURCE), new VString('Has Space', EMPTY_SOURCE)]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1]);

    const spaceErr = errs.errs.find((e) => e._tag === 'EntryContainsSpace');
    expect(spaceErr).toBeDefined();
    // Entry with space is skipped from enum names
    expect(vt.enumNames!.size).toBe(0);
  });

  it('reports error when EEnum entry name is empty', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const entry = new EEnum('name');
    const ts = makeTableSchema('test', [idField, nameField], pk, entry);

    const v1 = makeVStruct(ts, [new VInt(1, EMPTY_SOURCE), new VString('', EMPTY_SOURCE)]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1]);

    const emptyErr = errs.errs.find((e) => e._tag === 'EnumEmpty');
    expect(emptyErr).toBeDefined();
  });

  it('does not report EnumEmpty when EEntry has empty name', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const entry = new EEntry('name');
    const ts = makeTableSchema('test', [idField, nameField], pk, entry);

    const v1 = makeVStruct(ts, [new VInt(1, EMPTY_SOURCE), new VString('', EMPTY_SOURCE)]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1]);

    const emptyErr = errs.errs.find((e) => e._tag === 'EnumEmpty');
    expect(emptyErr).toBeUndefined();
  });

  it('reports error when entry name is duplicated (case-insensitive)', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const entry = new EEntry('name');
    const ts = makeTableSchema('test', [idField, nameField], pk, entry);

    const v1 = makeVStruct(ts, [new VInt(1, EMPTY_SOURCE), new VString('Red', EMPTY_SOURCE)]);
    const v2 = makeVStruct(ts, [new VInt(2, EMPTY_SOURCE), new VString('RED', EMPTY_SOURCE)]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1, v2]);

    const dupErr = errs.errs.find((e) => e._tag === 'EntryDuplicated');
    expect(dupErr).toBeDefined();
    // Only 'Red' (first) should be in enumNames
    expect(vt.enumNames!.size).toBe(1);
    expect(vt.enumNames!.has('Red')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Seq field validation
  // -------------------------------------------------------------------------

  it('validates seq field continuity — pass case', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const seqField = makeFieldSchema('seq', Primitive.INT, ['seq']);
    const pk = new KeySchema(['id']);
    const ts = makeTableSchema('test', [idField, seqField], pk);

    const v1 = makeVStruct(ts, [new VInt(10, EMPTY_SOURCE), new VInt(0, EMPTY_SOURCE)]);
    const v2 = makeVStruct(ts, [new VInt(20, EMPTY_SOURCE), new VInt(1, EMPTY_SOURCE)]);
    const v3 = makeVStruct(ts, [new VInt(30, EMPTY_SOURCE), new VInt(2, EMPTY_SOURCE)]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1, v2, v3]);

    expect(errs.errs).toHaveLength(0);
  });

  it('reports error when seq field value is not continuous', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const seqField = makeFieldSchema('seq', Primitive.INT, ['seq']);
    const pk = new KeySchema(['id']);
    const ts = makeTableSchema('test', [idField, seqField], pk);

    const v1 = makeVStruct(ts, [new VInt(10, EMPTY_SOURCE), new VInt(0, EMPTY_SOURCE)]);
    const v2 = makeVStruct(ts, [new VInt(20, EMPTY_SOURCE), new VInt(3, EMPTY_SOURCE)]); // gap!
    const v3 = makeVStruct(ts, [new VInt(30, EMPTY_SOURCE), new VInt(4, EMPTY_SOURCE)]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1, v2, v3]);

    const seqErr = errs.errs.find((e) => e._tag === 'SeqValueNotContinuous');
    expect(seqErr).toBeDefined();
  });

  it('does not report seq error when no seq field', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const ts = makeTableSchema('test', [idField, nameField], pk);

    const v1 = makeVStruct(ts, [new VInt(1, EMPTY_SOURCE), new VString('A', EMPTY_SOURCE)]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1]);

    expect(errs.errs).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Multi-key primary key
  // -------------------------------------------------------------------------

  it('handles multi-field primary key', () => {
    const aField = makeFieldSchema('a', Primitive.INT);
    const bField = makeFieldSchema('b', Primitive.STRING);
    const pk = new KeySchema(['a', 'b']);
    const ts = makeTableSchema('test', [aField, bField], pk);

    const v1 = makeVStruct(ts, [new VInt(1, EMPTY_SOURCE), new VString('X', EMPTY_SOURCE)]);
    const v2 = makeVStruct(ts, [new VInt(2, EMPTY_SOURCE), new VString('Y', EMPTY_SOURCE)]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1, v2]);

    expect(vt.primaryKeyMap.size).toBe(2);
    // Multi-key returns VList as key
    const keys = [...vt.primaryKeyMap.keys()];
    // Should not be sorted since multi-key returns VList, not VInt
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it('handles table with no unique keys', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const pk = new KeySchema(['id']);
    const ts = makeTableSchema('test', [idField], pk);

    const v1 = makeVStruct(ts, [new VInt(1, EMPTY_SOURCE)]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1]);

    expect(vt.uniqueKeyMaps.size).toBe(0);
  });

  it('preserves original valueList in returned VTable', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const ts = makeTableSchema('test', [idField, nameField], pk);

    const v1 = makeVStruct(ts, [new VInt(1, EMPTY_SOURCE), new VString('A', EMPTY_SOURCE)]);
    const v2 = makeVStruct(ts, [new VInt(2, EMPTY_SOURCE), new VString('B', EMPTY_SOURCE)]);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([v1, v2]);

    // valueList should be the same array (not a copy, matching Java behavior)
    expect(vt.valueList).toEqual([v1, v2]);
  });

  it('returns correct schema in VTable', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const pk = new KeySchema(['id']);
    const ts = makeTableSchema('mytable', [idField], pk);

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create([]);

    expect(vt.schema).toBe(ts);
    expect(vt.name()).toBe('mytable');
  });

  // -------------------------------------------------------------------------
  // Large table performance / correctness (regression: O(n²) key extraction)
  // -------------------------------------------------------------------------
  // Regression test for the linear-scan duplicate detection in extractKeyValues.
  // Old implementation scanned keyMap.keys() for every row (O(n²)) — a table
  // with 89061 rows took ~55s. Fixed implementation must stay well under the
  // timeout even at this scale.

  it('handles 40000 unique string keys within timeout (no false duplicates)', () => {
    const idField = makeFieldSchema('id', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const ts = makeTableSchema('bigtable', [idField], pk);

    const N = 40000;
    const structs: VStruct[] = [];
    for (let i = 0; i < N; i++) {
      structs.push(new VStruct(
        ts,
        [new VString(`key-${i}`, EMPTY_SOURCE)],
        EMPTY_SOURCE,
      ));
    }

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create(structs);

    expect(vt.primaryKeyMap.size).toBe(N);
    expect(errs.errs).toHaveLength(0);
  }, 8000);

  it('detects duplicate keys inside a large table', () => {
    const idField = makeFieldSchema('id', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const ts = makeTableSchema('bigtable', [idField], pk);

    const N = 60000;
    const dupCount = 3; // three duplicated keys among N rows
    const structs: VStruct[] = [];
    for (let i = 0; i < N; i++) {
      let key: string;
      if (i < dupCount) {
        key = 'duplicate-key'; // first 3 rows share the same key
      } else {
        key = `key-${i}`;
      }
      structs.push(new VStruct(
        ts,
        [new VString(key, EMPTY_SOURCE)],
        EMPTY_SOURCE,
      ));
    }

    const errs = CfgValueErrs.of();
    const creator = new VTableCreator(ts, errs);
    const vt = creator.create(structs);

    // 3 rows share the same key → 2 duplicates reported
    const dupErrs = errs.errs.filter((e) => e._tag === 'PrimaryOrUniqueKeyDuplicated');
    expect(dupErrs.length).toBe(dupCount - 1);
    // Only one entry remains for that key (last one wins)
    expect(vt.primaryKeyMap.size).toBe(N - (dupCount - 1));
  }, 8000);
});
