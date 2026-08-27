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

  it('exports SQL with DROP/CREATE TABLE and INSERT statements', async () => {
    const svc = await createService(ITEM_CFG, { 'item.csv': ITEM_CSV });
    const result = await ExportService.export(svc, 'item', 'sql');

    expect(result.resultCode).toBe('ok');
    expect(result.table).toBe('item');

    // Table name: cfg_item (camelToSnake), backtick-quoted MySQL dialect
    expect(result.content).toContain('DROP TABLE IF EXISTS `cfg_item`;');
    expect(result.content).toContain('CREATE TABLE IF NOT EXISTS `cfg_item` (');
    // Field definitions with MySQL types
    expect(result.content).toContain('`id` int(11)');
    expect(result.content).toContain('`name` text');
    expect(result.content).toContain('`damage` int(11)');
    // Primary key from schema
    expect(result.content).toContain('PRIMARY KEY (`id`)');
    // Engine/charset suffix
    expect(result.content).toContain('ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    // Batched INSERT with column list
    expect(result.content).toContain('INSERT INTO `cfg_item` (`id`, `name`, `damage`) VALUES');
    expect(result.content).toContain("('100', '剑', '10')");
    expect(result.content).toContain("('101', '盾', '20')");
  });

  it('exports field comments as MySQL COMMENT', async () => {
    const COMMENT_CFG = `table item[id] {
  id:int (comment='唯一id');
  name:str;
}
`;
    const COMMENT_CSV = `ID,名称
id,name
1,a
`;
    const svc = await createService(COMMENT_CFG, { 'item.csv': COMMENT_CSV });
    const result = await ExportService.export(svc, 'item', 'sql');

    expect(result.resultCode).toBe('ok');
    expect(result.content).toContain("COMMENT='唯一id'");
  });

  it('uses varchar(255) for string primary key, tinyint for bool, double for float', async () => {
    const TYPE_CFG = `table mixed[name] {
  name:str;
  active:bool;
  rate:float;
  tags:list<str> (sep=';');
}
`;
    const TYPE_CSV = `ID,激活,比率,标签
name,active,rate,tags
1,true,1.5,"a,b,c"
`;
    const svc = await createService(TYPE_CFG, { 'mixed.csv': TYPE_CSV });
    const result = await ExportService.export(svc, 'mixed', 'sql');

    expect(result.resultCode).toBe('ok');
    expect(result.content).toContain('`name` varchar(255) NOT NULL');
    expect(result.content).toContain('`active` tinyint(1)');
    expect(result.content).toContain('`rate` double');
    expect(result.content).toContain('`tags` text');
  });

  it('escapes single quotes and backslashes in SQL string values', async () => {
    const ESC_CFG = `table message[id] {
  id:int;
  text:str;
}
`;
    const ESC_CSV = `ID,文本
id,text
1,It's a \ test
`;
    const svc = await createService(ESC_CFG, { 'message.csv': ESC_CSV });
    const result = await ExportService.export(svc, 'message', 'sql');

    expect(result.resultCode).toBe('ok');
    // Single quote escaped as '', backslash doubled
    expect(result.content).toContain("'It''s a \\ test'");
  });

  it('exports multi-field primary key and unique keys', async () => {
    const MULTI_CFG = `table lootitem[lootid,itemid] (unique='itemid') {
  lootid:int;
  itemid:int;
  count:int;
}
`;
    const MULTI_CSV = `ID,物品,数量
lootid,itemid,count
1,100,5
1,101,3
`;
    const svc = await createService(MULTI_CFG, { 'lootitem.csv': MULTI_CSV });
    const result = await ExportService.export(svc, 'lootitem', 'sql');

    expect(result.resultCode).toBe('ok');
    expect(result.content).toContain('PRIMARY KEY (`lootid`, `itemid`)');
    expect(result.content).toContain('UNIQUE KEY `uk_cfg_lootitem_itemid` (`itemid`)');
  });

  it('exports empty table with only DROP/CREATE, no INSERT', async () => {
    const EMPTY_CSV = `ID,名称,伤害
id,name,damage
`;
    const svc = await createService(ITEM_CFG, { 'item.csv': EMPTY_CSV });
    const result = await ExportService.export(svc, 'item', 'sql');

    expect(result.resultCode).toBe('ok');
    expect(result.content).toContain('CREATE TABLE IF NOT EXISTS');
    expect(result.content).not.toContain('INSERT INTO');
  });

  it('batches multiple rows into one INSERT statement', async () => {
    const BATCH_CSV = `ID,名称,伤害
id,name,damage
1,a,1
2,b,2
3,c,3
`;
    const svc = await createService(ITEM_CFG, { 'item.csv': BATCH_CSV });
    const result = await ExportService.export(svc, 'item', 'sql');

    expect(result.resultCode).toBe('ok');
    const insertCount = (result.content.match(/INSERT INTO/g) || []).length;
    expect(insertCount).toBe(1);
    expect(result.content).toContain("('1', 'a', '1')");
    expect(result.content).toContain("('3', 'c', '3')");
  });

  it('exports all tables as one script via exportAllSql (sorted by name)', async () => {
    const ALL_CFG = `table aaa[id] {
  id:int;
}
table bbb[id] {
  id:int;
}
`;
    const A_CSV = `ID
id
1
`;
    const svc = await createService(ALL_CFG, { 'aaa.csv': A_CSV, 'bbb.csv': A_CSV });
    const result = await ExportService.exportAllSql(svc);

    expect(result.resultCode).toBe('ok');
    expect(result.content).toContain('`cfg_aaa`');
    expect(result.content).toContain('`cfg_bbb`');
    const idxA = result.content.indexOf('cfg_aaa');
    const idxB = result.content.indexOf('cfg_bbb');
    expect(idxA).toBeGreaterThan(-1);
    expect(idxB).toBeGreaterThan(idxA);
  });
});
