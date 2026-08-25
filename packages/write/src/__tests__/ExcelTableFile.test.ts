/**
 * ExcelTableFile tests — T7.2
 *
 * Row mode: line = row
 * Column mode: line = column
 *
 * Uses temp .xlsx files in .temp/ for round-trip read-write tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { ExcelTableFile } from '../storages/ExcelTableFile';
import { RecordBlock, RecordBlockTransformed } from '../RecordBlock';

const TEMP_DIR = path.join(__dirname, '..', '..', '..', '..', '.temp', 'write-excel-tests');

function ensureTempDir(): void {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

/**
 * Create a simple .xlsx file with given sheet name and cell data.
 * data[row][col] — 0-based indices.
 */
async function createExcelFile(
  name: string,
  sheetName: string,
  data: string[][],
): Promise<string> {
  const filePath = path.join(TEMP_DIR, name);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < data[r].length; c++) {
      ws.getRow(r + 1).getCell(c + 1).value = data[r][c];
    }
  }
  await wb.xlsx.writeFile(filePath);
  return filePath;
}

async function readExcelSheet(
  filePath: string,
  sheetName: string,
  minRows: number = 0,
  minCols: number = 0,
): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error('Sheet not found: ' + sheetName);

  const maxRow = Math.max(ws.actualRowCount, minRows);
  const result: string[][] = [];
  for (let r = 1; r <= maxRow; r++) {
    const row = ws.getRow(r);
    const cellCount = Math.max(row.cellCount, minCols);
    const cells: string[] = [];
    for (let c = 1; c <= cellCount; c++) {
      const v = row.getCell(c).value;
      cells.push(v === null || v === undefined ? '' : String(v));
    }
    // Pad to minCols if needed (trailing empty cells not counted by ExcelJS)
    while (cells.length < minCols) {
      cells.push('');
    }
    result.push(cells);
  }
  return result;
}

describe('ExcelTableFile — Row Mode', () => {
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

  it('opens an existing Excel file', async () => {
    const filePath = await createExcelFile('row-read.xlsx', 'Sheet1', [
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
    const tf = await ExcelTableFile.create(filePath, 'Sheet1', 2, false);
    expect(tf).toBeDefined();
  });

  it('throws when file does not exist', async () => {
    await expect(ExcelTableFile.create('nonexistent.xlsx', 'Sheet1', 2, false))
      .rejects.toThrow('does not exist');
  });

  it('throws when sheet does not exist', async () => {
    const filePath = await createExcelFile('row-nosheet.xlsx', 'Sheet1', [['a']]);
    await expect(ExcelTableFile.create(filePath, 'WrongSheet', 2, false))
      .rejects.toThrow('Sheet does not exist');
  });

  it('emptyRows clears specified rows fully when fieldIndices is null', async () => {
    const filePath = await createExcelFile('row-empty.xlsx', 'Sheet1', [
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
    const tf = await ExcelTableFile.create(filePath, 'Sheet1', 2, false);
    tf.emptyRows(2, 1, null);
    await tf.saveAndClose();
    const data = await readExcelSheet(filePath, 'Sheet1', 3, 3);
    // Row 2 (0-based) should be all empty
    expect(data[2]).toEqual(['', '', '']);
  });

  it('emptyRows clears only specified fieldIndices on first row', async () => {
    const filePath = await createExcelFile('row-empty-fields.xlsx', 'Sheet1', [
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
    const tf = await ExcelTableFile.create(filePath, 'Sheet1', 2, false);
    // Clear row 1 (0-based) cols 0 and 2, leave col 1 intact
    tf.emptyRows(1, 1, [0, 2]);
    await tf.saveAndClose();
    const data = await readExcelSheet(filePath, 'Sheet1', 3, 3);
    // Row 1: col 0 and 2 cleared, col 1 preserved
    expect(data[1]).toEqual(['', '2', '']);
    // Row 2 untouched
    expect(data[2]).toEqual(['4', '5', '6']);
  });

  it('insertRecordBlock appends to end when startRow is -1', async () => {
    const filePath = await createExcelFile('row-append.xlsx', 'Sheet1', [
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
    const block = new RecordBlock(3);
    block.setCell(0, 0, 'x');
    block.setCell(0, 1, 'y');
    block.setCell(0, 2, 'z');
    const transformed = new RecordBlockTransformed(block, [0, 1, 2]);

    const tf = await ExcelTableFile.create(filePath, 'Sheet1', 2, false);
    tf.insertRecordBlock(-1, 0, transformed);
    await tf.saveAndClose();
    const data = await readExcelSheet(filePath, 'Sheet1', 3, 3);
    expect(data[2]).toEqual(['x', 'y', 'z']);
  });

  it('insertRecordBlock overwrites existing empty row', async () => {
    const filePath = await createExcelFile('row-overwrite.xlsx', 'Sheet1', [
      ['a', 'b', 'c'],
      ['', '', ''],
    ]);
    const block = new RecordBlock(2);
    block.setCell(0, 0, 'aa');
    block.setCell(0, 1, 'bb');
    const transformed = new RecordBlockTransformed(block, [0, 1]);

    const tf = await ExcelTableFile.create(filePath, 'Sheet1', 2, false);
    tf.insertRecordBlock(2, 1, transformed);
    await tf.saveAndClose();
    const data = await readExcelSheet(filePath, 'Sheet1', 3, 3);
    expect(data[2]).toEqual(['aa', 'bb', '']);
  });

  it('insertRecordBlock shifts rows down when content > emptyRowCount', async () => {
    const filePath = await createExcelFile('row-shift.xlsx', 'Sheet1', [
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['9', '9', '9'],
    ]);
    const block = new RecordBlock(2);
    block.setCell(0, 0, 'aa');
    block.setCell(0, 1, 'bb');
    block.setCell(1, 0, 'cc');
    block.setCell(1, 1, 'dd');
    const transformed = new RecordBlockTransformed(block, [0, 1]);

    const tf = await ExcelTableFile.create(filePath, 'Sheet1', 2, false);
    tf.insertRecordBlock(2, 0, transformed);
    await tf.saveAndClose();
    const data = await readExcelSheet(filePath, 'Sheet1', 5, 3);
    expect(data[2]).toEqual(['aa', 'bb', '']);
    expect(data[3]).toEqual(['cc', 'dd', '']);
    expect(data[4]).toEqual(['9', '9', '9']);
  });

  it('insertRecordBlock maps block columns to fieldIndices positions', async () => {
    const filePath = await createExcelFile('row-fmap.xlsx', 'Sheet1', [
      ['a', 'b', 'c'],
      ['', '', ''],
    ]);
    const block = new RecordBlock(2);
    block.setCell(0, 0, 'first');
    block.setCell(0, 1, 'third');
    const transformed = new RecordBlockTransformed(block, [0, 2]);

    const tf = await ExcelTableFile.create(filePath, 'Sheet1', 2, false);
    tf.insertRecordBlock(2, 1, transformed);
    await tf.saveAndClose();
    const data = await readExcelSheet(filePath, 'Sheet1', 3, 3);
    expect(data[2]).toEqual(['first', '', 'third']);
  });
});

describe('ExcelTableFile — Column Mode', () => {
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

  it('opens a column-mode Excel file', async () => {
    const filePath = await createExcelFile('col-read.xlsx', 'Sheet1', [
      ['f0', 'f1', 'f2'],
      ['A', 'B', 'C'],
      ['1', '2', '3'],
    ]);
    const tf = await ExcelTableFile.create(filePath, 'Sheet1', 2, true);
    expect(tf).toBeDefined();
  });

  it('emptyRows clears columns when fieldIndices is null', async () => {
    const filePath = await createExcelFile('col-empty.xlsx', 'Sheet1', [
      ['f0', 'f1', 'f2'],
      ['A', 'B', 'C'],
      ['1', '2', '3'],
    ]);
    const tf = await ExcelTableFile.create(filePath, 'Sheet1', 2, true);
    // Clear columns 0 and 1
    tf.emptyRows(0, 2, null);
    await tf.saveAndClose();
    const data = await readExcelSheet(filePath, 'Sheet1', 3, 3);
    // Column 0 and 1 should be empty, column 2 preserved
    expect(data[1]).toEqual(['', '', 'C']);
    expect(data[2]).toEqual(['', '', '3']);
  });

  it('insertRecordBlock appends new column when startRow is -1', async () => {
    const filePath = await createExcelFile('col-append.xlsx', 'Sheet1', [
      ['f0', 'f1'],
      ['A', 'B'],
      ['1', '2'],
    ]);
    // fieldIndices = [1, 2] maps block col 0 → row 1, block col 1 → row 2
    const block = new RecordBlock(2);
    block.setCell(0, 0, 'C');
    block.setCell(0, 1, '3');
    const transformed = new RecordBlockTransformed(block, [1, 2]);

    const tf = await ExcelTableFile.create(filePath, 'Sheet1', 2, true);
    tf.insertRecordBlock(-1, 0, transformed);
    await tf.saveAndClose();
    const data = await readExcelSheet(filePath, 'Sheet1', 3, 3);
    // New column at position 2
    expect(data[1]).toEqual(['A', 'B', 'C']);
    expect(data[2]).toEqual(['1', '2', '3']);
  });

  it('insertRecordBlock overwrites existing empty column', async () => {
    const filePath = await createExcelFile('col-overwrite.xlsx', 'Sheet1', [
      ['f0', 'f1', ''],
      ['A', 'B', ''],
      ['1', '2', ''],
    ]);
    const block = new RecordBlock(2);
    block.setCell(0, 0, 'X');
    block.setCell(0, 1, 'Y');
    const transformed = new RecordBlockTransformed(block, [1, 2]);

    const tf = await ExcelTableFile.create(filePath, 'Sheet1', 2, true);
    tf.insertRecordBlock(2, 1, transformed);
    await tf.saveAndClose();
    const data = await readExcelSheet(filePath, 'Sheet1', 3, 3);
    expect(data[1]).toEqual(['A', 'B', 'X']);
    expect(data[2]).toEqual(['1', '2', 'Y']);
  });
});
