/**
 * ExcelReader tests — TypeScript port of Java `configgen.data.ReadByFastExcel`.
 *
 * Uses the real example/config/ai_行为/ai行为.xlsx file.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { readExcel } from '../ExcelReader';
import { EMPTY_ROW } from '../DRawRow';
import { getTableNameIndex } from '../DataUtil';

// Resolve the test xlsx file path relative to this test file
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const XLSX_PATH = path.join(REPO_ROOT, 'example', 'config', 'ai_行为', 'ai行为.xlsx');
const RELATIVE_PATH = 'ai_行为/ai行为.xlsx';

describe('ExcelReader (readExcel)', () => {
  it('reads the xlsx file and returns a ReadResult', async () => {
    const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
    expect(result).toBeDefined();
    expect(result.sheets.length).toBe(4);
    expect(result.stat.excelCount).toBe(1);
    expect(result.stat.sheetCount).toBe(4);
    expect(result.stat.ignoredSheetCount).toBe(2);
    expect(result.nullableAddTag).toBeNull();
  });

  it('ignores sheets with invalid names (__CONFIG and 说明)', async () => {
    const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
    const names = result.sheets.map((s) => s.tableName);
    // __CONFIG starts with _ → getCodeName returns null → ignored
    // 说明 starts with Chinese → getCodeName returns null → ignored
    expect(names).not.toContain('ai.__CONFIG');
    expect(names).not.toContain('ai.说明');
  });

  it('parses sheet "AI中文会被忽略只要a-z开头" as tableName "ai.ai" index 0', async () => {
    const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
    const sheet = result.sheets.find((s) => s.tableName === 'ai.ai');
    expect(sheet).toBeDefined();
    expect(sheet!.sheet.index).toBe(0);
    expect(sheet!.sheet.sheetName).toBe('AI中文会被忽略只要a-z开头');
  });

  it('parses sheet "AI_CONDITION" as tableName "ai.ai_condition" index 0', async () => {
    const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
    const sheet = result.sheets.find((s) => s.tableName === 'ai.ai_condition');
    expect(sheet).toBeDefined();
    expect(sheet!.sheet.index).toBe(0);
  });

  it('parses sheet "AI_ACTION_中文测试" as tableName "ai.ai_action" index 0', async () => {
    const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
    const sheet = result.sheets.find((s) => s.tableName === 'ai.ai_action' && s.sheet.index === 0);
    expect(sheet).toBeDefined();
  });

  it('parses sheet "AI_ACTION_1_继续测试" as tableName "ai.ai_action" index 1', async () => {
    const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
    const sheet = result.sheets.find((s) => s.tableName === 'ai.ai_action' && s.sheet.index === 1);
    expect(sheet).toBeDefined();
  });

  it('has correct relativeFilePath in each DRawSheet', async () => {
    const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
    for (const s of result.sheets) {
      expect(s.sheet.relativeFilePath).toBe(RELATIVE_PATH);
    }
  });

  it('reads row data from the ai sheet (header row + field row + data rows)', async () => {
    const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
    const sheet = result.sheets.find((s) => s.tableName === 'ai.ai')!;
    const rows = sheet.sheet.rows;

    // eachRow with includeEmpty:false returns 54 non-empty rows, but row 3 is empty
    // (skipped → gap filled with EMPTY_ROW), and the last non-empty row is Excel row 55
    // (0-based index 54), so the rows array has 55 entries total.
    expect(rows.length).toBe(55);

    // Row 0 (Excel row 1): header row
    expect(rows[0].cell(0)).toBe('ID');
    expect(rows[0].cell(1)).toContain('描述');

    // Row 1 (Excel row 2): field name row
    expect(rows[1].cell(0)).toBe('ID');
    expect(rows[1].cell(1)).toBe('Desc');
    expect(rows[1].cell(2)).toBe('CondID');

    // Row 2 (Excel row 3) is EMPTY (skipped by eachRow, filled with EMPTY_ROW)
    expect(rows[2]).toBe(EMPTY_ROW);
    expect(rows[2].count()).toBe(0);
    expect(rows[2].cell(0)).toBe('');

    // Row 3 (Excel row 4): first data row
    expect(rows[3].cell(0)).toBe('1');
    expect(rows[3].cell(2)).toBe('1;2');
    expect(rows[3].cell(3)).toBe('150');   // TrigTick column, number converted to string
    expect(rows[3].cell(4)).toBe('10000'); // TrigOdds
    expect(rows[3].cell(5)).toBe('1;2');   // ActionID
    expect(rows[3].cell(6)).toBe('true');  // DeathRemove (boolean → 'true')
  });

  it('reads Chinese text from data cells correctly', async () => {
    const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
    const sheet = result.sheets.find((s) => s.tableName === 'ai.ai')!;

    // Row 4 (Excel row 5): "召唤猴子"
    expect(sheet.sheet.rows[4].cell(0)).toBe('10012');
    expect(sheet.sheet.rows[4].cell(1)).toBe('召唤猴子');
  });

  it('reads AI_CONDITION sheet data', async () => {
    const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
    const sheet = result.sheets.find((s) => s.tableName === 'ai.ai_condition')!;
    const rows = sheet.sheet.rows;

    expect(rows.length).toBeGreaterThan(5);

    // Row 0: header
    expect(rows[0].cell(0)).toBe('ID');
    expect(rows[0].cell(1)).toBe('描述');

    // Row 1: field names
    expect(rows[1].cell(0)).toBe('ID');
    expect(rows[1].cell(1)).toBe('Desc');
    expect(rows[1].cell(2)).toBe('FormulaID');

    // Row 2: first data row
    expect(rows[2].cell(0)).toBe('1');
    expect(rows[2].cell(1)).toBe('受到伤害');
  });

  it('reads AI_ACTION sheet with index 0 and index 1 separately', async () => {
    const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);

    const idx0 = result.sheets.find((s) => s.tableName === 'ai.ai_action' && s.sheet.index === 0)!;
    const idx1 = result.sheets.find((s) => s.tableName === 'ai.ai_action' && s.sheet.index === 1)!;

    // index 0 (AI_ACTION_中文测试): 35 rows
    expect(idx0.sheet.rows.length).toBeGreaterThan(10);
    expect(idx0.sheet.rows[0].cell(0)).toBe('ID');

    // index 1 (AI_ACTION_1_继续测试): 22 rows
    expect(idx1.sheet.rows.length).toBeGreaterThan(10);
    expect(idx1.sheet.rows[0].cell(0)).toBe('ID');

    // Check data from index 1
    expect(idx1.sheet.rows[2].cell(0)).toBe('10019');
    expect(idx1.sheet.rows[2].cell(1)).toBe('新手关塔\n减伤');
  });

  it('handles readSheet filter to only read a specific sheet', async () => {
    const result = await readExcel(XLSX_PATH, RELATIVE_PATH, 'AI_CONDITION');
    expect(result.sheets.length).toBe(1);
    expect(result.sheets[0].tableName).toBe('ai.ai_condition');
  });

  it('handles readSheet filter with a sheet name that has Chinese', async () => {
    const result = await readExcel(XLSX_PATH, RELATIVE_PATH, 'AI中文会被忽略只要a-z开头');
    expect(result.sheets.length).toBe(1);
    expect(result.sheets[0].tableName).toBe('ai.ai');
  });

  it('returns no sheets when readSheet matches nothing', async () => {
    const result = await readExcel(XLSX_PATH, RELATIVE_PATH, 'NoSuchSheet');
    expect(result.sheets.length).toBe(0);
  });

  it('DRawSheet.id() returns correct identifier', async () => {
    const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
    for (const s of result.sheets) {
      const id = s.sheet.id();
      expect(id).toContain(RELATIVE_PATH);
      expect(id).toContain(s.sheet.sheetName);
    }
  });

  it('DRawSheet.isCsv() returns false for Excel sheets', async () => {
    const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
    for (const s of result.sheets) {
      expect(s.sheet.isCsv()).toBe(false);
    }
  });

  it('number cells are converted to string correctly', async () => {
    const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
    const sheet = result.sheets.find((s) => s.tableName === 'ai.ai')!;
    // Excel row 4 (rows[3]): ID=1 (number), TrigTick=150 (number), TrigOdds=10000 (number)
    expect(sheet.sheet.rows[3].cell(0)).toBe('1');
    expect(sheet.sheet.rows[3].cell(3)).toBe('150');
    expect(sheet.sheet.rows[3].cell(4)).toBe('10000');
  });

  it('boolean cells are converted to string correctly', async () => {
    const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
    const sheet = result.sheets.find((s) => s.tableName === 'ai.ai')!;
    // Excel row 4 (rows[3]): DeathRemove=true (boolean)
    expect(sheet.sheet.rows[3].cell(6)).toBe('true');
  });

  it('null/empty cells return empty string', async () => {
    const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
    const sheet = result.sheets.find((s) => s.tableName === 'ai.ai')!;
    // Excel row 4 (rows[3]): Desc is null
    expect(sheet.sheet.rows[3].cell(1)).toBe('');
  });

  it('handles newline in rich text cells', async () => {
    const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
    const idx1 = result.sheets.find((s) => s.tableName === 'ai.ai_action' && s.sheet.index === 1)!;
    // Row 2 (Excel row 3): "新手关塔\n减伤"
    expect(idx1.sheet.rows[2].cell(1)).toBe('新手关塔\n减伤');
  });
});
