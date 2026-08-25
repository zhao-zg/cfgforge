/**
 * LuaCodeGenerator tests — T8.7
 *
 * Verifies that LuaCodeGenerator:
 * 1. Generates _cfgs.lua, _beans.lua, and per-table .lua files in dir/pkg/
 * 2. Generates correct Lua table data with field names and values
 * 3. Reads constructor parameters (dir, pkg, encoding, flags)
 * 4. Extends GeneratorWithTag (own parameter)
 * 5. Handles interface + impl beans in _beans.lua
 * 6. Handles enum tables
 * 7. Handles foreign key refs
 * 8. Handles list fields
 * 9. Generates with packBool optimization
 * 10. Generates with shared optimization
 * 11. Handles nested namespace (dot-separated) tables
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Context } from '@cfggen/context';
import { CachedFiles } from '@cfggen/shared';
import { LuaCodeGenerator } from '../LuaCodeGenerator';
import { GeneratorWithTag } from '../GeneratorWithTag';
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

// Simple schema: one table with int pk, string name, int age
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

describe('LuaCodeGenerator', () => {
  let tempDir: string;
  let dstDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-lua-'));
    dstDir = path.join(tempDir, 'out');
    fs.mkdirSync(dstDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('generates _cfgs.lua, _beans.lua, and user.lua files', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new LuaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const luaDir = path.join(dstDir, 'cfg');
    expect(fs.existsSync(luaDir)).toBe(true);
    expect(fs.existsSync(path.join(luaDir, '_cfgs.lua'))).toBe(true);
    expect(fs.existsSync(path.join(luaDir, '_beans.lua'))).toBe(true);
    expect(fs.existsSync(path.join(luaDir, 'user.lua'))).toBe(true);
  });

  it('generates _cfgs.lua with package definition and require', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new LuaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const cfgsLua = fs.readFileSync(path.join(dstDir, 'cfg', '_cfgs.lua'), 'utf8');
    expect(cfgsLua).toContain('local cfg = {}');
    expect(cfgsLua).toContain('cfg._mk = require "common.mkcfg"');
    expect(cfgsLua).toContain('local pre = cfg._mk.pretable');
    expect(cfgsLua).toContain('cfg.user = pre("cfg.user"');
    expect(cfgsLua).toContain('return cfg');
  });

  it('generates user.lua with mk.table call and data', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new LuaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const userLua = fs.readFileSync(path.join(dstDir, 'cfg', 'user.lua'), 'utf8');
    // require _cfgs
    expect(userLua).toContain('local cfg = require "cfg._cfgs"');
    // local this = cfg.user
    expect(userLua).toContain('local this = cfg.user');
    // mk.table call
    expect(userLua).toContain('local mk = cfg._mk.table(this,');
    // Field names
    expect(userLua).toContain("'id'");
    expect(userLua).toContain("'name'");
    expect(userLua).toContain("'age'");
    // Data rows: mk("Alice", 25) or mk(1, "Alice", 25)
    expect(userLua).toContain('mk(');
    expect(userLua).toContain('Alice');
    expect(userLua).toContain('Bob');
    // Return
    expect(userLua).toContain('return this');
  });

  it('generates _beans.lua with Beans definitions', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new LuaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const beansLua = fs.readFileSync(path.join(dstDir, 'cfg', '_beans.lua'), 'utf8');
    expect(beansLua).toContain('local cfg = require "cfg._cfgs"');
    expect(beansLua).toContain('local Beans = {}');
    expect(beansLua).toContain('cfg._beans = Beans');
    expect(beansLua).toContain('local bean = cfg._mk.bean');
    expect(beansLua).toContain('local action = cfg._mk.action');
    expect(beansLua).toContain('return Beans');
  });

  it('reads constructor parameters correctly', () => {
    const gen = new LuaCodeGenerator(mockParameter({}));
    expect(gen.dir).toBe('.');
    expect(gen.pkg).toBe('cfg');
    expect(gen.encoding).toBe('UTF-8');
    expect(gen.useEmmyLua).toBe(false);
    expect(gen.preload).toBe(false);
    expect(gen.useShared).toBe(false);
    expect(gen.useSharedEmptyTable).toBe(false);
    expect(gen.packBool).toBe(false);
    expect(gen.noStr).toBe(false);
    expect(gen.rForOldShared).toBe(false);
  });

  it('reads flag parameters', () => {
    const gen = new LuaCodeGenerator(mockParameter({
      emmylua: 'true',
      preload: 'true',
      shared: 'true',
      sharedEmptyTable: 'true',
      packBool: 'true',
      noStr: 'true',
      rForOldShared: 'true',
    }));
    expect(gen.useEmmyLua).toBe(true);
    expect(gen.preload).toBe(true);
    expect(gen.useShared).toBe(true);
    expect(gen.useSharedEmptyTable).toBe(true);
    expect(gen.packBool).toBe(true);
    expect(gen.noStr).toBe(true);
    expect(gen.rForOldShared).toBe(true);
  });

  it('extends GeneratorWithTag (own parameter)', () => {
    const gen = new LuaCodeGenerator(mockParameter({ own: 'tag1' }));
    expect(gen).toBeDefined();
    expect(gen).toBeInstanceOf(LuaCodeGenerator);
    expect(gen).toBeInstanceOf(GeneratorWithTag);
  });

  it('uses custom pkg parameter', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new LuaCodeGenerator(mockParameter({ dir: dstDir, pkg: 'mygame' }));
    await gen.generate(ctx);

    const luaDir = path.join(dstDir, 'mygame');
    expect(fs.existsSync(luaDir)).toBe(true);
    const cfgsLua = fs.readFileSync(path.join(luaDir, '_cfgs.lua'), 'utf8');
    expect(cfgsLua).toContain('local mygame = {}');
    expect(cfgsLua).toContain('mygame._mk = require "common.mkcfg"');
    expect(cfgsLua).toContain('mygame.user = pre("mygame.user"');
  });

  it('generates multiple table .lua files', async () => {
    const multiCfg = `table user[id] {
  id:int;
  name:str;
}
table item[id] {
  id:int;
  price:int;
}
`;
    const multiCsvUser = `用户ID,姓名
id,name
1,Alice
`;
    const multiCsvItem = `物品ID,价格
id,price
1,100
`;
    writeFile(tempDir, 'config.cfg', multiCfg);
    writeFile(tempDir, 'user.csv', multiCsvUser);
    writeFile(tempDir, 'item.csv', multiCsvItem);

    const ctx = await Context.create(tempDir);
    const gen = new LuaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const luaDir = path.join(dstDir, 'cfg');
    expect(fs.existsSync(path.join(luaDir, 'user.lua'))).toBe(true);
    expect(fs.existsSync(path.join(luaDir, 'item.lua'))).toBe(true);

    const cfgsLua = fs.readFileSync(path.join(luaDir, '_cfgs.lua'), 'utf8');
    expect(cfgsLua).toContain('cfg.user');
    expect(cfgsLua).toContain('cfg.item');
  });

  it('generates interface and impl beans', async () => {
    const ifaceCfg = `interface shape {
  struct circle {
    radius:int;
  }
  struct square {
    side:int;
  }
}
table shapeconfig[id] {
  id:int;
  shape:shape (pack);
}
`;
    const shapeCsv = `ID,Shape
id,shape
1,circle(1)
`;
    writeFile(tempDir, 'config.cfg', ifaceCfg);
    writeFile(tempDir, 'shapeconfig.csv', shapeCsv);

    const ctx = await Context.create(tempDir);
    const gen = new LuaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const luaDir = path.join(dstDir, 'cfg');
    expect(fs.existsSync(path.join(luaDir, 'shapeconfig.lua'))).toBe(true);

    const beansLua = fs.readFileSync(path.join(luaDir, '_beans.lua'), 'utf8');
    // Interface beans
    expect(beansLua).toContain('Beans.shape');
    // Impl beans as action
    expect(beansLua).toContain('Beans.shape.circle');
    expect(beansLua).toContain('Beans.shape.square');
    expect(beansLua).toContain('action(');
  });

  it('handles enum table (EEnum entry)', async () => {
    const enumCfg = `table color[name] (enum='name') {
  name:str;
  r:int;
  g:int;
  b:int;
}
`;
    const enumCsv = `名称,R,G,B
name,r,g,b
Red,255,0,0
Green,0,255,0
Blue,0,0,255
`;
    writeFile(tempDir, 'config.cfg', enumCfg);
    writeFile(tempDir, 'color.csv', enumCsv);

    const ctx = await Context.create(tempDir);
    const gen = new LuaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const luaDir = path.join(dstDir, 'cfg');
    const colorLua = fs.readFileSync(path.join(luaDir, 'color.lua'), 'utf8');
    // Enum index is the column index of the entry field
    expect(colorLua).toContain('mk.table(this,');
    expect(colorLua).toContain('Red');
    expect(colorLua).toContain('Green');
    expect(colorLua).toContain('Blue');
  });

  it('generates with emmylua annotations', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new LuaCodeGenerator(mockParameter({ dir: dstDir, emmylua: 'true' }));
    await gen.generate(ctx);

    const luaDir = path.join(dstDir, 'cfg');
    const userLua = fs.readFileSync(path.join(luaDir, 'user.lua'), 'utf8');
    // EmmyLua annotations on table file: @class and @field
    expect(userLua).toContain('---@class cfg.user');
    expect(userLua).toContain('---@field id number');
    expect(userLua).toContain('---@field name string');
    expect(userLua).toContain('---@field age number');
    expect(userLua).toContain('---@field all table<any,cfg.user>');
    // @type is generated in _cfgs.lua, not in user.lua
    const cfgsLua = fs.readFileSync(path.join(luaDir, '_cfgs.lua'), 'utf8');
    expect(cfgsLua).toContain('---@type cfg.user');
  });

  it('handles list field in table', async () => {
    const listCfg = `table bag[id] {
  id:int;
  items:list<int> (pack);
}
`;
    const listCsv = `ID,Items
id,items
1,1;2;3
`;
    writeFile(tempDir, 'config.cfg', listCfg);
    writeFile(tempDir, 'bag.csv', listCsv);

    const ctx = await Context.create(tempDir);
    const gen = new LuaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const luaDir = path.join(dstDir, 'cfg');
    const bagLua = fs.readFileSync(path.join(luaDir, 'bag.lua'), 'utf8');
    expect(bagLua).toContain("'items'");
    // List data should contain {1, 2, 3}
    expect(bagLua).toContain('{');
    expect(bagLua).toContain('1');
    expect(bagLua).toContain('2');
    expect(bagLua).toContain('3');
  });

  it('handles foreign key refs', async () => {
    const fkCfg = `table weapon[id] {
  id:int;
  name:str;
}
table hero[id] {
  id:int;
  weaponid:int -> weapon;
}
`;
    const weaponCsv = `ID,Name
id,name
1,Sword
`;
    const heroCsv = `ID,WeaponID
id,weaponid
1,1
`;
    writeFile(tempDir, 'config.cfg', fkCfg);
    writeFile(tempDir, 'weapon.csv', weaponCsv);
    writeFile(tempDir, 'hero.csv', heroCsv);

    const ctx = await Context.create(tempDir);
    const gen = new LuaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const luaDir = path.join(dstDir, 'cfg');
    const heroLua = fs.readFileSync(path.join(luaDir, 'hero.lua'), 'utf8');
    // Ref definition
    expect(heroLua).toContain('RefWeaponid');
    expect(heroLua).toContain('cfg.weapon');
  });

  it('handles bool fields with packBool', async () => {
    const boolCfg = `table flag[id] {
  id:int;
  a:bool;
  b:bool;
  c:bool;
}
`;
    const boolCsv = `ID,A,B,C
id,a,b,c
1,true,false,true
`;
    writeFile(tempDir, 'config.cfg', boolCfg);
    writeFile(tempDir, 'flag.csv', boolCsv);

    const ctx = await Context.create(tempDir);
    const gen = new LuaCodeGenerator(mockParameter({ dir: dstDir, packBool: 'true' }));
    await gen.generate(ctx);

    const luaDir = path.join(dstDir, 'cfg');
    const flagLua = fs.readFileSync(path.join(luaDir, 'flag.lua'), 'utf8');
    // packBool packs bools into a hex value; the field list should have a combined bool entry
    expect(flagLua).toContain("'a'");
    expect(flagLua).toContain("'b'");
    expect(flagLua).toContain("'c'");
    // The data should contain a hex value (0x...)
    expect(flagLua).toMatch(/0x[0-9a-f]+/);
  });

  it('handles nested namespace tables', async () => {
    const nestedCfg = `table ai.behavior.action[id] {
  id:int;
  desc:str;
}
`;
    const actionCsv = `ID,描述
id,desc
1,TestAction
`;
    writeFile(tempDir, 'config.cfg', nestedCfg);
    fs.mkdirSync(path.join(tempDir, 'ai', 'behavior'), { recursive: true });
    writeFile(path.join(tempDir, 'ai', 'behavior'), 'action.csv', actionCsv);

    const ctx = await Context.create(tempDir);
    const gen = new LuaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const luaDir = path.join(dstDir, 'cfg');
    // Table path: ai/behavior/action.lua (dot → slash)
    expect(fs.existsSync(path.join(luaDir, 'ai', 'behavior', 'action.lua'))).toBe(true);

    const cfgsLua = fs.readFileSync(path.join(luaDir, '_cfgs.lua'), 'utf8');
    // Package definition: ai = {} and ai.behavior = {}
    expect(cfgsLua).toContain('ai = {}');
    expect(cfgsLua).toContain('ai.behavior = {}');
    expect(cfgsLua).toContain('cfg.ai.behavior.action');
  });

  it('generates preload _loads.lua when preload flag is set', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new LuaCodeGenerator(mockParameter({ dir: dstDir, preload: 'true' }));
    await gen.generate(ctx);

    const luaDir = path.join(dstDir, 'cfg');
    expect(fs.existsSync(path.join(luaDir, '_loads.lua'))).toBe(true);
    const loadsLua = fs.readFileSync(path.join(luaDir, '_loads.lua'), 'utf8');
    expect(loadsLua).toContain('local require = require');
    expect(loadsLua).toContain('require "cfg.user"');
  });

  it('generates struct bean in _beans.lua', async () => {
    const structCfg = `struct equip {
  name:str;
  level:int;
}
table item[id] {
  id:int;
  equip:equip (pack);
}
`;
    const itemCsv = `ID,Equip
id,equip
1,Sword;5
`;
    writeFile(tempDir, 'config.cfg', structCfg);
    writeFile(tempDir, 'item.csv', itemCsv);

    const ctx = await Context.create(tempDir);
    const gen = new LuaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const beansLua = fs.readFileSync(path.join(dstDir, 'cfg', '_beans.lua'), 'utf8');
    expect(beansLua).toContain('Beans.equip');
    expect(beansLua).toContain('bean(');
    expect(beansLua).toContain("'name'");
    expect(beansLua).toContain("'level'");
  });

  it('cleans up stale .lua files in target directory', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    // Pre-create a stale file
    const luaDir = path.join(dstDir, 'cfg');
    fs.mkdirSync(luaDir, { recursive: true });
    writeFile(luaDir, 'stale.lua', '-- old file');

    const ctx = await Context.create(tempDir);
    const gen = new LuaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    // keepMetaAndDeleteOtherFiles only queues the dir; finalExit does the actual deletion
    CachedFiles.finalExit();

    // stale.lua should be cleaned (keepMetaAndDeleteOtherFiles)
    // Note: keepMetaAndDeleteOtherFiles only keeps files written in this run
    expect(fs.existsSync(path.join(luaDir, 'stale.lua'))).toBe(false);
    expect(fs.existsSync(path.join(luaDir, 'user.lua'))).toBe(true);
  });
});
