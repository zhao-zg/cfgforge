/**
 * ForeachVStruct tests — T4.5a
 *
 * Tests traversal of VStruct instances in a CfgValue tree:
 * - Basic traversal: single table, single record
 * - Multiple tables, multiple records
 * - Nested VStruct in fields
 * - VInterface with child VStruct
 * - VList containing VStructs
 * - VMap containing VStructs (key and value)
 * - Early exit (visitor returns false)
 * - Empty CfgValue
 * - recordId() format
 */

import { describe, it, expect } from 'vitest';
import {
  VString,
  VInt,
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
  ForeachVStruct,
  type VStructVisitor,
  ForeachContext,
} from '../ForeachVStruct';
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
  StructRef,
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
  foreignKeys: any[] = [],
  uniqueKeys: KeySchema[] = [],
): TableSchema {
  // Set fieldSchemas on key schemas
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

function makeStructSchema(
  name: string,
  fields: FieldSchema[],
): StructSchema {
  return new StructSchema(
    name,
    AutoOrPack.AUTO,
    Metadata_of(),
    fields,
    [],
  );
}

function makeInterfaceSchema(
  name: string,
  impls: StructSchema[],
): InterfaceSchema {
  return new InterfaceSchema(
    name,
    '',
    impls[0]?.name() ?? '',
    AutoOrPack.AUTO,
    Metadata_of(),
    impls,
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

function makeCfgValue(tables: VTable[], schema?: any): CfgValue {
  const vTableMap = new Map<string, VTable>();
  for (const t of tables) {
    vTableMap.set(t.name(), t);
  }
  return new CfgValue(schema ?? ({} as any), vTableMap, new CfgValueStat());
}

// Collector visitor: collects all visited VStruct names and contexts
class CollectorVisitor implements VStructVisitor {
  visits: Array<{ name: string; recordId: string }> = [];
  stopAfter: number | null = null;

  visit(vStruct: VStruct, ctx: ForeachContext): boolean {
    this.visits.push({ name: vStruct.name(), recordId: ctx.recordId() });
    if (this.stopAfter !== null && this.visits.length >= this.stopAfter) {
      return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ForeachVStruct', () => {

  // -------------------------------------------------------------------------
  // Basic traversal
  // -------------------------------------------------------------------------

  it('visits single table with single record', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const pk = new KeySchema(['id']);
    const ts = makeTableSchema('monster', [idField, nameField], pk);

    const vStruct = makeVStruct(ts, [
      new VInt(1, EMPTY_SOURCE),
      new VString('goblin', EMPTY_SOURCE),
    ]);

    const vt = makeVTable(ts, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct }]);
    const cfgValue = makeCfgValue([vt]);

    const visitor = new CollectorVisitor();
    ForeachVStruct.foreach(visitor, cfgValue);

    expect(visitor.visits).toHaveLength(1);
    expect(visitor.visits[0].name).toBe('monster');
    expect(visitor.visits[0].recordId).toBe('monster-1');
  });

  // -------------------------------------------------------------------------
  // Multiple tables, multiple records
  // -------------------------------------------------------------------------

  it('visits multiple tables and records in sorted order', () => {
    // Table 'aaa' with 2 records
    const ts1 = makeTableSchema(
      'aaa',
      [makeFieldSchema('id', Primitive.INT)],
      new KeySchema(['id']),
    );
    const v1a = makeVStruct(ts1, [new VInt(1, EMPTY_SOURCE)]);
    const v1b = makeVStruct(ts1, [new VInt(2, EMPTY_SOURCE)]);
    const vt1 = makeVTable(ts1, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: v1a },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: v1b },
    ]);

    // Table 'bbb' with 1 record
    const ts2 = makeTableSchema(
      'bbb',
      [makeFieldSchema('id', Primitive.INT)],
      new KeySchema(['id']),
    );
    const v2a = makeVStruct(ts2, [new VInt(10, EMPTY_SOURCE)]);
    const vt2 = makeVTable(ts2, [
      { pk: new VInt(10, EMPTY_SOURCE), vStruct: v2a },
    ]);

    const cfgValue = makeCfgValue([vt2, vt1]); // intentionally unsorted

    const visitor = new CollectorVisitor();
    ForeachVStruct.foreach(visitor, cfgValue);

    // Tables should be sorted: aaa first, then bbb
    expect(visitor.visits).toHaveLength(3);
    expect(visitor.visits[0].recordId).toBe('aaa-1');
    expect(visitor.visits[1].recordId).toBe('aaa-2');
    expect(visitor.visits[2].recordId).toBe('bbb-10');
  });

  // -------------------------------------------------------------------------
  // Nested VStruct in fields
  // -------------------------------------------------------------------------

  it('recurses into nested VStruct fields', () => {
    // Inner struct schema
    const innerSchema = makeStructSchema('inner', [
      makeFieldSchema('x', Primitive.INT),
    ]);
    // Outer table schema with a struct field
    const outerFields2 = [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('child', new StructRef('inner')),
    ];
    const pk = new KeySchema(['id']);
    const ts = makeTableSchema('outer', outerFields2, pk);

    const innerStruct = makeVStruct(innerSchema, [
      new VInt(42, EMPTY_SOURCE),
    ]);
    const outerStruct = makeVStruct(ts, [
      new VInt(1, EMPTY_SOURCE),
      innerStruct,
    ]);

    const vt = makeVTable(ts, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: outerStruct }]);
    const cfgValue = makeCfgValue([vt]);

    const visitor = new CollectorVisitor();
    ForeachVStruct.foreach(visitor, cfgValue);

    expect(visitor.visits).toHaveLength(2);
    expect(visitor.visits[0].name).toBe('outer');
    expect(visitor.visits[1].name).toBe('inner');
  });

  // -------------------------------------------------------------------------
  // VInterface with child VStruct
  // -------------------------------------------------------------------------

  it('recurses into VInterface child VStruct', () => {
    const implSchema = makeStructSchema('impl1', [
      makeFieldSchema('val', Primitive.STRING),
    ]);
    const ifaceSchema = makeInterfaceSchema('iface', [implSchema]);

    // Table with an interface field
    const ts = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('impl', new StructRef('iface')),
    ], new KeySchema(['id']));

    const childStruct = makeVStruct(implSchema, [
      new VString('hello', EMPTY_SOURCE),
    ]);
    const vIface = new VInterface(ifaceSchema, childStruct, EMPTY_SOURCE);
    const vStruct = makeVStruct(ts, [
      new VInt(1, EMPTY_SOURCE),
      vIface,
    ]);

    const vt = makeVTable(ts, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct }]);
    const cfgValue = makeCfgValue([vt]);

    const visitor = new CollectorVisitor();
    ForeachVStruct.foreach(visitor, cfgValue);

    expect(visitor.visits).toHaveLength(2);
    expect(visitor.visits[0].name).toBe('item');
    expect(visitor.visits[1].name).toBe('impl1');
  });

  // -------------------------------------------------------------------------
  // VList containing VStructs
  // -------------------------------------------------------------------------

  it('recurses into VStructs inside VList', () => {
    const elemSchema = makeStructSchema('elem', [
      makeFieldSchema('val', Primitive.INT),
    ]);

    const elem1 = makeVStruct(elemSchema, [new VInt(10, EMPTY_SOURCE)]);
    const elem2 = makeVStruct(elemSchema, [new VInt(20, EMPTY_SOURCE)]);
    const vList = new VList([elem1, elem2], EMPTY_SOURCE);

    const ts = makeTableSchema('listholder', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('items', Primitive.STRING), // placeholder, actual value is VList
    ], new KeySchema(['id']));

    const vStruct = makeVStruct(ts, [
      new VInt(1, EMPTY_SOURCE),
      vList,
    ]);

    const vt = makeVTable(ts, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct }]);
    const cfgValue = makeCfgValue([vt]);

    const visitor = new CollectorVisitor();
    ForeachVStruct.foreach(visitor, cfgValue);

    expect(visitor.visits).toHaveLength(3);
    expect(visitor.visits[0].name).toBe('listholder');
    expect(visitor.visits[1].name).toBe('elem');
    expect(visitor.visits[2].name).toBe('elem');
  });

  // -------------------------------------------------------------------------
  // VMap containing VStructs (key and value)
  // -------------------------------------------------------------------------

  it('recurses into VStructs inside VMap keys and values', () => {
    const keySchema = makeStructSchema('mapkey', [
      makeFieldSchema('k', Primitive.INT),
    ]);
    const valSchema = makeStructSchema('mapval', [
      makeFieldSchema('v', Primitive.STRING),
    ]);

    const mk = makeVStruct(keySchema, [new VInt(1, EMPTY_SOURCE)]);
    const mv = makeVStruct(valSchema, [new VString('a', EMPTY_SOURCE)]);
    const vMap = new VMap(new Map<SimpleValue, SimpleValue>([[mk, mv]]), EMPTY_SOURCE);

    const ts = makeTableSchema('mapholder', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('m', Primitive.STRING), // placeholder
    ], new KeySchema(['id']));

    const vStruct = makeVStruct(ts, [
      new VInt(1, EMPTY_SOURCE),
      vMap,
    ]);

    const vt = makeVTable(ts, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct }]);
    const cfgValue = makeCfgValue([vt]);

    const visitor = new CollectorVisitor();
    ForeachVStruct.foreach(visitor, cfgValue);

    expect(visitor.visits).toHaveLength(3);
    expect(visitor.visits[0].name).toBe('mapholder');
    // Key visited first, then value
    expect(visitor.visits[1].name).toBe('mapkey');
    expect(visitor.visits[2].name).toBe('mapval');
  });

  // -------------------------------------------------------------------------
  // Early exit
  // -------------------------------------------------------------------------

  it('stops when visitor returns false', () => {
    const ts = makeTableSchema(
      't',
      [makeFieldSchema('id', Primitive.INT)],
      new KeySchema(['id']),
    );

    const records: Array<{ pk: Value; vStruct: VStruct }> = [];
    for (let i = 1; i <= 5; i++) {
      const v = makeVStruct(ts, [new VInt(i, EMPTY_SOURCE)]);
      records.push({ pk: new VInt(i, EMPTY_SOURCE), vStruct: v });
    }
    const vt = makeVTable(ts, records);
    const cfgValue = makeCfgValue([vt]);

    const visitor = new CollectorVisitor();
    visitor.stopAfter = 2;
    ForeachVStruct.foreach(visitor, cfgValue);

    expect(visitor.visits).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Empty CfgValue
  // -------------------------------------------------------------------------

  it('handles empty CfgValue', () => {
    const cfgValue = makeCfgValue([]);
    const visitor = new CollectorVisitor();
    ForeachVStruct.foreach(visitor, cfgValue);
    expect(visitor.visits).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // foreachVTable (single table)
  // -------------------------------------------------------------------------

  it('foreachVTable visits all records in a single table', () => {
    const ts = makeTableSchema(
      'single',
      [makeFieldSchema('id', Primitive.INT)],
      new KeySchema(['id']),
    );
    const records: Array<{ pk: Value; vStruct: VStruct }> = [];
    for (let i = 1; i <= 3; i++) {
      const v = makeVStruct(ts, [new VInt(i, EMPTY_SOURCE)]);
      records.push({ pk: new VInt(i, EMPTY_SOURCE), vStruct: v });
    }
    const vt = makeVTable(ts, records);

    const visitor = new CollectorVisitor();
    ForeachVStruct.foreachVTable(visitor, vt);

    expect(visitor.visits).toHaveLength(3);
    expect(visitor.visits[0].recordId).toBe('single-1');
    expect(visitor.visits[1].recordId).toBe('single-2');
    expect(visitor.visits[2].recordId).toBe('single-3');
  });

  // -------------------------------------------------------------------------
  // foreachVTable early exit
  // -------------------------------------------------------------------------

  it('foreachVTable returns false when visitor stops', () => {
    const ts = makeTableSchema(
      't',
      [makeFieldSchema('id', Primitive.INT)],
      new KeySchema(['id']),
    );
    const records: Array<{ pk: Value; vStruct: VStruct }> = [];
    for (let i = 1; i <= 3; i++) {
      const v = makeVStruct(ts, [new VInt(i, EMPTY_SOURCE)]);
      records.push({ pk: new VInt(i, EMPTY_SOURCE), vStruct: v });
    }
    const vt = makeVTable(ts, records);

    const visitor = new CollectorVisitor();
    visitor.stopAfter = 1;
    const shouldContinue = ForeachVStruct.foreachVTable(visitor, vt);

    expect(shouldContinue).toBe(false);
    expect(visitor.visits).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Deeply nested VStruct (VStruct → VList → VStruct → VInterface → VStruct)
  // -------------------------------------------------------------------------

  it('recurses deeply through mixed nesting', () => {
    // Deepest struct
    const deepSchema = makeStructSchema('deep', [
      makeFieldSchema('x', Primitive.INT),
    ]);
    const deepStruct = makeVStruct(deepSchema, [new VInt(99, EMPTY_SOURCE)]);

    // Interface wrapping deep struct
    const ifaceSchema = makeInterfaceSchema('deepiface', [deepSchema]);
    const vIface = new VInterface(ifaceSchema, deepStruct, EMPTY_SOURCE);

    // List element struct containing the interface
    const elemSchema = makeStructSchema('listelem', [
      makeFieldSchema('iface', new StructRef('deepiface')),
    ]);
    const elem = makeVStruct(elemSchema, [vIface]);

    // List containing the element
    const vList = new VList([elem], EMPTY_SOURCE);

    // Top-level table
    const ts = makeTableSchema('root', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('items', Primitive.STRING), // placeholder
    ], new KeySchema(['id']));

    const rootStruct = makeVStruct(ts, [
      new VInt(1, EMPTY_SOURCE),
      vList,
    ]);

    const vt = makeVTable(ts, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: rootStruct }]);
    const cfgValue = makeCfgValue([vt]);

    const visitor = new CollectorVisitor();
    ForeachVStruct.foreach(visitor, cfgValue);

    // Expected visit order: root → listelem → deep
    expect(visitor.visits).toHaveLength(3);
    expect(visitor.visits[0].name).toBe('root');
    expect(visitor.visits[1].name).toBe('listelem');
    expect(visitor.visits[2].name).toBe('deep');
  });

  // -------------------------------------------------------------------------
  // recordId format
  // -------------------------------------------------------------------------

  it('recordId combines table name and pk packStr', () => {
    const ts = makeTableSchema(
      'item',
      [makeFieldSchema('id', Primitive.STRING)],
      new KeySchema(['id']),
    );
    const pkVal = new VString('sword', EMPTY_SOURCE);
    const vStruct = makeVStruct(ts, [pkVal]);
    const vt = makeVTable(ts, [{ pk: pkVal, vStruct }]);

    const visitor = new CollectorVisitor();
    const cfgValue = makeCfgValue([vt]);
    ForeachVStruct.foreach(visitor, cfgValue);

    expect(visitor.visits[0].recordId).toBe('item-sword');
  });
});
