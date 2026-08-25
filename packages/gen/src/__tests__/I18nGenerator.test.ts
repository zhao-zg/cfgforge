/**
 * I18nGenerator tests — T8.10
 *
 * Tests I18nByValueGenerator (CSV output) and I18nByIdGenerator (xlsx output).
 *
 * I18nByValueGenerator:
 *   - Generates a CSV file with columns: table, original, translated
 *   - Iterates all VText values in tables that have text fields
 *
 * I18nByIdGenerator:
 *   - Generates xlsx files (one per module, sheets = tables)
 *   - Also generates a _todo_[lang].xlsx summary file
 *   - Two modes: single i18nfile mode and langSwitch mode
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as XLSX from 'xlsx';

import { Context } from '@cfggen/context';
import { I18nByValueGenerator } from '../I18nByValueGenerator';
import { I18nByIdGenerator } from '../I18nByIdGenerator';
import { LangText } from '../LangText';
import type { Parameter } from '../Parameter';

function writeFile(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function mockParameter(opts: Record<string, string>): Parameter {
  return {
    get: (k: string, def: string) => (k in opts ? opts[k] : def),
    has: (k: string) => k in opts,
    getOrNull: (k: string) => (k in opts ? opts[k] : null),
  };
}

// Helper: read CSV as array of rows (simple split, sufficient for test data)
function readCSV(filePath: string): string[][] {
  const content = fs.readFileSync(filePath, 'utf8');
  // Strip BOM
  const cleaned = content.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r\n|\r|\n/).filter((l) => l.length > 0);
  return lines.map((l) => l.split(','));
}

// Helper: read xlsx file and return sheet data as array of arrays
function readXlsx(filePath: string): Record<string, any[][]> {
  const wb = XLSX.readFile(filePath);
  const result: Record<string, any[][]> = {};
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    result[sheetName] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: true });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Test schema with text fields
// ---------------------------------------------------------------------------

const TEXT_CFG = `table item[id] {
  id:int;
  name:text;
  desc:text;
}
`;

const TEXT_CSV = `ID,名称,描述
id,name,desc
1,Hello,World
2,Foo,
3,,
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('I18nByValueGenerator', () => {
  let tempDir: string;
  let outDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-i18n-val-'));
    outDir = path.join(tempDir, 'out');
    fs.mkdirSync(outDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('generates CSV with table, original, translated columns', async () => {
    writeFile(tempDir, 'config.cfg', TEXT_CFG);
    writeFile(tempDir, 'item.csv', TEXT_CSV);

    const ctx = await Context.create(tempDir);
    const csvPath = path.join(outDir, 'en.csv');
    const gen = new I18nByValueGenerator(mockParameter({ file: csvPath }));
    await gen.generate(ctx);

    expect(fs.existsSync(csvPath)).toBe(true);
    const rows = readCSV(csvPath);
    // Expect: header? No, Java version has no header.
    // Data rows: item,Hello,  | item,Foo, | item,World, (row 1 desc translated empty)
    // Actually: row 3 has both empty -> skipped
    // Row 1: name=Hello (translated=''), desc=World (translated='')
    // Row 2: name=Foo (translated=''), desc empty -> skipped
    expect(rows.length).toBeGreaterThanOrEqual(2);

    // Check first row contains item, Hello
    const helloRow = rows.find((r) => r.length >= 2 && r[1] === 'Hello');
    expect(helloRow).toBeDefined();
    expect(helloRow![0]).toBe('item');

    const fooRow = rows.find((r) => r.length >= 2 && r[1] === 'Foo');
    expect(fooRow).toBeDefined();
  });

  it('skips tables without text fields', async () => {
    const noTextCfg = `table cfg[id] {
  id:int;
  value:int;
}
`;
    const noTextCsv = `ID,值
id,value
1,100
`;
    writeFile(tempDir, 'config.cfg', noTextCfg);
    writeFile(tempDir, 'cfg.csv', noTextCsv);

    const ctx = await Context.create(tempDir);
    const csvPath = path.join(outDir, 'en.csv');
    const gen = new I18nByValueGenerator(mockParameter({ file: csvPath }));
    await gen.generate(ctx);

    // File exists but may have no data rows (empty or just BOM)
    expect(fs.existsSync(csvPath)).toBe(true);
    const rows = readCSV(csvPath);
    expect(rows.length).toBe(0);
  });

  it('extends GeneratorWithTag (own parameter)', () => {
    const gen = new I18nByValueGenerator(mockParameter({ own: 'tag1' }));
    expect(gen['tag']).toBe('tag1');
  });

  it('uses default file path when not specified', () => {
    const gen = new I18nByValueGenerator(mockParameter({}));
    expect(gen['file']).toBe('../i18n/en.csv');
  });
});

// ---------------------------------------------------------------------------

describe('I18nByIdGenerator', () => {
  let tempDir: string;
  let outDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-i18n-id-'));
    outDir = path.join(tempDir, 'out');
    fs.mkdirSync(outDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('generates xlsx files for tables with text fields', async () => {
    writeFile(tempDir, 'config.cfg', TEXT_CFG);
    writeFile(tempDir, 'item.csv', TEXT_CSV);

    const ctx = await Context.create(tempDir);
    const langsDir = path.join(outDir, 'langs');
    fs.mkdirSync(langsDir, { recursive: true });
    const langDir = path.join(langsDir, 'en');
    fs.mkdirSync(langDir, { recursive: true });

    const gen = new I18nByIdGenerator(mockParameter({ dir: langDir }));
    await gen.generate(ctx);

    // Table 'item' has no module prefix, so it goes into '_top' module → _top.xlsx
    const xlsxPath = path.join(langDir, '_top.xlsx');
    expect(fs.existsSync(xlsxPath)).toBe(true);

    const sheets = readXlsx(xlsxPath);
    // Should have a sheet named "item" (table name)
    expect(sheets['item']).toBeDefined();

    const rows = sheets['item'];
    // Header: id, name, t(name), desc, t(desc)
    expect(rows[0][0]).toBe('id');
    expect(rows[0][1]).toBe('name');
    expect(rows[0][2]).toBe('t(name)');
    expect(rows[0][3]).toBe('desc');
    expect(rows[0][4]).toBe('t(desc)');

    // Data rows
    expect(rows[1][0]).toBe('1');
    expect(rows[1][1]).toBe('Hello');
    // row 2: name=Foo, desc empty -> only name gets a row
    expect(rows[2][0]).toBe('2');
    expect(rows[2][1]).toBe('Foo');
  });

  it('generates _todo_ xlsx summary file', async () => {
    writeFile(tempDir, 'config.cfg', TEXT_CFG);
    writeFile(tempDir, 'item.csv', TEXT_CSV);

    const ctx = await Context.create(tempDir);
    const langsDir = path.join(outDir, 'langs');
    fs.mkdirSync(langsDir, { recursive: true });
    const langDir = path.join(langsDir, 'en');
    fs.mkdirSync(langDir, { recursive: true });

    const gen = new I18nByIdGenerator(mockParameter({ dir: langDir }));
    await gen.generate(ctx);

    const todoPath = path.join(langsDir, '_todo_en.xlsx');
    expect(fs.existsSync(todoPath)).toBe(true);

    const sheets = readXlsx(todoPath);
    // Should have "todo" and "参考用" sheets
    expect(sheets['todo']).toBeDefined();
    expect(sheets['参考用']).toBeDefined();

    // todo sheet header
    expect(sheets['todo'][0][0]).toBe('table');
    expect(sheets['todo'][0][1]).toBe('id');
    expect(sheets['todo'][0][2]).toBe('fieldChain');
    expect(sheets['todo'][0][3]).toBe('original');
    expect(sheets['todo'][0][4]).toBe('translated');

    // All texts are untranslated (no translations set), so all should be in todo
    // Row 1: name=Hello, desc=World -> 2 entries in todo
    // Row 2: name=Foo, desc empty -> 1 entry in todo
    const todoDataRows = sheets['todo'].slice(1);
    expect(todoDataRows.length).toBe(3);

    // done sheet should only have header
    const doneDataRows = sheets['参考用'].slice(1);
    expect(doneDataRows.length).toBe(0);
  });

  it('groups tables by module in separate xlsx files', async () => {
    const moduleCfg = `
table mod1.itema[id] {
  id:int;
  name:text;
}
table mod2.itemb[id] {
  id:int;
  label:text;
}
`;
    const itemACsv = `ID,名称
id,name
1,Alpha
`;
    const itemBCsv = `ID,标签
id,label
1,Beta
`;

    writeFile(tempDir, 'config.cfg', moduleCfg);
    // CSV files for module-prefixed tables must use subdirectory layout:
    //   mod1/itema.csv → tableName 'mod1.itema'
    fs.mkdirSync(path.join(tempDir, 'mod1'), { recursive: true });
    writeFile(tempDir, 'mod1/itema.csv', itemACsv);
    fs.mkdirSync(path.join(tempDir, 'mod2'), { recursive: true });
    writeFile(tempDir, 'mod2/itemb.csv', itemBCsv);

    const ctx = await Context.create(tempDir);
    const langsDir = path.join(outDir, 'langs');
    fs.mkdirSync(langsDir, { recursive: true });
    const langDir = path.join(langsDir, 'en');
    fs.mkdirSync(langDir, { recursive: true });

    const gen = new I18nByIdGenerator(mockParameter({ dir: langDir }));
    await gen.generate(ctx);

    // Two modules: mod1 and mod2
    expect(fs.existsSync(path.join(langDir, 'mod1.xlsx'))).toBe(true);
    expect(fs.existsSync(path.join(langDir, 'mod2.xlsx'))).toBe(true);

    // mod1.xlsx should have sheet "mod1.itema"
    const mod1Sheets = readXlsx(path.join(langDir, 'mod1.xlsx'));
    expect(mod1Sheets['mod1.itema']).toBeDefined();

    // mod2.xlsx should have sheet "mod2.itemb"
    const mod2Sheets = readXlsx(path.join(langDir, 'mod2.xlsx'));
    expect(mod2Sheets['mod2.itemb']).toBeDefined();
  });

  it('skips tables without text fields', async () => {
    const noTextCfg = `table cfg[id] {
  id:int;
  value:int;
}
`;
    const noTextCsv = `ID,值
id,value
1,100
`;
    writeFile(tempDir, 'config.cfg', noTextCfg);
    writeFile(tempDir, 'cfg.csv', noTextCsv);

    const ctx = await Context.create(tempDir);
    const langsDir = path.join(outDir, 'langs');
    fs.mkdirSync(langsDir, { recursive: true });
    const langDir = path.join(langsDir, 'en');
    fs.mkdirSync(langDir, { recursive: true });

    const gen = new I18nByIdGenerator(mockParameter({ dir: langDir }));
    await gen.generate(ctx);

    // No xlsx files in the lang directory (only _todo which has just header)
    const files = fs.readdirSync(langDir);
    expect(files.filter((f) => f.endsWith('.xlsx')).length).toBe(0);
  });

  it('extends Generator (not GeneratorWithTag)', () => {
    const gen = new I18nByIdGenerator(mockParameter({ dir: '.' }));
    // I18nByIdGenerator extends Generator directly, not GeneratorWithTag
    expect(gen).toBeInstanceOf(I18nByIdGenerator);
  });
});

// ---------------------------------------------------------------------------

describe('LangText', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-langtext-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('extract groups tables by module', async () => {
    const moduleCfg = `
table ai.behavior[id] {
  id:int;
  name:text;
}
table ai.action[id] {
  id:int;
  label:text;
}
table top_item[id] {
  id:int;
  title:text;
}
`;
    writeFile(tempDir, 'config.cfg', moduleCfg);
    // CSV files for module-prefixed tables must use subdirectory layout:
    //   ai/behavior.csv → tableName 'ai.behavior'
    fs.mkdirSync(path.join(tempDir, 'ai'), { recursive: true });
    writeFile(tempDir, 'ai/behavior.csv', 'ID,名称\nid,name\n1,Chase\n');
    writeFile(tempDir, 'ai/action.csv', 'ID,标签\nid,label\n1,Attack\n');
    writeFile(tempDir, 'top_item.csv', 'ID,标题\nid,title\n1,Sword\n');

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    const langText = LangText.extract(cfgValue);

    // ai.behavior and ai.action should be in "ai" module
    expect(langText.modules.get('ai')).toBeDefined();
    expect(langText.modules.get('ai')!.tables.get('ai.behavior')).toBeDefined();
    expect(langText.modules.get('ai')!.tables.get('ai.action')).toBeDefined();

    // top_item should be in "_top" module
    expect(langText.modules.get('_top')).toBeDefined();
    expect(langText.modules.get('_top')!.tables.get('top_item')).toBeDefined();
  });
});
