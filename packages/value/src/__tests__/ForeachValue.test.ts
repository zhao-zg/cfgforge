/**
 * ForeachValue tests — T4.7 (dependency of T4.9 TextValue)
 *
 * Tests traversal of all primitive values in a CfgValue tree:
 * - Basic traversal: single table, single record, primitive fields
 * - fieldChain accumulation (field names, list indices, map k/v)
 * - VStruct fields
 * - VInterface with child VStruct
 * - VList elements
 * - VMap entries (key and value)
 * - ValueVisitorForPrimitive (only visitPrimitive implemented)
 * - searchCfgValue / searchVTable (ForSearchVisitor)
 * - Empty CfgValue
 * - Multiple tables
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
import {
  ForeachValue,
  ValueVisitorForPrimitive,
  type ValueVisitor,
  type ValueVisitorForSearch,
} from '../ForeachValue';
import { DCellList, DFile } from '@cfgforge/data';
import type { Source } from '@cfgforge/data';
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
  type Structural,
} from '@cfgforge/schema';

// ---------------------------------------------------------------------------
// Helpers (reused from ForeachVStruct tests pattern)
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

// ---------------------------------------------------------------------------
// Collector visitor: collects all visited primitives with fieldChain and pk

class CollectorVisitor extends ValueVisitorForPrimitive {
  visits: Array<{
    type: string;
    pkStr: string;
    fieldChain: string[];
    value: string;
  }> = [];

  visitPrimitive(pv: PrimitiveValue, pk: Value, fieldChain: string[]): void {
    this.visits.push({
      type: pv.constructor.name,
      pkStr: pk.packStr(),
      fieldChain: [...fieldChain],
      value: pv.packStr(),
    });
  }
}

// ---------------------------------------------------------------------------
// Search collector
// ---------------------------------------------------------------------------

class SearchCollector implements ValueVisitorForSearch {
  results: Array<{
    table: string;
    pkStr: string;
    fieldChain: string[];
    value: string;
  }> = [];

  visit(
    pv: PrimitiveValue,
    table: string,
    pk: Value,
    fieldChain: string[],
  ): void {
    this.results.push({
      table,
      pkStr: pk.packStr(),
      fieldChain: [...fieldChain],
      value: pv.packStr(),
    });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ForeachValue', () => {

  // -------------------------------------------------------------------------
  // Basic traversal: primitives in a flat table
  // -------------------------------------------------------------------------

  it('should visit all primitive values in a flat table', () => {
    // Schema: table with fields id(int), name(text), desc(text)
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.TEXT);
    const descField = makeFieldSchema('desc', Primitive.TEXT);
    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('item', [idField, nameField, descField], pk);

    const record = makeVStruct(tableSchema, [
      new VInt(1, EMPTY_SOURCE),
      new VText('sword', EMPTY_SOURCE),
      new VText('a sharp sword', EMPTY_SOURCE),
    ]);

    const vTable = makeVTable(tableSchema, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: record }]);
    const cfgValue = makeCfgValue([vTable]);

    const collector = new CollectorVisitor();
    ForeachValue.foreach(collector, cfgValue);

    // Should visit 3 primitives: VInt, VText, VText
    expect(collector.visits).toHaveLength(3);
    expect(collector.visits[0].type).toBe('VInt');
    expect(collector.visits[0].value).toBe('1');
    expect(collector.visits[0].fieldChain).toEqual(['id']);
    expect(collector.visits[1].type).toBe('VText');
    expect(collector.visits[1].value).toBe('sword');
    expect(collector.visits[1].fieldChain).toEqual(['name']);
    expect(collector.visits[2].fieldChain).toEqual(['desc']);
  });

  // -------------------------------------------------------------------------
  // fieldChain with VStruct fields
  // -------------------------------------------------------------------------

  it('should accumulate fieldChain for nested VStruct fields', () => {
    // Schema: inner struct {x:int}, outer table {id:int, inner:inner}
    const xField = makeFieldSchema('x', Primitive.INT);
    const innerSchema = makeStructSchema('inner', [xField]);

    const idField = makeFieldSchema('id', Primitive.INT);
    const innerField = makeFieldSchema('inner', innerSchema);
    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('test', [idField, innerField], pk);

    const innerStruct = makeVStruct(innerSchema, [
      new VInt(42, EMPTY_SOURCE),
    ]);

    const record = makeVStruct(tableSchema, [
      new VInt(1, EMPTY_SOURCE),
      innerStruct,
    ]);

    const vTable = makeVTable(tableSchema, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: record }]);
    const cfgValue = makeCfgValue([vTable]);

    const collector = new CollectorVisitor();
    ForeachValue.foreach(collector, cfgValue);

    expect(collector.visits).toHaveLength(2);
    expect(collector.visits[0].fieldChain).toEqual(['id']);
    expect(collector.visits[1].fieldChain).toEqual(['inner', 'x']);
    expect(collector.visits[1].value).toBe('42');
  });

  // -------------------------------------------------------------------------
  // VInterface traversal
  // -------------------------------------------------------------------------

  it('should traverse VInterface child VStruct', () => {
    // Schema: interface IShape with impls [Circle{r:int}]
    const rField = makeFieldSchema('r', Primitive.INT);
    const circleSchema = makeStructSchema('Circle', [rField]);
    const shapeInterface = makeInterfaceSchema('IShape', [circleSchema]);

    const idField = makeFieldSchema('id', Primitive.INT);
    const shapeField = makeFieldSchema('shape', shapeInterface);
    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('test', [idField, shapeField], pk);

    const childStruct = makeVStruct(circleSchema, [
      new VInt(5, EMPTY_SOURCE),
    ]);

    const vi = new VInterface(shapeInterface, childStruct, EMPTY_SOURCE);

    const record = makeVStruct(tableSchema, [
      new VInt(1, EMPTY_SOURCE),
      vi,
    ]);

    const vTable = makeVTable(tableSchema, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: record }]);
    const cfgValue = makeCfgValue([vTable]);

    const collector = new CollectorVisitor();
    ForeachValue.foreach(collector, cfgValue);

    expect(collector.visits).toHaveLength(2);
    expect(collector.visits[0].fieldChain).toEqual(['id']);
    expect(collector.visits[1].fieldChain).toEqual(['shape', 'r']);
    expect(collector.visits[1].value).toBe('5');
  });

  // -------------------------------------------------------------------------
  // VList traversal
  // -------------------------------------------------------------------------

  it('should traverse VList elements with index in fieldChain', () => {
    // Schema: table {id:int, tags:list[text]}
    const idField = makeFieldSchema('id', Primitive.INT);
    const tagsField = makeFieldSchema('tags', { kind: 'list', item: Primitive.TEXT });
    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('test', [idField, tagsField], pk);

    const vList = new VList(
      [
        new VText('a', EMPTY_SOURCE),
        new VText('b', EMPTY_SOURCE),
        new VText('c', EMPTY_SOURCE),
      ],
      EMPTY_SOURCE,
    );

    const record = makeVStruct(tableSchema, [
      new VInt(1, EMPTY_SOURCE),
      vList,
    ]);

    const vTable = makeVTable(tableSchema, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: record }]);
    const cfgValue = makeCfgValue([vTable]);

    const collector = new CollectorVisitor();
    ForeachValue.foreach(collector, cfgValue);

    expect(collector.visits).toHaveLength(4);
    expect(collector.visits[1].fieldChain).toEqual(['tags', '0']);
    expect(collector.visits[2].fieldChain).toEqual(['tags', '1']);
    expect(collector.visits[3].fieldChain).toEqual(['tags', '2']);
  });

  // -------------------------------------------------------------------------
  // VMap traversal
  // -------------------------------------------------------------------------

  it('should traverse VMap keys and values with k/v suffix', () => {
    // Schema: table {id:int, m:map[int,int]}
    const idField = makeFieldSchema('id', Primitive.INT);
    const mapField = makeFieldSchema('m', {
      kind: 'map',
      key: Primitive.INT,
      value: Primitive.INT,
    });
    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('test', [idField, mapField], pk);

    const vMap = new VMap(
      new Map<SimpleValue, SimpleValue>([
        [new VInt(1, EMPTY_SOURCE), new VInt(10, EMPTY_SOURCE)],
        [new VInt(2, EMPTY_SOURCE), new VInt(20, EMPTY_SOURCE)],
      ]),
      EMPTY_SOURCE,
    );

    const record = makeVStruct(tableSchema, [
      new VInt(1, EMPTY_SOURCE),
      vMap,
    ]);

    const vTable = makeVTable(tableSchema, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: record }]);
    const cfgValue = makeCfgValue([vTable]);

    const collector = new CollectorVisitor();
    ForeachValue.foreach(collector, cfgValue);

    expect(collector.visits).toHaveLength(5); // id + 2k + 2v
    expect(collector.visits[1].fieldChain).toEqual(['m', '0k']);
    expect(collector.visits[1].value).toBe('1');
    expect(collector.visits[2].fieldChain).toEqual(['m', '0v']);
    expect(collector.visits[2].value).toBe('10');
    expect(collector.visits[3].fieldChain).toEqual(['m', '1k']);
    expect(collector.visits[3].value).toBe('2');
    expect(collector.visits[4].fieldChain).toEqual(['m', '1v']);
    expect(collector.visits[4].value).toBe('20');
  });

  // -------------------------------------------------------------------------
  // ValueVisitor: visitVStruct / visitVList / visitVMap / visitVInterface called
  // -------------------------------------------------------------------------

  it('should call visitVStruct, visitVList, visitVMap, visitVInterface', () => {
    const innerSchema = makeStructSchema('inner', [makeFieldSchema('x', Primitive.INT)]);
    const circleSchema = makeStructSchema('Circle', [makeFieldSchema('r', Primitive.INT)]);
    const shapeInterface = makeInterfaceSchema('IShape', [circleSchema]);

    const idField = makeFieldSchema('id', Primitive.INT);
    const innerField = makeFieldSchema('inner', innerSchema);
    const shapeField = makeFieldSchema('shape', shapeInterface);
    const tagsField = makeFieldSchema('tags', { kind: 'list', item: Primitive.TEXT });
    const mapField = makeFieldSchema('m', {
      kind: 'map',
      key: Primitive.INT,
      value: Primitive.INT,
    });

    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('test', [idField, innerField, shapeField, tagsField, mapField], pk);

    const childStruct = makeVStruct(circleSchema, [new VInt(5, EMPTY_SOURCE)]);
    const vi = new VInterface(shapeInterface, childStruct, EMPTY_SOURCE);
    const vList = new VList([new VText('a', EMPTY_SOURCE)], EMPTY_SOURCE);
    const vMap = new VMap(
      new Map<SimpleValue, SimpleValue>([[new VInt(1, EMPTY_SOURCE), new VInt(2, EMPTY_SOURCE)]]),
      EMPTY_SOURCE,
    );

    const record = makeVStruct(tableSchema, [
      new VInt(1, EMPTY_SOURCE),
      makeVStruct(innerSchema, [new VInt(42, EMPTY_SOURCE)]),
      vi,
      vList,
      vMap,
    ]);

    const vTable = makeVTable(tableSchema, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: record }]);
    const cfgValue = makeCfgValue([vTable]);

    const visited: string[] = [];
    const visitor: ValueVisitor = {
      visitPrimitive: () => { visited.push('prim'); },
      visitVStruct: () => { visited.push('struct'); },
      visitVInterface: () => { visited.push('interface'); },
      visitVList: () => { visited.push('list'); },
      visitVMap: () => { visited.push('map'); },
    };

    ForeachValue.foreach(visitor, cfgValue);

    // Order: struct(table record), prim(id), struct(inner), prim(x),
    //        interface, struct(Circle), prim(r), list, prim(text), map, prim(k), prim(v)
    expect(visited).toContain('struct');
    expect(visited).toContain('interface');
    expect(visited).toContain('list');
    expect(visited).toContain('map');
    expect(visited).toContain('prim');
  });

  // -------------------------------------------------------------------------
  // Empty CfgValue
  // -------------------------------------------------------------------------

  it('should handle empty CfgValue gracefully', () => {
    const cfgValue = makeCfgValue([]);
    const collector = new CollectorVisitor();
    ForeachValue.foreach(collector, cfgValue);
    expect(collector.visits).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Multiple tables, multiple records
  // -------------------------------------------------------------------------

  it('should traverse multiple tables and multiple records', () => {
    const idField1 = makeFieldSchema('id', Primitive.INT);
    const nameField1 = makeFieldSchema('name', Primitive.TEXT);
    const pk1 = new KeySchema(['id']);
    const tableSchema1 = makeTableSchema('item', [idField1, nameField1], pk1);

    const idField2 = makeFieldSchema('id', Primitive.INT);
    const valField2 = makeFieldSchema('val', Primitive.INT);
    const pk2 = new KeySchema(['id']);
    const tableSchema2 = makeTableSchema('prop', [idField2, valField2], pk2);

    const r1 = makeVStruct(tableSchema1, [new VInt(1, EMPTY_SOURCE), new VText('a', EMPTY_SOURCE)]);
    const r2 = makeVStruct(tableSchema1, [new VInt(2, EMPTY_SOURCE), new VText('b', EMPTY_SOURCE)]);
    const r3 = makeVStruct(tableSchema2, [new VInt(10, EMPTY_SOURCE), new VInt(100, EMPTY_SOURCE)]);

    const vt1 = makeVTable(tableSchema1, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: r1 },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: r2 },
    ]);
    const vt2 = makeVTable(tableSchema2, [
      { pk: new VInt(10, EMPTY_SOURCE), vStruct: r3 },
    ]);

    const cfgValue = makeCfgValue([vt2, vt1]); // unsorted order

    const collector = new CollectorVisitor();
    ForeachValue.foreach(collector, cfgValue);

    // Should visit in sorted table order: item, prop
    // item: r1(id=1,name=a), r2(id=2,name=b) → 4 prims
    // prop: r3(id=10,val=100) → 2 prims
    expect(collector.visits).toHaveLength(6);
    expect(collector.visits[0].pkStr).toBe('1');
    expect(collector.visits[0].fieldChain).toEqual(['id']);
    expect(collector.visits[4].pkStr).toBe('10');
    expect(collector.visits[4].fieldChain).toEqual(['id']);
  });

  // -------------------------------------------------------------------------
  // searchCfgValue
  // -------------------------------------------------------------------------

  it('searchCfgValue should visit primitives with table name', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.TEXT);
    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('weapon', [idField, nameField], pk);

    const record = makeVStruct(tableSchema, [
      new VInt(1, EMPTY_SOURCE),
      new VText('blade', EMPTY_SOURCE),
    ]);

    const vTable = makeVTable(tableSchema, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: record }]);
    const cfgValue = makeCfgValue([vTable]);

    const searcher = new SearchCollector();
    ForeachValue.searchCfgValue(searcher, cfgValue);

    expect(searcher.results).toHaveLength(2);
    expect(searcher.results[0].table).toBe('weapon');
    expect(searcher.results[0].value).toBe('1');
    expect(searcher.results[1].table).toBe('weapon');
    expect(searcher.results[1].value).toBe('blade');
  });

  // -------------------------------------------------------------------------
  // searchVTable with VInterface (should visit interface name as VString)
  // -------------------------------------------------------------------------

  it('searchVTable should visit VInterface impl name as VString', () => {
    const rField = makeFieldSchema('r', Primitive.INT);
    const circleSchema = makeStructSchema('Circle', [rField]);
    const shapeInterface = makeInterfaceSchema('IShape', [circleSchema]);

    const idField = makeFieldSchema('id', Primitive.INT);
    const shapeField = makeFieldSchema('shape', shapeInterface);
    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('test', [idField, shapeField], pk);

    const childStruct = makeVStruct(circleSchema, [new VInt(5, EMPTY_SOURCE)]);
    const vi = new VInterface(shapeInterface, childStruct, EMPTY_SOURCE);

    const record = makeVStruct(tableSchema, [
      new VInt(1, EMPTY_SOURCE),
      vi,
    ]);

    const vTable = makeVTable(tableSchema, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: record }]);

    const searcher = new SearchCollector();
    ForeachValue.searchVTable(searcher, vTable);

    // Should visit: id(1), interface name("Circle"), r(5)
    expect(searcher.results).toHaveLength(3);
    expect(searcher.results[1].value).toBe('Circle');
    expect(searcher.results[2].value).toBe('5');
  });

  // -------------------------------------------------------------------------
  // searchVTable with VStruct note
  // -------------------------------------------------------------------------

  it('searchVTable should visit VStruct note as VString when present', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.TEXT);
    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('test', [idField, nameField], pk);

    const record = makeVStruct(tableSchema, [
      new VInt(1, EMPTY_SOURCE),
      new VText('hello', EMPTY_SOURCE),
    ]);
    record.setNote('a note');

    const vTable = makeVTable(tableSchema, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: record }]);

    const searcher = new SearchCollector();
    ForeachValue.searchVTable(searcher, vTable);

    // Should visit: note("a note" at $note), id(1), name("hello")
    // (ForSearchVisitor.visitVStruct is called before field traversal)
    expect(searcher.results).toHaveLength(3);
    expect(searcher.results[0].value).toBe('a note');
    expect(searcher.results[0].fieldChain).toEqual(['$note']);
  });

  // -------------------------------------------------------------------------
  // foreachVTable
  // -------------------------------------------------------------------------

  it('foreachVTable should iterate records in a single table', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('test', [idField], pk);

    const r1 = makeVStruct(tableSchema, [new VInt(1, EMPTY_SOURCE)]);
    const r2 = makeVStruct(tableSchema, [new VInt(2, EMPTY_SOURCE)]);

    const vTable = makeVTable(tableSchema, [
      { pk: new VInt(1, EMPTY_SOURCE), vStruct: r1 },
      { pk: new VInt(2, EMPTY_SOURCE), vStruct: r2 },
    ]);

    const collector = new CollectorVisitor();
    ForeachValue.foreachVTable(
      collector,
      vTable,
    );

    expect(collector.visits).toHaveLength(2);
    expect(collector.visits[0].pkStr).toBe('1');
    expect(collector.visits[1].pkStr).toBe('2');
  });

  // -------------------------------------------------------------------------
  // foreachValue with non-VStruct top-level value
  // -------------------------------------------------------------------------

  it('foreachValue should handle a primitive value directly', () => {
    const collector = new CollectorVisitor();
    const pk = new VInt(1, EMPTY_SOURCE);
    ForeachValue.foreachValue(
      collector,
      new VString('hello', EMPTY_SOURCE),
      pk,
      [],
    );
    expect(collector.visits).toHaveLength(1);
    expect(collector.visits[0].value).toBe('hello');
    expect(collector.visits[0].fieldChain).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // VStruct note is NOT visited by foreachValue (only by searchVTable)
  // -------------------------------------------------------------------------

  it('foreachValue should NOT visit VStruct note (only searchVTable does)', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const pk = new KeySchema(['id']);
    const tableSchema = makeTableSchema('test', [idField], pk);

    const record = makeVStruct(tableSchema, [new VInt(1, EMPTY_SOURCE)]);
    record.setNote('a note');

    const vTable = makeVTable(tableSchema, [{ pk: new VInt(1, EMPTY_SOURCE), vStruct: record }]);
    const cfgValue = makeCfgValue([vTable]);

    const collector = new CollectorVisitor();
    ForeachValue.foreach(collector, cfgValue);

    // Only id is visited, note is not
    expect(collector.visits).toHaveLength(1);
    expect(collector.visits[0].value).toBe('1');
  });
});
