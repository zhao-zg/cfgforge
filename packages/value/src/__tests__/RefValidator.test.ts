/**
 * RefValidator tests — T4.5b
 *
 * Tests foreign key reference validation:
 * - Valid reference: no errors
 * - Invalid reference: ForeignValueNotFound error
 * - Nullable ref with empty cell: no error
 * - Non-nullable ref with empty cell: RefNotNullableButCellEmpty error
 * - FList ref: check each element
 * - FMap ref: check each value
 * - RefPrimary (primary key lookup)
 * - RefUniq (unique key lookup)
 * - Nullable ref with value 0: no error (special case)
 * - Nullable ref that is part of PK: no error (special case)
 * - Multiple errors collected
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
import { CfgValueErrs } from '../CfgValueErrs';
import { RefValidator } from '../RefValidator';
import { DCellList, DFile, DCell } from '@cfgforge/data';
import type { Source } from '@cfgforge/data';
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
  FList,
  FMap,
  StructRef,
  RefPrimary,
  RefUniq,
  type Structural,
} from '@cfgforge/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_SOURCE: Source = DCellList.of();
const FILE_SOURCE: Source = DFile.of('<server>', 'test');

/** Create a DCell source with a non-empty value (cell has value). */
function cellSource(content: string): DCell {
  return DCell.of(content, 'test.xlsx');
}

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

describe('RefValidator', () => {

  // -------------------------------------------------------------------------
  // Valid reference — no errors
  // -------------------------------------------------------------------------

  it('valid primary key reference produces no errors', () => {
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
      new VInt(100, cellSource('100')),
      new VInt(1, cellSource('1')),
    ]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: dropStruct },
    ]);

    const cfgValue = makeCfgValue([monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const errs = CfgValueErrs.of();
    new RefValidator(cfgValue, errs).validate();
    expect(errs.errs).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Invalid reference — ForeignValueNotFound
  // -------------------------------------------------------------------------

  it('invalid primary key reference produces ForeignValueNotFound', () => {
    const monsterSchema = makeTableSchema('monster', [makeFieldSchema('id', Primitive.INT)], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
    ]);

    const idField = makeFieldSchema('id', Primitive.INT);
    const monsterIdField = makeFieldSchema('monsterId', Primitive.INT);
    const dropFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(false), [monsterIdField]);
    const dropSchema = makeTableSchema('drop', [idField, monsterIdField], new KeySchema(['id']), [dropFk]);

    const dropStruct = makeVStruct(dropSchema, [
      new VInt(100, cellSource('100')),
      new VInt(999, cellSource('999')),
    ]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: dropStruct },
    ]);

    const cfgValue = makeCfgValue([monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const errs = CfgValueErrs.of();
    new RefValidator(cfgValue, errs).validate();

    expect(errs.errs).toHaveLength(1);
    expect(errs.errs[0]._tag).toBe('ForeignValueNotFound');
  });

  // -------------------------------------------------------------------------
  // Nullable ref with empty cell — no error
  // -------------------------------------------------------------------------

  it('nullable ref with empty cell produces no error', () => {
    const emptyCell = new DCell('', 'test.xlsx', 0, 0);

    const monsterSchema = makeTableSchema('monster', [makeFieldSchema('id', Primitive.INT)], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
    ]);

    const idField = makeFieldSchema('id', Primitive.INT);
    const monsterIdField = makeFieldSchema('monsterId', Primitive.INT);
    const dropFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(true), [monsterIdField]);
    const dropSchema = makeTableSchema('drop', [idField, monsterIdField], new KeySchema(['id']), [dropFk]);

    const dropStruct = makeVStruct(dropSchema, [
      new VInt(100, EMPTY_SOURCE),
      new VInt(0, emptyCell),
    ]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: dropStruct },
    ]);

    const cfgValue = makeCfgValue([monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const errs = CfgValueErrs.of();
    new RefValidator(cfgValue, errs).validate();
    expect(errs.errs).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Non-nullable ref with empty cell — RefNotNullableButCellEmpty
  // -------------------------------------------------------------------------

  it('non-nullable ref with empty cell produces RefNotNullableButCellEmpty', () => {
    const emptyCell = new DCell('', 'test.xlsx', 0, 0);

    const monsterSchema = makeTableSchema('monster', [makeFieldSchema('id', Primitive.INT)], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
    ]);

    const idField = makeFieldSchema('id', Primitive.INT);
    const monsterIdField = makeFieldSchema('monsterId', Primitive.INT);
    const dropFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(false), [monsterIdField]);
    const dropSchema = makeTableSchema('drop', [idField, monsterIdField], new KeySchema(['id']), [dropFk]);

    const dropStruct = makeVStruct(dropSchema, [
      new VInt(100, EMPTY_SOURCE),
      new VInt(0, emptyCell),
    ]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: dropStruct },
    ]);

    const cfgValue = makeCfgValue([monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const errs = CfgValueErrs.of();
    new RefValidator(cfgValue, errs).validate();

    expect(errs.errs).toHaveLength(1);
    expect(errs.errs[0]._tag).toBe('RefNotNullableButCellEmpty');
  });

  // -------------------------------------------------------------------------
  // Nullable ref with value 0 from non-empty cell — no error (special case)
  // -------------------------------------------------------------------------

  it('nullable ref with value 0 from cell produces no error', () => {
    const monsterSchema = makeTableSchema('monster', [makeFieldSchema('id', Primitive.INT)], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
    ]);

    const idField = makeFieldSchema('id', Primitive.INT);
    const monsterIdField = makeFieldSchema('monsterId', Primitive.INT);
    const dropFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(true), [monsterIdField]);
    const dropSchema = makeTableSchema('drop', [idField, monsterIdField], new KeySchema(['id']), [dropFk]);

    const cellWithZero = new DCell('0', 'test.xlsx', 0, 0);
    const dropStruct = makeVStruct(dropSchema, [
      new VInt(100, EMPTY_SOURCE),
      new VInt(0, cellWithZero),
    ]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: dropStruct },
    ]);

    const cfgValue = makeCfgValue([monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const errs = CfgValueErrs.of();
    new RefValidator(cfgValue, errs).validate();
    expect(errs.errs).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // FList ref — check each element
  // -------------------------------------------------------------------------

  it('FList ref checks each element in foreign table', () => {
    const monsterSchema = makeTableSchema('monster', [makeFieldSchema('id', Primitive.INT)], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(2, EMPTY_SOURCE)]) },
    ]);

    const idField = makeFieldSchema('id', Primitive.INT);
    const monsterIdsField = makeFieldSchema('monsterIds', new FList(Primitive.INT));
    const dropFk = makeForeignKey('monsterIds', ['monsterIds'], 'monster', new RefPrimary(false), [monsterIdsField]);
    const dropSchema = makeTableSchema('drop', [idField, monsterIdsField], new KeySchema(['id']), [dropFk]);

    const listItems: SimpleValue[] = [
      new VInt(1, EMPTY_SOURCE),
      new VInt(999, EMPTY_SOURCE),
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

    const errs = CfgValueErrs.of();
    new RefValidator(cfgValue, errs).validate();

    expect(errs.errs).toHaveLength(1);
    expect(errs.errs[0]._tag).toBe('ForeignValueNotFound');
  });

  // -------------------------------------------------------------------------
  // FMap ref — check each value
  // -------------------------------------------------------------------------

  it('FMap ref checks each value in foreign table', () => {
    const monsterSchema = makeTableSchema('monster', [makeFieldSchema('id', Primitive.INT)], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(2, EMPTY_SOURCE)]) },
    ]);

    const idField = makeFieldSchema('id', Primitive.INT);
    const monsterMapField = makeFieldSchema('monsterMap', new FMap(Primitive.INT, Primitive.INT));
    const dropFk = makeForeignKey('monsterMap', ['monsterMap'], 'monster', new RefPrimary(false), [monsterMapField]);
    const dropSchema = makeTableSchema('drop', [idField, monsterMapField], new KeySchema(['id']), [dropFk]);

    const vMap = new VMap(new Map<SimpleValue, SimpleValue>([
      [new VInt(10, EMPTY_SOURCE), new VInt(1, EMPTY_SOURCE)],
      [new VInt(20, EMPTY_SOURCE), new VInt(999, EMPTY_SOURCE)],
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

    const errs = CfgValueErrs.of();
    new RefValidator(cfgValue, errs).validate();

    expect(errs.errs).toHaveLength(1);
    expect(errs.errs[0]._tag).toBe('ForeignValueNotFound');
  });

  // -------------------------------------------------------------------------
  // RefUniq — unique key lookup
  // -------------------------------------------------------------------------

  it('valid unique key reference produces no errors', () => {
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
      new VInt(100, cellSource('100')),
      new VString('sword', cellSource('sword')),
    ]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: dropStruct },
    ]);

    const cfgValue = makeCfgValue([itemTable, dropTable]);
    linkForeignKeys(cfgValue);

    const errs = CfgValueErrs.of();
    new RefValidator(cfgValue, errs).validate();
    expect(errs.errs).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Multiple errors collected
  // -------------------------------------------------------------------------

  it('collects multiple ForeignValueNotFound errors', () => {
    const monsterSchema = makeTableSchema('monster', [makeFieldSchema('id', Primitive.INT)], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
    ]);

    const idField = makeFieldSchema('id', Primitive.INT);
    const monsterIdField = makeFieldSchema('monsterId', Primitive.INT);
    const dropFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(false), [monsterIdField]);
    const dropSchema = makeTableSchema('drop', [idField, monsterIdField], new KeySchema(['id']), [dropFk]);

    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: makeVStruct(dropSchema, [new VInt(100, cellSource('100')), new VInt(999, cellSource('999'))]) },
      { pk: new VInt(200, EMPTY_SOURCE), vStruct: makeVStruct(dropSchema, [new VInt(200, cellSource('200')), new VInt(888, cellSource('888'))]) },
    ]);

    const cfgValue = makeCfgValue([monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const errs = CfgValueErrs.of();
    new RefValidator(cfgValue, errs).validate();

    expect(errs.errs).toHaveLength(2);
    expect(errs.errs.every((e) => e._tag === 'ForeignValueNotFound')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Empty CfgValue — no errors
  // -------------------------------------------------------------------------

  it('empty CfgValue produces no errors', () => {
    const cfgValue = makeCfgValue([]);
    const errs = CfgValueErrs.of();
    new RefValidator(cfgValue, errs).validate();
    expect(errs.errs).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Nullable ref from file source — skip validation
  // -------------------------------------------------------------------------

  it('nullable ref from file source skips validation', () => {
    const monsterSchema = makeTableSchema('monster', [makeFieldSchema('id', Primitive.INT)], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
    ]);

    const idField = makeFieldSchema('id', Primitive.INT);
    const monsterIdField = makeFieldSchema('monsterId', Primitive.INT);
    const dropFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(true), [monsterIdField]);
    const dropSchema = makeTableSchema('drop', [idField, monsterIdField], new KeySchema(['id']), [dropFk]);

    const dropStruct = makeVStruct(dropSchema, [
      new VInt(100, EMPTY_SOURCE),
      new VInt(999, FILE_SOURCE),
    ]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: dropStruct },
    ]);

    const cfgValue = makeCfgValue([monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const errs = CfgValueErrs.of();
    new RefValidator(cfgValue, errs).validate();
    expect(errs.errs).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Non-nullable ref from file source — must validate
  // -------------------------------------------------------------------------

  it('non-nullable ref from file source must validate', () => {
    const monsterSchema = makeTableSchema('monster', [makeFieldSchema('id', Primitive.INT)], new KeySchema(['id']));
    const monsterTable = makeVTable(monsterSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: makeVStruct(monsterSchema, [new VInt(1, EMPTY_SOURCE)]) },
    ]);

    const idField = makeFieldSchema('id', Primitive.INT);
    const monsterIdField = makeFieldSchema('monsterId', Primitive.INT);
    const dropFk = makeForeignKey('monsterId', ['monsterId'], 'monster', new RefPrimary(false), [monsterIdField]);
    const dropSchema = makeTableSchema('drop', [idField, monsterIdField], new KeySchema(['id']), [dropFk]);

    const dropStruct = makeVStruct(dropSchema, [
      new VInt(100, EMPTY_SOURCE),
      new VInt(999, FILE_SOURCE),
    ]);
    const dropTable = makeVTable(dropSchema, [
      { pk: new VInt(100, EMPTY_SOURCE), vStruct: dropStruct },
    ]);

    const cfgValue = makeCfgValue([monsterTable, dropTable]);
    linkForeignKeys(cfgValue);

    const errs = CfgValueErrs.of();
    new RefValidator(cfgValue, errs).validate();

    expect(errs.errs).toHaveLength(1);
    expect(errs.errs[0]._tag).toBe('ForeignValueNotFound');
  });

  // -------------------------------------------------------------------------
  // Nullable ref that is part of PK — skip (special case)
  // -------------------------------------------------------------------------

  it('nullable ref that is part of primary key skips validation', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const selfFk = makeForeignKey('id', ['id'], 'selfref', new RefPrimary(true), [idField]);
    const ts = makeTableSchema('selfref', [idField, nameField], new KeySchema(['id']), [selfFk]);

    const record = makeVStruct(ts, [
      new VInt(999, EMPTY_SOURCE),
      new VString('test', EMPTY_SOURCE),
    ]);
    const table = makeVTable(ts, [
      { pk: new VInt(999, EMPTY_SOURCE), vStruct: record },
    ]);

    const cfgValue = makeCfgValue([table]);
    linkForeignKeys(cfgValue);

    const errs = CfgValueErrs.of();
    new RefValidator(cfgValue, errs).validate();

    expect(errs.errs).toHaveLength(0);
  });
});
