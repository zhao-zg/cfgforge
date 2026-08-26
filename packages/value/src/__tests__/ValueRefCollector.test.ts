/**
 * ValueRefCollector tests — T4.8
 *
 * Tests foreign key reference collection:
 * - collectStructRef with RefPrimary SimpleType field
 * - collectStructRef with RefPrimary FList field
 * - collectStructRef with RefPrimary FMap field
 * - collectStructRef with RefUniq
 * - collect() recursive traversal of nested VStruct/VInterface/VList/VMap
 * - refTitle meta override
 * - collectRefs static convenience method
 * - No FK: no refs collected
 * - Foreign table not found: no refs collected
 */

import { describe, it, expect } from 'vitest';
import {
  VString,
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
} from '../CfgValue';
import {
  ValueRefCollector,
  type RefId,
  type FieldRef,
} from '../ValueRefCollector';
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
  RefUniq,
  InterfaceSchema,
  metaStr,
  type Structural,
} from '@cfgforge/schema';

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
    ENo.NO,
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
  meta: Metadata = Metadata_of(),
): ForeignKeySchema {
  const fkKey = new KeySchema(keyFields);
  fkKey.setFieldSchemas(localFields);
  return new ForeignKeySchema(name, fkKey, refTable, refKey, meta);
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

describe('ValueRefCollector', () => {

  // -------------------------------------------------------------------------
  // collectStructRef — RefPrimary SimpleType
  // -------------------------------------------------------------------------

  it('collectStructRef collects RefPrimary SimpleType reference', () => {
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
    const fieldRefs: FieldRef[] = [];
    ValueRefCollector.collectStructRef(cfgValue, dropStruct, refIdToRecordMap, fieldRefs, '');

    expect(fieldRefs).toHaveLength(1);
    expect(fieldRefs[0].firstField).toBe('monsterId');
    expect(fieldRefs[0].toTable).toBe('monster');
    expect(fieldRefs[0].toId).toBe('1');
    expect(refIdToRecordMap.size).toBe(1);
    const refId = [...refIdToRecordMap.keys()][0];
    expect(refId.table).toBe('monster');
    expect(refId.id).toBe('1');
  });

  // -------------------------------------------------------------------------
  // collectStructRef — RefPrimary FList
  // -------------------------------------------------------------------------

  it('collectStructRef collects RefPrimary FList references', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const m1 = makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]);
    const m2 = makeVStruct(monsterSchema, [new VInt(2, EMPTY_SOURCE)]);
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: m1 },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: m2 },
    ]);

    const idField = makeFieldSchema('id', Primitive.INT);
    const monsterIdsField = makeFieldSchema('monsterIds', new FList(Primitive.INT));
    const dropFk = makeForeignKey('monsterIds', ['monsterIds'], 'monster', new RefPrimary(false), [monsterIdsField]);
    const dropSchema = makeTableSchema('drop', [idField, monsterIdsField], new KeySchema(['id']), [dropFk]);

    const listItems: SimpleValue[] = [
      new VInt(1, EMPTY_SOURCE),
      new VInt(2, EMPTY_SOURCE),
    ];
    const vList = new VList(listItems, EMPTY_SOURCE);
    const dropStruct = makeVStruct(dropSchema, [
      new VInt(100, EMPTY_SOURCE),
      vList,
    ]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: dropStruct },
    ]);

    const cfgValue = makeCfgValue([monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const refIdToRecordMap = new Map<RefId, VStruct>();
    const fieldRefs: FieldRef[] = [];
    ValueRefCollector.collectStructRef(cfgValue, dropStruct, refIdToRecordMap, fieldRefs, '');

    expect(fieldRefs).toHaveLength(2);
    expect(fieldRefs[0].toId).toBe('1');
    expect(fieldRefs[1].toId).toBe('2');
    expect(refIdToRecordMap.size).toBe(2);
  });

  // -------------------------------------------------------------------------
  // collectStructRef — RefPrimary FMap
  // -------------------------------------------------------------------------

  it('collectStructRef collects RefPrimary FMap references (by values)', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const m1 = makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]);
    const m2 = makeVStruct(monsterSchema, [new VInt(2, EMPTY_SOURCE)]);
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: m1 },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: m2 },
    ]);

    const idField = makeFieldSchema('id', Primitive.INT);
    const monsterMapField = makeFieldSchema('monsterMap', new FMap(Primitive.INT, Primitive.INT));
    const dropFk = makeForeignKey('monsterMap', ['monsterMap'], 'monster', new RefPrimary(false), [monsterMapField]);
    const dropSchema = makeTableSchema('drop', [idField, monsterMapField], new KeySchema(['id']), [dropFk]);

    const vMap = new VMap(new Map<SimpleValue, SimpleValue>([
      [new VInt(10, EMPTY_SOURCE), new VInt(1, EMPTY_SOURCE)],
      [new VInt(20, EMPTY_SOURCE), new VInt(2, EMPTY_SOURCE)],
    ]), EMPTY_SOURCE);
    const dropStruct = makeVStruct(dropSchema, [
      new VInt(100, EMPTY_SOURCE),
      vMap,
    ]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: dropStruct },
    ]);

    const cfgValue = makeCfgValue([monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const refIdToRecordMap = new Map<RefId, VStruct>();
    const fieldRefs: FieldRef[] = [];
    ValueRefCollector.collectStructRef(cfgValue, dropStruct, refIdToRecordMap, fieldRefs, '');

    expect(fieldRefs).toHaveLength(2);
    const ids = fieldRefs.map(r => r.toId).sort();
    expect(ids).toEqual(['1', '2']);
  });

  // -------------------------------------------------------------------------
  // collectStructRef — RefUniq
  // -------------------------------------------------------------------------

  it('collectStructRef collects RefUniq reference', () => {
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
    const uniqMap = new Map<Value, VStruct>([
      [new VString('sword', EMPTY_SOURCE), itemStruct],
    ]);
    const uniqueKeyMaps = new Map<string[], Map<Value, VStruct>>();
    uniqueKeyMaps.set(['code'], uniqMap);
    const itemTable = new VTable(
      itemSchema,
      [itemStruct],
      new Map<Value, VStruct>([[new VInt(1, EMPTY_SOURCE), itemStruct]]),
      uniqueKeyMaps,
    );

    const idField = makeFieldSchema('id', Primitive.INT);
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
    const dropSchema = makeTableSchema('drop', [idField, codeField], new KeySchema(['id']), [dropFk]);

    const dropStruct = makeVStruct(dropSchema, [
      new VInt(100, EMPTY_SOURCE),
      new VString('sword', EMPTY_SOURCE),
    ]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: dropStruct },
    ]);

    const cfgValue = makeCfgValue([itemTable, dropTable]);
    linkForeignKeys(cfgValue);

    const refIdToRecordMap = new Map<RefId, VStruct>();
    const fieldRefs: FieldRef[] = [];
    ValueRefCollector.collectStructRef(cfgValue, dropStruct, refIdToRecordMap, fieldRefs, '');

    expect(fieldRefs).toHaveLength(1);
    expect(fieldRefs[0].firstField).toBe('itemCode');
    expect(fieldRefs[0].toTable).toBe('item');
    expect(fieldRefs[0].toId).toBe('sword');
  });

  // -------------------------------------------------------------------------
  // collectStructRef — no FK
  // -------------------------------------------------------------------------

  it('collectStructRef with no foreign keys returns empty', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const monsterStruct = makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]);
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: monsterStruct },
    ]);
    const cfgValue = makeCfgValue([monsterTable]);

    const refIdToRecordMap = new Map<RefId, VStruct>();
    const fieldRefs: FieldRef[] = [];
    ValueRefCollector.collectStructRef(cfgValue, monsterStruct, refIdToRecordMap, fieldRefs, '');

    expect(fieldRefs).toHaveLength(0);
    expect(refIdToRecordMap.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // collectStructRef — ref not found in foreign table
  // -------------------------------------------------------------------------

  it('collectStructRef skips when foreign table not found', () => {
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
    const cfgValue = makeCfgValue([dropTable]);
    // Don't link FKs — foreign table 'monster' not found

    const refIdToRecordMap = new Map<RefId, VStruct>();
    const fieldRefs: FieldRef[] = [];
    ValueRefCollector.collectStructRef(cfgValue, dropStruct, refIdToRecordMap, fieldRefs, '');

    expect(fieldRefs).toHaveLength(0);
    expect(refIdToRecordMap.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // collectStructRef — ref value not in foreign table
  // -------------------------------------------------------------------------

  it('collectStructRef skips when ref value not found in foreign table', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
    ]);

    const idField = makeFieldSchema('id', Primitive.INT);
    const monsterIdField = makeFieldSchema('monsterId', Primitive.INT);
    const dropFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(false), [monsterIdField]);
    const dropSchema = makeTableSchema('drop', [idField, monsterIdField], new KeySchema(['id']), [dropFk]);

    const dropStruct = makeVStruct(dropSchema, [
      new VInt(100, EMPTY_SOURCE),
      new VInt(999, EMPTY_SOURCE), // not in monster table
    ]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: dropStruct },
    ]);

    const cfgValue = makeCfgValue([monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const refIdToRecordMap = new Map<RefId, VStruct>();
    const fieldRefs: FieldRef[] = [];
    ValueRefCollector.collectStructRef(cfgValue, dropStruct, refIdToRecordMap, fieldRefs, '');

    expect(fieldRefs).toHaveLength(0);
    expect(refIdToRecordMap.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // collectStructRef — namePrefix
  // -------------------------------------------------------------------------

  it('collectStructRef uses namePrefix for ref label', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
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
    const fieldRefs: FieldRef[] = [];
    ValueRefCollector.collectStructRef(cfgValue, dropStruct, refIdToRecordMap, fieldRefs, 'sub.');

    expect(fieldRefs).toHaveLength(1);
    expect(fieldRefs[0].label).toBe('sub.refMonsterId');
  });

  // -------------------------------------------------------------------------
  // collectStructRef — nullable ref produces 'nullableRef' label
  // -------------------------------------------------------------------------

  it('collectStructRef uses nullableRef label for nullable RefPrimary', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
    ]);

    const idField = makeFieldSchema('id', Primitive.INT);
    const monsterIdField = makeFieldSchema('monsterId', Primitive.INT);
    const dropFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(true), [monsterIdField]);
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
    const fieldRefs: FieldRef[] = [];
    ValueRefCollector.collectStructRef(cfgValue, dropStruct, refIdToRecordMap, fieldRefs, '');

    expect(fieldRefs).toHaveLength(1);
    expect(fieldRefs[0].label).toBe('nullableRefMonsterId');
  });

  // -------------------------------------------------------------------------
  // collectStructRef — refTitle meta override
  // -------------------------------------------------------------------------

  it('collectStructRef uses refTitle meta for custom ref name', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('name', Primitive.STRING),
    ], new KeySchema(['id']));
    const monsterStruct = makeVStruct(monsterSchema, [
      new VInt(1, EMPTY_SOURCE),
      new VString('Dragon', EMPTY_SOURCE),
    ]);
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: monsterStruct },
    ]);

    const idField = makeFieldSchema('id', Primitive.INT);
    const monsterIdField = makeFieldSchema('monsterId', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    // FK with refTitle meta pointing to 'name' field
    const fkMeta = Metadata_of();
    fkMeta.data().set('refTitle', metaStr('name'));
    const dropFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(false), [monsterIdField], fkMeta);
    const dropSchema = makeTableSchema('drop', [idField, monsterIdField, nameField], new KeySchema(['id']), [dropFk]);

    const dropStruct = makeVStruct(dropSchema, [
      new VInt(100, EMPTY_SOURCE),
      new VInt(1, EMPTY_SOURCE),
      new VString('Dragon', EMPTY_SOURCE),
    ]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: dropStruct },
    ]);

    const cfgValue = makeCfgValue([monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const refIdToRecordMap = new Map<RefId, VStruct>();
    const fieldRefs: FieldRef[] = [];
    ValueRefCollector.collectStructRef(cfgValue, dropStruct, refIdToRecordMap, fieldRefs, '');

    expect(fieldRefs).toHaveLength(1);
    expect(fieldRefs[0].label).toBe('Dragon');
  });

  // -------------------------------------------------------------------------
  // collect() — recursive traversal
  // -------------------------------------------------------------------------

  it('collect() traverses nested VStruct fields', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
    ]);

    // Inner struct with FK
    const innerIdField = makeFieldSchema('innerId', Primitive.INT);
    const monsterRefField = makeFieldSchema('monsterId', Primitive.INT);
    const innerFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(false), [monsterRefField]);
    const innerSchema = makeTableSchema('innerstruct', [innerIdField, monsterRefField], new KeySchema(['innerId']), [innerFk]);

    const innerStruct = makeVStruct(innerSchema, [
      new VInt(1, EMPTY_SOURCE),
      new VInt(1, EMPTY_SOURCE),
    ]);

    // Outer struct containing innerStruct as a field
    const outerIdField = makeFieldSchema('id', Primitive.INT);
    const outerStructField = makeFieldSchema('inner', new StructRef('innerstruct'));
    const outerSchema = makeTableSchema('outer', [outerIdField, outerStructField], new KeySchema(['id']));
    // Need to set StructRef.obj
    (outerStructField.type as StructRef).obj = innerSchema;

    const outerStruct = makeVStruct(outerSchema, [
      new VInt(100, EMPTY_SOURCE),
      innerStruct,
    ]);

    const outerTable = makeVTable(outerSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: outerStruct },
    ]);

    const cfgValue = makeCfgValue([monsterTable, outerTable]);
    linkForeignKeys(cfgValue);

    const refIdToRecordMap = new Map<RefId, VStruct>();
    const fieldRefs: FieldRef[] = [];
    const collector = new ValueRefCollector(cfgValue, refIdToRecordMap, fieldRefs);
    collector.collect(outerStruct, []);

    expect(fieldRefs).toHaveLength(1);
    expect(fieldRefs[0].firstField).toBe('monsterId');
    expect(fieldRefs[0].toId).toBe('1');
  });

  // -------------------------------------------------------------------------
  // collect() — VInterface delegates to child VStruct
  // -------------------------------------------------------------------------

  it('collect() traverses VInterface via child VStruct', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
    ]);

    // Create a StructSchema impl with FK
    const circleIdField = makeFieldSchema('id', Primitive.INT);
    const circleMonsterIdField = makeFieldSchema('monsterId', Primitive.INT);
    const circleFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(false), [circleMonsterIdField]);
    const circleStruct = new StructSchema('IShape.Circle', AutoOrPack.AUTO, Metadata_of(), [circleIdField, circleMonsterIdField], [circleFk]);
    // Set keyIndices for the FK
    circleFk.setKeyIndices([1]);

    // Create interface schema with circleStruct as impl
    const iface = new InterfaceSchema(
      'IShape',
      '',
      'Circle',
      AutoOrPack.AUTO,
      Metadata_of(),
      [circleStruct],
    );

    const childStruct = makeVStruct(circleStruct, [
      new VInt(1, EMPTY_SOURCE),
      new VInt(1, EMPTY_SOURCE),
    ]);
    const vInterface = new VInterface(iface, childStruct, EMPTY_SOURCE);

    // Wrap in outer struct
    const outerIdField = makeFieldSchema('id', Primitive.INT);
    const outerShapeField = makeFieldSchema('shape', new StructRef('IShape'));
    const outerSchema = makeTableSchema('outer', [outerIdField, outerShapeField], new KeySchema(['id']));
    (outerShapeField.type as StructRef).obj = iface;

    const outerStruct = makeVStruct(outerSchema, [
      new VInt(100, EMPTY_SOURCE),
      vInterface,
    ]);
    const outerTable = makeVTable(outerSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: outerStruct },
    ]);

    const cfgValue = makeCfgValue([monsterTable, outerTable]);
    linkForeignKeys(cfgValue);

    const refIdToRecordMap = new Map<RefId, VStruct>();
    const fieldRefs: FieldRef[] = [];
    const collector = new ValueRefCollector(cfgValue, refIdToRecordMap, fieldRefs);
    collector.collect(outerStruct, []);

    expect(fieldRefs).toHaveLength(1);
    expect(fieldRefs[0].toId).toBe('1');
  });

  // -------------------------------------------------------------------------
  // collect() — VList traversal
  // -------------------------------------------------------------------------

  it('collect() traverses VList elements', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(2, EMPTY_SOURCE)]) },
    ]);

    // Inner struct with FK, used as list element
    const innerIdField = makeFieldSchema('innerId', Primitive.INT);
    const monsterRefField = makeFieldSchema('monsterId', Primitive.INT);
    const innerFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(false), [monsterRefField]);
    const innerSchema = makeTableSchema('innerstruct', [innerIdField, monsterRefField], new KeySchema(['innerId']), [innerFk]);

    const s1 = makeVStruct(innerSchema, [new VInt(1, EMPTY_SOURCE), new VInt(1, EMPTY_SOURCE)]);
    const s2 = makeVStruct(innerSchema, [new VInt(2, EMPTY_SOURCE), new VInt(2, EMPTY_SOURCE)]);
    const vList = new VList([s1, s2], EMPTY_SOURCE);

    // Outer struct containing list
    const outerIdField = makeFieldSchema('id', Primitive.INT);
    const outerListField = makeFieldSchema('items', new FList(new StructRef('innerstruct')));
    const outerSchema = makeTableSchema('outer', [outerIdField, outerListField], new KeySchema(['id']));
    (outerListField.type as FList).item.obj = innerSchema;

    const outerStruct = makeVStruct(outerSchema, [
      new VInt(100, EMPTY_SOURCE),
      vList,
    ]);
    const outerTable = makeVTable(outerSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: outerStruct },
    ]);

    const cfgValue = makeCfgValue([monsterTable, outerTable]);
    linkForeignKeys(cfgValue);

    const refIdToRecordMap = new Map<RefId, VStruct>();
    const fieldRefs: FieldRef[] = [];
    const collector = new ValueRefCollector(cfgValue, refIdToRecordMap, fieldRefs);
    collector.collect(outerStruct, []);

    expect(fieldRefs).toHaveLength(2);
    expect(fieldRefs[0].toId).toBe('1');
    expect(fieldRefs[1].toId).toBe('2');
  });

  // -------------------------------------------------------------------------
  // collect() — VMap traversal
  // -------------------------------------------------------------------------

  it('collect() traverses VMap keys and values', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(2, EMPTY_SOURCE)]) },
    ]);

    // Inner struct with FK
    const innerIdField = makeFieldSchema('innerId', Primitive.INT);
    const monsterRefField = makeFieldSchema('monsterId', Primitive.INT);
    const innerFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(false), [monsterRefField]);
    const innerSchema = makeTableSchema('innerstruct', [innerIdField, monsterRefField], new KeySchema(['innerId']), [innerFk]);

    const s1 = makeVStruct(innerSchema, [new VInt(1, EMPTY_SOURCE), new VInt(1, EMPTY_SOURCE)]);
    const s2 = makeVStruct(innerSchema, [new VInt(2, EMPTY_SOURCE), new VInt(2, EMPTY_SOURCE)]);
    const vMap = new VMap(new Map<SimpleValue, SimpleValue>([
      [new VInt(10, EMPTY_SOURCE), s1],
      [new VInt(20, EMPTY_SOURCE), s2],
    ]), EMPTY_SOURCE);

    // Outer struct containing map
    const outerIdField = makeFieldSchema('id', Primitive.INT);
    const outerMapField = makeFieldSchema('items', new FMap(Primitive.INT, new StructRef('innerstruct')));
    const outerSchema = makeTableSchema('outer', [outerIdField, outerMapField], new KeySchema(['id']));
    (outerMapField.type as FMap).value.obj = innerSchema;

    const outerStruct = makeVStruct(outerSchema, [
      new VInt(100, EMPTY_SOURCE),
      vMap,
    ]);
    const outerTable = makeVTable(outerSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: outerStruct },
    ]);

    const cfgValue = makeCfgValue([monsterTable, outerTable]);
    linkForeignKeys(cfgValue);

    const refIdToRecordMap = new Map<RefId, VStruct>();
    const fieldRefs: FieldRef[] = [];
    const collector = new ValueRefCollector(cfgValue, refIdToRecordMap, fieldRefs);
    collector.collect(outerStruct, []);

    expect(fieldRefs).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // collect() — primitive values are no-ops
  // -------------------------------------------------------------------------

  it('collect() on primitive values is a no-op', () => {
    const cfgValue = makeCfgValue([]);
    const refIdToRecordMap = new Map<RefId, VStruct>();
    const fieldRefs: FieldRef[] = [];
    const collector = new ValueRefCollector(cfgValue, refIdToRecordMap, fieldRefs);

    collector.collect(new VInt(42, EMPTY_SOURCE), []);
    collector.collect(new VString('hello', EMPTY_SOURCE), []);
    collector.collect(new VBool(true, EMPTY_SOURCE), []);

    expect(fieldRefs).toHaveLength(0);
    expect(refIdToRecordMap.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // collectRefs — static convenience
  // -------------------------------------------------------------------------

  it('collectRefs static method returns field refs', () => {
    const monsterSchema = makeTableSchema('monster', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
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

    const refs = ValueRefCollector.collectRefs(dropStruct, cfgValue);
    expect(refs).toHaveLength(1);
    expect(refs[0].toTable).toBe('monster');
    expect(refs[0].toId).toBe('1');
  });
});
