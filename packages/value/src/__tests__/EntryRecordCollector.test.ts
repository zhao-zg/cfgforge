/**
 * EntryRecordCollector tests — T4.10
 *
 * Tests entry record collection:
 * - ROOT table (meta.isRoot): collect all records
 * - EEnum table: collect all records
 * - EEntry table: collect only records with entry field value
 * - ENo table: collect nothing
 * - Empty table → empty result
 * - Multiple tables → aggregated Entry
 */

import { describe, it, expect } from 'vitest';
import {
  VString,
  VInt,
  VStruct,
  VTable,
  CfgValue,
  CfgValueStat,
  type Value,
} from '../CfgValue';
import {
  EntryRecordCollector,
  EntryTypeTag,
} from '../EntryRecordCollector';
import { DCellList } from '@cfggen/data';
import type { Source } from '@cfggen/data';
import {
  TableSchema,
  KeySchema,
  FieldSchema,
  ForeignKeySchema,
  Metadata,
  Metadata_of,
  TAG,
  Primitive,
  AutoOrPack,
  ENo,
  EEntry,
  EEnum,
  type Structural,
} from '@cfggen/schema';

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
  entry: any = ENo.NO,
  meta: Metadata = Metadata_of(),
  foreignKeys: ForeignKeySchema[] = [],
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
    entry,
    false,
    meta,
    fields,
    foreignKeys,
    uniqueKeys,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EntryRecordCollector', () => {

  // -------------------------------------------------------------------------
  // ENo table — collects nothing
  // -------------------------------------------------------------------------

  it('ENo table collects no records', () => {
    const schema = makeTableSchema('internal', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('name', Primitive.STRING),
    ], new KeySchema(['id']), ENo.NO);
    const table = makeVTable(schema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(schema, [new VInt(1, EMPTY_SOURCE), new VString('a', EMPTY_SOURCE)]) },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: makeVStruct(schema, [new VInt(2, EMPTY_SOURCE), new VString('b', EMPTY_SOURCE)]) },
    ]);
    const cfgValue = makeCfgValue([table]);

    const entry = EntryRecordCollector.collectEntry(cfgValue);
    expect(entry.total).toBe(0);
    expect(entry.tables).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // ROOT table — collects all records
  // -------------------------------------------------------------------------

  it('ROOT table collects all records', () => {
    const rootMeta = Metadata_of();
    rootMeta.data().set('root', TAG);
    const schema = makeTableSchema('rootTable', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('name', Primitive.STRING),
    ], new KeySchema(['id']), ENo.NO, rootMeta);
    const table = makeVTable(schema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(schema, [new VInt(1, EMPTY_SOURCE), new VString('a', EMPTY_SOURCE)]) },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: makeVStruct(schema, [new VInt(2, EMPTY_SOURCE), new VString('b', EMPTY_SOURCE)]) },
    ]);
    const cfgValue = makeCfgValue([table]);

    const entry = EntryRecordCollector.collectEntry(cfgValue);
    expect(entry.total).toBe(2);
    expect(entry.tables).toHaveLength(1);
    expect(entry.tables[0].typeTag).toBe(EntryTypeTag.ROOT);
    expect(entry.tables[0].entryRecords).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // EEnum table — collects all records
  // -------------------------------------------------------------------------

  it('EEnum table collects all records', () => {
    const schema = makeTableSchema('color', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('name', Primitive.STRING),
    ], new KeySchema(['id']), new EEnum('name'));
    const table = makeVTable(schema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(schema, [new VInt(1, EMPTY_SOURCE), new VString('Red', EMPTY_SOURCE)]) },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: makeVStruct(schema, [new VInt(2, EMPTY_SOURCE), new VString('Green', EMPTY_SOURCE)]) },
      { pk: new VInt(3, EMPTY_SOURCE), vStruct: makeVStruct(schema, [new VInt(3, EMPTY_SOURCE), new VString('Blue', EMPTY_SOURCE)]) },
    ]);
    const cfgValue = makeCfgValue([table]);

    const entry = EntryRecordCollector.collectEntry(cfgValue);
    expect(entry.total).toBe(3);
    expect(entry.tables).toHaveLength(1);
    expect(entry.tables[0].typeTag).toBe(EntryTypeTag.ENUM);
    expect(entry.tables[0].entryRecords).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // EEntry table — only collect records with entry field value
  // -------------------------------------------------------------------------

  it('EEntry table collects only records with entry field value', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('entryName', Primitive.STRING),
    ], new KeySchema(['id']), new EEntry('entryName'));
    const table = makeVTable(schema, [
      // entry field has value
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(schema, [new VInt(1, EMPTY_SOURCE), new VString('Sword', EMPTY_SOURCE)]) },
      // entry field empty
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: makeVStruct(schema, [new VInt(2, EMPTY_SOURCE), new VString('', EMPTY_SOURCE)]) },
      // entry field has value
      { pk: new VInt(3, EMPTY_SOURCE), vStruct: makeVStruct(schema, [new VInt(3, EMPTY_SOURCE), new VString('Shield', EMPTY_SOURCE)]) },
    ]);
    const cfgValue = makeCfgValue([table]);

    const entry = EntryRecordCollector.collectEntry(cfgValue);
    expect(entry.total).toBe(2);
    expect(entry.tables).toHaveLength(1);
    expect(entry.tables[0].typeTag).toBe(EntryTypeTag.ENTRY);
    expect(entry.tables[0].entryRecords).toHaveLength(2);
    // Verify the right records were collected (pk=1 and pk=3)
    expect(entry.tables[0].entryRecords[0].primaryKey).toBe('1');
    expect(entry.tables[0].entryRecords[1].primaryKey).toBe('3');
  });

  // -------------------------------------------------------------------------
  // EEntry table — all records have empty entry field → no entry records
  // -------------------------------------------------------------------------

  it('EEntry table with all empty entry fields collects nothing', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('entryName', Primitive.STRING),
    ], new KeySchema(['id']), new EEntry('entryName'));
    const table = makeVTable(schema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(schema, [new VInt(1, EMPTY_SOURCE), new VString('', EMPTY_SOURCE)]) },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: makeVStruct(schema, [new VInt(2, EMPTY_SOURCE), new VString('', EMPTY_SOURCE)]) },
    ]);
    const cfgValue = makeCfgValue([table]);

    const entry = EntryRecordCollector.collectEntry(cfgValue);
    expect(entry.total).toBe(0);
    expect(entry.tables).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Empty CfgValue → empty result
  // -------------------------------------------------------------------------

  it('empty CfgValue produces empty result', () => {
    const cfgValue = makeCfgValue([]);
    const entry = EntryRecordCollector.collectEntry(cfgValue);
    expect(entry.total).toBe(0);
    expect(entry.tables).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Multiple tables → aggregated Entry
  // -------------------------------------------------------------------------

  it('multiple tables are aggregated into a single Entry', () => {
    const rootMeta = Metadata_of();
    rootMeta.data().set('root', TAG);
    const rootSchema = makeTableSchema('rootTable', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']), ENo.NO, rootMeta);
    const rootTable = makeVTable(rootSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(rootSchema, [new VInt(1, EMPTY_SOURCE)]) },
    ]);

    const enumSchema = makeTableSchema('color', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('name', Primitive.STRING),
    ], new KeySchema(['id']), new EEnum('name'));
    const enumTable = makeVTable(enumSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(enumSchema, [new VInt(1, EMPTY_SOURCE), new VString('Red', EMPTY_SOURCE)]) },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: makeVStruct(enumSchema, [new VInt(2, EMPTY_SOURCE), new VString('Blue', EMPTY_SOURCE)]) },
    ]);

    const internalSchema = makeTableSchema('internal', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']), ENo.NO);
    const internalTable = makeVTable(internalSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(internalSchema, [new VInt(1, EMPTY_SOURCE)]) },
    ]);

    const cfgValue = makeCfgValue([rootTable, enumTable, internalTable]);
    const entry = EntryRecordCollector.collectEntry(cfgValue);

    // root (1 record) + enum (2 records) + internal (0 records) = 3 total
    expect(entry.total).toBe(3);
    expect(entry.tables).toHaveLength(2); // internal table excluded (no entry records)
  });

  // -------------------------------------------------------------------------
  // collectEntryInTable — direct call on ENo table
  // -------------------------------------------------------------------------

  it('collectEntryInTable on ENo table returns empty records with ENTRY tag', () => {
    const schema = makeTableSchema('internal', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']), ENo.NO);
    const table = makeVTable(schema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(schema, [new VInt(1, EMPTY_SOURCE)]) },
    ]);

    const result = EntryRecordCollector.collectEntryInTable(table);
    expect(result.entryRecords).toHaveLength(0);
    expect(result.typeTag).toBe(EntryTypeTag.ENTRY);
  });
});
