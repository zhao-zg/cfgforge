import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EditorService } from '../EditorService';
import { ExportService } from '../ExportService';

function writeFile(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Fixture for CSV/SQL tests (used in later tasks)
const ITEM_CFG = `table item[id] (title='name') {
  id:int;
  name:str;
  damage:int;
}
`;

const ITEM_CSV = `ID,名称,伤害
id,name,damage
100,剑,10
101,盾,20
`;

describe('ExportService', () => {
  describe('camelToSnake', () => {
    it('converts HeroRecruitList to hero_recruit_list', () => {
      expect(ExportService.camelToSnake('HeroRecruitList')).toBe('hero_recruit_list');
    });

    it('converts A2024Christmas to a2024_christmas', () => {
      expect(ExportService.camelToSnake('A2024Christmas')).toBe('a2024_christmas');
    });

    it('converts AiNpcCityAttack to ai_npc_city_attack', () => {
      expect(ExportService.camelToSnake('AiNpcCityAttack')).toBe('ai_npc_city_attack');
    });

    it('converts simple lowercase name', () => {
      expect(ExportService.camelToSnake('item')).toBe('item');
    });

    it('handles consecutive uppercase', () => {
      expect(ExportService.camelToSnake('HTTPServer')).toBe('http_server');
    });
  });
});

// ---------------------------------------------------------------------------
// Fixture for CSV/SQL tests
// ---------------------------------------------------------------------------

describe('ExportService CSV', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-export-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  async function createService(cfg: string, csvs: Record<string, string>): Promise<EditorService> {
    writeFile(tempDir, 'config.cfg', cfg);
    for (const [name, content] of Object.entries(csvs)) {
      writeFile(tempDir, name, content);
    }
    return EditorService.create(tempDir);
  }

  it('exports CSV with correct headers and data rows', async () => {
    const svc = await createService(ITEM_CFG, { 'item.csv': ITEM_CSV });
    const result = await ExportService.export(svc, 'item', 'csv');

    expect(result.resultCode).toBe('ok');
    expect(result.table).toBe('item');
    // BOM header
    expect(result.content.startsWith('\uFEFF')).toBe(true);
    // Header row: field names from schema
    const lines = result.content.slice(1).split('\r\n'); // remove BOM, split by CRLF
    expect(lines[0]).toBe('id,name,damage');
    // Data rows
    expect(lines[1]).toBe('100,剑,10');
    expect(lines[2]).toBe('101,盾,20');
  });

  it('exports CSV with JSON-serialized nested values', async () => {
    const NESTED_CFG = `table reward[id] {
  id:int;
  items:list<int> (sep=';');
}
`;
    const NESTED_CSV = `ID,物品
id,items
1,100;200;300
`;
    const svc = await createService(NESTED_CFG, { 'reward.csv': NESTED_CSV });
    const result = await ExportService.export(svc, 'reward', 'csv');

    expect(result.resultCode).toBe('ok');
    const lines = result.content.slice(1).split('\r\n');
    expect(lines[0]).toBe('id,items');
    // list value should be JSON-serialized
    const itemsValue = lines[1].split(',').slice(1).join(',');
    expect(itemsValue).toContain('100');
    expect(itemsValue).toContain('300');
  });

  it('escapes CSV special characters (comma, quote, newline)', async () => {
    const ESC_CFG = `table message[id] {
  id:int;
  text:str;
}
`;
    const ESC_CSV = `ID,文本
id,text
1,"Hello, ""World""\nNew line"
`;
    const svc = await createService(ESC_CFG, { 'message.csv': ESC_CSV });
    const result = await ExportService.export(svc, 'message', 'csv');

    expect(result.resultCode).toBe('ok');
    const content = result.content;
    // Values with comma/quote/newline should be quoted and quotes doubled
    expect(content).toContain('"Hello');
    expect(content).toContain('""World""');
  });

  it('returns tableNotFound for nonexistent table', async () => {
    const svc = await createService(ITEM_CFG, { 'item.csv': ITEM_CSV });
    const result = await ExportService.export(svc, 'nonexistent', 'csv');
    expect(result.resultCode).toBe('tableNotFound');
  });

  it('exports empty table with only header row', async () => {
    const EMPTY_CSV = `ID,名称,伤害
id,name,damage
`;
    const svc = await createService(ITEM_CFG, { 'item.csv': EMPTY_CSV });
    const result = await ExportService.export(svc, 'item', 'csv');

    expect(result.resultCode).toBe('ok');
    const lines = result.content.slice(1).split('\r\n');
    expect(lines[0]).toBe('id,name,damage');
    // Only header row, no data rows
    expect(lines.length).toBe(1); // header only, no trailing empty
  });
});

describe('ExportService SQL', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-export-sql-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  async function createService(cfg: string, csvs: Record<string, string>): Promise<EditorService> {
    writeFile(tempDir, 'config.cfg', cfg);
    for (const [name, content] of Object.entries(csvs)) {
      writeFile(tempDir, name, content);
    }
    return EditorService.create(tempDir);
  }

  it('exports SQL with CREATE TABLE and INSERT statements', async () => {
    const svc = await createService(ITEM_CFG, { 'item.csv': ITEM_CSV });
    const result = await ExportService.export(svc, 'item', 'sql');

    expect(result.resultCode).toBe('ok');
    expect(result.table).toBe('item');

    // Table name: cfg_item (camelToSnake)
    expect(result.content).toContain('CREATE TABLE IF NOT EXISTS "cfg_item"');
    // Field definitions with types
    expect(result.content).toContain('"id" INTEGER');
    expect(result.content).toContain('"name" TEXT');
    expect(result.content).toContain('"damage" INTEGER');
    // INSERT statements
    expect(result.content).toContain('INSERT INTO "cfg_item" VALUES');
    expect(result.content).toContain('100');
    expect(result.content).toContain("'剑'");
    expect(result.content).toContain('10');
    expect(result.content).toContain('101');
    expect(result.content).toContain("'盾'");
    expect(result.content).toContain('20');
  });

  it('uses correct SQL type for bool, float, list fields', async () => {
    const TYPE_CFG = `table mixed[id] {
  id:int;
  name:str;
  active:bool;
  rate:float;
  tags:list<str> (sep=';');
}
`;
    const TYPE_CSV = `ID,名称,激活,比率,标签
id,name,active,rate,tags
1,test,true,1.5,"a,b,c"
`;
    const svc = await createService(TYPE_CFG, { 'mixed.csv': TYPE_CSV });
    const result = await ExportService.export(svc, 'mixed', 'sql');

    expect(result.resultCode).toBe('ok');
    expect(result.content).toContain('"active" INTEGER');
    expect(result.content).toContain('"rate" REAL');
    expect(result.content).toContain('"tags" TEXT');
  });

  it('escapes single quotes in SQL string values', async () => {
    const ESC_CFG = `table message[id] {
  id:int;
  text:str;
}
`;
    const ESC_CSV = `ID,文本
id,text
1,It's a test
`;
    const svc = await createService(ESC_CFG, { 'message.csv': ESC_CSV });
    const result = await ExportService.export(svc, 'message', 'sql');

    expect(result.resultCode).toBe('ok');
    // Single quote should be escaped as ''
    expect(result.content).toContain("'It''s a test'");
  });

  it('exports empty table with only CREATE TABLE', async () => {
    const EMPTY_CSV = `ID,名称,伤害
id,name,damage
`;
    const svc = await createService(ITEM_CFG, { 'item.csv': EMPTY_CSV });
    const result = await ExportService.export(svc, 'item', 'sql');

    expect(result.resultCode).toBe('ok');
    expect(result.content).toContain('CREATE TABLE IF NOT EXISTS');
    expect(result.content).not.toContain('INSERT INTO');
  });

  it('uses correct table name for CamelCase tables', async () => {
    // CFG requires lowercase table names, but camelToSnake is still applied
    // to produce the SQL table name prefix cfg_
    const CC_CFG = `table herorecruitlist[id] {
  id:int;
  name:str;
}
`;
    const CC_CSV = `ID,名称
id,name
1,Hero
`;
    const svc = await createService(CC_CFG, { 'herorecruitlist.csv': CC_CSV });
    const result = await ExportService.export(svc, 'herorecruitlist', 'sql');

    expect(result.resultCode).toBe('ok');
    expect(result.content).toContain('"cfg_herorecruitlist"');
  });
});
