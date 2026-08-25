/**
 * TableFile tests — T7.1
 *
 * TableFile is the interface for writing to CSV/Excel files.
 * Since CsvTableFile and ExcelTableFile are in T7.2, this test file
 * only verifies the interface contract via a mock implementation.
 */

import { describe, it, expect } from 'vitest';
import type { RecordBlockTransformed } from '../RecordBlock';
import type { TableFile } from '../TableFile';

// Minimal mock for testing the interface contract
class MockTableFile implements TableFile {
  emptyRowsCalls: Array<{ startRow: number; count: number; fieldIndices: number[] | null }> = [];
  insertCalls: Array<{ startRow: number; emptyRowCount: number; content: RecordBlockTransformed }> = [];
  saved = false;

  emptyRows(startRow: number, count: number, fieldIndices: number[] | null): void {
    this.emptyRowsCalls.push({ startRow, count, fieldIndices });
  }

  insertRecordBlock(startRow: number, emptyRowCount: number, content: RecordBlockTransformed): void {
    this.insertCalls.push({ startRow, emptyRowCount, content });
  }

  saveAndClose(): void {
    this.saved = true;
  }
}

describe('TableFile interface (mock)', () => {
  it('emptyRows records call with null fieldIndices', () => {
    const f = new MockTableFile();
    f.emptyRows(0, 5, null);
    expect(f.emptyRowsCalls).toHaveLength(1);
    expect(f.emptyRowsCalls[0].startRow).toBe(0);
    expect(f.emptyRowsCalls[0].count).toBe(5);
    expect(f.emptyRowsCalls[0].fieldIndices).toBeNull();
  });

  it('emptyRows records call with specific fieldIndices', () => {
    const f = new MockTableFile();
    f.emptyRows(0, 3, [0, 2, 4]);
    expect(f.emptyRowsCalls[0].fieldIndices).toEqual([0, 2, 4]);
  });

  it('insertRecordBlock records call', () => {
    const f = new MockTableFile();
    // Create a minimal transformed block for the mock
    const block = { getRowCount: () => 1, getRow: () => ['test'] } as unknown as RecordBlockTransformed;
    f.insertRecordBlock(0, 0, block);
    expect(f.insertCalls).toHaveLength(1);
    expect(f.insertCalls[0].startRow).toBe(0);
    expect(f.insertCalls[0].emptyRowCount).toBe(0);
  });

  it('saveAndClose marks saved', () => {
    const f = new MockTableFile();
    expect(f.saved).toBe(false);
    f.saveAndClose();
    expect(f.saved).toBe(true);
  });
});
