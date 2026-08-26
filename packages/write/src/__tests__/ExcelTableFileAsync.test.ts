/**
 * ExcelTableFile async tests — create/saveAndClose via CfgFileSystem (T12.0d)
 *
 * Tests cover:
 * - create: opens existing Excel file via async CfgFileSystem.exists
 * - saveAndClose: writes temp + atomic rename via CfgFileSystem
 * - Verifies round-trip read/write works with CfgFileSystem abstraction
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { ExcelTableFile } from '../storages/ExcelTableFile';
import { RecordBlock, RecordBlockTransformed } from '../RecordBlock';
import { setDefaultFileSystem, NodeFileSystem } from '@cfgforge/shared';

const TEMP_DIR = path.join(__dirname, '..', '..', '..', '..', '.temp', 'write-excel-async-tests');

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
    while (cells.length < minCols) {
      cells.push('');
    }
    result.push(cells);
  }
  return result;
}

describe('ExcelTableFile async (CfgFileSystem)', () => {
  beforeEach(() => {
    ensureTempDir();
    setDefaultFileSystem(new NodeFileSystem());
  });
  afterEach(() => {
    if (fs.existsSync(TEMP_DIR)) {
      const files = fs.readdirSync(TEMP_DIR);
      for (const f of files) {
        if (f.startsWith('async-')) {
          try { fs.unlinkSync(path.join(TEMP_DIR, f)); } catch { /* ignore */ }
        }
      }
    }
  });

  it('opens an existing Excel file via CfgFileSystem.exists', async () => {
    const filePath = await createExcelFile('async-read.xlsx', 'Sheet1', [
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
    const tf = await ExcelTableFile.create(filePath, 'Sheet1', 2, false);
    expect(tf).toBeDefined();
  });

  it('throws when file does not exist (via CfgFileSystem.exists)', async () => {
    await expect(ExcelTableFile.create('nonexistent-async.xlsx', 'Sheet1', 2, false))
      .rejects.toThrow('does not exist');
  });

  it('throws when sheet does not exist', async () => {
    const filePath = await createExcelFile('async-nosheet.xlsx', 'Sheet1', [['a']]);
    await expect(ExcelTableFile.create(filePath, 'WrongSheet', 2, false))
      .rejects.toThrow('Sheet does not exist');
  });

  it('saveAndClose writes and renames via CfgFileSystem', async () => {
    const filePath = await createExcelFile('async-save.xlsx', 'Sheet1', [
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
    const tf = await ExcelTableFile.create(filePath, 'Sheet1', 2, false);
    tf.emptyRows(2, 1, null);
    await tf.saveAndClose();

    const data = await readExcelSheet(filePath, 'Sheet1', 3, 3);
    expect(data[2]).toEqual(['', '', '']);
  });

  it('saveAndClose with insertRecordBlock appends via CfgFileSystem', async () => {
    const filePath = await createExcelFile('async-append.xlsx', 'Sheet1', [
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

  it('does not leave .tmp file after saveAndClose', async () => {
    const filePath = await createExcelFile('async-tmp.xlsx', 'Sheet1', [
      ['a', 'b'],
      ['1', '2'],
    ]);
    const tf = await ExcelTableFile.create(filePath, 'Sheet1', 2, false);
    tf.emptyRows(1, 1, null);
    await tf.saveAndClose();

    // .tmp file should not exist after saveAndClose
    expect(fs.existsSync(filePath + '.tmp')).toBe(false);
    // Original file should still exist
    expect(fs.existsSync(filePath)).toBe(true);
  });
});
