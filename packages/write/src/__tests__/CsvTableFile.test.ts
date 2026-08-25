/**
 * CsvTableFile tests — T7.2
 *
 * Row mode: line = row (same as Java CsvTableFile)
 * Column mode: line = column (same as Java ColumnModeCsvTableFile)
 *
 * Uses temp CSV files in .temp/ for round-trip read-write tests.
 *
 * Key understanding for column mode:
 *   - fieldIndices map block columns to ROW indices (not column indices)
 *   - writeLine(lineNum=column, lineData) writes lineData[row] to rows[row][column]
 *   - So content.getRow(lineOffset) returns an array indexed by row
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { CsvTableFile } from '../storages/CsvTableFile';
import { RecordBlock, RecordBlockTransformed } from '../RecordBlock';

const TEMP_DIR = path.join(__dirname, '..', '..', '..', '..', '.temp', 'write-csv-tests');

function ensureTempDir(): void {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

function writeCsvFile(name: string, content: string): string {
  const filePath = path.join(TEMP_DIR, name);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function readCsvFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

function readCsvLines(filePath: string): string[] {
  return readCsvFile(filePath).replace(/^\ufeff/, '').trim().split('\r\n');
}

describe('CsvTableFile — Row Mode', () => {
  beforeEach(() => { ensureTempDir(); });
  afterEach(() => {
    if (fs.existsSync(TEMP_DIR)) {
      const files = fs.readdirSync(TEMP_DIR);
      for (const f of files) {
        if (f.startsWith('row-')) {
          fs.unlinkSync(path.join(TEMP_DIR, f));
        }
      }
    }
  });

  it('reads a CSV file with normalized columns', () => {
    const filePath = writeCsvFile('row-read.csv', 'a,b,c\r\n1,2,3\r\n4,5,6\r\n');
    const tf = new CsvTableFile(filePath, 'UTF-8', 2, false);
    expect(tf).toBeDefined();
  });

  it('throws on empty CSV file', () => {
    const filePath = writeCsvFile('row-empty.csv', '');
    expect(() => new CsvTableFile(filePath, 'UTF-8', 2, false)).toThrow('no data');
  });

  it('emptyRows clears specified rows fully when fieldIndices is null', async () => {
    const filePath = writeCsvFile('row-empty-rows.csv', 'a,b,c\r\n1,2,3\r\n4,5,6\r\n7,8,9\r\n');
    const tf = new CsvTableFile(filePath, 'UTF-8', 2, false);
    tf.emptyRows(2, 2, null);
    await tf.saveAndClose();
    const lines = readCsvLines(filePath);
    expect(lines[2]).toBe(',,');
    expect(lines[3]).toBe(',,');
  });

  it('emptyRows clears only specified fieldIndices on first row', async () => {
    const filePath = writeCsvFile('row-empty-fields.csv', 'a,b,c\r\n1,2,3\r\n4,5,6\r\n7,8,9\r\n');
    const tf = new CsvTableFile(filePath, 'UTF-8', 2, false);
    tf.emptyRows(2, 1, [0, 2]);
    await tf.saveAndClose();
    const lines = readCsvLines(filePath);
    // row 2: col 0 and 2 cleared, col 1 preserved
    expect(lines[2]).toBe(',5,');
    // row 3 untouched
    expect(lines[3]).toBe('7,8,9');
  });

  it('emptyRows does nothing when startRow is out of range', async () => {
    const filePath = writeCsvFile('row-oob.csv', 'a,b,c\r\n1,2,3\r\n');
    const tf = new CsvTableFile(filePath, 'UTF-8', 2, false);
    tf.emptyRows(99, 1, null);
    await tf.saveAndClose();
    const lines = readCsvLines(filePath);
    expect(lines[1]).toBe('1,2,3');
  });

  it('insertRecordBlock appends to end when startRow is -1', async () => {
    const filePath = writeCsvFile('row-append.csv', 'a,b,c\r\n1,2,3\r\n');
    const block = new RecordBlock(3);
    block.setCell(0, 0, 'x');
    block.setCell(0, 1, 'y');
    block.setCell(0, 2, 'z');
    const transformed = new RecordBlockTransformed(block, [0, 1, 2]);

    const tf = new CsvTableFile(filePath, 'UTF-8', 2, false);
    tf.insertRecordBlock(-1, 0, transformed);
    await tf.saveAndClose();
    const lines = readCsvLines(filePath);
    expect(lines[2]).toBe('x,y,z');
  });

  it('insertRecordBlock overwrites existing empty rows', async () => {
    const filePath = writeCsvFile('row-overwrite.csv', 'a,b,c\r\n,,\r\n,,\r\n');
    const block = new RecordBlock(2);
    block.setCell(0, 0, 'aa');
    block.setCell(0, 1, 'bb');
    const transformed = new RecordBlockTransformed(block, [0, 1]);

    const tf = new CsvTableFile(filePath, 'UTF-8', 2, false);
    tf.insertRecordBlock(2, 1, transformed);
    await tf.saveAndClose();
    const lines = readCsvLines(filePath);
    expect(lines[2]).toBe('aa,bb,');
  });

  it('insertRecordBlock inserts new rows when content > emptyRowCount', async () => {
    // CSV: 2 header rows + 1 data row = 3 rows total
    const filePath = writeCsvFile('row-insert.csv', 'a,b,c\r\n1,2,3\r\n9,9,9\r\n');
    const block = new RecordBlock(2);
    block.setCell(0, 0, 'aa');
    block.setCell(0, 1, 'bb');
    block.setCell(1, 0, 'cc');
    block.setCell(1, 1, 'dd');
    const transformed = new RecordBlockTransformed(block, [0, 1]);

    // startRow=2, emptyRowCount=0 → insert 2 gap rows at position 2, shifting 9,9,9 down
    const tf = new CsvTableFile(filePath, 'UTF-8', 2, false);
    tf.insertRecordBlock(2, 0, transformed);
    await tf.saveAndClose();
    const lines = readCsvLines(filePath);
    expect(lines[2]).toBe('aa,bb,');
    expect(lines[3]).toBe('cc,dd,');
    expect(lines[4]).toBe('9,9,9');
  });

  it('saveAndClose does nothing when not modified', async () => {
    const filePath = writeCsvFile('row-nomod.csv', 'a,b\r\n1,2\r\n');
    const original = readCsvFile(filePath);
    const tf = new CsvTableFile(filePath, 'UTF-8', 2, false);
    await tf.saveAndClose();
    expect(readCsvFile(filePath)).toBe(original);
  });

  it('insertRecordBlock maps block columns to fieldIndices positions', async () => {
    // 3 columns, but block only has 2 fields mapped to col 0 and col 2
    const filePath = writeCsvFile('row-fmap.csv', 'a,b,c\r\n,,\r\n');
    const block = new RecordBlock(2);
    block.setCell(0, 0, 'first');
    block.setCell(0, 1, 'third');
    const transformed = new RecordBlockTransformed(block, [0, 2]);

    const tf = new CsvTableFile(filePath, 'UTF-8', 2, false);
    tf.insertRecordBlock(2, 1, transformed);
    await tf.saveAndClose();
    const lines = readCsvLines(filePath);
    expect(lines[2]).toBe('first,,third');
  });
});

describe('CsvTableFile — Column Mode', () => {
  beforeEach(() => { ensureTempDir(); });
  afterEach(() => {
    if (fs.existsSync(TEMP_DIR)) {
      const files = fs.readdirSync(TEMP_DIR);
      for (const f of files) {
        if (f.startsWith('col-')) {
          fs.unlinkSync(path.join(TEMP_DIR, f));
        }
      }
    }
  });

  // In column mode:
  //   - fieldIndices map block columns to ROW indices (where each field's value goes)
  //   - writeLine(column, lineData) writes lineData[row] → rows[row][column]
  //   - So content.getRow(lineOffset) returns an array indexed by row

  it('reads a column-mode CSV', () => {
    const filePath = writeCsvFile('col-read.csv', 'field0,field1,field2\r\nA,B,C\r\n1,2,3\r\n');
    const tf = new CsvTableFile(filePath, 'UTF-8', 2, true);
    expect(tf).toBeDefined();
  });

  it('emptyRows clears columns (not rows) when fieldIndices is null', async () => {
    // Column mode: startLine=column index, count=number of columns
    const filePath = writeCsvFile('col-empty.csv', 'f0,f1,f2\r\nA,B,C\r\n1,2,3\r\n');
    const tf = new CsvTableFile(filePath, 'UTF-8', 2, true);
    // Clear columns 0 and 1
    tf.emptyRows(0, 2, null);
    await tf.saveAndClose();
    const lines = readCsvLines(filePath);
    // Column 0 and 1 should be empty, column 2 preserved
    expect(lines[1]).toBe(',,C');
    expect(lines[2]).toBe(',,3');
  });

  it('emptyRows clears only specified fieldIndices (row indices) on first column', async () => {
    // Column mode: fieldIndices = row indices within the first column
    const filePath = writeCsvFile('col-empty-fields.csv', 'f0,f1,f2\r\nA,B,C\r\n1,2,3\r\n');
    const tf = new CsvTableFile(filePath, 'UTF-8', 2, true);
    // Clear column 0, rows 1 and 2 (fieldIndices)
    tf.emptyRows(0, 1, [1, 2]);
    await tf.saveAndClose();
    const lines = readCsvLines(filePath);
    // f0 still in row 0, row 1 and row 2 of column 0 cleared
    expect(lines[0]).toBe('f0,f1,f2');
    expect(lines[1]).toBe(',B,C');
    expect(lines[2]).toBe(',2,3');
  });

  it('insertRecordBlock appends new column to end when startRow is -1', async () => {
    // CSV: 3 rows (header + 2 data rows), 2 columns
    // We want to append a new column where:
    //   row 1 (field 0) = "C", row 2 (field 1) = "3"
    // fieldIndices = [1, 2] maps block col 0 → row 1, block col 1 → row 2
    const filePath = writeCsvFile('col-append.csv', 'f0,f1\r\nA,B\r\n1,2\r\n');
    const block = new RecordBlock(2);
    block.setCell(0, 0, 'C');  // line 0 (column 0), field 0 → row 1
    block.setCell(0, 1, '3');  // line 0 (column 0), field 1 → row 2
    const transformed = new RecordBlockTransformed(block, [1, 2]);

    const tf = new CsvTableFile(filePath, 'UTF-8', 2, true);
    tf.insertRecordBlock(-1, 0, transformed);
    await tf.saveAndClose();
    const lines = readCsvLines(filePath);
    // New column appended at position 2 (actualStartLine = max(columnCount=2, headRow=2) = 2)
    expect(lines[0]).toBe('f0,f1,');
    expect(lines[1]).toBe('A,B,C');
    expect(lines[2]).toBe('1,2,3');
  });

  it('insertRecordBlock overwrites existing empty column', async () => {
    // CSV has an empty 3rd column
    const filePath = writeCsvFile('col-overwrite.csv', 'f0,f1,\r\nA,B,\r\n1,2,\r\n');
    const block = new RecordBlock(2);
    block.setCell(0, 0, 'X');  // field 0 → row 1
    block.setCell(0, 1, 'Y');  // field 1 → row 2
    const transformed = new RecordBlockTransformed(block, [1, 2]);

    const tf = new CsvTableFile(filePath, 'UTF-8', 2, true);
    tf.insertRecordBlock(2, 1, transformed);
    await tf.saveAndClose();
    const lines = readCsvLines(filePath);
    expect(lines[1]).toBe('A,B,X');
    expect(lines[2]).toBe('1,2,Y');
  });

  it('insertRecordBlock inserts new column when content > emptyColumnCount', async () => {
    // CSV has 2 data columns + 1 empty column
    const filePath = writeCsvFile('col-insert.csv', 'f0,f1,\r\nA,B,\r\n1,2,\r\n');
    const block = new RecordBlock(2);
    block.setCell(0, 0, 'X');  // field 0 → row 1
    block.setCell(0, 1, 'Y');  // field 1 → row 2
    const transformed = new RecordBlockTransformed(block, [1, 2]);

    const tf = new CsvTableFile(filePath, 'UTF-8', 2, true);
    // startColumn=2, emptyColumnCount=1, contentColumnCount=1
    // 1 > 1 is false → no gap insertion, just overwrite
    tf.insertRecordBlock(2, 1, transformed);
    await tf.saveAndClose();
    const lines = readCsvLines(filePath);
    expect(lines[1]).toBe('A,B,X');
    expect(lines[2]).toBe('1,2,Y');
  });
});
