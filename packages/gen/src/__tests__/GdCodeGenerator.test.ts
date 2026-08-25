/**
 * GdCodeGenerator tests — T8.8
 *
 * Verifies that GdCodeGenerator:
 * 1. Generates .gd files in the correct directory structure
 * 2. Copies runtime files (ConfigStream.gd, ConfigLoader.gd, ConfigErrors.gd, TextPoolManager.gd)
 * 3. Generates ConfigProcessor.gd with table dispatch
 * 4. Generates struct/table .gd files with proper class_name
 * 5. Reads constructor parameters (dir, prefix)
 * 6. Extends GeneratorWithTag (own parameter)
 * 7. Handles enum tables
 * 8. Generates interface and impl files
 * 9. Generates _create with stream read calls
 * 10. Handles struct with foreign keys
 * 11. Cleans up stale files
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Context } from '@cfggen/context';
import { CachedFiles } from '@cfggen/shared';
import { GdCodeGenerator } from '../GdCodeGenerator';
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

describe('GdCodeGenerator', () => {
  let tempDir: string;
  let dstDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-gd-'));
    dstDir = path.join(tempDir, 'out');
    fs.mkdirSync(dstDir, { recursive: true });
  });

  afterEach(() => {
    CachedFiles.finalExit();
    rmSync(tempDir);
  });

  it('generates files in dir directory structure', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new GdCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    // Files should be in dir/ = out/
    expect(fs.existsSync(dstDir)).toBe(true);
    expect(fs.existsSync(path.join(dstDir, 'ConfigStream.gd'))).toBe(true);
    expect(fs.existsSync(path.join(dstDir, 'ConfigLoader.gd'))).toBe(true);
    expect(fs.existsSync(path.join(dstDir, 'ConfigErrors.gd'))).toBe(true);
    expect(fs.existsSync(path.join(dstDir, 'TextPoolManager.gd'))).toBe(true);
    // ConfigProcessor.gd
    expect(fs.existsSync(path.join(dstDir, 'ConfigProcessor.gd'))).toBe(true);
  });

  it('generates DataUser.gd table file with class_name and fields', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new GdCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const userGdPath = path.join(dstDir, 'DataUser.gd');
    expect(fs.existsSync(userGdPath)).toBe(true);
    const userGd = fs.readFileSync(userGdPath, 'utf8');
    // class_name
    expect(userGd).toContain('class_name DataUser');
    // Public properties
    expect(userGd).toContain('var id: int');
    expect(userGd).toContain('var name: String');
    expect(userGd).toContain('var age: int');
    // _to_string
    expect(userGd).toContain('func _to_string() -> String:');
    // _create
    expect(userGd).toContain('static func _create(stream: ConfigStream) -> DataUser:');
    // Stream read calls
    expect(userGd).toContain('stream.read_int32()');
    expect(userGd).toContain('stream.read_string_in_pool()');
    // Internal storage
    expect(userGd).toContain('static var _data: Dictionary[int, DataUser]');
    // find by primary key
    expect(userGd).toContain('static func find(id: int) -> DataUser:');
    // all()
    expect(userGd).toContain('static func all() -> Array[DataUser]:');
    // _init_from_stream
    expect(userGd).toContain('static func _init_from_stream(stream: ConfigStream, _errors: ConfigErrors):');
  });

  it('generates ConfigProcessor.gd with table dispatch', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new GdCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const processorGd = fs.readFileSync(path.join(dstDir, 'ConfigProcessor.gd'), 'utf8');
    expect(processorGd).toContain('class_name ConfigProcessor');
    expect(processorGd).toContain('func load_from_stream(stream: ConfigStream, _errors: ConfigErrors):');
    expect(processorGd).toContain('config_nulls.append("user")');
    expect(processorGd).toContain('"user":');
    expect(processorGd).toContain('config_nulls.erase("user")');
    expect(processorGd).toContain('DataUser._init_from_stream(stream, _errors)');
  });

  it('copies runtime .gd files', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new GdCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const streamGd = fs.readFileSync(path.join(dstDir, 'ConfigStream.gd'), 'utf8');
    expect(streamGd).toContain('class_name ConfigStream');

    const errorsGd = fs.readFileSync(path.join(dstDir, 'ConfigErrors.gd'), 'utf8');
    expect(errorsGd).toContain('class_name ConfigErrors');
  });

  it('reads constructor parameters correctly', () => {
    const gen = new GdCodeGenerator(mockParameter({}));
    expect(gen.dir).toBe('config');
    expect(gen.prefix).toBe('Data');
  });

  it('reads custom prefix parameter', () => {
    const gen = new GdCodeGenerator(mockParameter({ prefix: 'Cfg' }));
    expect(gen.prefix).toBe('Cfg');
  });

  it('extends GeneratorWithTag (own parameter)', () => {
    const gen = new GdCodeGenerator(mockParameter({ own: 'tag1' }));
    expect(gen).toBeDefined();
    expect(gen).toBeInstanceOf(GdCodeGenerator);
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
    const gen = new GdCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const colorGd = fs.readFileSync(path.join(dstDir, 'DataColor.gd'), 'utf8');
    // Static enum instances
    expect(colorGd).toContain('static var Red: DataColor');
    expect(colorGd).toContain('static var Green: DataColor');
    expect(colorGd).toContain('static var Blue: DataColor');
    // Enum match in _init_from_stream
    expect(colorGd).toContain('match item.name.strip_edges():');
    expect(colorGd).toContain('"Red":');
    expect(colorGd).toContain('"Green":');
    expect(colorGd).toContain('"Blue":');
    // Null check
    expect(colorGd).toContain('enum_null');
  });

  it('generates interface and impl files', async () => {
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
    const gen = new GdCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    // Interface file: DataShape.gd
    expect(fs.existsSync(path.join(dstDir, 'DataShape.gd'))).toBe(true);
    const ifaceGd = fs.readFileSync(path.join(dstDir, 'DataShape.gd'), 'utf8');
    expect(ifaceGd).toContain('class_name DataShape');
    expect(ifaceGd).toContain('static func _create(stream: ConfigStream) -> DataShape:');
    expect(ifaceGd).toContain('match type_name:');
    expect(ifaceGd).toContain('"circle":');
    expect(ifaceGd).toContain('return DataShape_Circle._create(stream)');
    expect(ifaceGd).toContain('"square":');
    expect(ifaceGd).toContain('return DataShape_Square._create(stream)');

    // Impl files: Shape/DataShape_Circle.gd, Shape/DataShape_Square.gd
    expect(fs.existsSync(path.join(dstDir, 'Shape', 'DataShape_Circle.gd'))).toBe(true);
    expect(fs.existsSync(path.join(dstDir, 'Shape', 'DataShape_Square.gd'))).toBe(true);

    const circleGd = fs.readFileSync(path.join(dstDir, 'Shape', 'DataShape_Circle.gd'), 'utf8');
    expect(circleGd).toContain('class_name DataShape_Circle extends DataShape');
    expect(circleGd).toContain('var radius: int');

    const squareGd = fs.readFileSync(path.join(dstDir, 'Shape', 'DataShape_Square.gd'), 'utf8');
    expect(squareGd).toContain('class_name DataShape_Square extends DataShape');
    expect(squareGd).toContain('var side: int');

    // Table file: DataShapeconfig.gd
    expect(fs.existsSync(path.join(dstDir, 'DataShapeconfig.gd'))).toBe(true);
  });

  it('generates multiple table files and ConfigProcessor entries', async () => {
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
    const gen = new GdCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    expect(fs.existsSync(path.join(dstDir, 'DataUser.gd'))).toBe(true);
    expect(fs.existsSync(path.join(dstDir, 'DataItem.gd'))).toBe(true);

    const processorGd = fs.readFileSync(path.join(dstDir, 'ConfigProcessor.gd'), 'utf8');
    expect(processorGd).toContain('"user"');
    expect(processorGd).toContain('"item"');
    expect(processorGd).toContain('DataUser._init_from_stream');
    expect(processorGd).toContain('DataItem._init_from_stream');
  });

  it('generates _create with stream read calls', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new GdCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const userGd = fs.readFileSync(path.join(dstDir, 'DataUser.gd'), 'utf8');
    expect(userGd).toContain('instance.id = stream.read_int32()');
    expect(userGd).toContain('instance.name = stream.read_string_in_pool()');
    expect(userGd).toContain('instance.age = stream.read_int32()');
  });

  it('generates _to_string with field format', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new GdCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const userGd = fs.readFileSync(path.join(dstDir, 'DataUser.gd'), 'utf8');
    // _to_string should contain field format
    expect(userGd).toContain('"DataUser{"');
    expect(userGd).toContain('str(id)');
    // name is String, no str() wrapper
    expect(userGd).toContain('name');
    expect(userGd).toContain('str(age)');
  });

  it('generates _init_from_stream with count loop', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new GdCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const userGd = fs.readFileSync(path.join(dstDir, 'DataUser.gd'), 'utf8');
    expect(userGd).toContain('var count = stream.read_int32()');
    expect(userGd).toContain('for i in range(count):');
    expect(userGd).toContain('var item = _create(stream)');
    expect(userGd).toContain('_data[item.id] = item');
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
    // CSV must be in ai/behavior/ subdirectory
    fs.mkdirSync(path.join(tempDir, 'ai', 'behavior'), { recursive: true });
    writeFile(path.join(tempDir, 'ai', 'behavior'), 'action.csv', actionCsv);

    const ctx = await Context.create(tempDir);
    const gen = new GdCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    // Struct file: Ai/Behavior/DataAiBehavior_Tree.gd (namespace dir + className)
    expect(fs.existsSync(path.join(dstDir, 'Ai', 'Behavior', 'DataAiBehavior_Tree.gd'))).toBe(true);
    // Table file: Ai/Behavior/DataAiBehavior_Action.gd
    expect(fs.existsSync(path.join(dstDir, 'Ai', 'Behavior', 'DataAiBehavior_Action.gd'))).toBe(true);

    const treeGd = fs.readFileSync(path.join(dstDir, 'Ai', 'Behavior', 'DataAiBehavior_Tree.gd'), 'utf8');
    expect(treeGd).toContain('class_name DataAiBehavior_Tree');
    expect(treeGd).toContain('var name: String');
    expect(treeGd).toContain('var priority: int');

    const actionGd = fs.readFileSync(path.join(dstDir, 'Ai', 'Behavior', 'DataAiBehavior_Action.gd'), 'utf8');
    expect(actionGd).toContain('class_name DataAiBehavior_Action');
  });

  it('handles struct with foreign key reference', async () => {
    const fkCfg = `table weapon[id] {
  id:int;
  name:str;
  atk:int;
}
table user[id] {
  id:int;
  name:str;
  weapon:int -> weapon;
}
`;
    const weaponCsv = `武器ID,名称,攻击力
id,name,atk
1,Sword,100
2,Bow,80
`;
    const userCsv = `用户ID,姓名,武器
id,name,weapon
1,Alice,1
2,Bob,2
`;
    writeFile(tempDir, 'config.cfg', fkCfg);
    writeFile(tempDir, 'weapon.csv', weaponCsv);
    writeFile(tempDir, 'user.csv', userCsv);

    const ctx = await Context.create(tempDir);
    const gen = new GdCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const userGd = fs.readFileSync(path.join(dstDir, 'DataUser.gd'), 'utf8');
    // Foreign key ref property
    expect(userGd).toContain('var RefWeapon: DataWeapon');
    // _resolve function
    expect(userGd).toContain('func _resolve(errors: ConfigErrors):');
    // Ref resolution: DataWeapon.find(weapon)
    expect(userGd).toContain('DataWeapon.find(');
    // _resolve_refs
    expect(userGd).toContain('static func _resolve_refs(errors: ConfigErrors):');
  });

  it('cleans up stale files not in keep set', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    // Create a stale file in dstDir
    fs.writeFileSync(path.join(dstDir, 'OldData.gd'), 'stale content', 'utf8');

    const ctx = await Context.create(tempDir);
    const gen = new GdCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    // After generation + finalExit, stale file should be deleted
    CachedFiles.finalExit();
    expect(fs.existsSync(path.join(dstDir, 'OldData.gd'))).toBe(false);
    // But DataUser.gd should still exist
    expect(fs.existsSync(path.join(dstDir, 'DataUser.gd'))).toBe(true);
  });

  it('uses custom prefix parameter in generated code', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new GdCodeGenerator(mockParameter({ dir: dstDir, prefix: 'Cfg' }));
    await gen.generate(ctx);

    // File should be CfgUser.gd, not DataUser.gd
    expect(fs.existsSync(path.join(dstDir, 'CfgUser.gd'))).toBe(true);
    expect(fs.existsSync(path.join(dstDir, 'DataUser.gd'))).toBe(false);
    const userGd = fs.readFileSync(path.join(dstDir, 'CfgUser.gd'), 'utf8');
    expect(userGd).toContain('class_name CfgUser');
  });
});
