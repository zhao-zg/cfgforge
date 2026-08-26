/**
 * JsonGenerator tests — T8.2
 *
 * Ported from Java JsonGenerator behavior (configgen.genjson.JsonGenerator).
 *
 * The generator writes one JSON file per record into `<dst>/<tableDir>/<pk>.json`
 * via VTableJsonStorage.addOrUpdateRecord.
 *
 * Differences from Java:
 * - `generate(ctx)` is async (Promise<void>)
 * - dst is resolved relative to dataDir (Java uses Path.of(dst) with cwd)
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Context } from '@cfgforge/context';
import { JsonGenerator } from '../JsonGenerator';
import type { Parameter } from '../Parameter';

function writeFile(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Minimal mock Parameter: returns values from a plain object. */
function mockParameter(opts: Record<string, string>): Parameter {
  return {
    get: (k: string, def: string) => (k in opts ? opts[k] : def),
    has: (k: string) => k in opts,
    getOrNull: (k: string) => (k in opts ? opts[k] : null),
  };
}

const USER_CFG = `table user[id] {
  id:int;
  name:str;
  age:int;
}
`;

const USER_CSV = `用户ID,姓名,年龄
id,name,age
1,Alice,25
2,Bob,30
`;

describe('JsonGenerator', () => {
  let tempDir: string;
  let dstDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-json-'));
    dstDir = path.join(tempDir, 'out');
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('generates one JSON file per record', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new JsonGenerator(mockParameter({ tables: 'user', dst: dstDir }));
    await gen.generate(ctx);

    expect(fs.existsSync(path.join(dstDir, '_user', '1.json'))).toBe(true);
    expect(fs.existsSync(path.join(dstDir, '_user', '2.json'))).toBe(true);

    const json1 = JSON.parse(fs.readFileSync(path.join(dstDir, '_user', '1.json'), 'utf8'));
    expect(json1).toEqual({
      $type: 'user',
      id: 1,
      name: 'Alice',
      age: 25,
    });
  });

  it('uses dst parameter when provided', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const customDir = path.join(tempDir, 'custom');
    const ctx = await Context.create(tempDir);
    const gen = new JsonGenerator(mockParameter({ tables: 'user', dst: customDir }));
    await gen.generate(ctx);

    expect(fs.existsSync(path.join(customDir, '_user', '1.json'))).toBe(true);
  });

  it('ignores tables that do not exist in the value', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new JsonGenerator(mockParameter({ tables: 'user;nosuchtable', dst: dstDir }));
    await gen.generate(ctx);

    expect(fs.existsSync(path.join(dstDir, '_user', '1.json'))).toBe(true);
    expect(fs.existsSync(path.join(dstDir, 'nosuchtable'))).toBe(false);
  });

  it('ignores tables with map fields', async () => {
    const mapCfg = `table item[id] {
  id:int;
  attrs:map<int,int> (pack);
}
`;
    const mapCsv = `ID,属性
id,attrs
1,"1,10"
`;
    writeFile(tempDir, 'config.cfg', mapCfg);
    writeFile(tempDir, 'item.csv', mapCsv);

    const ctx = await Context.create(tempDir);
    const gen = new JsonGenerator(mockParameter({ tables: 'item', dst: dstDir }));
    await gen.generate(ctx);

    // Table has map → ignored, no JSON files generated
    expect(fs.existsSync(path.join(dstDir, '_item'))).toBe(false);
  });

  it('supports tables parameter listing multiple tables', async () => {
    const cfg = `
table user[id] {
  id:int;
  name:str;
}
table item[id] {
  id:int;
  price:int;
}
`;
    writeFile(tempDir, 'config.cfg', cfg);
    writeFile(tempDir, 'user.csv', 'ID,姓名\nid,name\n1,Alice\n');
    writeFile(tempDir, 'item.csv', 'ID,价格\nid,price\n1,100\n');

    const ctx = await Context.create(tempDir);
    const gen = new JsonGenerator(mockParameter({ tables: 'user;item', dst: dstDir }));
    await gen.generate(ctx);

    expect(fs.existsSync(path.join(dstDir, '_user', '1.json'))).toBe(true);
    expect(fs.existsSync(path.join(dstDir, '_item', '1.json'))).toBe(true);
  });

  it('extends GeneratorWithTag (own parameter)', () => {
    const gen = new JsonGenerator(mockParameter({ own: 'tag1', tables: 'user' }));
    expect(gen.tag).toBe('tag1');
  });
});
