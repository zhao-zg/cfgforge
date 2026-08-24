/**
 * End-to-end regression tests — Phase 3 T3.8.
 *
 * Tests the full data reading pipeline:
 *   File enumeration → CfgDataReader (readExcel/readCsv) → HeadParser → CellParser → CfgData
 *
 * Uses real files from example/config/ — the same test data as Java's
 * CfgDataReaderTest.readCsv and CfgDataReaderTest.readExcel.
 *
 * Since DirectoryStructure is not yet ported to TS, we manually enumerate
 * the Excel/CSV files in the test directories, replicating the logic of
 * Java's DirectoryStructure.findExcelFilesRecursively.
 *
 * Note: readExcel is async (ExcelJS), but CfgDataReader expects synchronous
 * reader functions. We pre-read Excel files and cache the ReadResult, then
 * return synchronously from the reader closure.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { CfgDataReader, type ExcelFileInfo } from '../CfgDataReader';
import { HeadRows } from '../HeadRows';
import { readExcel } from '../ExcelReader';
import { readCsv } from '../CsvReader';
import { FileFmt, getFileFormat, isFileIgnored } from '../DataUtil';
import { getCodeName } from '@cfggen/shared';
import { CfgSchemaErrs } from '@cfggen/schema';
import type { ReadResult } from '../ReadResult';

// ---------------------------------------------------------------------------
// Paths to test data
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const EXAMPLE_CONFIG_DIR = path.join(REPO_ROOT, 'example', 'config');
const TEST_RESOURCES_DIR = path.join(REPO_ROOT, 'app', 'src', 'test', 'resources');

// ---------------------------------------------------------------------------
// Helper: enumerate Excel/CSV files recursively (replicates Java
// DirectoryStructure.findExcelFilesRecursively)
// ---------------------------------------------------------------------------

function findExcelFilesRecursively(dir: string, rootDir: string): ExcelFileInfo[] {
  const result: ExcelFileInfo[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (isFileIgnored(fullPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      const codeName = getCodeName(entry.name);
      if (codeName === null) {
        continue;
      }
      result.push(...findExcelFilesRecursively(fullPath, rootDir));
    } else if (entry.isFile()) {
      const fmt = getFileFormat(fullPath);
      if (fmt === null) continue;

      if (fmt === FileFmt.CSV) {
        const codeName = getCodeName(entry.name);
        if (codeName === null) continue;
      }
      if (fmt === FileFmt.CSV || fmt === FileFmt.EXCEL) {
        const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
        const stat = fs.statSync(fullPath);
        result.push({
          lastModified: stat.mtimeMs,
          path: fullPath,
          relativePath,
          fmt,
          nullableAddTag: null,
        });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helper: pre-read Excel files and build a cache for sync access
// ---------------------------------------------------------------------------

async function preReadExcelFiles(files: ExcelFileInfo[]): Promise<Map<string, ReadResult>> {
  const cache = new Map<string, ReadResult>();
  for (const f of files) {
    if (f.fmt === FileFmt.EXCEL) {
      const result = await readExcel(f.path, f.relativePath, null);
      cache.set(f.path, result);
    }
  }
  return cache;
}

// ---------------------------------------------------------------------------
// Helper: build a CfgDataReader with real reader functions
// CSV reader is synchronous; Excel reader uses pre-cached results
// ---------------------------------------------------------------------------

function createReader(headRow: typeof HeadRows.A2_Default, excelCache: Map<string, ReadResult>): CfgDataReader {
  const csvReader = (
    filePath: string,
    relativePath: string,
    tableName: string,
    index: number,
    fieldSeparator: string,
    nullableAddTag: string | null,
  ): ReadResult => {
    return readCsv(filePath, relativePath, tableName, index, fieldSeparator, 'gbk', nullableAddTag);
  };

  const excelReader = (
    filePath: string,
    _relativePath: string,
    _sheetNameFilter: string | null,
  ): ReadResult => {
    const cached = excelCache.get(filePath);
    if (cached === undefined) {
      throw new Error(`Excel file not pre-read: ${filePath}`);
    }
    return cached;
  };

  return new CfgDataReader(headRow, csvReader, excelReader);
}

// ---------------------------------------------------------------------------
// Helper: run readCfgData
// ---------------------------------------------------------------------------

async function readCfgData(files: ExcelFileInfo[], headRow: typeof HeadRows.A2_Default) {
  const excelCache = await preReadExcelFiles(files);
  const reader = createReader(headRow, excelCache);
  const errs = CfgSchemaErrs.of();
  return reader.readCfgData(files, null, errs);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E: data reading pipeline (T3.8)', () => {
  describe('read single CSV file (rank.csv from test resources)', () => {
    // This mirrors Java CfgDataReaderTest.readCsv
    const RANK_CSV = path.join(TEST_RESOURCES_DIR, 'rank.csv');
    const rankExists = fs.existsSync(RANK_CSV);

    (rankExists ? it : it.skip)('reads rank.csv and verifies table structure', async () => {
      const files: ExcelFileInfo[] = [
        {
          lastModified: fs.statSync(RANK_CSV).mtimeMs,
          path: RANK_CSV,
          relativePath: 'rank.csv',
          fmt: FileFmt.CSV,
          nullableAddTag: null,
        },
      ];

      const data = await readCfgData(files, HeadRows.A2_Default);

      expect(data.tables.size).toBe(1);
      expect(data.stat.tableCount).toBe(1);

      const dt = data.getDTable('rank');
      expect(dt).toBeDefined();
      expect(dt!.tableName).toBe('rank');
      expect(dt!.rawSheets.length).toBe(1);

      // After CellParser, raw sheet rows are cleared to free memory
      expect(dt!.rawSheets[0].rows.length).toBe(0);

      // Fields: RankID, RankName, RankShowName (3 fields; "策划注释" column is empty→ignored)
      expect(dt!.fields.length).toBe(3);
      expect(dt!.fields[0].name).toBe('RankID');
      expect(dt!.fields[1].name).toBe('RankName');
      expect(dt!.fields[2].name).toBe('RankShowName');

      // 5 data rows (rank 1-5)
      expect(dt!.rows.length).toBe(5);

      // Verify row 0: 1,white,白,下品
      expect(dt!.rows[0][0].value()).toBe('1');
      expect(dt!.rows[0][0].col()).toBe(0);

      expect(dt!.rows[0][1].value()).toBe('white');
      expect(dt!.rows[0][1].col()).toBe(1);

      // The 3rd field (RankShowName) comes from CSV column 3 (index 3)
      expect(dt!.rows[0][2].value()).toBe('下品');
      expect(dt!.rows[0][2].col()).toBe(3);

      // Verify row 1: 2,green,绿,中品
      expect(dt!.rows[1][0].value()).toBe('2');
      expect(dt!.rows[1][1].value()).toBe('green');
      expect(dt!.rows[1][2].value()).toBe('中品');
    });
  });

  describe('read single Excel file (ai行为.xlsx)', () => {
    // This mirrors Java CfgDataReaderTest.readExcel
    const XLSX_PATH = path.join(EXAMPLE_CONFIG_DIR, 'ai_行为', 'ai行为.xlsx');
    const xlsxExists = fs.existsSync(XLSX_PATH);

    (xlsxExists ? it : it.skip)('reads ai行为.xlsx and verifies table structure', async () => {
      const files: ExcelFileInfo[] = [
        {
          lastModified: fs.statSync(XLSX_PATH).mtimeMs,
          path: XLSX_PATH,
          relativePath: 'ai_行为/ai行为.xlsx',
          fmt: FileFmt.EXCEL,
          nullableAddTag: null,
        },
      ];

      const data = await readCfgData(files, HeadRows.A2_Default);

      // 3 tables: ai, ai_action, ai_condition
      // (4 sheets, but ai_action has index 0 and index 1 → merged into 1 table)
      expect(data.tables.size).toBe(3);
      expect(data.stat.tableCount).toBe(3);
      expect(data.stat.excelCount).toBe(1);
      expect(data.stat.sheetCount).toBe(4);

      // Table "ai.ai": 7 fields, 52 data rows
      // (directory ai_行为 codeName=ai + sheet ai → table name ai.ai)
      {
        const dt = data.getDTable('ai.ai');
        expect(dt).toBeDefined();
        expect(dt!.tableName).toBe('ai.ai');
        expect(dt!.fields.length).toBe(7);
        expect(dt!.rows.length).toBe(52);

        // Verify field names
        expect(dt!.fields[0].name).toBe('ID');
        expect(dt!.fields[1].name).toBe('Desc');
        expect(dt!.fields[2].name).toBe('CondID');
      }

      // Table "ai.ai_action": 12 fields, 53 data rows (merged from index 0 + index 1 sheets)
      {
        const dt = data.getDTable('ai.ai_action');
        expect(dt).toBeDefined();
        expect(dt!.tableName).toBe('ai.ai_action');
        expect(dt!.fields.length).toBe(12);
        expect(dt!.rows.length).toBe(53);
      }

      // Table "ai.ai_condition": exists
      {
        const dt = data.getDTable('ai.ai_condition');
        expect(dt).toBeDefined();
        expect(dt!.tableName).toBe('ai.ai_condition');
      }
    });

    (xlsxExists ? it : it.skip)('ai table first data row has correct values', async () => {
      const files: ExcelFileInfo[] = [
        {
          lastModified: fs.statSync(XLSX_PATH).mtimeMs,
          path: XLSX_PATH,
          relativePath: 'ai_行为/ai行为.xlsx',
          fmt: FileFmt.EXCEL,
          nullableAddTag: null,
        },
      ];

      const data = await readCfgData(files, HeadRows.A2_Default);
      const dt = data.getDTable('ai.ai')!;

      // First data row: ID=1, Desc=空, CondID=1;2, TrigTick=150, TrigOdds=10000, ActionID=1;2, DeathRemove=true
      expect(dt.rows[0][0].value()).toBe('1');
      expect(dt.rows[0][1].value()).toBe('');
      expect(dt.rows[0][2].value()).toBe('1;2');
      expect(dt.rows[0][3].value()).toBe('150');
      expect(dt.rows[0][4].value()).toBe('10000');
      expect(dt.rows[0][5].value()).toBe('1;2');
      expect(dt.rows[0][6].value()).toBe('true');
    });

    (xlsxExists ? it : it.skip)('ai table Chinese text is parsed correctly', async () => {
      const files: ExcelFileInfo[] = [
        {
          lastModified: fs.statSync(XLSX_PATH).mtimeMs,
          path: XLSX_PATH,
          relativePath: 'ai_行为/ai行为.xlsx',
          fmt: FileFmt.EXCEL,
          nullableAddTag: null,
        },
      ];

      const data = await readCfgData(files, HeadRows.A2_Default);
      const dt = data.getDTable('ai.ai')!;

      // Row 1 (0-based index 1): ID=10012, Desc=召唤猴子
      expect(dt.rows[1][0].value()).toBe('10012');
      expect(dt.rows[1][1].value()).toBe('召唤猴子');
    });
  });

  describe('read all CSV files from example/config/equip/', () => {
    const EQUIP_DIR = path.join(EXAMPLE_CONFIG_DIR, 'equip');

    it('reads all equip CSV files and verifies table count', async () => {
      const files = findExcelFilesRecursively(EQUIP_DIR, EXAMPLE_CONFIG_DIR)
        .filter(f => f.fmt === FileFmt.CSV);

      // Should find: ability, equipconfig, jewelry, jewelryrandom, jewelrysuit, jewelrytype, rank
      // (7 CSV files, equip.cfg is CFG format → not included)
      expect(files.length).toBe(7);

      const data = await readCfgData(files, HeadRows.A2_Default);

      // 7 tables
      expect(data.tables.size).toBe(7);
      expect(data.stat.tableCount).toBe(7);
      expect(data.stat.csvCount).toBe(7);

      // Verify specific tables exist
      const tableNames = Array.from(data.tables.keys()).sort();
      expect(tableNames).toContain('equip.ability');
      expect(tableNames).toContain('equip.rank');
      expect(tableNames).toContain('equip.equipconfig');
      expect(tableNames).toContain('equip.jewelry');
      expect(tableNames).toContain('equip.jewelryrandom');
      expect(tableNames).toContain('equip.jewelrysuit');
      expect(tableNames).toContain('equip.jewelrytype');
    });

    it('equip.rank table has correct structure', async () => {
      const files = findExcelFilesRecursively(EQUIP_DIR, EXAMPLE_CONFIG_DIR)
        .filter(f => f.fmt === FileFmt.CSV && f.relativePath.endsWith('rank.csv'));

      const data = await readCfgData(files, HeadRows.A2_Default);
      const dt = data.getDTable('equip.rank');

      expect(dt).toBeDefined();
      // rank.csv: RankID, RankName, RankShowName (策划注释 column empty→ignored)
      expect(dt!.fields.length).toBe(3);
      expect(dt!.fields[0].name).toBe('RankID');
      expect(dt!.fields[1].name).toBe('RankName');
      expect(dt!.fields[2].name).toBe('RankShowName');
      // 6 data rows (0-5)
      expect(dt!.rows.length).toBe(6);

      // Verify first row: 0,white,白,下品
      expect(dt!.rows[0][0].value()).toBe('0');
      expect(dt!.rows[0][1].value()).toBe('white');
      expect(dt!.rows[0][2].value()).toBe('下品');

      // Verify last row: 5,red,红,神
      expect(dt!.rows[5][0].value()).toBe('5');
      expect(dt!.rows[5][1].value()).toBe('red');
      expect(dt!.rows[5][2].value()).toBe('神');
    });

    it('equip.ability table has correct structure', async () => {
      const files = findExcelFilesRecursively(EQUIP_DIR, EXAMPLE_CONFIG_DIR)
        .filter(f => f.fmt === FileFmt.CSV && f.relativePath.endsWith('ability.csv'));

      const data = await readCfgData(files, HeadRows.A2_Default);
      const dt = data.getDTable('equip.ability');

      expect(dt).toBeDefined();
      // ability.csv: id, name (策划注释 column empty→ignored)
      expect(dt!.fields.length).toBe(2);
      expect(dt!.fields[0].name).toBe('id');
      expect(dt!.fields[1].name).toBe('name');
      // 7 data rows
      expect(dt!.rows.length).toBe(7);

      // Verify first row: 1,attack,攻击
      expect(dt!.rows[0][0].value()).toBe('1');
      expect(dt!.rows[0][1].value()).toBe('attack');

      // Verify last row: 7,break_armor,破甲
      expect(dt!.rows[6][0].value()).toBe('7');
      expect(dt!.rows[6][1].value()).toBe('break_armor');
    });
  });

  describe('read all CSV files from example/config/other/', () => {
    const OTHER_DIR = path.join(EXAMPLE_CONFIG_DIR, 'other');

    it('reads all other CSV files and verifies table count', async () => {
      const files = findExcelFilesRecursively(OTHER_DIR, EXAMPLE_CONFIG_DIR)
        .filter(f => f.fmt === FileFmt.CSV);

      // Should find: drop, loot, lootitem, lootitem_1, lootitem_2, monster, signin
      // (7 CSV files, other.cfg is CFG format → not included)
      // lootitem.csv + lootitem_1.csv + lootitem_2.csv all map to "other.lootitem"
      expect(files.length).toBe(7);

      const data = await readCfgData(files, HeadRows.A2_Default);

      // 5 tables (lootitem + lootitem_1 + lootitem_2 merge into one "other.lootitem" table)
      // keytest is a JSON table, not CSV → not counted here
      expect(data.tables.size).toBe(5);
      expect(data.stat.tableCount).toBe(5);
      expect(data.stat.csvCount).toBe(7);

      // Verify tables exist
      expect(data.getDTable('other.drop')).toBeDefined();
      expect(data.getDTable('other.loot')).toBeDefined();
      expect(data.getDTable('other.lootitem')).toBeDefined();
      expect(data.getDTable('other.monster')).toBeDefined();
      expect(data.getDTable('other.signin')).toBeDefined();
    });

    it('other.lootitem merges data from lootitem, lootitem_1, and lootitem_2', async () => {
      const files = findExcelFilesRecursively(OTHER_DIR, EXAMPLE_CONFIG_DIR)
        .filter(f => f.fmt === FileFmt.CSV && f.relativePath.includes('lootitem'));

      // 3 files: lootitem.csv (index 0), lootitem_1.csv (index 1), lootitem_2.csv (index 2)
      expect(files.length).toBe(3);

      const data = await readCfgData(files, HeadRows.A2_Default);
      const dt = data.getDTable('other.lootitem');

      expect(dt).toBeDefined();
      // All 3 files merged into one table with 3 raw sheets
      expect(dt!.rawSheets.length).toBe(3);
      // Verify sheet indices (sorted)
      expect(dt!.rawSheets[0].index).toBe(0);
      expect(dt!.rawSheets[1].index).toBe(1);
      expect(dt!.rawSheets[2].index).toBe(2);
    });
  });

  describe('read all CSV files from example/config/task/', () => {
    const TASK_DIR = path.join(EXAMPLE_CONFIG_DIR, 'task');

    it('reads all task CSV files and verifies table count', async () => {
      const files = findExcelFilesRecursively(TASK_DIR, EXAMPLE_CONFIG_DIR)
        .filter(f => f.fmt === FileFmt.CSV);

      // Should find: completeconditiontype任务完成条件类型, task_任务, taskextraexp
      // (3 CSV files, task.cfg is CFG format → not included)
      expect(files.length).toBe(3);

      const data = await readCfgData(files, HeadRows.A2_Default);

      // 3 tables
      expect(data.tables.size).toBe(3);
      expect(data.stat.tableCount).toBe(3);
      expect(data.stat.csvCount).toBe(3);

      // Verify tables exist (Chinese chars in filename are stripped by getCodeName)
      expect(data.getDTable('task.completeconditiontype')).toBeDefined();
      expect(data.getDTable('task.task')).toBeDefined();
      expect(data.getDTable('task.taskextraexp')).toBeDefined();
    });

    it('task.taskextraexp has correct structure', async () => {
      const files = findExcelFilesRecursively(TASK_DIR, EXAMPLE_CONFIG_DIR)
        .filter(f => f.fmt === FileFmt.CSV && f.relativePath.endsWith('taskextraexp.csv'));

      const data = await readCfgData(files, HeadRows.A2_Default);
      const dt = data.getDTable('task.taskextraexp');

      expect(dt).toBeDefined();
      // taskextraexp.csv: taskid, extraexp, test1, test2, fielda, fieldb, fieldc, fieldd
      // (注释 column is empty→ignored)
      expect(dt!.fields.length).toBe(8);
      expect(dt!.fields[0].name).toBe('taskid');
      expect(dt!.fields[1].name).toBe('extraexp');
      // 1 data row
      expect(dt!.rows.length).toBe(1);

      // Verify: 1,杀个怪,1000,1,2,3,cc,ee,dd
      expect(dt!.rows[0][0].value()).toBe('1');
      expect(dt!.rows[0][1].value()).toBe('1000');
    });
  });

  describe('read entire example/config/ directory', () => {
    it('reads all CSV + Excel files and verifies comprehensive stats', async () => {
      const files = findExcelFilesRecursively(EXAMPLE_CONFIG_DIR, EXAMPLE_CONFIG_DIR);

      const csvFiles = files.filter(f => f.fmt === FileFmt.CSV);
      const excelFiles = files.filter(f => f.fmt === FileFmt.EXCEL);

      expect(csvFiles.length).toBeGreaterThanOrEqual(15);
      expect(excelFiles.length).toBe(1);

      const data = await readCfgData(files, HeadRows.A2_Default);

      // Verify stats
      expect(data.stat.excelCount).toBe(1);
      expect(data.stat.csvCount).toBe(csvFiles.length);
      expect(data.stat.tableCount).toBe(data.tables.size);

      // Verify ai tables from Excel (table names have directory prefix)
      expect(data.getDTable('ai.ai')).toBeDefined();
      expect(data.getDTable('ai.ai_action')).toBeDefined();
      expect(data.getDTable('ai.ai_condition')).toBeDefined();

      // Verify equip tables from CSV
      expect(data.getDTable('equip.rank')).toBeDefined();
      expect(data.getDTable('equip.ability')).toBeDefined();
      expect(data.getDTable('equip.equipconfig')).toBeDefined();

      // Verify other tables from CSV
      expect(data.getDTable('other.drop')).toBeDefined();
      expect(data.getDTable('other.signin')).toBeDefined();

      // Verify task tables from CSV
      expect(data.getDTable('task.task')).toBeDefined();
      expect(data.getDTable('task.taskextraexp')).toBeDefined();
    });

    it('all table rawSheets are cleared after parsing (memory optimization)', async () => {
      const files = findExcelFilesRecursively(EXAMPLE_CONFIG_DIR, EXAMPLE_CONFIG_DIR);

      const data = await readCfgData(files, HeadRows.A2_Default);

      for (const table of data.tables.values()) {
        for (const sheet of table.rawSheets) {
          expect(sheet.rows.length).toBe(0);
        }
      }
    });

    it('all table fields have non-empty names', async () => {
      const files = findExcelFilesRecursively(EXAMPLE_CONFIG_DIR, EXAMPLE_CONFIG_DIR);

      const data = await readCfgData(files, HeadRows.A2_Default);

      for (const table of data.tables.values()) {
        for (const field of table.fields) {
          expect(field.name.length).toBeGreaterThan(0);
        }
      }
    });

    it('all table rows have matching field count', async () => {
      const files = findExcelFilesRecursively(EXAMPLE_CONFIG_DIR, EXAMPLE_CONFIG_DIR);

      const data = await readCfgData(files, HeadRows.A2_Default);

      for (const table of data.tables.values()) {
        for (const row of table.rows) {
          expect(row.length).toBe(table.fields.length);
        }
      }
    });
  });

  describe('stat counters are correct', () => {
    it('ignoredColumnCount counts empty-name columns', async () => {
      // rank.csv has "策划注释" as column name which is empty in the name row → ignored
      const RANK_CSV = path.join(EXAMPLE_CONFIG_DIR, 'equip', 'rank.csv');
      const files: ExcelFileInfo[] = [
        {
          lastModified: fs.statSync(RANK_CSV).mtimeMs,
          path: RANK_CSV,
          relativePath: 'equip/rank.csv',
          fmt: FileFmt.CSV,
          nullableAddTag: null,
        },
      ];

      const data = await readCfgData(files, HeadRows.A2_Default);

      // rank.csv: 4 columns in name row, but "策划注释" column has empty name → ignored
      // So ignoredColumnCount = 1, columnCount = 3
      expect(data.stat.ignoredColumnCount).toBe(1);
      expect(data.stat.columnCount).toBe(3);
    });

    it('emptyTableCount counts tables with no data rows', async () => {
      // Create a temp CSV with only header rows, no data
      const tmpDir = path.join(REPO_ROOT, '.temp');
      fs.mkdirSync(tmpDir, { recursive: true });
      const tmpCsv = path.join(tmpDir, 'empty_data.csv');
      fs.writeFileSync(tmpCsv, 'comment1,comment2\nfield1,field2\n', 'utf-8');

      try {
        const files: ExcelFileInfo[] = [
          {
            lastModified: fs.statSync(tmpCsv).mtimeMs,
            path: tmpCsv,
            relativePath: 'empty_data.csv',
            fmt: FileFmt.CSV,
            nullableAddTag: null,
          },
        ];

        const data = await readCfgData(files, HeadRows.A2_Default);

        expect(data.tables.size).toBe(1);
        expect(data.stat.emptyTableCount).toBe(1);
        const dt = data.getDTable('empty_data');
        expect(dt!.rows.length).toBe(0);
        expect(dt!.fields.length).toBe(2);
      } finally {
        fs.unlinkSync(tmpCsv);
      }
    });
  });
});
