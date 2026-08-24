/**
 * DRowId tests — TypeScript port of Java `configgen.data.CfgData.DRowId`.
 */

import { describe, it, expect } from 'vitest';
import { DRowId } from '../DRowId';

describe('DRowId', () => {
  it('constructs with fileName, sheetName, row', () => {
    const id = new DRowId('buff/buffclass.csv', '', 3);
    expect(id.fileName).toBe('buff/buffclass.csv');
    expect(id.sheetName).toBe('');
    expect(id.row).toBe(3);
  });

  it('constructs with sheetName for Excel', () => {
    const id = new DRowId('ai/ai.xlsx', 'AI_ACTION', 5);
    expect(id.fileName).toBe('ai/ai.xlsx');
    expect(id.sheetName).toBe('AI_ACTION');
    expect(id.row).toBe(5);
  });
});
