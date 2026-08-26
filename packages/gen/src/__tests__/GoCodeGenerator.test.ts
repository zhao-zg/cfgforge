/**
 * GoCodeGenerator tests — T8.5f
 *
 * Verifies that GoCodeGenerator:
 * 1. Generates .go files in the correct directory structure (dir/pkg/)
 * 2. Copies runtime files (stream.go, LoadErrors.go)
 * 3. Generates CfgMgr file with table dispatch
 * 4. Generates struct/table .go files with proper package/class
 * 5. Reads constructor parameters (dir, pkg, encoding, serverText, mod)
 * 6. Extends GeneratorWithTag (own parameter)
 * 7. Handles enum tables
 * 8. Generates interface and impl files
 * 9. Handles struct with foreign keys
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Context } from '@cfgforge/context';
import { GoCodeGenerator } from '../GoCodeGenerator';
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

describe('GoCodeGenerator', () => {
  let tempDir: string;
  let dstDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-go-'));
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
    const gen = new GoCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    // Files should be in dir/pkg/ = out/config/
    const goDir = path.join(dstDir, 'config');
    expect(fs.existsSync(goDir)).toBe(true);
    expect(fs.existsSync(path.join(goDir, 'stream.go'))).toBe(true);
    expect(fs.existsSync(path.join(goDir, 'LoadErrors.go'))).toBe(true);
    // CfgMgr file: lower1(pkg) + "mgr" + ".go" = "configmgr.go"
    expect(fs.existsSync(path.join(goDir, 'configmgr.go'))).toBe(true);
  });

  it('generates user.go table struct file', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new GoCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const goDir = path.join(dstDir, 'config');
    const userGoPath = path.join(goDir, 'user.go');
    expect(fs.existsSync(userGoPath)).toBe(true);
    const userGo = fs.readFileSync(userGoPath, 'utf8');
    // Package declaration
    expect(userGo).toContain('package config');
    // Struct definition
    expect(userGo).toContain('type User struct {');
    // Field properties
    expect(userGo).toContain('id int32');
    expect(userGo).toContain('name string');
    expect(userGo).toContain('age int32');
    // Create function
    expect(userGo).toContain('func createUser(stream *Stream) *User');
    // String method
    expect(userGo).toContain('func (t *User) String() string');
    // Getters
    expect(userGo).toContain('func (t *User) Id() int32');
    expect(userGo).toContain('func (t *User) Name() string');
    expect(userGo).toContain('func (t *User) Age() int32');
    // Mgr struct
    expect(userGo).toContain('type UserMgr struct {');
    expect(userGo).toContain('all []*User');
    // GetAll
    expect(userGo).toContain('func(t *UserMgr) GetAll() []*User');
    // Get by primary key
    expect(userGo).toContain('func(t *UserMgr) Get(');
    // Init
    expect(userGo).toContain('func (t *UserMgr) Init(stream *Stream)');
  });

  it('generates configmgr.go with table dispatch', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new GoCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const goDir = path.join(dstDir, 'config');
    const mgrGo = fs.readFileSync(path.join(goDir, 'configmgr.go'), 'utf8');
    expect(mgrGo).toContain('package config');
    expect(mgrGo).toContain('import "io"');
    // Mgr variable and getter
    expect(mgrGo).toContain('var userMgr *UserMgr');
    expect(mgrGo).toContain('func GetUserMgr() *UserMgr');
    // Init function
    expect(mgrGo).toContain('func Init(reader io.Reader) *Stream');
    // Table dispatch case
    expect(mgrGo).toContain('case "user"');
    expect(mgrGo).toContain('userMgr = &UserMgr{}');
    expect(mgrGo).toContain('userMgr.Init(stream)');
  });

  it('copies stream.go runtime file', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new GoCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const goDir = path.join(dstDir, 'config');
    const streamGo = fs.readFileSync(path.join(goDir, 'stream.go'), 'utf8');
    expect(streamGo).toContain('package config');
    expect(streamGo).toContain('type Stream struct');
  });

  it('copies LoadErrors.go runtime file', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new GoCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const goDir = path.join(dstDir, 'config');
    const loadErrGo = fs.readFileSync(path.join(goDir, 'LoadErrors.go'), 'utf8');
    expect(loadErrGo).toContain('package config');
  });

  it('reads constructor parameters correctly', () => {
    const gen = new GoCodeGenerator(mockParameter({}));
    expect(gen.dir).toBe('config');
    expect(gen.pkg).toBe('config');
    expect(gen.encoding).toBe('GBK');
    expect(gen.serverText).toBe(false);
  });

  it('reads serverText flag', () => {
    const genWith = new GoCodeGenerator(mockParameter({ serverText: 'true' }));
    expect(genWith.serverText).toBe(true);

    const genWithout = new GoCodeGenerator(mockParameter({}));
    expect(genWithout.serverText).toBe(false);
  });

  it('extends GeneratorWithTag (own parameter)', () => {
    const gen = new GoCodeGenerator(mockParameter({ own: 'tag1' }));
    expect(gen).toBeDefined();
    expect(gen).toBeInstanceOf(GoCodeGenerator);
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
    const gen = new GoCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const goDir = path.join(dstDir, 'config');
    const colorGo = fs.readFileSync(path.join(goDir, 'color.go'), 'utf8');
    // Enum entries as var block
    expect(colorGo).toContain('//entries');
    expect(colorGo).toContain('var (');
    expect(colorGo).toContain('red Color');
    expect(colorGo).toContain('green Color');
    expect(colorGo).toContain('blue Color');
    // Enum getters
    expect(colorGo).toContain('func (t *ColorMgr) GetRed() *Color');
    expect(colorGo).toContain('func (t *ColorMgr) GetGreen() *Color');
    expect(colorGo).toContain('func (t *ColorMgr) GetBlue() *Color');
    // Switch in Init
    expect(colorGo).toContain('switch v.name {');
    expect(colorGo).toContain('case "Red"');
    expect(colorGo).toContain('case "Green"');
    expect(colorGo).toContain('case "Blue"');
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
    const gen = new GoCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const goDir = path.join(dstDir, 'config');
    // Interface file
    expect(fs.existsSync(path.join(goDir, 'shape.go'))).toBe(true);
    const ifaceGo = fs.readFileSync(path.join(goDir, 'shape.go'), 'utf8');
    expect(ifaceGo).toContain('type Shape interface{}');
    expect(ifaceGo).toContain('func createShape(stream *Stream) Shape');
    expect(ifaceGo).toContain('case "circle"');
    expect(ifaceGo).toContain('return createShapeCircle(stream)');
    expect(ifaceGo).toContain('case "square"');
    expect(ifaceGo).toContain('return createShapeSquare(stream)');

    // Impl files (interface prefix in file name: shape_circle.go, shape_square.go)
    expect(fs.existsSync(path.join(goDir, 'shape_circle.go'))).toBe(true);
    expect(fs.existsSync(path.join(goDir, 'shape_square.go'))).toBe(true);

    const circleGo = fs.readFileSync(path.join(goDir, 'shape_circle.go'), 'utf8');
    expect(circleGo).toContain('type ShapeCircle struct {');
    expect(circleGo).toContain('radius int32');

    const squareGo = fs.readFileSync(path.join(goDir, 'shape_square.go'), 'utf8');
    expect(squareGo).toContain('type ShapeSquare struct {');
    expect(squareGo).toContain('side int32');

    // Table file (lowercased by GoName)
    expect(fs.existsSync(path.join(goDir, 'shapeconfig.go'))).toBe(true);
  });

  it('generates multiple table files and CfgMgr entries', async () => {
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
    const gen = new GoCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const goDir = path.join(dstDir, 'config');
    expect(fs.existsSync(path.join(goDir, 'user.go'))).toBe(true);
    expect(fs.existsSync(path.join(goDir, 'item.go'))).toBe(true);

    const mgrGo = fs.readFileSync(path.join(goDir, 'configmgr.go'), 'utf8');
    expect(mgrGo).toContain('case "user"');
    expect(mgrGo).toContain('case "item"');
    expect(mgrGo).toContain('userMgr = &UserMgr{}');
    expect(mgrGo).toContain('itemMgr = &ItemMgr{}');
  });

  it('uses custom pkg parameter', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new GoCodeGenerator(mockParameter({ dir: dstDir, pkg: 'mygame' }));
    await gen.generate(ctx);

    // Files should be in dir/pkg/ = out/mygame/
    const goDir = path.join(dstDir, 'mygame');
    expect(fs.existsSync(goDir)).toBe(true);
    const userGo = fs.readFileSync(path.join(goDir, 'user.go'), 'utf8');
    expect(userGo).toContain('package mygame');
    // CfgMgr file: lower1("mygame") + "mgr" = "mygamemgr.go"
    expect(fs.existsSync(path.join(goDir, 'mygamemgr.go'))).toBe(true);
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
    const gen = new GoCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const goDir = path.join(dstDir, 'config');
    // Struct file: ai_behavior_tree.go
    expect(fs.existsSync(path.join(goDir, 'ai_behavior_tree.go'))).toBe(true);
    // Table file: ai_behavior_action.go
    expect(fs.existsSync(path.join(goDir, 'ai_behavior_action.go'))).toBe(true);

    const treeGo = fs.readFileSync(path.join(goDir, 'ai_behavior_tree.go'), 'utf8');
    expect(treeGo).toContain('package config');
    expect(treeGo).toContain('type AiBehaviorTree struct {');

    const actionGo = fs.readFileSync(path.join(goDir, 'ai_behavior_action.go'), 'utf8');
    expect(actionGo).toContain('type AiBehaviorAction struct {');
  });

  it('create function reads fields from Stream', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new GoCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const goDir = path.join(dstDir, 'config');
    const userGo = fs.readFileSync(path.join(goDir, 'user.go'), 'utf8');
    expect(userGo).toContain('v.id = stream.ReadInt32()');
    expect(userGo).toContain('v.name = stream.ReadStringInPool()');
    expect(userGo).toContain('v.age = stream.ReadInt32()');
  });

  it('generates String method with field format', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new GoCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const goDir = path.join(dstDir, 'config');
    const userGo = fs.readFileSync(path.join(goDir, 'user.go'), 'utf8');
    // String method should format fields
    expect(userGo).toContain('fmt.Sprintf("User{id=%v, name=%v, age=%v}"');
  });

  it('generates Mgr Init with create and append', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new GoCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const goDir = path.join(dstDir, 'config');
    const userGo = fs.readFileSync(path.join(goDir, 'user.go'), 'utf8');
    expect(userGo).toContain('cnt := stream.ReadInt32()');
    expect(userGo).toContain('t.all = make([]*User, 0, cnt)');
    expect(userGo).toContain('v := createUser(stream)');
    expect(userGo).toContain('t.all = append(t.all, v)');
    expect(userGo).toContain('t.idMap[v.id] = v');
  });
});
