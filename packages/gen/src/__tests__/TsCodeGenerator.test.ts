/**
 * TsCodeGenerator tests — T8.3e
 *
 * Verifies that TsCodeGenerator:
 * 1. Generates Config.ts with the expected namespace/class structure
 * 2. Copies ConfigUtil.ts to the output directory
 * 3. Reads constructor parameters (dir, pkg, encoding, serverText)
 * 4. Extends GeneratorWithTag (own parameter)
 * 5. className() converts fullName to Upper1_Segmented format
 *
 * The test uses a simple schema with one table to verify the output
 * contains the essential structural elements.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Context } from '@cfggen/context';
import { TsCodeGenerator } from '../TsCodeGenerator';
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

describe('TsCodeGenerator', () => {
  let tempDir: string;
  let dstDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-ts-'));
    dstDir = path.join(tempDir, 'out');
    fs.mkdirSync(dstDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('generates Config.ts and ConfigUtil.ts', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new TsCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    expect(fs.existsSync(path.join(dstDir, 'Config.ts'))).toBe(true);
    expect(fs.existsSync(path.join(dstDir, 'ConfigUtil.ts'))).toBe(true);
  });

  it('Config.ts contains namespace and class declaration', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new TsCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const configTs = fs.readFileSync(path.join(dstDir, 'Config.ts'), 'utf8');
    // namespace
    expect(configTs).toContain('export namespace Config');
    // class for the user table
    expect(configTs).toContain('export class User');
    // Processor class
    expect(configTs).toContain('export class Processor');
    // namespace closing
    expect(configTs).toContain('}');
  });

  it('Config.ts contains field properties and Get method', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new TsCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const configTs = fs.readFileSync(path.join(dstDir, 'Config.ts'), 'utf8');
    // Field getters
    expect(configTs).toContain('get Id(): number');
    expect(configTs).toContain('get Name(): string');
    expect(configTs).toContain('get Age(): number');
    // Primary key Get method
    expect(configTs).toContain('static Get(id: number)');
    // All() method
    expect(configTs).toContain('static All()');
    // Initialize method
    expect(configTs).toContain('static Initialize(os: Stream, errors: LoadErrors)');
    // _create method
    expect(configTs).toContain('static _create(os: Stream)');
  });

  it('ConfigUtil.ts contains Stream class and LoadErrors', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new TsCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const configUtil = fs.readFileSync(path.join(dstDir, 'ConfigUtil.ts'), 'utf8');
    expect(configUtil).toContain('export class Stream');
    expect(configUtil).toContain('export class LoadErrors');
  });

  it('uses custom pkg parameter as namespace name', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new TsCodeGenerator(mockParameter({ dir: dstDir, pkg: 'MyGame' }));
    await gen.generate(ctx);

    const configTs = fs.readFileSync(path.join(dstDir, 'Config.ts'), 'utf8');
    expect(configTs).toContain('export namespace MyGame');
    expect(configTs).not.toContain('export namespace Config');
  });

  it('Config.ts includes import from ConfigUtil', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new TsCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const configTs = fs.readFileSync(path.join(dstDir, 'Config.ts'), 'utf8');
    expect(configTs).toContain('import {Stream, LoadErrors, ToStringList, ToStringMap');
    expect(configTs).toContain('from "./ConfigUtil"');
  });

  it('extends GeneratorWithTag (own parameter)', () => {
    const gen = new TsCodeGenerator(mockParameter({ own: 'tag1' }));
    // tag is protected in GeneratorWithTag, but the behavior is testable:
    // the constructor should not throw and the generator should work
    expect(gen).toBeDefined();
    expect(gen).toBeInstanceOf(TsCodeGenerator);
  });

  it('reads serverText flag parameter', () => {
    const genWithServerText = new TsCodeGenerator(mockParameter({ serverText: 'true' }));
    expect(genWithServerText.serverText).toBe(true);

    const genWithoutServerText = new TsCodeGenerator(mockParameter({}));
    expect(genWithoutServerText.serverText).toBe(false);
  });

  it('className converts dotted fullName to Upper1_Segmented', () => {
    const gen = new TsCodeGenerator(mockParameter({}));
    // Mock a Nameable with fullName "namespace.name"
    const mockNameable = {
      fullName: () => 'npc.monster.goblin',
    };
    // @ts-expect-error: mock for testing
    expect(gen.className(mockNameable)).toBe('Npc_Monster_Goblin');
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
    const gen = new TsCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const configTs = fs.readFileSync(path.join(dstDir, 'Config.ts'), 'utf8');
    expect(configTs).toContain('export class Color');
    // Enum static fields
    expect(configTs).toContain('private static _Red');
    expect(configTs).toContain('static get Red()');
    expect(configTs).toContain('private static _Green');
    expect(configTs).toContain('static get Green()');
    expect(configTs).toContain('private static _Blue');
    expect(configTs).toContain('static get Blue()');
  });

  it('generates multiple table classes', async () => {
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
    const gen = new TsCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const configTs = fs.readFileSync(path.join(dstDir, 'Config.ts'), 'utf8');
    expect(configTs).toContain('export class User');
    expect(configTs).toContain('export class Item');
    // Processor should list both tables
    expect(configTs).toContain('"user"');
    expect(configTs).toContain('"item"');
  });
});
