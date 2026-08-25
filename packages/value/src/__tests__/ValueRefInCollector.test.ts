/**
 * ValueRefInCollector tests — T4.10
 *
 * Tests incoming reference collection:
 * - hasReference: fast check for existence of references
 * - collect: full collection of all incoming refs
 * - No references found → empty result / false
 * - Record doesn't exist → null/empty
 * - Multiple refIn tables
 * - FList / FMap foreign key types
 * - RefPrimary / RefUniq / RefList refKey types
 */

import { describe, it, expect } from 'vitest';
import {
  VString,
  VInt,
  VStruct,
  VList,
  VMap,
  VTable,
  CfgValue,
  CfgValueStat,
  type Value,
  type SimpleValue,
} from '../CfgValue';
import { ValueRefInCollector } from '../ValueRefInCollector';
import { RefId } from '../ValueRefCollector';
import { DCellList, DFile, DCell } from '@cfggen/data';
import type { Source } from '@cfggen/data';
import { TableSchemaRefGraph } from '@cfggen/schema';
import {
  TableSchema,
  KeySchema,
  FieldSchema,
  ForeignKeySchema,
  Metadata,
  Metadata_of,
  Primitive,
  AutoOrPack,
  ENo,
  EEntry,
  EEnum,
  FList,
  FMap,
  StructRef,
  RefPrimary,
  RefUniq,
  RefList,
  type Structural,
} from '@cfggen/schema';

// ---------------------------------------------------------------------------
// Helpers (copied from RefValidator.test.ts pattern)
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
  foreignKeys: ForeignKeySchema[] = [],
  uniqueKeys: KeySchema[] = [],
  entry: any = ENo.NO,
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
    Metadata_of(),
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

function makeVTableWithUniq(
  schema: TableSchema,
  records: Array<{ pk: Value; vStruct: VStruct }>,
  uniqKeyNames: string[],
  uniqRecords: Array<{ uniqKey: Value; vStruct: VStruct }>,
): VTable {
  const valueList: VStruct[] = [];
  const primaryKeyMap = new Map<Value, VStruct>();
  for (const r of records) {
    valueList.push(r.vStruct);
    primaryKeyMap.set(r.pk, r.vStruct);
  }
  const uniqueKeyMaps = new Map<string[], Map<Value, VStruct>>();
  const uniqMap = new Map<Value, VStruct>();
  for (const r of uniqRecords) {
    uniqMap.set(r.uniqKey, r.vStruct);
  }
  uniqueKeyMaps.set(uniqKeyNames, uniqMap);
  return new VTable(schema, valueList, primaryKeyMap, uniqueKeyMaps);
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

/** Build a mock CfgSchema with tableMap for TableSchemaRefGraph. */
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

describe('ValueRefInCollector', () => {

  // -------------------------------------------------------------------------
  // hasReference — basic positive case
  // -------------------------------------------------------------------------

  it('hasReference returns true when a record is referenced', () => {
    // monster table: id=1 exists
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

    // drop table: references monster.id
    const dropIdField = makeFieldSchema('id', Primitive.INT);
    const monsterIdField = makeFieldSchema('monsterId', Primitive.INT);
    const dropFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(false), [monsterIdField]);
    const dropSchema = makeTableSchema('drop', [dropIdField, monsterIdField], new KeySchema(['id']), [dropFk]);

    const dropStruct = makeVStruct(dropSchema, [
      new VInt(100, EMPTY_SOURCE),
      new VInt(1, EMPTY_SOURCE), // references monster id=1
    ]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: dropStruct },
    ]);

    const mockSchema = makeMockCfgSchema([monsterSchema, dropSchema]);
    const cfgValue = makeCfgValue(mockSchema, [monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const graph = new TableSchemaRefGraph(mockSchema);
    const collector = new ValueRefInCollector(graph, cfgValue);

    expect(collector.hasReference(monsterTable, new VInt(1, EMPTY_SOURCE))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // hasReference — negative case
  // -------------------------------------------------------------------------

  it('hasReference returns false when no record references the target', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(2, EMPTY_SOURCE)]) },
    ]);

    const dropIdField = makeFieldSchema('id', Primitive.INT);
    const monsterIdField = makeFieldSchema('monsterId', Primitive.INT);
    const dropFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(false), [monsterIdField]);
    const dropSchema = makeTableSchema('drop', [dropIdField, monsterIdField], new KeySchema(['id']), [dropFk]);

    const dropStruct = makeVStruct(dropSchema, [
      new VInt(100, EMPTY_SOURCE),
      new VInt(1, EMPTY_SOURCE), // only references monster id=1
    ]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: dropStruct },
    ]);

    const mockSchema = makeMockCfgSchema([monsterSchema, dropSchema]);
    const cfgValue = makeCfgValue(mockSchema, [monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const graph = new TableSchemaRefGraph(mockSchema);
    const collector = new ValueRefInCollector(graph, cfgValue);

    // monster id=2 is not referenced by any drop record
    expect(collector.hasReference(monsterTable, new VInt(2, EMPTY_SOURCE))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // hasReference — record doesn't exist
  // -------------------------------------------------------------------------

  it('hasReference returns false when the target record does not exist', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
    ]);

    const dropIdField = makeFieldSchema('id', Primitive.INT);
    const monsterIdField = makeFieldSchema('monsterId', Primitive.INT);
    const dropFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(false), [monsterIdField]);
    const dropSchema = makeTableSchema('drop', [dropIdField, monsterIdField], new KeySchema(['id']), [dropFk]);
    const dropTable = makeVTable(dropSchema, []);

    const mockSchema = makeMockCfgSchema([monsterSchema, dropSchema]);
    const cfgValue = makeCfgValue(mockSchema, [monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const graph = new TableSchemaRefGraph(mockSchema);
    const collector = new ValueRefInCollector(graph, cfgValue);

    // monster id=999 does not exist
    expect(collector.hasReference(monsterTable, new VInt(999, EMPTY_SOURCE))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // collect — returns full reference info
  // -------------------------------------------------------------------------

  it('collect returns all incoming references', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
    ]);

    // Two drop records both referencing monster id=1
    const dropIdField = makeFieldSchema('id', Primitive.INT);
    const monsterIdField = makeFieldSchema('monsterId', Primitive.INT);
    const dropFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(false), [monsterIdField]);
    const dropSchema = makeTableSchema('drop', [dropIdField, monsterIdField], new KeySchema(['id']), [dropFk]);

    const drop1 = makeVStruct(dropSchema, [new VInt(100, EMPTY_SOURCE), new VInt(1, EMPTY_SOURCE)]);
    const drop2 = makeVStruct(dropSchema, [new VInt(200, EMPTY_SOURCE), new VInt(1, EMPTY_SOURCE)]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: drop1 },
      { pk: new VInt(200, EMPTY_SOURCE), vStruct: drop2 },
    ]);

    const mockSchema = makeMockCfgSchema([monsterSchema, dropSchema]);
    const cfgValue = makeCfgValue(mockSchema, [monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const graph = new TableSchemaRefGraph(mockSchema);
    const collector = new ValueRefInCollector(graph, cfgValue);

    const refs = collector.collect(monsterTable, new VInt(1, EMPTY_SOURCE));
    expect(refs.size).toBe(2);
  });

  // -------------------------------------------------------------------------
  // collect — no references → empty map
  // -------------------------------------------------------------------------

  it('collect returns empty map when no references exist', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(2, EMPTY_SOURCE)]) },
    ]);

    const dropIdField = makeFieldSchema('id', Primitive.INT);
    const monsterIdField = makeFieldSchema('monsterId', Primitive.INT);
    const dropFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(false), [monsterIdField]);
    const dropSchema = makeTableSchema('drop', [dropIdField, monsterIdField], new KeySchema(['id']), [dropFk]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: makeVStruct(dropSchema, [new VInt(100, EMPTY_SOURCE), new VInt(1, EMPTY_SOURCE)]) },
    ]);

    const mockSchema = makeMockCfgSchema([monsterSchema, dropSchema]);
    const cfgValue = makeCfgValue(mockSchema, [monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const graph = new TableSchemaRefGraph(mockSchema);
    const collector = new ValueRefInCollector(graph, cfgValue);

    const refs = collector.collect(monsterTable, new VInt(2, EMPTY_SOURCE));
    expect(refs.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // FList foreign key — reference via list field
  // -------------------------------------------------------------------------

  it('hasReference works with FList foreign key', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(2, EMPTY_SOURCE)]) },
    ]);

    const dropIdField = makeFieldSchema('id', Primitive.INT);
    const monsterIdsField = makeFieldSchema('monsterIds', new FList(Primitive.INT));
    const dropFk = makeForeignKey('monsterIds', ['monsterIds'], 'monster', new RefPrimary(false), [monsterIdsField]);
    const dropSchema = makeTableSchema('drop', [dropIdField, monsterIdsField], new KeySchema(['id']), [dropFk]);

    const listItems: SimpleValue[] = [new VInt(1, EMPTY_SOURCE), new VInt(2, EMPTY_SOURCE)];
    const vList = new VList(listItems, EMPTY_SOURCE);
    const dropStruct = makeVStruct(dropSchema, [new VInt(100, EMPTY_SOURCE), vList]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: dropStruct },
    ]);

    const mockSchema = makeMockCfgSchema([monsterSchema, dropSchema]);
    const cfgValue = makeCfgValue(mockSchema, [monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const graph = new TableSchemaRefGraph(mockSchema);
    const collector = new ValueRefInCollector(graph, cfgValue);

    expect(collector.hasReference(monsterTable, new VInt(1, EMPTY_SOURCE))).toBe(true);
    expect(collector.hasReference(monsterTable, new VInt(2, EMPTY_SOURCE))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // FMap foreign key — reference via map values
  // -------------------------------------------------------------------------

  it('hasReference works with FMap foreign key', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(2, EMPTY_SOURCE)]) },
    ]);

    const dropIdField = makeFieldSchema('id', Primitive.INT);
    const monsterMapField = makeFieldSchema('monsterMap', new FMap(Primitive.INT, Primitive.INT));
    const dropFk = makeForeignKey('monsterMap', ['monsterMap'], 'monster', new RefPrimary(false), [monsterMapField]);
    const dropSchema = makeTableSchema('drop', [dropIdField, monsterMapField], new KeySchema(['id']), [dropFk]);

    const vMap = new VMap(new Map<SimpleValue, SimpleValue>([
      [new VInt(10, EMPTY_SOURCE), new VInt(1, EMPTY_SOURCE)],
      [new VInt(20, EMPTY_SOURCE), new VInt(2, EMPTY_SOURCE)],
    ]), EMPTY_SOURCE);
    const dropStruct = makeVStruct(dropSchema, [new VInt(100, EMPTY_SOURCE), vMap]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: dropStruct },
    ]);

    const mockSchema = makeMockCfgSchema([monsterSchema, dropSchema]);
    const cfgValue = makeCfgValue(mockSchema, [monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const graph = new TableSchemaRefGraph(mockSchema);
    const collector = new ValueRefInCollector(graph, cfgValue);

    expect(collector.hasReference(monsterTable, new VInt(1, EMPTY_SOURCE))).toBe(true);
    expect(collector.hasReference(monsterTable, new VInt(2, EMPTY_SOURCE))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // RefUniq — reference via unique key
  // -------------------------------------------------------------------------

  it('hasReference works with RefUniq key', () => {
    const itemFields = [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('code', Primitive.STRING),
    ];
    const uniqKey = new KeySchema(['code']);
    const itemSchema = makeTableSchema('item', itemFields, new KeySchema(['id']), [], [uniqKey]);
    const itemStruct = makeVStruct(itemSchema, [
      new VInt(1, EMPTY_SOURCE),
      new VString('sword', EMPTY_SOURCE),
    ]);
    const itemTable = makeVTableWithUniq(
      itemSchema,
      [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: itemStruct }],
      ['code'],
      [{ uniqKey: new VString('sword', EMPTY_SOURCE), vStruct: itemStruct }],
    );

    const dropIdField = makeFieldSchema('id', Primitive.INT);
    const codeField = makeFieldSchema('itemCode', Primitive.STRING);
    const refUniqKey = new KeySchema(['code']);
    const dropFk = new ForeignKeySchema(
      'itemCode',
      new KeySchema(['itemCode']),
      'item',
      new RefUniq(refUniqKey, false),
      Metadata_of(),
    );
    dropFk.key.setFieldSchemas([codeField]);
    const dropSchema = makeTableSchema('drop', [dropIdField, codeField], new KeySchema(['id']), [dropFk]);

    const dropStruct = makeVStruct(dropSchema, [
      new VInt(100, EMPTY_SOURCE),
      new VString('sword', EMPTY_SOURCE),
    ]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: dropStruct },
    ]);

    const mockSchema = makeMockCfgSchema([itemSchema, dropSchema]);
    const cfgValue = makeCfgValue(mockSchema, [itemTable, dropTable]);
    linkForeignKeys(cfgValue);

    const graph = new TableSchemaRefGraph(mockSchema);
    const collector = new ValueRefInCollector(graph, cfgValue);

    // item with id=1 (code='sword') is referenced
    expect(collector.hasReference(itemTable, new VInt(1, EMPTY_SOURCE))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // No refIn tables → hasReference returns false
  // -------------------------------------------------------------------------

  it('hasReference returns false when no tables reference the target table', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
    ]);

    const mockSchema = makeMockCfgSchema([monsterSchema]);
    const cfgValue = makeCfgValue(mockSchema, [monsterTable]);
    linkForeignKeys(cfgValue);

    const graph = new TableSchemaRefGraph(mockSchema);
    const collector = new ValueRefInCollector(graph, cfgValue);

    expect(collector.hasReference(monsterTable, new VInt(1, EMPTY_SOURCE))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // collectTo — collects into external map
  // -------------------------------------------------------------------------

  it('collectTo adds references to an external map', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
    ]);

    const dropIdField = makeFieldSchema('id', Primitive.INT);
    const monsterIdField = makeFieldSchema('monsterId', Primitive.INT);
    const dropFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(false), [monsterIdField]);
    const dropSchema = makeTableSchema('drop', [dropIdField, monsterIdField], new KeySchema(['id']), [dropFk]);

    const drop1 = makeVStruct(dropSchema, [new VInt(100, EMPTY_SOURCE), new VInt(1, EMPTY_SOURCE)]);
    const drop2 = makeVStruct(dropSchema, [new VInt(200, EMPTY_SOURCE), new VInt(1, EMPTY_SOURCE)]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: drop1 },
      { pk: new VInt(200, EMPTY_SOURCE), vStruct: drop2 },
    ]);

    const mockSchema = makeMockCfgSchema([monsterSchema, dropSchema]);
    const cfgValue = makeCfgValue(mockSchema, [monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const graph = new TableSchemaRefGraph(mockSchema);
    const collector = new ValueRefInCollector(graph, cfgValue);

    const externalMap = new Map();
    collector.collectTo(monsterTable, new VInt(1, EMPTY_SOURCE), externalMap);
    expect(externalMap.size).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Multiple refIn tables — searches all of them
  // -------------------------------------------------------------------------

  it('searches multiple refIn tables', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
    ]);

    // drop table references monster
    const dropIdField = makeFieldSchema('id', Primitive.INT);
    const dropMonsterIdField = makeFieldSchema('monsterId', Primitive.INT);
    const dropFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(false), [dropMonsterIdField]);
    const dropSchema = makeTableSchema('drop', [dropIdField, dropMonsterIdField], new KeySchema(['id']), [dropFk]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: makeVStruct(dropSchema, [new VInt(100, EMPTY_SOURCE), new VInt(1, EMPTY_SOURCE)]) },
    ]);

    // quest table also references monster
    const questIdField = makeFieldSchema('id', Primitive.INT);
    const questMonsterIdField = makeFieldSchema('targetId', Primitive.INT);
    const questFk = makeForeignKey('targetId', ['targetId'], 'monster', new RefPrimary(false), [questMonsterIdField]);
    const questSchema = makeTableSchema('quest', [questIdField, questMonsterIdField], new KeySchema(['id']), [questFk]);
    const questTable = makeVTable(questSchema, [
      { pk: new VInt(500, EMPTY_SOURCE), vStruct: makeVStruct(questSchema, [new VInt(500, EMPTY_SOURCE), new VInt(1, EMPTY_SOURCE)]) },
    ]);

    const mockSchema = makeMockCfgSchema([monsterSchema, dropSchema, questSchema]);
    const cfgValue = makeCfgValue(mockSchema, [monsterTable, dropTable, questTable]);
    linkForeignKeys(cfgValue);

    const graph = new TableSchemaRefGraph(mockSchema);
    const collector = new ValueRefInCollector(graph, cfgValue);

    const refs = collector.collect(monsterTable, new VInt(1, EMPTY_SOURCE));
    expect(refs.size).toBe(2); // one from drop, one from quest
  });
});
