/**
 * VTableBlockParser tests — T4.2f
 *
 * Tests block boundary detection using ancestor-first-column algorithm:
 * - findColumnIndex: locate cell-list index by col()
 * - getPkColumnIndices: compute PK column indices from schema
 * - isPkCellAllEmpty: check if PK cells are all empty in a row
 * - parseBlock: basic multi-row block extraction
 * - parseBlock: block ends at next record (PK non-empty)
 * - parseBlock: skip rows with empty firstCol (inner nested block)
 * - parseBlock: ancestor column non-empty signals outer block new item → break
 * - fieldNameOf: known and unknown column
 * - collectBlockAncestors: nested block structure has correct ancestors map
 */

import { describe, it, expect } from 'vitest';
import {
  VTableBlockParser,
  getPkColumnIndices,
  isPkCellAllEmpty,
  findColumnIndex,
} from '../VTableBlockParser';
import { CellsWithRowIndex } from '../ValueParser';
import { DCell, DRowId, DTable } from '@cfggen/data';
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
  type FieldType,
  type FieldFormat,
} from '@cfggen/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCell(value: string, row: number, col: number): DCell {
  return new DCell(value, new DRowId('test.csv', '', row), col, 0);
}

function makeRow(values: string[], rowIdx: number, startCol = 0): DCell[] {
  return values.map((v, i) => makeCell(v, rowIdx, startCol + i));
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
): TableSchema {
  const pk = new KeySchema(pkFields);
  const pkFieldSchemas = pkFields.map((fName) => {
    const f = fields.find((f) => f.name === fName);
    if (!f) throw new Error(`pk field ${fName} not found`);
    return f;
  });
  pk.setFieldSchemas(pkFieldSchemas);
  return new TableSchema(
    name,
    pk,
    ENo.NO,
    false,
    Metadata_of(),
    fields,
    [],
    [],
  );
}

function makeDTable(rows: DCell[][]): DTable {
  return new DTable('test', [], rows, [], null);
}

// ---------------------------------------------------------------------------
// findColumnIndex
// ---------------------------------------------------------------------------

describe('findColumnIndex', () => {
  it('finds the cell-list index by col() match', () => {
    const row = [
      makeCell('a', 0, 0),
      makeCell('b', 0, 1),
      makeCell('c', 0, 2),
    ];
    expect(findColumnIndex(row[2], row)).toBe(2);
    expect(findColumnIndex(row[0], row)).toBe(0);
    expect(findColumnIndex(row[1], row)).toBe(1);
  });

  it('returns row length if col() not found', () => {
    const row = [makeCell('a', 0, 0), makeCell('b', 0, 1)];
    const foreignCell = makeCell('x', 0, 99);
    expect(findColumnIndex(foreignCell, row)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getPkColumnIndices
// ---------------------------------------------------------------------------

describe('getPkColumnIndices', () => {
  it('returns PK column index for single int PK', () => {
    const idField = makeField('id', Primitive.INT);
    const nameField = makeField('name', Primitive.STRING);
    const ts = makeTableSchema('test', [idField, nameField], ['id']);
    expect(getPkColumnIndices(ts)).toEqual([0]);
  });

  it('returns multiple indices for multi-field PK with span > 1', () => {
    const aField = makeField('a', Primitive.INT);
    // block list field with span=2 before the PK field
    const itemsField = makeField('items', new FList(Primitive.INT), new Block(2), 2);
    const bField = makeField('b', Primitive.INT);
    const ts = makeTableSchema('test', [aField, itemsField, bField], ['b']);
    // a: span=1 (col 0), items: span=2 (col 1-2), b: span=1 (col 3)
    expect(getPkColumnIndices(ts)).toEqual([3]);
  });

  it('returns multiple indices for PK field with span > 1 (e.g. block struct)', () => {
    // PK is a struct ref with span 2
    const posStruct = makeStruct('Pos', [
      makeField('x', Primitive.INT),
      makeField('y', Primitive.INT),
    ], 2);
    const posRef = new StructRef('Pos');
    posRef.obj = posStruct;
    const posField = makeField('pos', posRef, AutoOrPack.AUTO, 2);
    const nameField = makeField('name', Primitive.STRING);
    const ts = makeTableSchema('test', [posField, nameField], ['pos']);
    // pos: span=2 (col 0-1), so PK indices = [0, 1]
    expect(getPkColumnIndices(ts)).toEqual([0, 1]);
  });
});

// ---------------------------------------------------------------------------
// isPkCellAllEmpty
// ---------------------------------------------------------------------------

describe('isPkCellAllEmpty', () => {
  it('returns true when all PK cells are empty', () => {
    const row = [makeCell('', 0, 0), makeCell('x', 0, 1)];
    expect(isPkCellAllEmpty(row, [0])).toBe(true);
  });

  it('returns false when any PK cell is non-empty', () => {
    const row = [makeCell('1', 0, 0), makeCell('x', 0, 1)];
    expect(isPkCellAllEmpty(row, [0])).toBe(false);
  });

  it('handles multiple PK indices', () => {
    const row = [makeCell('', 0, 0), makeCell('', 0, 1), makeCell('x', 0, 2)];
    expect(isPkCellAllEmpty(row, [0, 1])).toBe(true);
    expect(isPkCellAllEmpty(row, [0, 2])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// VTableBlockParser — constructor & blockFirstColToInfo
// ---------------------------------------------------------------------------

describe('VTableBlockParser constructor', () => {
  it('builds blockFirstColToInfo for table with block list field', () => {
    const idField = makeField('id', Primitive.INT);
    const itemsField = makeField('items', new FList(Primitive.INT), new Block(2), 2);
    const ts = makeTableSchema('test', [idField, itemsField], ['id']);
    const dTable = makeDTable([]);

    const parser = new VTableBlockParser(dTable, ts);
    // items field starts at col 1 (after id span=1)
    expect(parser.fieldNameOf(1)).toBe('items');
    expect(parser.fieldNameOf(0)).toBe('');
  });

  it('handles table with no block fields', () => {
    const idField = makeField('id', Primitive.INT);
    const nameField = makeField('name', Primitive.STRING);
    const ts = makeTableSchema('test', [idField, nameField], ['id']);
    const dTable = makeDTable([]);

    const parser = new VTableBlockParser(dTable, ts);
    expect(parser.fieldNameOf(0)).toBe('');
    expect(parser.fieldNameOf(1)).toBe('');
  });

  it('builds ancestors map for nested block structure', () => {
    // struct Spawn: x(int), y(int) → span=2
    const spawnStruct = makeStruct('Spawn', [
      makeField('x', Primitive.INT),
      makeField('y', Primitive.INT),
    ], 2);

    // struct Wave: time(int), spawns([Spawn]{block:1}) → span = 1 + 2 = 3
    const spawnRef = new StructRef('Spawn');
    spawnRef.obj = spawnStruct;
    const spawnsField = makeField('spawns', new FList(spawnRef), new Block(1), 2);
    const waveStruct = makeStruct('Wave', [
      makeField('time', Primitive.INT),
      spawnsField,
    ], 3);

    // table: id(int), waves([Wave]{block:1}) → span = 1 + 3 = 4
    const waveRef = new StructRef('Wave');
    waveRef.obj = waveStruct;
    const wavesField = makeField('waves', new FList(waveRef), new Block(1), 3);
    const idField = makeField('id', Primitive.INT);
    const ts = makeTableSchema('test', [idField, wavesField], ['id']);
    const dTable = makeDTable([]);

    const parser = new VTableBlockParser(dTable, ts);
    // waves starts at col 1 (after id span=1)
    expect(parser.fieldNameOf(1)).toBe('waves');
    // spawns starts at col 2 (after time span=1 within Wave)
    expect(parser.fieldNameOf(2)).toBe('spawns');
  });
});

// ---------------------------------------------------------------------------
// parseBlock — basic scenarios
// ---------------------------------------------------------------------------

describe('VTableBlockParser.parseBlock', () => {
  it('returns single entry when block has no continuation rows', () => {
    // Table: id(int, col 0), items([int]{block:2}, col 1-2)
    const idField = makeField('id', Primitive.INT);
    const itemsField = makeField('items', new FList(Primitive.INT), new Block(2), 2);
    const ts = makeTableSchema('test', [idField, itemsField], ['id']);

    // Single row: id=1, items=10,20
    const row0 = [makeCell('1', 0, 0), makeCell('10', 0, 1), makeCell('20', 0, 2)];
    const dTable = makeDTable([row0]);

    const parser = new VTableBlockParser(dTable, ts);
    // Parse items block: cells = [col1, col2]
    const cells = [row0[1], row0[2]];
    const result = parser.parseBlock(cells, 0);

    expect(result).toHaveLength(1);
    expect(result[0].cells).toBe(cells);
    expect(result[0].rowIndex).toBe(0);
  });

  it('collects multiple rows in same record (PK empty)', () => {
    // Table: id(int, col 0), items([int]{block:2}, col 1-2)
    const idField = makeField('id', Primitive.INT);
    const itemsField = makeField('items', new FList(Primitive.INT), new Block(2), 2);
    const ts = makeTableSchema('test', [idField, itemsField], ['id']);

    // Row 0: id=1, items=10,20
    // Row 1: id="", items=30,40  (same record, block continues)
    const row0 = [makeCell('1', 0, 0), makeCell('10', 0, 1), makeCell('20', 0, 2)];
    const row1 = [makeCell('', 1, 0), makeCell('30', 1, 1), makeCell('40', 1, 2)];
    const dTable = makeDTable([row0, row1]);

    const parser = new VTableBlockParser(dTable, ts);
    const cells = [row0[1], row0[2]];
    const result = parser.parseBlock(cells, 0);

    expect(result).toHaveLength(2);
    expect(result[0].rowIndex).toBe(0);
    expect(result[1].rowIndex).toBe(1);
    // Row 1 cells should be a slice from row1[1..3]
    expect(result[1].cells).toEqual([row1[1], row1[2]]);
  });

  it('stops at next record (PK non-empty)', () => {
    const idField = makeField('id', Primitive.INT);
    const itemsField = makeField('items', new FList(Primitive.INT), new Block(2), 2);
    const ts = makeTableSchema('test', [idField, itemsField], ['id']);

    // Row 0: id=1, items=10,20
    // Row 1: id="", items=30,40  (block continues)
    // Row 2: id=2, items=50,60  (next record → stop)
    const row0 = [makeCell('1', 0, 0), makeCell('10', 0, 1), makeCell('20', 0, 2)];
    const row1 = [makeCell('', 1, 0), makeCell('30', 1, 1), makeCell('40', 1, 2)];
    const row2 = [makeCell('2', 2, 0), makeCell('50', 2, 1), makeCell('60', 2, 2)];
    const dTable = makeDTable([row0, row1, row2]);

    const parser = new VTableBlockParser(dTable, ts);
    const cells = [row0[1], row0[2]];
    const result = parser.parseBlock(cells, 0);

    expect(result).toHaveLength(2); // row 0 + row 1, row 2 is next record
  });

  it('skips rows where firstCol is empty (inner nested block)', () => {
    const idField = makeField('id', Primitive.INT);
    const itemsField = makeField('items', new FList(Primitive.INT), new Block(2), 2);
    const ts = makeTableSchema('test', [idField, itemsField], ['id']);

    // Row 0: id=1, items=10,20
    // Row 1: id="", items_col1="", items_col2=""  (firstCol empty → skip)
    // Row 2: id="", items=30,40  (firstCol non-empty → add)
    const row0 = [makeCell('1', 0, 0), makeCell('10', 0, 1), makeCell('20', 0, 2)];
    const row1 = [makeCell('', 1, 0), makeCell('', 1, 1), makeCell('', 1, 2)];
    const row2 = [makeCell('', 2, 0), makeCell('30', 2, 1), makeCell('40', 2, 2)];
    const dTable = makeDTable([row0, row1, row2]);

    const parser = new VTableBlockParser(dTable, ts);
    const cells = [row0[1], row0[2]];
    const result = parser.parseBlock(cells, 0);

    expect(result).toHaveLength(2); // row 0 + row 2 (row 1 skipped)
    expect(result[0].rowIndex).toBe(0);
    expect(result[1].rowIndex).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// parseBlock — ancestor-first-column boundary detection
// ---------------------------------------------------------------------------

describe('VTableBlockParser.parseBlock — ancestor boundary detection', () => {
  it('breaks when ancestor block first column is non-empty (outer block new item)', () => {
    // Nested structure:
    // table: id(int, col 0), waves([Wave]{block:1}, col 1-3)
    // struct Wave: time(int, col 1), spawns([Spawn]{block:1}, col 2-3)
    // struct Spawn: x(int, col 2), y(int, col 3)

    const spawnStruct = makeStruct('Spawn', [
      makeField('x', Primitive.INT),
      makeField('y', Primitive.INT),
    ], 2);

    const spawnRef = new StructRef('Spawn');
    spawnRef.obj = spawnStruct;
    const spawnsField = makeField('spawns', new FList(spawnRef), new Block(1), 2);
    const waveStruct = makeStruct('Wave', [
      makeField('time', Primitive.INT),
      spawnsField,
    ], 3);

    const waveRef = new StructRef('Wave');
    waveRef.obj = waveStruct;
    const wavesField = makeField('waves', new FList(waveRef), new Block(1), 3);
    const idField = makeField('id', Primitive.INT);
    const ts = makeTableSchema('test', [idField, wavesField], ['id']);

    // Columns: id(0), wave_time(1), spawn_x(2), spawn_y(3)
    // Row 0: id=1, time=100, x=1, y=2  → record 1, wave 1, spawn 1
    // Row 1: id="", time="",  x=3, y=4  → spawn continues (ancestor col 1 empty)
    // Row 2: id="", time=200, x=5, y=6  → ancestor col 1 non-empty → outer wave new item → break
    const row0 = [makeCell('1', 0, 0), makeCell('100', 0, 1), makeCell('1', 0, 2), makeCell('2', 0, 3)];
    const row1 = [makeCell('', 1, 0), makeCell('', 1, 1), makeCell('3', 1, 2), makeCell('4', 1, 3)];
    const row2 = [makeCell('', 2, 0), makeCell('200', 2, 1), makeCell('5', 2, 2), makeCell('6', 2, 3)];
    const dTable = makeDTable([row0, row1, row2]);

    const parser = new VTableBlockParser(dTable, ts);

    // Parse spawns block: cells = [col2, col3] from row 0
    const cells = [row0[2], row0[3]];
    const result = parser.parseBlock(cells, 0);

    // Should get row 0 + row 1, then break at row 2 (ancestor col 1 = "200" non-empty)
    expect(result).toHaveLength(2);
    expect(result[0].rowIndex).toBe(0);
    expect(result[1].rowIndex).toBe(1);
  });

  it('does not break when ancestor column is empty', () => {
    // Same structure as above
    const spawnStruct = makeStruct('Spawn', [
      makeField('x', Primitive.INT),
      makeField('y', Primitive.INT),
    ], 2);

    const spawnRef = new StructRef('Spawn');
    spawnRef.obj = spawnStruct;
    const spawnsField = makeField('spawns', new FList(spawnRef), new Block(1), 2);
    const waveStruct = makeStruct('Wave', [
      makeField('time', Primitive.INT),
      spawnsField,
    ], 3);

    const waveRef = new StructRef('Wave');
    waveRef.obj = waveStruct;
    const wavesField = makeField('waves', new FList(waveRef), new Block(1), 3);
    const idField = makeField('id', Primitive.INT);
    const ts = makeTableSchema('test', [idField, wavesField], ['id']);

    // Row 0: id=1, time=100, x=1, y=2
    // Row 1: id="", time="",  x=3, y=4  (ancestor empty, firstCol non-empty → add)
    // Row 2: id="", time="",  x=5, y=6  (ancestor empty, firstCol non-empty → add)
    // Row 3: id=2, ...         (next record → break)
    const row0 = [makeCell('1', 0, 0), makeCell('100', 0, 1), makeCell('1', 0, 2), makeCell('2', 0, 3)];
    const row1 = [makeCell('', 1, 0), makeCell('', 1, 1), makeCell('3', 1, 2), makeCell('4', 1, 3)];
    const row2 = [makeCell('', 2, 0), makeCell('', 2, 1), makeCell('5', 2, 2), makeCell('6', 2, 3)];
    const row3 = [makeCell('2', 3, 0), makeCell('x', 3, 1), makeCell('x', 3, 2), makeCell('x', 3, 3)];
    const dTable = makeDTable([row0, row1, row2, row3]);

    const parser = new VTableBlockParser(dTable, ts);
    const cells = [row0[2], row0[3]];
    const result = parser.parseBlock(cells, 0);

    expect(result).toHaveLength(3); // row 0, 1, 2
  });

  it('parses outer block (no ancestors) spanning multiple rows', () => {
    // Table: id(int, col 0), waves([Wave]{block:1}, col 1-3)
    // Wave: time(int, col 1), spawns([Spawn]{block:1}, col 2-3)
    const spawnStruct = makeStruct('Spawn', [
      makeField('x', Primitive.INT),
      makeField('y', Primitive.INT),
    ], 2);

    const spawnRef = new StructRef('Spawn');
    spawnRef.obj = spawnStruct;
    const spawnsField = makeField('spawns', new FList(spawnRef), new Block(1), 2);
    const waveStruct = makeStruct('Wave', [
      makeField('time', Primitive.INT),
      spawnsField,
    ], 3);

    const waveRef = new StructRef('Wave');
    waveRef.obj = waveStruct;
    const wavesField = makeField('waves', new FList(waveRef), new Block(1), 3);
    const idField = makeField('id', Primitive.INT);
    const ts = makeTableSchema('test', [idField, wavesField], ['id']);

    // Row 0: id=1, time=100, x=1, y=2  → record 1, wave 1
    // Row 1: id="", time=200, x=3, y=4  → wave 2 (outer block continues, ancestor set is empty)
    // Row 2: id=2, ...                  → next record → break
    const row0 = [makeCell('1', 0, 0), makeCell('100', 0, 1), makeCell('1', 0, 2), makeCell('2', 0, 3)];
    const row1 = [makeCell('', 1, 0), makeCell('200', 1, 1), makeCell('3', 1, 2), makeCell('4', 1, 3)];
    const row2 = [makeCell('2', 2, 0), makeCell('x', 2, 1), makeCell('x', 2, 2), makeCell('x', 2, 3)];
    const dTable = makeDTable([row0, row1, row2]);

    const parser = new VTableBlockParser(dTable, ts);

    // Parse waves block: cells = [col1, col2, col3] from row 0
    const cells = [row0[1], row0[2], row0[3]];
    const result = parser.parseBlock(cells, 0);

    // waves block has no ancestors (it's the outermost block), so
    // row 1 has firstCol(col 1) = "200" non-empty → add
    // row 2 has PK non-empty → break
    expect(result).toHaveLength(2);
    expect(result[0].rowIndex).toBe(0);
    expect(result[1].rowIndex).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// fieldNameOf
// ---------------------------------------------------------------------------

describe('VTableBlockParser.fieldNameOf', () => {
  it('returns field name for known block first column', () => {
    const idField = makeField('id', Primitive.INT);
    const itemsField = makeField('items', new FList(Primitive.INT), new Block(2), 2);
    const ts = makeTableSchema('test', [idField, itemsField], ['id']);
    const dTable = makeDTable([]);

    const parser = new VTableBlockParser(dTable, ts);
    expect(parser.fieldNameOf(1)).toBe('items');
  });

  it('returns empty string for unknown column', () => {
    const idField = makeField('id', Primitive.INT);
    const itemsField = makeField('items', new FList(Primitive.INT), new Block(2), 2);
    const ts = makeTableSchema('test', [idField, itemsField], ['id']);
    const dTable = makeDTable([]);

    const parser = new VTableBlockParser(dTable, ts);
    expect(parser.fieldNameOf(0)).toBe('');
    expect(parser.fieldNameOf(99)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// VTableBlockParser implements BlockParser interface
// ---------------------------------------------------------------------------

describe('VTableBlockParser as BlockParser', () => {
  it('can be used as a BlockParser', () => {
    const idField = makeField('id', Primitive.INT);
    const itemsField = makeField('items', new FList(Primitive.INT), new Block(2), 2);
    const ts = makeTableSchema('test', [idField, itemsField], ['id']);
    const dTable = makeDTable([]);

    const parser = new VTableBlockParser(dTable, ts);
    // Type check: parser has parseBlock method returning CellsWithRowIndex[]
    expect(typeof parser.parseBlock).toBe('function');
  });
});
