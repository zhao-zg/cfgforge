/**
 * ValueToCsv tests — T4.8
 *
 * Tests CSV serialization of VTable data:
 * - Basic CSV output with header + data rows
 * - Field value extraction (StringValue uses value(), others use packStr())
 * - Missing field returns empty string
 * - Offset and limit pagination
 * - Offset beyond range returns empty
 * - Limit exceeds available rows
 * - Empty VTable
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
import { ValueToCsv } from '../ValueToCsv';
import { DCellList } from '@cfgforge/data';
import type { Source } from '@cfgforge/data';
import {
  TableSchema,
  KeySchema,
  FieldSchema,
  Metadata_of,
  Primitive,
  AutoOrPack,
  ENo,
} from '@cfgforge/schema';
import { writeCSV } from '@cfgforge/shared';

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
): TableSchema {
  const pkFieldSchemas = primaryKey.fields().map((fName) => {
    const found = fields.find((f) => f.name === fName);
    if (!found) throw new Error(`field ${fName} not found for key`);
    return found;
  });
  primaryKey.setFieldSchemas(pkFieldSchemas);

  return new TableSchema(
    name,
    primaryKey,
    ENo.NO,
    false,
    Metadata_of(),
    fields,
    [],
    [],
  );
}

function makeVStruct(schema: TableSchema, values: Value[]): VStruct {
  return new VStruct(schema, values, EMPTY_SOURCE);
}

function makeVTable(
  schema: TableSchema,
  records: VStruct[],
): VTable {
  const primaryKeyMap = new Map<Value, VStruct>();
  records.forEach((r, i) => {
    primaryKeyMap.set(new VInt(i + 1, EMPTY_SOURCE), r);
  });
  return new VTable(
    schema,
    records,
    primaryKeyMap,
    new Map<string[], Map<Value, VStruct>>(),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ValueToCsv', () => {

  // -------------------------------------------------------------------------
  // Basic CSV output
  // -------------------------------------------------------------------------

  it('writes header + data rows', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('name', Primitive.STRING),
    ], new KeySchema(['id']));
    const records = [
      makeVStruct(schema, [new VInt(1, EMPTY_SOURCE), new VString('sword', EMPTY_SOURCE)]),
      makeVStruct(schema, [new VInt(2, EMPTY_SOURCE), new VString('shield', EMPTY_SOURCE)]),
    ];
    const vTable = makeVTable(schema, records);

    const sb: string[] = [];
    ValueToCsv.writeAsCsv(sb, vTable, new Set(['id', 'name']), 0, 100);
    const csv = sb.join('');

    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('id,name');
    expect(lines[1]).toBe('1,sword');
    expect(lines[2]).toBe('2,shield');
  });

  // -------------------------------------------------------------------------
  // Field value extraction
  // -------------------------------------------------------------------------

  it('StringValue uses value(), not packStr()', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('desc', Primitive.STRING),
    ], new KeySchema(['id']));
    const records = [
      makeVStruct(schema, [new VInt(1, EMPTY_SOURCE), new VString('hello world', EMPTY_SOURCE)]),
    ];
    const vTable = makeVTable(schema, records);

    const sb: string[] = [];
    ValueToCsv.writeAsCsv(sb, vTable, new Set(['desc']), 0, 100);
    const csv = sb.join('');

    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('desc');
    expect(lines[1]).toBe('hello world');
  });

  // -------------------------------------------------------------------------
  // Missing field returns empty string
  // -------------------------------------------------------------------------

  it('missing field returns empty string', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('name', Primitive.STRING),
    ], new KeySchema(['id']));
    const records = [
      makeVStruct(schema, [new VInt(1, EMPTY_SOURCE), new VString('sword', EMPTY_SOURCE)]),
    ];
    const vTable = makeVTable(schema, records);

    const sb: string[] = [];
    // Request a field that doesn't exist
    ValueToCsv.writeAsCsv(sb, vTable, new Set(['nonexistent']), 0, 100);
    const csv = sb.join('');

    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('nonexistent');
    expect(lines[1]).toBe('');
  });

  // -------------------------------------------------------------------------
  // Offset and limit pagination
  // -------------------------------------------------------------------------

  it('offset skips first N rows', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const records = [
      makeVStruct(schema, [new VInt(1, EMPTY_SOURCE)]),
      makeVStruct(schema, [new VInt(2, EMPTY_SOURCE)]),
      makeVStruct(schema, [new VInt(3, EMPTY_SOURCE)]),
    ];
    const vTable = makeVTable(schema, records);

    const sb: string[] = [];
    ValueToCsv.writeAsCsv(sb, vTable, new Set(['id']), 1, 100);
    const csv = sb.join('');

    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('id');
    expect(lines[1]).toBe('2');
    expect(lines[2]).toBe('3');
    expect(lines).toHaveLength(3);
  });

  it('limit restricts number of rows', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const records = [
      makeVStruct(schema, [new VInt(1, EMPTY_SOURCE)]),
      makeVStruct(schema, [new VInt(2, EMPTY_SOURCE)]),
      makeVStruct(schema, [new VInt(3, EMPTY_SOURCE)]),
      makeVStruct(schema, [new VInt(4, EMPTY_SOURCE)]),
    ];
    const vTable = makeVTable(schema, records);

    const sb: string[] = [];
    ValueToCsv.writeAsCsv(sb, vTable, new Set(['id']), 0, 2);
    const csv = sb.join('');

    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('id');
    expect(lines[1]).toBe('1');
    expect(lines[2]).toBe('2');
    expect(lines).toHaveLength(3);
  });

  it('offset + limit combination', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const records = [
      makeVStruct(schema, [new VInt(1, EMPTY_SOURCE)]),
      makeVStruct(schema, [new VInt(2, EMPTY_SOURCE)]),
      makeVStruct(schema, [new VInt(3, EMPTY_SOURCE)]),
      makeVStruct(schema, [new VInt(4, EMPTY_SOURCE)]),
      makeVStruct(schema, [new VInt(5, EMPTY_SOURCE)]),
    ];
    const vTable = makeVTable(schema, records);

    const sb: string[] = [];
    ValueToCsv.writeAsCsv(sb, vTable, new Set(['id']), 1, 2);
    const csv = sb.join('');

    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('id');
    expect(lines[1]).toBe('2');
    expect(lines[2]).toBe('3');
    expect(lines).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it('offset beyond range returns empty', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const records = [
      makeVStruct(schema, [new VInt(1, EMPTY_SOURCE)]),
    ];
    const vTable = makeVTable(schema, records);

    const sb: string[] = [];
    ValueToCsv.writeAsCsv(sb, vTable, new Set(['id']), 10, 100);
    expect(sb.join('')).toBe('');
  });

  it('limit exceeds available rows is clamped', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const records = [
      makeVStruct(schema, [new VInt(1, EMPTY_SOURCE)]),
      makeVStruct(schema, [new VInt(2, EMPTY_SOURCE)]),
    ];
    const vTable = makeVTable(schema, records);

    const sb: string[] = [];
    ValueToCsv.writeAsCsv(sb, vTable, new Set(['id']), 0, 100);
    const csv = sb.join('');

    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('id');
    expect(lines[1]).toBe('1');
    expect(lines[2]).toBe('2');
    expect(lines).toHaveLength(3);
  });

  it('negative offset returns empty', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const records = [
      makeVStruct(schema, [new VInt(1, EMPTY_SOURCE)]),
    ];
    const vTable = makeVTable(schema, records);

    const sb: string[] = [];
    ValueToCsv.writeAsCsv(sb, vTable, new Set(['id']), -1, 100);
    expect(sb.join('')).toBe('');
  });

  it('zero limit returns empty', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const records = [
      makeVStruct(schema, [new VInt(1, EMPTY_SOURCE)]),
    ];
    const vTable = makeVTable(schema, records);

    const sb: string[] = [];
    ValueToCsv.writeAsCsv(sb, vTable, new Set(['id']), 0, 0);
    expect(sb.join('')).toBe('');
  });

  it('empty VTable returns empty', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
    ], new KeySchema(['id']));
    const vTable = makeVTable(schema, []);

    const sb: string[] = [];
    ValueToCsv.writeAsCsv(sb, vTable, new Set(['id']), 0, 100);
    expect(sb.join('')).toBe('');
  });

  // -------------------------------------------------------------------------
  // CSV escaping
  // -------------------------------------------------------------------------

  it('escapes values with commas', () => {
    const schema = makeTableSchema('item', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('desc', Primitive.STRING),
    ], new KeySchema(['id']));
    const records = [
      makeVStruct(schema, [new VInt(1, EMPTY_SOURCE), new VString('hello, world', EMPTY_SOURCE)]),
    ];
    const vTable = makeVTable(schema, records);

    const sb: string[] = [];
    ValueToCsv.writeAsCsv(sb, vTable, new Set(['id', 'desc']), 0, 100);
    const csv = sb.join('');

    const lines = csv.trim().split('\r\n');
    expect(lines[1]).toBe('1,"hello, world"');
  });
});
