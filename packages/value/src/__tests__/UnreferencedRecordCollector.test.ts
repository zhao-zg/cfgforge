/**
 * UnreferencedRecordCollector tests — T4.10
 *
 * Tests unreferenced record collection:
 * - Referenced record → not unreferenced
 * - Unreferenced record → collected
 * - EEnum table → all skipped
 * - EEntry table: record with entry field value → skipped
 * - Root table → skipped entirely
 * - ENo table: records without references → unreferenced
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
  UnreferencedRecordCollector,
} from '../UnreferencedRecordCollector';
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
  RefPrimary,
  TableSchemaRefGraph,
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

function makeCfgValue(schema: any, tables: VTable[]): CfgValue {
  const vTableMap = new Map<string, VTable>();
  for (const t of tables) {
    vTableMap.set(t.name(), t);
  }
  return new CfgValue(schema, vTableMap, new CfgValueStat());
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

function makeMockCfgSchema(tables: TableSchema[]): any {
  const tableMap = new Map<string, TableSchema>();
  for (const t of tables) {
    tableMap.set(t.name(), t);
  }
  return {
    requireResolved: () => {},
    tableMap: () => tableMap,
    findTable: (name: string) => tableMap.get(name) ?? null,
    sortedTables: () => tables,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UnreferencedRecordCollector', () => {

  // -------------------------------------------------------------------------
  // Referenced record → not unreferenced
  // -------------------------------------------------------------------------

  it('referenced record is not collected as unreferenced', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
    ]);

    const dropIdField = makeFieldSchema('id', Primitive.INT);
    const monsterIdField = makeFieldSchema('monsterId', Primitive.INT);
    const dropFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(false), [monsterIdField]);
    const dropMeta = Metadata_of();
    dropMeta.data().set('root', TAG); // mark drop as root so it's not unreferenced
    const dropSchema = makeTableSchema('drop', [dropIdField, monsterIdField], new KeySchema(['id']), ENo.NO, dropMeta, [dropFk]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: makeVStruct(dropSchema, [new VInt(100, EMPTY_SOURCE), new VInt(1, EMPTY_SOURCE)]) },
    ]);

    const mockSchema = makeMockCfgSchema([monsterSchema, dropSchema]);
    const cfgValue = makeCfgValue(mockSchema, [monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const unreferenced = UnreferencedRecordCollector.collectUnreferenced(cfgValue);
    // monster id=1 is referenced by drop → not unreferenced
    // drop is root → skipped
    expect(unreferenced.total).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Unreferenced record → collected
  // -------------------------------------------------------------------------

  it('unreferenced record is collected', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(2, EMPTY_SOURCE)]) }, // not referenced
    ]);

    const dropIdField = makeFieldSchema('id', Primitive.INT);
    const monsterIdField = makeFieldSchema('monsterId', Primitive.INT);
    const dropFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(false), [monsterIdField]);
    const dropSchema = makeTableSchema('drop', [dropIdField, monsterIdField], new KeySchema(['id']), ENo.NO, Metadata_of(), [dropFk]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: makeVStruct(dropSchema, [new VInt(100, EMPTY_SOURCE), new VInt(1, EMPTY_SOURCE)]) }, // references monster id=1
    ]);

    const mockSchema = makeMockCfgSchema([monsterSchema, dropSchema]);
    const cfgValue = makeCfgValue(mockSchema, [monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const unreferenced = UnreferencedRecordCollector.collectUnreferenced(cfgValue);
    // monster id=2 is unreferenced; drop id=100 is also unreferenced (no one references drop)
    expect(unreferenced.total).toBe(2);
    expect(unreferenced.tableToUnreferenced.has('monster')).toBe(true);
    expect(unreferenced.tableToUnreferenced.get('monster')!.length).toBe(1);
    expect(unreferenced.tableToUnreferenced.get('monster')![0].primaryKey).toBe('2');
  });

  // -------------------------------------------------------------------------
  // EEnum table → all skipped
  // -------------------------------------------------------------------------

  it('EEnum table records are all skipped', () => {
    const colorSchema = makeTableSchema('color', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('name', Primitive.STRING),
    ], new KeySchema(['id']), new EEnum('name'));
    const colorTable = makeVTable(colorSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(colorSchema, [new VInt(1, EMPTY_SOURCE), new VString('Red', EMPTY_SOURCE)]) },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: makeVStruct(colorSchema, [new VInt(2, EMPTY_SOURCE), new VString('Blue', EMPTY_SOURCE)]) },
    ]);

    const mockSchema = makeMockCfgSchema([colorSchema]);
    const cfgValue = makeCfgValue(mockSchema, [colorTable]);
    linkForeignKeys(cfgValue);

    const unreferenced = UnreferencedRecordCollector.collectUnreferenced(cfgValue);
    expect(unreferenced.total).toBe(0);
  });

  // -------------------------------------------------------------------------
  // EEntry table — record with entry field value → skipped
  // -------------------------------------------------------------------------

  it('EEntry record with entry field value is skipped', () => {
    const itemSchema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('entryName', Primitive.STRING),
    ], new KeySchema(['id']), new EEntry('entryName'));
    const itemTable = makeVTable(itemSchema, [
      // has entry → skipped
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(itemSchema, [new VInt(1, EMPTY_SOURCE), new VString('Sword', EMPTY_SOURCE)]) },
      // no entry → unreferenced
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: makeVStruct(itemSchema, [new VInt(2, EMPTY_SOURCE), new VString('', EMPTY_SOURCE)]) },
    ]);

    const mockSchema = makeMockCfgSchema([itemSchema]);
    const cfgValue = makeCfgValue(mockSchema, [itemTable]);
    linkForeignKeys(cfgValue);

    const unreferenced = UnreferencedRecordCollector.collectUnreferenced(cfgValue);
    expect(unreferenced.total).toBe(1);
    expect(unreferenced.tableToUnreferenced.get('item')!.length).toBe(1);
    expect(unreferenced.tableToUnreferenced.get('item')![0].primaryKey).toBe('2');
  });

  // -------------------------------------------------------------------------
  // Root table → skipped entirely
  // -------------------------------------------------------------------------

  it('root table is skipped entirely', () => {
    const rootMeta = Metadata_of();
    rootMeta.data().set('root', TAG);
    const rootSchema = makeTableSchema('rootTable', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']), ENo.NO, rootMeta);
    const rootTable = makeVTable(rootSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(rootSchema, [new VInt(1, EMPTY_SOURCE)]) },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: makeVStruct(rootSchema, [new VInt(2, EMPTY_SOURCE)]) },
    ]);

    const mockSchema = makeMockCfgSchema([rootSchema]);
    const cfgValue = makeCfgValue(mockSchema, [rootTable]);
    linkForeignKeys(cfgValue);

    const unreferenced = UnreferencedRecordCollector.collectUnreferenced(cfgValue);
    expect(unreferenced.total).toBe(0);
  });

  // -------------------------------------------------------------------------
  // ENo table — records without references are unreferenced
  // -------------------------------------------------------------------------

  it('ENo table records without references are unreferenced', () => {
    const internalSchema = makeTableSchema('internal', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const internalTable = makeVTable(internalSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(internalSchema, [new VInt(1, EMPTY_SOURCE)]) },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: makeVStruct(internalSchema, [new VInt(2, EMPTY_SOURCE)]) },
    ]);

    const mockSchema = makeMockCfgSchema([internalSchema]);
    const cfgValue = makeCfgValue(mockSchema, [internalTable]);
    linkForeignKeys(cfgValue);

    const unreferenced = UnreferencedRecordCollector.collectUnreferenced(cfgValue);
    expect(unreferenced.total).toBe(2);
    expect(unreferenced.tableToUnreferenced.has('internal')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Empty CfgValue → empty result
  // -------------------------------------------------------------------------

  it('empty CfgValue produces empty result', () => {
    const mockSchema = makeMockCfgSchema([]);
    const cfgValue = makeCfgValue(mockSchema, []);
    const unreferenced = UnreferencedRecordCollector.collectUnreferenced(cfgValue);
    expect(unreferenced.total).toBe(0);
    expect(unreferenced.tableToUnreferenced.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // collectUnreferencedInTable — direct call
  // -------------------------------------------------------------------------

  it('collectUnreferencedInTable works standalone', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(2, EMPTY_SOURCE)]) },
    ]);

    const mockSchema = makeMockCfgSchema([monsterSchema]);
    const cfgValue = makeCfgValue(mockSchema, [monsterTable]);
    linkForeignKeys(cfgValue);

    const graph = new TableSchemaRefGraph(mockSchema);
    const result = UnreferencedRecordCollector.collectUnreferencedInTable(cfgValue, monsterTable, graph);
    expect(result.tableName).toBe('monster');
    expect(result.unreferencedRecords).toHaveLength(2); // both unreferenced
  });
});
