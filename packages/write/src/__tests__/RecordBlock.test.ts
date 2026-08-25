/**
 * RecordBlock tests — T7.1
 *
 * RecordBlock is a 2D string array builder with dynamic row expansion.
 * RecordBlockTransformed maps block columns to data file column indices.
 */

import { describe, it, expect } from 'vitest';
import { RecordBlock, RecordBlockTransformed } from '../RecordBlock';

describe('RecordBlock', () => {
  it('starts with getRowCount 0 (no cells set)', () => {
    const block = new RecordBlock(3);
    expect(block.getRowCount()).toBe(0);
  });

  it('setCell sets values and tracks maxRow', () => {
    const block = new RecordBlock(3);
    block.setCell(0, 0, 'a');
    block.setCell(0, 1, 'b');
    block.setCell(0, 2, 'c');
    expect(block.getRowCount()).toBe(1);

    block.setCell(2, 0, 'd');
    expect(block.getRowCount()).toBe(3);
  });

  it('throws on negative row or col', () => {
    const block = new RecordBlock(2);
    expect(() => block.setCell(-1, 0, 'x')).toThrow();
    expect(() => block.setCell(0, -1, 'x')).toThrow();
  });

  it('throws on col >= maxColumns', () => {
    const block = new RecordBlock(2);
    expect(() => block.setCell(0, 2, 'x')).toThrow();
  });

  it('dynamically expands rows beyond initial capacity', () => {
    const block = new RecordBlock(1);
    // Initial capacity is 4 rows; write to row 10
    block.setCell(10, 0, 'far');
    expect(block.getRowCount()).toBe(11);
  });

  it('setCell overwrites previous value at same position', () => {
    const block = new RecordBlock(2);
    block.setCell(0, 0, 'old');
    block.setCell(0, 0, 'new');
    // Verify via transformed block
    const t = new RecordBlockTransformed(block, [0, 1]);
    expect(t.getRow(0)![0]).toBe('new');
  });

  it('null rows (not set) are preserved as null in internal array', () => {
    const block = new RecordBlock(2);
    block.setCell(0, 0, 'a');
    block.setCell(2, 0, 'c');
    // Row 1 was never set → getRow returns null
    const t = new RecordBlockTransformed(block, [0, 1]);
    expect(t.getRow(0)).not.toBeNull();
    expect(t.getRow(1)).toBeNull();
    expect(t.getRow(2)).not.toBeNull();
  });
});

describe('RecordBlockTransformed', () => {
  it('maps block columns to data file column indices', () => {
    const block = new RecordBlock(3);
    block.setCell(0, 0, 'a');
    block.setCell(0, 1, 'b');
    block.setCell(0, 2, 'c');

    // fieldIndices: [2, 5, 7] → block col 0 → data col 2, etc.
    const t = new RecordBlockTransformed(block, [2, 5, 7]);
    const row = t.getRow(0)!;
    expect(row.length).toBe(8); // dataMaxColumns = max(7) + 1 = 8
    expect(row[2]).toBe('a');
    expect(row[5]).toBe('b');
    expect(row[7]).toBe('c');
  });

  it('getRowCount delegates to block', () => {
    const block = new RecordBlock(2);
    block.setCell(1, 0, 'x');
    const t = new RecordBlockTransformed(block, [0, 1]);
    expect(t.getRowCount()).toBe(2);
  });

  it('throws on invalid row index', () => {
    const block = new RecordBlock(2);
    block.setCell(0, 0, 'x');
    const t = new RecordBlockTransformed(block, [0, 1]);
    expect(() => t.getRow(-1)).toThrow();
    expect(() => t.getRow(1)).toThrow(); // only row 0 exists
  });

  it('throws when fieldIndices size != block columns', () => {
    const block = new RecordBlock(3);
    expect(() => new RecordBlockTransformed(block, [0, 1])).toThrow();
  });

  it('returns null for rows where block has no data', () => {
    const block = new RecordBlock(2);
    block.setCell(0, 0, 'a');
    block.setCell(2, 0, 'c');
    const t = new RecordBlockTransformed(block, [0, 1]);
    expect(t.getRow(1)).toBeNull();
  });
});
