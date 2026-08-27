import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Context } from '@cfgforge/context';
import { SqlGenerator } from '../SqlGenerator';
import {
  camelToSnake,
  escapeSqlString,
  sqlColumnType,
} from '../SqlRender';
import type { Parameter } from '../Parameter';
import type { Primitive } from '@cfgforge/schema';

// ---------------------------------------------------------------------------
// Parameter mock (same pattern as JsonGenerator.test.ts)
// ---------------------------------------------------------------------------

function mockParameter(opts: Record<string, string>): Parameter {
  return {
    get: (k: string, def: string) => (k in opts ? opts[k] : def),
    has: (k: string) => k in opts,
    getOrNull: (k: string) => (k in opts ? opts[k] : null),
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CFG = `table item[id] {
  // 唯一id
  id:int;
  name:str;
  damage:int;
}

table lootitem[lootid,itemid] {
  lootid:int;
  itemid:int;
  count:int;
  [itemid];
}
`;

const ITEM_CSV = `ID,名称,伤害
id,name,damage
100,剑,10
101,盾,20
`;

const LOOTITEM_CSV = `ID,物品,数量
lootid,itemid,count
1,100,5
1,101,3
2,200,8
`;

// ---------------------------------------------------------------------------
// Pure function tests
// ---------------------------------------------------------------------------

describe('SqlRender pure functions', () => {
  it('camelToSnake converts boundaries', () => {
    expect(camelToSnake('HeroRecruitList')).toBe('hero_recruit_list');
    expect(camelToSnake('HTTPServer')).toBe('http_server');
    expect(camelToSnake('A2024C')).toBe('a2024_c');
    expect(camelToSnake('item')).toBe('item');
  });

  it('escapeSqlString doubles backslash and quote', () => {
    expect(escapeSqlString(`a'b`)).toBe(`a''b`);
    expect(escapeSqlString(`a\\b`)).toBe(`a\\\\b`);
    expect(escapeSqlString(`a\\'b`)).toBe(`a\\\\''b`);
  });

  it('sqlColumnType maps primitives with MySQL dialect', () => {
    expect(sqlColumnType('int', false)).toBe("int(11) NOT NULL DEFAULT '0'");
    expect(sqlColumnType('long', false)).toBe("bigint(20) NOT NULL DEFAULT '0'");
    expect(sqlColumnType('bool', false)).toBe("tinyint(1) NOT NULL DEFAULT '0'");
    expect(sqlColumnType('float', false)).toBe("double NOT NULL DEFAULT '0'");
    expect(sqlColumnType('str', false)).toBe('text DEFAULT NULL');
    expect(sqlColumnType('str', true)).toBe('varchar(255) NOT NULL');
    expect(sqlColumnType('text', true)).toBe('text DEFAULT NULL');
  });

  it('sqlColumnType accepts all Primitive values without crash', () => {
    const prims: Primitive[] = ['bool', 'int', 'long', 'float', 'str', 'text'];
    for (const p of prims) {
      expect(typeof sqlColumnType(p, false)).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// Generator tests (fixture dir + Context)
// ---------------------------------------------------------------------------

describe('SqlGenerator', () => {
  let tempDir: string;
  let outDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-sqlgen-'));
    outDir = path.join(tempDir, 'out');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'config.cfg'), CFG);
    fs.writeFileSync(path.join(tempDir, 'item.csv'), ITEM_CSV);
    fs.writeFileSync(path.join(tempDir, 'lootitem.csv'), LOOTITEM_CSV);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function makeContext(): Promise<Context> {
    return Context.create(tempDir);
  }

  it('mode=single writes one .sql per table with MySQL DDL', async () => {
    const gen = new SqlGenerator(mockParameter({ dir: outDir }));
    await gen.generate(await makeContext());

    const files = fs.readdirSync(outDir).sort();
    expect(files).toEqual(['cfg_item.sql', 'cfg_lootitem.sql']);

    const itemSql = fs.readFileSync(path.join(outDir, 'cfg_item.sql'), 'utf-8');
    expect(itemSql).toContain('DROP TABLE IF EXISTS `cfg_item`;');
    expect(itemSql).toContain('CREATE TABLE IF NOT EXISTS `cfg_item` (');
    expect(itemSql).toContain('`id` int(11) NOT NULL DEFAULT \'0\'');
    expect(itemSql).toContain("COMMENT '唯一id '");
    expect(itemSql).toContain('PRIMARY KEY (`id`)');
    expect(itemSql).toContain('ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    expect(itemSql).toContain('INSERT INTO `cfg_item` (`id`, `name`, `damage`) VALUES');
    expect(itemSql).toContain("(100, '剑', 10)");
    expect(itemSql).toContain("(101, '盾', 20)");

    const lootSql = fs.readFileSync(path.join(outDir, 'cfg_lootitem.sql'), 'utf-8');
    expect(lootSql).toContain('PRIMARY KEY (`lootid`, `itemid`)');
    expect(lootSql).toContain('UNIQUE KEY `uk_cfg_lootitem_itemid` (`itemid`)');
  });

  it('mode=all writes single combined file sorted by table name', async () => {
    const gen = new SqlGenerator(mockParameter({ dir: outDir, mode: 'all' }));
    await gen.generate(await makeContext());

    const files = fs.readdirSync(outDir);
    expect(files).toEqual(['config.sql']);

    const sql = fs.readFileSync(path.join(outDir, 'config.sql'), 'utf-8');
    expect(sql).toContain('`cfg_item`');
    expect(sql).toContain('`cfg_lootitem`');
    expect(sql.indexOf('cfg_item')).toBeLessThan(sql.indexOf('cfg_lootitem'));
  });

  it('tables= filter generates only listed tables', async () => {
    const gen = new SqlGenerator(mockParameter({ dir: outDir, tables: 'item' }));
    await gen.generate(await makeContext());

    const files = fs.readdirSync(outDir);
    expect(files).toEqual(['cfg_item.sql']);
  });

  it('noDrop flag omits DROP statement', async () => {
    const gen = new SqlGenerator(mockParameter({ dir: outDir, noDrop: '' }));
    await gen.generate(await makeContext());

    const itemSql = fs.readFileSync(path.join(outDir, 'cfg_item.sql'), 'utf-8');
    expect(itemSql).not.toContain('DROP TABLE');
    expect(itemSql).toContain('CREATE TABLE IF NOT EXISTS');
  });

  it('batch=1 writes one INSERT per row', async () => {
    const gen = new SqlGenerator(mockParameter({ dir: outDir, tables: 'item', batch: '1' }));
    await gen.generate(await makeContext());

    const itemSql = fs.readFileSync(path.join(outDir, 'cfg_item.sql'), 'utf-8');
    const insertCount = (itemSql.match(/INSERT INTO/g) || []).length;
    expect(insertCount).toBe(2);
  });

  it('batch=100 groups rows into one INSERT', async () => {
    const gen = new SqlGenerator(mockParameter({ dir: outDir, tables: 'lootitem', batch: '100' }));
    await gen.generate(await makeContext());

    const lootSql = fs.readFileSync(path.join(outDir, 'cfg_lootitem.sql'), 'utf-8');
    const insertCount = (lootSql.match(/INSERT INTO/g) || []).length;
    expect(insertCount).toBe(1);
  });

  it('prefix option changes table names', async () => {
    const gen = new SqlGenerator(mockParameter({ dir: outDir, tables: 'item', prefix: 't_' }));
    await gen.generate(await makeContext());

    const files = fs.readdirSync(outDir);
    expect(files).toEqual(['t_item.sql']);
    const sql = fs.readFileSync(path.join(outDir, 't_item.sql'), 'utf-8');
    expect(sql).toContain('`t_item`');
  });

  it('unknown mode throws', async () => {
    const gen = new SqlGenerator(mockParameter({ dir: outDir, mode: 'bad' }));
    await expect(gen.generate(await makeContext())).rejects.toThrow("unknown mode 'bad'");
  });
});
