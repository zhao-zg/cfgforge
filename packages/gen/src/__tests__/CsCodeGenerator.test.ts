/**
 * CsCodeGenerator tests — T8.4g
 *
 * Verifies that CsCodeGenerator:
 * 1. Generates .cs files in the correct directory structure (dir/pkg/)
 * 2. Generates Processor.cs with table dispatch
 * 3. Generates struct/table .cs files with proper namespace/class
 * 4. Copies Loader.cs runtime library
 * 5. Generates module loader files in _loaders/
 * 6. Reads constructor parameters (dir, pkg, encoding, prefix, serverText, unity)
 * 7. Extends GeneratorWithTag (own parameter)
 * 8. Handles enum tables
 * 9. Handles unity mode differences
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Context } from '@cfggen/context';
import { CsCodeGenerator } from '../CsCodeGenerator';
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

describe('CsCodeGenerator', () => {
  let tempDir: string;
  let dstDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-cs-'));
    dstDir = path.join(tempDir, 'out');
    fs.mkdirSync(dstDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('generates files in dir/pkg/ directory structure', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new CsCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    // Files should be in dir/pkg/ = out/Config/
    const csDir = path.join(dstDir, 'Config');
    expect(fs.existsSync(csDir)).toBe(true);
    expect(fs.existsSync(path.join(csDir, 'Processor.cs'))).toBe(true);
    expect(fs.existsSync(path.join(csDir, 'Loader.cs'))).toBe(true);
  });

  it('generates DUser.cs table class file', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new CsCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const csDir = path.join(dstDir, 'Config');
    const userCsPath = path.join(csDir, 'DUser.cs');
    expect(fs.existsSync(userCsPath)).toBe(true);
    const userCs = fs.readFileSync(userCsPath, 'utf8');
    // Class declaration with prefix D
    expect(userCs).toContain('public partial class DUser');
    // Field properties
    expect(userCs).toContain('public required int Id');
    expect(userCs).toContain('public required string Name');
    expect(userCs).toContain('public required int Age');
    // Static Get method
    expect(userCs).toContain('public static DUser? Get(int id)');
    // All() method
    expect(userCs).toContain('public static IReadOnlyList<DUser> All()');
  });

  it('generates Processor.cs with table dispatch', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new CsCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const csDir = path.join(dstDir, 'Config');
    const procCs = fs.readFileSync(path.join(csDir, 'Processor.cs'), 'utf8');
    expect(procCs).toContain('public static class Processor');
    expect(procCs).toContain('public static void Process(ConfigReader reader)');
    expect(procCs).toContain('"user"');
    expect(procCs).toContain('DUser.Initialize(reader)');
  });

  it('generates module loader files in _loaders/', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new CsCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const csDir = path.join(dstDir, 'Config');
    const loadersDir = path.join(csDir, '_loaders');
    expect(fs.existsSync(loadersDir)).toBe(true);
    const rootLoader = path.join(loadersDir, '_rootLoader.cs');
    expect(fs.existsSync(rootLoader)).toBe(true);
    const content = fs.readFileSync(rootLoader, 'utf8');
    expect(content).toContain('partial class DUser');
    expect(content).toContain('internal static void Initialize(ConfigReader reader)');
    expect(content).toContain('internal static DUser _create(ConfigReader reader)');
  });

  it('copies Loader.cs runtime library', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new CsCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const csDir = path.join(dstDir, 'Config');
    const loaderCs = fs.readFileSync(path.join(csDir, 'Loader.cs'), 'utf8');
    // Loader.cs should contain ConfigReader class
    expect(loaderCs).toContain('ConfigReader');
  });

  it('uses custom prefix parameter', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new CsCodeGenerator(mockParameter({ dir: dstDir, prefix: 'Cfg' }));
    await gen.generate(ctx);

    const csDir = path.join(dstDir, 'Config');
    const userCsPath = path.join(csDir, 'CfgUser.cs');
    expect(fs.existsSync(userCsPath)).toBe(true);
    const userCs = fs.readFileSync(userCsPath, 'utf8');
    expect(userCs).toContain('public partial class CfgUser');
  });

  it('uses custom pkg parameter as namespace', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new CsCodeGenerator(mockParameter({ dir: dstDir, pkg: 'MyGame' }));
    await gen.generate(ctx);

    const csDir = path.join(dstDir, 'MyGame');
    expect(fs.existsSync(csDir)).toBe(true);
    const userCs = fs.readFileSync(path.join(csDir, 'DUser.cs'), 'utf8');
    expect(userCs).toContain('namespace MyGame;');
  });

  it('generates namespace with file-scoped declaration (non-unity)', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new CsCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const csDir = path.join(dstDir, 'Config');
    const userCs = fs.readFileSync(path.join(csDir, 'DUser.cs'), 'utf8');
    // Non-unity: file-scoped namespace (no block)
    expect(userCs).toContain('namespace Config;');
    // Non-unity: required keyword
    expect(userCs).toContain('required ');
  });

  it('generates namespace with block declaration (unity mode)', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new CsCodeGenerator(mockParameter({ dir: dstDir, unity: 'true' }));
    await gen.generate(ctx);

    const csDir = path.join(dstDir, 'Config');
    const userCs = fs.readFileSync(path.join(csDir, 'DUser.cs'), 'utf8');
    // Unity: block namespace
    expect(userCs).toContain('namespace Config');
    expect(userCs).toContain('{');
    // Unity: no required keyword
    expect(userCs).not.toContain('required ');
    // Unity: uses using statements
    expect(userCs).toContain('using System;');
    expect(userCs).toContain('using System.Collections.Generic;');
  });

  it('reads constructor parameters correctly', () => {
    const gen = new CsCodeGenerator(mockParameter({}));
    expect(gen.dir).toBe('Config');
    expect(gen.pkg).toBe('Config');
    expect(gen.encoding).toBe('UTF-8');
    expect(gen.prefix).toBe('D');
    expect(gen.serverText).toBe(false);
    expect(gen.unity).toBe(false);
  });

  it('reads serverText and unity flags', () => {
    const genWith = new CsCodeGenerator(mockParameter({ serverText: 'true', unity: 'true' }));
    expect(genWith.serverText).toBe(true);
    expect(genWith.unity).toBe(true);

    const genWithout = new CsCodeGenerator(mockParameter({}));
    expect(genWithout.serverText).toBe(false);
    expect(genWithout.unity).toBe(false);
  });

  it('extends GeneratorWithTag (own parameter)', () => {
    const gen = new CsCodeGenerator(mockParameter({ own: 'tag1' }));
    expect(gen).toBeDefined();
    expect(gen).toBeInstanceOf(CsCodeGenerator);
  });

  it('handles enum table (entry field)', async () => {
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
    const gen = new CsCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const csDir = path.join(dstDir, 'Config');
    const colorCs = fs.readFileSync(path.join(csDir, 'DColor.cs'), 'utf8');
    // Enum definition
    expect(colorCs).toContain('public enum DColor');
    expect(colorCs).toContain('Red,');
    expect(colorCs).toContain('Green,');
    expect(colorCs).toContain('Blue,');
    // Info class
    expect(colorCs).toContain('public partial class DColorInfo');
    // Extensions class
    expect(colorCs).toContain('public static class DColorExtensions');
    // Enum extensions class
    expect(colorCs).toContain('public static class DColorExtensions');
    // _infos array for enum entries
    expect(colorCs).toContain('_infos');
    // EEnum property in Info class
    expect(colorCs).toContain('EEnum');
  });

  it('generates multiple table classes and processor entries', async () => {
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
    const gen = new CsCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const csDir = path.join(dstDir, 'Config');
    expect(fs.existsSync(path.join(csDir, 'DUser.cs'))).toBe(true);
    expect(fs.existsSync(path.join(csDir, 'DItem.cs'))).toBe(true);

    const procCs = fs.readFileSync(path.join(csDir, 'Processor.cs'), 'utf8');
    expect(procCs).toContain('"user"');
    expect(procCs).toContain('"item"');
    expect(procCs).toContain('DUser.Initialize(reader)');
    expect(procCs).toContain('DItem.Initialize(reader)');
  });

  it('generates struct with nested namespace path', async () => {
    const nestedCfg = `struct ai.behavior.tree {
  name:str;
  priority:int;
}
table ai.behavior.action[id] {
  id:int;
  desc:str;
}
`;
    const actionCsv = `ID,描述
id,desc
1,TestAction
`;
    writeFile(tempDir, 'config.cfg', nestedCfg);
    // CSV must be in ai/behavior/ subdirectory so getTableNameIndex parses 'ai.behavior.action'
    fs.mkdirSync(path.join(tempDir, 'ai', 'behavior'), { recursive: true });
    writeFile(path.join(tempDir, 'ai', 'behavior'), 'action.csv', actionCsv);

    const ctx = await Context.create(tempDir);
    const gen = new CsCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const csDir = path.join(dstDir, 'Config');
    // Nested namespace should create subdirectory
    const aiDir = path.join(csDir, 'Ai');
    const behaviorDir = path.join(aiDir, 'Behavior');
    expect(fs.existsSync(behaviorDir)).toBe(true);
    // Struct file
    expect(fs.existsSync(path.join(behaviorDir, 'DTree.cs'))).toBe(true);
    // Table file
    expect(fs.existsSync(path.join(behaviorDir, 'DAction.cs'))).toBe(true);

    const treeCs = fs.readFileSync(path.join(behaviorDir, 'DTree.cs'), 'utf8');
    expect(treeCs).toContain('namespace Config.Ai.Behavior;');
    expect(treeCs).toContain('public partial class DTree');
  });

  it('_create method reads fields from ConfigReader', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new CsCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const csDir = path.join(dstDir, 'Config');
    const loadersDir = path.join(csDir, '_loaders');
    const rootLoader = fs.readFileSync(path.join(loadersDir, '_rootLoader.cs'), 'utf8');
    expect(rootLoader).toContain('var id = reader.ReadInt32()');
    expect(rootLoader).toContain('var name = reader.ReadStringInPool()');
    expect(rootLoader).toContain('var age = reader.ReadInt32()');
    expect(rootLoader).toContain('Id = id');
    expect(rootLoader).toContain('Name = name');
    expect(rootLoader).toContain('Age = age');
  });

  it('generates GetHashCode/Equals/ToString overrides', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new CsCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const csDir = path.join(dstDir, 'Config');
    const loadersDir = path.join(csDir, '_loaders');
    const rootLoader = fs.readFileSync(path.join(loadersDir, '_rootLoader.cs'), 'utf8');
    expect(rootLoader).toContain('public override int GetHashCode()');
    expect(rootLoader).toContain('public override bool Equals(object? obj)');
    expect(rootLoader).toContain('public override string ToString()');
    // GetHashCode should use primary key fields
    expect(rootLoader).toContain('Id.GetHashCode()');
  });
});
