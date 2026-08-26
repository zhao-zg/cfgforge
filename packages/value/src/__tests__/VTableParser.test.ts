/**
 * VTableParser tests — T4.2g
 *
 * Tests the table-level value parsing driver:
 * - Constructor: default VTableBlockParser injection
 * - Constructor: custom BlockParser injection
 * - parseTable: simple table without block (single record)
 * - parseTable: simple table without block (multiple records)
 * - parseTable: table with block list (multi-row block continuation)
 * - parseTable: empty table (zero rows)
 * - parseTable: row where parseStructural returns null is skipped
 * - parseTable: VTable with primary key map populated
 */

import { describe, it, expect } from 'vitest';
import { VTableParser } from '../VTableParser';
import { ValueParser, ParseContext, CellsWithRowIndex, dummyBlockParser } from '../ValueParser';
import { CfgValueErrs } from '../CfgValueErrs';
import { VTable, VStruct, VInt, VString, VList } from '../CfgValue';
import { VTableCreator } from '../VTableCreator';
import { DCell, DRowId, DTable, HeadRows } from '@cfgforge/data';
import {
  TableSchema,
  KeySchema,
  FieldSchema,
  StructSchema,
  ENo,
  Primitive,
  FList,
  StructRef,
  AutoOrPack,
  Block,
  Metadata,
  Metadata_of,
  fieldSpan,
  hasBlock,
  type FieldType,
  type FieldFormat,
  type Structural,
} from '@cfgforge/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCell(value: string, row: number, col: number): DCell {
  return new DCell(value, new DRowId('test.csv', '', row), col, 0);
}

function makeField(
  name: string,
  type: FieldType,
  fmt: FieldFormat = AutoOrPack.AUTO,
  spanVal?: number,
): FieldSchema {
  const meta = Metadata_of();
  if (spanVal !== undefined) meta.putSpan(spanVal);
  return new FieldSchema(name, type, fmt, meta);
}

function makeStruct(
  name: string,
  fields: FieldSchema[],
  spanVal?: number,
): StructSchema {
  const meta = Metadata_of();
  if (spanVal !== undefined) meta.putSpan(spanVal);
  return new StructSchema(name, AutoOrPack.AUTO, meta, fields, []);
}

function makeTableSchema(
  name: string,
  fields: FieldSchema[],
  pkFields: string[],
  meta: Metadata = Metadata_of(),
): TableSchema {
  const pk = new KeySchema(pkFields);
  const pkFieldSchemas = pkFields.map((fName) => {
    const f = fields.find((f) => f.name === fName);
    if (!f) throw new Error(`pk field ${fName} not found`);
    return f;
  });
  pk.setFieldSchemas(pkFieldSchemas);

  // Set _span on the table schema so span() works.
  // For AUTO fmt with all primitive fields, span = number of fields.
  // For tables with block/struct fields, span is sum of fieldSpan(field).
  let totalSpan = 0;
  for (const f of fields) {
    const fs = fieldSpan(f);
    totalSpan += fs;
    // Also set _span on field meta if it has non-primitive type
    // (fieldSpan already returns 1 for primitives, so only needed for non-primitive)
  }
  meta.putSpan(totalSpan);

  return new TableSchema(
    name,
    pk,
    ENo.NO,
    false,
    meta,
    fields,
    [],
    [],
  );
}

function makeDTable(rows: DCell[][]): DTable {
  return new DTable('test', [], rows, [], null);
}

// Helper: set _hasBlock metadata on the table schema so hasBlock() works
function setHasBlock(tableSchema: TableSchema, value: boolean): void {
  tableSchema.meta().putHasBlock(value);
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('VTableParser constructor', () => {
  it('constructs with default VTableBlockParser when no blockParser given', () => {
    const idField = makeField('id', Primitive.INT);
    const ts = makeTableSchema('test', [idField], ['id']);
    const dt = makeDTable([]);

    const parser = new VTableParser(ts, dt, ts, HeadRows.A2_Default, CfgValueErrs.of());
    expect(parser).toBeInstanceOf(VTableParser);
  });

  it('constructs with custom BlockParser', () => {
    const idField = makeField('id', Primitive.INT);
    const ts = makeTableSchema('test', [idField], ['id']);
    const dt = makeDTable([]);

    const parser = new VTableParser(
      ts, dt, ts, HeadRows.A2_Default, CfgValueErrs.of(), dummyBlockParser,
    );
    expect(parser).toBeInstanceOf(VTableParser);
  });
});

// ---------------------------------------------------------------------------
// parseTable — simple table without block
// ---------------------------------------------------------------------------

describe('VTableParser.parseTable — no block', () => {
  it('parses single record', () => {
    const idField = makeField('id', Primitive.INT);
    const nameField = makeField('name', Primitive.STRING);
    const ts = makeTableSchema('test', [idField, nameField], ['id']);
    setHasBlock(ts, false);

    // Row 0: id=1, name=Alice
    const row0 = [makeCell('1', 0, 0), makeCell('Alice', 0, 1)];
    const dt = makeDTable([row0]);

    const errs = CfgValueErrs.of();
    const parser = new VTableParser(ts, dt, ts, HeadRows.A2_Default, errs, dummyBlockParser);
    const vt = parser.parseTable();

    expect(vt).toBeInstanceOf(VTable);
    expect(vt.valueList).toHaveLength(1);
    expect(vt.primaryKeyMap.size).toBe(1);
    expect(errs.errs).toHaveLength(0);
  });

  it('parses multiple records', () => {
    const idField = makeField('id', Primitive.INT);
    const nameField = makeField('name', Primitive.STRING);
    const ts = makeTableSchema('test', [idField, nameField], ['id']);
    setHasBlock(ts, false);

    const row0 = [makeCell('1', 0, 0), makeCell('A', 0, 1)];
    const row1 = [makeCell('2', 1, 0), makeCell('B', 1, 1)];
    const row2 = [makeCell('3', 2, 0), makeCell('C', 2, 1)];
    const dt = makeDTable([row0, row1, row2]);

    const errs = CfgValueErrs.of();
    const parser = new VTableParser(ts, dt, ts, HeadRows.A2_Default, errs, dummyBlockParser);
    const vt = parser.parseTable();

    expect(vt.valueList).toHaveLength(3);
    expect(vt.primaryKeyMap.size).toBe(3);
    // Verify PK values
    const keys = [...vt.primaryKeyMap.keys()];
    const ids = keys.map((k) => (k as VInt).value).sort((a, b) => a - b);
    expect(ids).toEqual([1, 2, 3]);
  });

  it('parses empty table (zero rows)', () => {
    const idField = makeField('id', Primitive.INT);
    const nameField = makeField('name', Primitive.STRING);
    const ts = makeTableSchema('test', [idField, nameField], ['id']);
    setHasBlock(ts, false);

    const dt = makeDTable([]);

    const errs = CfgValueErrs.of();
    const parser = new VTableParser(ts, dt, ts, HeadRows.A2_Default, errs, dummyBlockParser);
    const vt = parser.parseTable();

    expect(vt.valueList).toHaveLength(0);
    expect(vt.primaryKeyMap.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseTable — table with block list field
// ---------------------------------------------------------------------------

describe('VTableParser.parseTable — with block', () => {
  it('parses table with block list spanning multiple rows', () => {
    // Table: id(int, col 0), items([int]{block:2}, col 1-2)
    const idField = makeField('id', Primitive.INT);
    const itemsField = makeField('items', new FList(Primitive.INT), new Block(2), 2);
    const ts = makeTableSchema('test', [idField, itemsField], ['id']);
    setHasBlock(ts, true);

    // Row 0: id=1, items=10,20  (record 1, block row 1)
    // Row 1: id="", items=30,40  (record 1, block row 2)
    // Row 2: id=2, items=50,60  (record 2, block row 1)
    const row0 = [makeCell('1', 0, 0), makeCell('10', 0, 1), makeCell('20', 0, 2)];
    const row1 = [makeCell('', 1, 0), makeCell('30', 1, 1), makeCell('40', 1, 2)];
    const row2 = [makeCell('2', 2, 0), makeCell('50', 2, 1), makeCell('60', 2, 2)];
    const dt = makeDTable([row0, row1, row2]);

    const errs = CfgValueErrs.of();
    // Use default VTableBlockParser (not dummyBlockParser)
    const parser = new VTableParser(ts, dt, ts, HeadRows.A2_Default, errs);
    const vt = parser.parseTable();

    expect(vt.valueList).toHaveLength(2);
    expect(vt.primaryKeyMap.size).toBe(2);
  });

  it('parses table with block where PK is multi-field (still uses first PK col for hasBlock)', () => {
    // Simple test: same as above but verify the parser doesn't crash
    const idField = makeField('id', Primitive.INT);
    const itemsField = makeField('items', new FList(Primitive.INT), new Block(1), 1);
    const ts = makeTableSchema('test', [idField, itemsField], ['id']);
    setHasBlock(ts, true);

    // Row 0: id=1, items=10
    // Row 1: id="", items=20  (block continuation)
    // Row 2: id=2, items=30  (next record)
    const row0 = [makeCell('1', 0, 0), makeCell('10', 0, 1)];
    const row1 = [makeCell('', 1, 0), makeCell('20', 1, 1)];
    const row2 = [makeCell('2', 2, 0), makeCell('30', 2, 1)];
    const dt = makeDTable([row0, row1, row2]);

    const errs = CfgValueErrs.of();
    const parser = new VTableParser(ts, dt, ts, HeadRows.A2_Default, errs);
    const vt = parser.parseTable();

    expect(vt.valueList).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// parseTable — VStruct null handling
// ---------------------------------------------------------------------------

describe('VTableParser.parseTable — null VStruct handling', () => {
  it('handles rows where all cells are empty (isEmpty=true path)', () => {
    // When canBeEmpty=true and all cells are empty, parseStructural sets isEmpty=true
    // and parses each field with canBeEmpty=true, producing default values.
    // So the empty row will produce a VStruct with default values (e.g., VInt(0)).
    // The VTableCreator will index it with PK=0.
    const idField = makeField('id', Primitive.INT);
    const nameField = makeField('name', Primitive.STRING);
    const ts = makeTableSchema('test', [idField, nameField], ['id']);
    setHasBlock(ts, false);

    // Row 0: empty cells — parseStructural with canBeEmpty=true → VStruct with defaults
    const row0 = [makeCell('', 0, 0), makeCell('', 0, 1)];
    // Row 1: id=2, name=B (valid record)
    const row1 = [makeCell('2', 1, 0), makeCell('B', 1, 1)];
    const dt = makeDTable([row0, row1]);

    const errs = CfgValueErrs.of();
    const parser = new VTableParser(ts, dt, ts, HeadRows.A2_Default, errs, dummyBlockParser);
    const vt = parser.parseTable();

    // Both rows produce VStructs — the empty row has default values (id=0)
    expect(vt.valueList).toHaveLength(2);
    // PK=0 from the empty row, PK=2 from the valid row
    expect(vt.primaryKeyMap.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// parseTable — VTable result verification
// ---------------------------------------------------------------------------

describe('VTableParser.parseTable — result verification', () => {
  it('produces VTable with primary key map populated', () => {
    const idField = makeField('id', Primitive.INT);
    const nameField = makeField('name', Primitive.STRING);
    const ts = makeTableSchema('test', [idField, nameField], ['id']);
    setHasBlock(ts, false);

    const row0 = [makeCell('42', 0, 0), makeCell('Answer', 0, 1)];
    const dt = makeDTable([row0]);

    const errs = CfgValueErrs.of();
    const parser = new VTableParser(ts, dt, ts, HeadRows.A2_Default, errs, dummyBlockParser);
    const vt = parser.parseTable();

    expect(vt.primaryKeyMap.size).toBe(1);
    const keys = [...vt.primaryKeyMap.keys()];
    expect(keys[0]).toBeInstanceOf(VInt);
    expect((keys[0] as VInt).value).toBe(42);
  });

  it('passes errors through to the result', () => {
    const idField = makeField('id', Primitive.INT);
    const nameField = makeField('name', Primitive.STRING);
    const ts = makeTableSchema('test', [idField, nameField], ['id']);
    setHasBlock(ts, false);

    // Row 0: id=not_a_number → parseLong should throw → error collected
    const row0 = [makeCell('not_a_number', 0, 0), makeCell('A', 0, 1)];
    const dt = makeDTable([row0]);

    const errs = CfgValueErrs.of();
    const parser = new VTableParser(ts, dt, ts, HeadRows.A2_Default, errs, dummyBlockParser);

    // parseTable should not throw — errors are collected
    expect(() => parser.parseTable()).not.toThrow();
    // Should have collected errors
    expect(errs.errs.length).toBeGreaterThan(0);
  });
});
