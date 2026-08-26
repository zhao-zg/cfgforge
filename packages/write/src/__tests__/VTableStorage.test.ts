/**
 * VTableStorage tests — T7.2
 *
 * Tests cover:
 * - computePhysicalRowCount: traverses value tree to find row span
 * - addOrUpdateRecord: add (append) and update (replace) flows
 * - deleteRecord: blank rows flow
 *
 * Since RecordBlockMapper (T7.6) is not yet implemented, we inject a
 * mock mapToBlockFn that builds a simple RecordBlock from VStruct.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { VTableStorage } from '../storages/VTableStorage';
import { RecordBlock } from '../RecordBlock';
import { DCell, DRowId, DRawSheet, DTable, DCellList } from '@cfgforge/data';

const TEMP_DIR = path.join(__dirname, '..', '..', '..', '..', '.temp', 'write-vtablestorage-tests');

function ensureTempDir(): void {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

/**
 * Create a simple CSV file with header + data rows.
 */
function createCsvFile(name: string, lines: string[]): string {
  const filePath = path.join(TEMP_DIR, name);
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
  return filePath;
}

/**
 * Read a CSV file and return its lines.
 */
function readCsvLines(filePath: string): string[] {
  return fs.readFileSync(filePath, 'utf-8').split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.length > 0);
}

/**
 * Mock mapToBlock: builds a RecordBlock with a single row containing
 * the cell values from the VStruct mock.
 */
function mockMapToBlock(record: any): RecordBlock {
  // record.cells is an array of strings on the mock
  const cells: string[] = record._mockCells || ['val'];
  const block = new RecordBlock(cells.length);
  for (let i = 0; i < cells.length; i++) {
    block.setCell(0, i, cells[i]);
  }
  return block;
}

/**
 * Create a mock VStruct with a DCell source at the given row.
 */
function mockVStruct(row: number, fileName: string, cells: string[] = ['val']): any {
  const rowId = new DRowId(fileName, '', row);
  const dcell = new DCell('val', rowId, 0, 0);
  return {
    source: dcell,
    schema: { isColumnMode: false },
    values: [],
    _mockCells: cells,
  };
}

/**
 * Create a mock VStruct with DCellList source (multi-row record).
 */
function mockVStructMultiRow(rows: number[], fileName: string, cellsPerRow: string[][]): any {
  const dcells = rows.map((r, i) => {
    const rowId = new DRowId(fileName, '', r);
    return new DCell(cellsPerRow[i]?.[0] || 'val', rowId, 0, 0);
  });
  const cellList = new DCellList(dcells);
  return {
    source: cellList,
    schema: { isColumnMode: false },
    values: [],
    _mockCells: cellsPerRow[0] || ['val'],
  };
}

describe('VTableStorage', () => {
  beforeEach(() => {
    ensureTempDir();
    VTableStorage.mapToBlockFn = mockMapToBlock;
  });
  afterEach(() => {
    VTableStorage.mapToBlockFn = (_record: any): RecordBlock => {
      throw new Error('RecordBlockMapper not yet wired');
    };
  });

  describe('computePhysicalRowCount (via deleteRecord)', () => {
    it('deletes a single-row record from a CSV file', async () => {
      const csvPath = createCsvFile('del-single.csv', [
        'comment',
        'name,age',
        'Alice,30',
        'Bob,25',
      ]);
      const dataDir = TEMP_DIR;

      // Mock context
      const context = {
        contextCfg: () => ({
          dataDir,
          headRow: { rowCount: () => 2 },
          csvOrTsvDefaultEncoding: 'UTF-8',
        }),
      } as any;

      // Mock DTable with a DRawSheet matching the CSV
      const sheet = new DRawSheet('del-single.csv', '', 0, [], [0, 1]);
      const dTable = new DTable('test', [], [], [sheet], null);

      // Mock VStruct at row 2 (0-based, the "Alice,30" row)
      const oldRecord = mockVStruct(2, 'del-single.csv', ['Alice', '30']);

      const resultSheet = await VTableStorage.deleteRecord(context, dTable, oldRecord);

      expect(resultSheet).toBe(sheet);
      const lines = readCsvLines(csvPath);
      // Row 2 should be blanked (empty values → just commas)
      expect(lines[2]).toBe(',');
    });

    it('deletes a multi-row record spanning physical rows', async () => {
      const csvPath = createCsvFile('del-multi.csv', [
        'comment',
        'name,age',
        'Alice,30',
        'Alice2,31',
        'Alice3,32',
        'Bob,25',
      ]);
      const dataDir = TEMP_DIR;

      const context = {
        contextCfg: () => ({
          dataDir,
          headRow: { rowCount: () => 2 },
          csvOrTsvDefaultEncoding: 'UTF-8',
        }),
      } as any;

      const sheet = new DRawSheet('del-multi.csv', '', 0, [], [0, 1]);
      const dTable = new DTable('test', [], [], [sheet], null);

      // Mock VStruct with DCellList covering rows 2-4
      const oldRecord = mockVStructMultiRow(
        [2, 3, 4],
        'del-multi.csv',
        [['Alice'], ['Alice2'], ['Alice3']],
      );

      await VTableStorage.deleteRecord(context, dTable, oldRecord);

      const lines = readCsvLines(csvPath);
      // Rows 2-4 should be blanked
      expect(lines[2]).toBe(',');
      expect(lines[3]).toBe(',');
      expect(lines[4]).toBe(',');
    });
  });

  describe('addOrUpdateRecord — add (append)', () => {
    it('appends a new record to the end of a CSV file', async () => {
      const csvPath = createCsvFile('add-append.csv', [
        'comment',
        'name,age',
        'Alice,30',
      ]);
      const dataDir = TEMP_DIR;

      const context = {
        contextCfg: () => ({
          dataDir,
          headRow: { rowCount: () => 2 },
          csvOrTsvDefaultEncoding: 'UTF-8',
        }),
      } as any;

      const sheet = new DRawSheet('add-append.csv', '', 0, [], [0, 1]);
      const dTable = new DTable('test', [], [], [sheet], null);

      // Mock VTable — primaryKeyMap does not contain the pkValue
      const vTable = {
        schema: { isColumnMode: false },
        primaryKeyMap: new Map(),
      } as any;

      const newRecord = mockVStruct(0, '', ['Charlie', '40']);

      const resultSheet = await VTableStorage.addOrUpdateRecord(
        context,
        vTable,
        dTable,
        { source: null } as any, // pkValue
        newRecord,
      );

      expect(resultSheet).toBe(sheet);
      const lines = readCsvLines(csvPath);
      // Should have appended a new row at the end
      expect(lines.length).toBeGreaterThanOrEqual(3);
      // The appended row should contain "Charlie"
      const lastLine = lines[lines.length - 1];
      expect(lastLine).toContain('Charlie');
    });
  });

  describe('addOrUpdateRecord — update (replace)', () => {
    it('replaces an existing record in-place', async () => {
      const csvPath = createCsvFile('update-inplace.csv', [
        'comment',
        'name,age',
        'Alice,30',
        'Bob,25',
      ]);
      const dataDir = TEMP_DIR;

      const context = {
        contextCfg: () => ({
          dataDir,
          headRow: { rowCount: () => 2 },
          csvOrTsvDefaultEncoding: 'UTF-8',
        }),
      } as any;

      const sheet = new DRawSheet('update-inplace.csv', '', 0, [], [0, 1]);
      const dTable = new DTable('test', [], [], [sheet], null);

      // oldRecord at row 2 (Alice,30)
      const oldRecord = mockVStruct(2, 'update-inplace.csv', ['Alice', '30']);

      // Mock VTable — primaryKeyMap contains the pkValue → oldRecord
      const pkValue = { source: null } as any;
      const vTable = {
        schema: { isColumnMode: false },
        primaryKeyMap: new Map([[pkValue, oldRecord]]),
      } as any;

      // newRecord has new values
      const newRecord = mockVStruct(0, '', ['Alicia', '35']);

      const resultSheet = await VTableStorage.addOrUpdateRecord(
        context,
        vTable,
        dTable,
        pkValue,
        newRecord,
      );

      expect(resultSheet).toBe(sheet);
      const lines = readCsvLines(csvPath);
      // Row 2 should now contain "Alicia"
      expect(lines[2]).toContain('Alicia');
      expect(lines[2]).not.toContain('Alice,30');
    });
  });

  describe('mapToBlockFn not wired', () => {
    it('throws if mapToBlockFn is not set before calling addOrUpdate', async () => {
      VTableStorage.mapToBlockFn = (_record: any): RecordBlock => {
        throw new Error('Not wired');
      };

      const csvPath = createCsvFile('throw-test.csv', [
        'comment',
        'name,age',
      ]);
      const dataDir = TEMP_DIR;
      const context = {
        contextCfg: () => ({
          dataDir,
          headRow: { rowCount: () => 2 },
          csvOrTsvDefaultEncoding: 'UTF-8',
        }),
      } as any;
      const sheet = new DRawSheet('throw-test.csv', '', 0, [], [0, 1]);
      const dTable = new DTable('test', [], [], [sheet], null);
      const vTable = {
        schema: { isColumnMode: false },
        primaryKeyMap: new Map(),
      } as any;
      const newRecord = mockVStruct(0, '', ['X']);

      await expect(
        VTableStorage.addOrUpdateRecord(context, vTable, dTable, { source: null } as any, newRecord),
      ).rejects.toThrow('Not wired');
    });
  });
});
