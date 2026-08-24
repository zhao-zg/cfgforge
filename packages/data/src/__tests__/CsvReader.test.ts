/**
 * CsvReader tests — TypeScript port of Java `configgen.data.ReadCsv`.
 *
 * Uses real sample files from samples/buff/ and samples/test/.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { readCsv } from '../CsvReader';
import { EMPTY_ROW } from '../DRawRow';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BUFFCLASS_CSV = path.join(REPO_ROOT, 'samples', 'buff', 'buffclass.csv');
const TRIGGEREVT_CSV = path.join(REPO_ROOT, 'samples', 'buff', 'triggerevt.csv');
const TEST2_CSV = path.join(REPO_ROOT, 'samples', 'test', 'test2.csv');

describe('CsvReader (readCsv)', () => {
  it('reads buffclass.csv and returns a ReadResult', () => {
    const result = readCsv(BUFFCLASS_CSV, 'buff/buffclass.csv', 'buff.buffclass', 0, ',', 'utf-8');
    expect(result).toBeDefined();
    expect(result.sheets.length).toBe(1);
    expect(result.stat.cellCsvCount).toBeGreaterThan(0);
    expect(result.nullableAddTag).toBeNull();
  });

  it('has correct tableName and index in the OneSheet', () => {
    const result = readCsv(BUFFCLASS_CSV, 'buff/buffclass.csv', 'buff.buffclass', 0, ',', 'utf-8');
    const sheet = result.sheets[0];
    expect(sheet.tableName).toBe('buff.buffclass');
    expect(sheet.sheet.index).toBe(0);
  });

  it('has empty sheetName (CSV is not Excel)', () => {
    const result = readCsv(BUFFCLASS_CSV, 'buff/buffclass.csv', 'buff.buffclass', 0, ',', 'utf-8');
    expect(result.sheets[0].sheet.sheetName).toBe('');
  });

  it('isCsv() returns true for CSV sheets', () => {
    const result = readCsv(BUFFCLASS_CSV, 'buff/buffclass.csv', 'buff.buffclass', 0, ',', 'utf-8');
    expect(result.sheets[0].sheet.isCsv()).toBe(true);
  });

  it('has correct relativeFilePath', () => {
    const result = readCsv(BUFFCLASS_CSV, 'buff/buffclass.csv', 'buff.buffclass', 0, ',', 'utf-8');
    expect(result.sheets[0].sheet.relativeFilePath).toBe('buff/buffclass.csv');
  });

  it('reads header row correctly', () => {
    const result = readCsv(BUFFCLASS_CSV, 'buff/buffclass.csv', 'buff.buffclass', 0, ',', 'utf-8');
    const rows = result.sheets[0].sheet.rows;

    // Row 0: header
    expect(rows[0].cell(0)).toBe('id');
    expect(rows[0].cell(1)).toBe('name');
    expect(rows[0].cell(2)).toBe('策划说明');

    // Row 1: field names (same as header for this file)
    expect(rows[1].cell(0)).toBe('id');
    expect(rows[1].cell(1)).toBe('name');
    // cell 2 is empty (trailing comma after "策划说明," → empty field)
    expect(rows[1].cell(2)).toBe('');
  });

  it('reads data rows correctly', () => {
    const result = readCsv(BUFFCLASS_CSV, 'buff/buffclass.csv', 'buff.buffclass', 0, ',', 'utf-8');
    const rows = result.sheets[0].sheet.rows;

    // Row 2: 1,Stun,晕眩,
    expect(rows[2].cell(0)).toBe('1');
    expect(rows[2].cell(1)).toBe('Stun');
    expect(rows[2].cell(2)).toBe('晕眩');

    // Row 3: 2,Charm,魅惑,
    expect(rows[3].cell(0)).toBe('2');
    expect(rows[3].cell(1)).toBe('Charm');
    expect(rows[3].cell(2)).toBe('魅惑');

    // Row 4: 4,Sleep,昏睡,
    expect(rows[4].cell(0)).toBe('4');
    expect(rows[4].cell(1)).toBe('Sleep');
    expect(rows[4].cell(2)).toBe('昏睡');
  });

  it('cell values are trimmed', () => {
    const result = readCsv(BUFFCLASS_CSV, 'buff/buffclass.csv', 'buff.buffclass', 0, ',', 'utf-8');
    const rows = result.sheets[0].sheet.rows;

    // CSV uses spaces around values — cell() should trim
    expect(rows[2].cell(1)).not.toMatch(/^\s|\s$/);
  });

  it('cellCount matches row length', () => {
    const result = readCsv(BUFFCLASS_CSV, 'buff/buffclass.csv', 'buff.buffclass', 0, ',', 'utf-8');
    const rows = result.sheets[0].sheet.rows;

    // Each row in buffclass.csv has 4 fields (id,name,策划说明,empty-after-trailing-comma)
    expect(rows[0].count()).toBe(4);
    expect(rows[1].count()).toBe(4);
    expect(rows[2].count()).toBe(4);
  });

  it('out-of-bounds cell returns empty string', () => {
    const result = readCsv(BUFFCLASS_CSV, 'buff/buffclass.csv', 'buff.buffclass', 0, ',', 'utf-8');
    const rows = result.sheets[0].sheet.rows;

    expect(rows[0].cell(100)).toBe('');
    expect(rows[0].cell(-1)).toBe('');
  });

  it('reads triggerevt.csv with Chinese text', () => {
    const result = readCsv(TRIGGEREVT_CSV, 'buff/triggerevt.csv', 'buff.triggerevt', 0, ',', 'utf-8');
    const rows = result.sheets[0].sheet.rows;

    expect(rows.length).toBeGreaterThan(10);

    // Header
    expect(rows[0].cell(0)).toBe('id');
    expect(rows[0].cell(1)).toBe('name');
    expect(rows[0].cell(2)).toBe('策划说明');

    // Data row: 1,RecvDamage,受到伤害事件,
    expect(rows[2].cell(0)).toBe('1');
    expect(rows[2].cell(1)).toBe('RecvDamage');
    expect(rows[2].cell(2)).toBe('受到伤害事件');

    // Row with longer Chinese text
    // 3,LiveTime,存活到一定时间触发,例如boss存活多久后，不掉落
    expect(rows[4].cell(0)).toBe('3');
    expect(rows[4].cell(1)).toBe('LiveTime');
    expect(rows[4].cell(2)).toContain('存活到一定时间触发');
    expect(rows[4].cell(3)).toContain('不掉落');
  });

  it('reads test2.csv with empty first column', () => {
    const result = readCsv(TEST2_CSV, 'test/test2.csv', 'test.test2', 0, ',', 'utf-8');
    const rows = result.sheets[0].sheet.rows;

    expect(rows.length).toBeGreaterThanOrEqual(2);

    // Row 0: ,名称,固定长度为3的布尔列表,,,条件，使用pack进行压缩
    expect(rows[0].cell(0)).toBe('');
    expect(rows[0].cell(1)).toBe('名称');
    expect(rows[0].cell(2)).toContain('固定长度为3的布尔列表');
    expect(rows[0].cell(5)).toContain('条件');

    // Row 1: id,name,testBools._1,_2,_3,cond
    expect(rows[1].cell(0)).toBe('id');
    expect(rows[1].cell(1)).toBe('name');
    expect(rows[1].cell(2)).toBe('testBools._1');
    expect(rows[1].cell(3)).toBe('_2');
    expect(rows[1].cell(4)).toBe('_3');
    expect(rows[1].cell(5)).toBe('cond');
  });

  it('supports custom field separator', () => {
    // Create a temp TSV file to test
    const tmpContent = 'a\tb\tc\n1\t2\t3\n';
    const tmpPath = path.join(REPO_ROOT, '.temp', 'test_tsv.csv');
    
    // Ensure .temp exists
    const fs = require('fs');
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, tmpContent, 'utf8');

    try {
      const result = readCsv(tmpPath, 'test_tsv.csv', 'test_tsv', 0, '\t', 'utf-8');
      const rows = result.sheets[0].sheet.rows;

      expect(rows.length).toBe(2);
      expect(rows[0].cell(0)).toBe('a');
      expect(rows[0].cell(1)).toBe('b');
      expect(rows[0].cell(2)).toBe('c');
      expect(rows[1].cell(0)).toBe('1');
      expect(rows[1].cell(1)).toBe('2');
      expect(rows[1].cell(2)).toBe('3');
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });

  it('supports nullableAddTag parameter', () => {
    const result = readCsv(BUFFCLASS_CSV, 'buff/buffclass.csv', 'buff.buffclass', 0, ',', 'utf-8', '-client');
    expect(result.nullableAddTag).toBe('-client');
  });

  it('supports non-zero index parameter', () => {
    const result = readCsv(BUFFCLASS_CSV, 'buff/buffclass.csv', 'buff.buffclass', 3, ',', 'utf-8');
    expect(result.sheets[0].sheet.index).toBe(3);
  });

  it('DRawSheet.id() returns relativeFilePath for CSV', () => {
    const result = readCsv(BUFFCLASS_CSV, 'buff/buffclass.csv', 'buff.buffclass', 0, ',', 'utf-8');
    // For CSV, sheetName is empty, so id() returns relativeFilePath
    expect(result.sheets[0].sheet.id()).toBe('buff/buffclass.csv');
  });

  it('cellCsvCount stat is accumulated', () => {
    const result = readCsv(BUFFCLASS_CSV, 'buff/buffclass.csv', 'buff.buffclass', 0, ',', 'utf-8');
    // 5 rows × 4 columns = 20
    expect(result.stat.cellCsvCount).toBe(20);
  });

  it('reads empty CSV file gracefully', () => {
    const tmpPath = path.join(REPO_ROOT, '.temp', 'test_empty.csv');
    const fs = require('fs');
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, '', 'utf8');

    try {
      const result = readCsv(tmpPath, 'test_empty.csv', 'test_empty', 0, ',', 'utf-8');
      expect(result.sheets[0].sheet.rows.length).toBe(0);
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });
});
