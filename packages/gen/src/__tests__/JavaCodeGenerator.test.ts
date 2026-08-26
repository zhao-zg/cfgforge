/**
 * JavaCodeGenerator tests — T8.6g
 *
 * Verifies that JavaCodeGenerator:
 * 1. Generates .java files in the correct directory structure (dir/pkg/)
 * 2. Generates ConfigMgr.java with table members
 * 3. Generates struct/table .java files with proper package/class
 * 4. Reads constructor parameters (dir, pkg, encoding, sealed, beautifulName)
 * 5. Extends GeneratorWithTag (own parameter)
 * 6. Handles enum tables
 * 7. Generates interface and impl files
 * 8. Generates ConfigLoader.java and ConfigMgrLoader.java
 * 9. Handles struct with foreign keys
 * 10. Generates Builder files when builders parameter is set
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Context } from '@cfgforge/context';
import { JavaCodeGenerator } from '../JavaCodeGenerator';
import type { Parameter } from '../Parameter';
import { GeneratorWithTag } from '../GeneratorWithTag';

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

describe('JavaCodeGenerator', () => {
  let tempDir: string;
  let dstDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-java-'));
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
    const gen = new JavaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    // Files should be in dir/pkg/ = out/config/
    const javaDir = path.join(dstDir, 'config');
    expect(fs.existsSync(javaDir)).toBe(true);
    expect(fs.existsSync(path.join(javaDir, 'User.java'))).toBe(true);
    expect(fs.existsSync(path.join(javaDir, 'ConfigMgr.java'))).toBe(true);
    expect(fs.existsSync(path.join(javaDir, 'ConfigLoader.java'))).toBe(true);
    expect(fs.existsSync(path.join(javaDir, 'ConfigMgrLoader.java'))).toBe(true);
  });

  it('generates User.java table class file', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new JavaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const javaDir = path.join(dstDir, 'config');
    const userJavaPath = path.join(javaDir, 'User.java');
    expect(fs.existsSync(userJavaPath)).toBe(true);
    const userJava = fs.readFileSync(userJavaPath, 'utf8');
    // Package declaration
    expect(userJava).toContain('package config;');
    // Class declaration
    expect(userJava).toContain('public class User {');
    // Field declarations
    expect(userJava).toContain('private int id;');
    expect(userJava).toContain('private String name;');
    expect(userJava).toContain('private int age;');
    // _create method
    expect(userJava).toContain('public static User _create(configgen.genjava.ConfigInput input)');
    // Getters
    expect(userJava).toContain('public int getId()');
    expect(userJava).toContain('public String getName()');
    expect(userJava).toContain('public int getAge()');
    // toString
    expect(userJava).toContain('public String toString()');
    // _ConfigLoader
    expect(userJava).toContain('public static class _ConfigLoader implements config.ConfigLoader');
  });

  it('generates ConfigMgr.java with table members', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new JavaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const javaDir = path.join(dstDir, 'config');
    const mgrJava = fs.readFileSync(path.join(javaDir, 'ConfigMgr.java'), 'utf8');
    expect(mgrJava).toContain('package config;');
    expect(mgrJava).toContain('public class ConfigMgr {');
    // Table member field
    expect(mgrJava).toContain('public java.util.Map<Integer, config.User> user_All;');
    // Get method
    expect(mgrJava).toContain('public config.User getUser(int id)');
    // all() method
    expect(mgrJava).toContain('public java.util.Collection<config.User> allUser()');
  });

  it('generates ConfigLoader.java interface', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new JavaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const javaDir = path.join(dstDir, 'config');
    const loaderJava = fs.readFileSync(path.join(javaDir, 'ConfigLoader.java'), 'utf8');
    expect(loaderJava).toContain('package config;');
    expect(loaderJava).toContain('public interface ConfigLoader {');
    expect(loaderJava).toContain('void createAll(ConfigMgr mgr, configgen.genjava.ConfigInput input);');
    expect(loaderJava).toContain('void resolveAll(ConfigMgr mgr);');
  });

  it('generates ConfigMgrLoader.java with table dispatch', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new JavaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const javaDir = path.join(dstDir, 'config');
    const mgrLoaderJava = fs.readFileSync(path.join(javaDir, 'ConfigMgrLoader.java'), 'utf8');
    expect(mgrLoaderJava).toContain('package config;');
    expect(mgrLoaderJava).toContain('public class ConfigMgrLoader {');
    // getAllConfigLoaders
    expect(mgrLoaderJava).toContain('public static Map<String, ConfigLoader> getAllConfigLoaders()');
    // Table registration
    expect(mgrLoaderJava).toContain('allConfigLoaders.put("user"');
    expect(mgrLoaderJava).toContain('new config.User._ConfigLoader()');
  });

  it('reads constructor parameters correctly', () => {
    const gen = new JavaCodeGenerator(mockParameter({}));
    expect(gen.dir).toBe('config');
    expect(gen.pkg).toBe('config');
    expect(gen.encoding).toBe('UTF-8');
    expect(gen.sealed).toBe(true);
    expect(gen.beautifulName).toBe(false);
  });

  it('reads noSealed flag', () => {
    const genSealed = new JavaCodeGenerator(mockParameter({}));
    expect(genSealed.sealed).toBe(true);

    const genNoSealed = new JavaCodeGenerator(mockParameter({ noSealed: 'true' }));
    expect(genNoSealed.sealed).toBe(false);
  });

  it('reads beautifulName flag', () => {
    const genWith = new JavaCodeGenerator(mockParameter({ beautifulName: 'true' }));
    expect(genWith.beautifulName).toBe(true);

    const genWithout = new JavaCodeGenerator(mockParameter({}));
    expect(genWithout.beautifulName).toBe(false);
  });

  it('extends GeneratorWithTag (own parameter)', () => {
    const gen = new JavaCodeGenerator(mockParameter({ own: 'tag1' }));
    expect(gen).toBeDefined();
    expect(gen).toBeInstanceOf(JavaCodeGenerator);
    expect(gen).toBeInstanceOf(GeneratorWithTag);
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
    const gen = new JavaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const javaDir = path.join(dstDir, 'config');
    // Enum class file
    expect(fs.existsSync(path.join(javaDir, 'Color.java'))).toBe(true);
    const colorJava = fs.readFileSync(path.join(javaDir, 'Color.java'), 'utf8');
    expect(colorJava).toContain('package config;');
    expect(colorJava).toContain('public enum Color {');
    // Enum constants (default: uppercase)
    expect(colorJava).toContain('RED("Red"');
    expect(colorJava).toContain('GREEN("Green"');
    expect(colorJava).toContain('BLUE("Blue"');
    // get method
    expect(colorJava).toContain('public static Color get(String value)');
    // map
    expect(colorJava).toContain('public static final java.util.Map<String, Color> map');

    // Detail class file (enum with detail fields)
    expect(fs.existsSync(path.join(javaDir, 'Color_Detail.java'))).toBe(true);
    const detailJava = fs.readFileSync(path.join(javaDir, 'Color_Detail.java'), 'utf8');
    expect(detailJava).toContain('package config;');
    expect(detailJava).toContain('public class Color_Detail {');
    expect(detailJava).toContain('private int r;');
    expect(detailJava).toContain('private int g;');
    expect(detailJava).toContain('private int b;');
  });

  it('handles simple enum table (only pk + enum str, no detail)', async () => {
    const simpleEnumCfg = `table color[name] (enum='name') {
  name:str;
}
`;
    const simpleEnumCsv = `名称
name
Red
Green
Blue
`;
    writeFile(tempDir, 'config.cfg', simpleEnumCfg);
    writeFile(tempDir, 'color.csv', simpleEnumCsv);

    const ctx = await Context.create(tempDir);
    const gen = new JavaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const javaDir = path.join(dstDir, 'config');
    expect(fs.existsSync(path.join(javaDir, 'Color.java'))).toBe(true);
    const colorJava = fs.readFileSync(path.join(javaDir, 'Color.java'), 'utf8');
    expect(colorJava).toContain('public enum Color {');
    expect(colorJava).toContain('RED("Red")');
    expect(colorJava).toContain('GREEN("Green")');
    expect(colorJava).toContain('BLUE("Blue")');
    // No detail class file should be generated
    expect(fs.existsSync(path.join(javaDir, 'Color_Detail.java'))).toBe(false);
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
    const gen = new JavaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const javaDir = path.join(dstDir, 'config');
    // Interface file is generated in a subdirectory named after the interface
    const shapeDir = path.join(javaDir, 'shape');
    expect(fs.existsSync(path.join(shapeDir, 'Shape.java'))).toBe(true);

    // Read the interface file
    const ifaceJava = fs.readFileSync(path.join(shapeDir, 'Shape.java'), 'utf8');
    expect(ifaceJava).toContain('package config.shape;');
    expect(ifaceJava).toContain('public sealed interface Shape');
    expect(ifaceJava).toContain('permits');
    // _create method with switch
    expect(ifaceJava).toContain('static Shape _create(configgen.genjava.ConfigInput input)');
    expect(ifaceJava).toContain('switch (tag)');
    expect(ifaceJava).toContain('case "circle"');
    expect(ifaceJava).toContain('case "square"');

    // Impl files (Circle.java and Square.java in shape subdirectory)
    expect(fs.existsSync(path.join(shapeDir, 'Circle.java'))).toBe(true);
    expect(fs.existsSync(path.join(shapeDir, 'Square.java'))).toBe(true);
    const circleJava = fs.readFileSync(path.join(shapeDir, 'Circle.java'), 'utf8');
    expect(circleJava).toContain('package config.shape;');
    expect(circleJava).toContain('final class Circle implements shape {');
    expect(circleJava).toContain('private int radius;');
  });

  it('generates multiple table files and ConfigMgr entries', async () => {
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
    const gen = new JavaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const javaDir = path.join(dstDir, 'config');
    expect(fs.existsSync(path.join(javaDir, 'User.java'))).toBe(true);
    expect(fs.existsSync(path.join(javaDir, 'Item.java'))).toBe(true);

    const mgrJava = fs.readFileSync(path.join(javaDir, 'ConfigMgr.java'), 'utf8');
    expect(mgrJava).toContain('user_All');
    expect(mgrJava).toContain('item_All');
    expect(mgrJava).toContain('getUser(');
    expect(mgrJava).toContain('getItem(');
  });

  it('uses custom pkg parameter', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new JavaCodeGenerator(mockParameter({ dir: dstDir, pkg: 'mygame' }));
    await gen.generate(ctx);

    // Files should be in dir/pkg/ = out/mygame/
    const javaDir = path.join(dstDir, 'mygame');
    expect(fs.existsSync(javaDir)).toBe(true);
    const userJava = fs.readFileSync(path.join(javaDir, 'User.java'), 'utf8');
    expect(userJava).toContain('package mygame;');
    expect(fs.existsSync(path.join(javaDir, 'ConfigMgr.java'))).toBe(true);
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
    fs.mkdirSync(path.join(tempDir, 'ai', 'behavior'), { recursive: true });
    writeFile(path.join(tempDir, 'ai', 'behavior'), 'action.csv', actionCsv);

    const ctx = await Context.create(tempDir);
    const gen = new JavaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const javaDir = path.join(dstDir, 'config');
    // Struct file: ai/behavior/Tree.java
    expect(fs.existsSync(path.join(javaDir, 'ai', 'behavior', 'Tree.java'))).toBe(true);
    // Table file: ai/behavior/Action.java
    expect(fs.existsSync(path.join(javaDir, 'ai', 'behavior', 'Action.java'))).toBe(true);

    const treeJava = fs.readFileSync(path.join(javaDir, 'ai', 'behavior', 'Tree.java'), 'utf8');
    expect(treeJava).toContain('package config.ai.behavior;');
    expect(treeJava).toContain('public class Tree {');

    const actionJava = fs.readFileSync(path.join(javaDir, 'ai', 'behavior', 'Action.java'), 'utf8');
    expect(actionJava).toContain('package config.ai.behavior;');
    expect(actionJava).toContain('public class Action {');
  });

  it('_create function reads fields from ConfigInput', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new JavaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const javaDir = path.join(dstDir, 'config');
    const userJava = fs.readFileSync(path.join(javaDir, 'User.java'), 'utf8');
    expect(userJava).toContain('self.id = input.readInt();');
    expect(userJava).toContain('self.name = input.readStringInPool();');
    expect(userJava).toContain('self.age = input.readInt();');
  });

  it('generates toString with field format', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new JavaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const javaDir = path.join(dstDir, 'config');
    const userJava = fs.readFileSync(path.join(javaDir, 'User.java'), 'utf8');
    expect(userJava).toContain('"(" + id + "," + name + "," + age + ")"');
  });

  it('generates _ConfigLoader with createAll and resolveAll', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new JavaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const javaDir = path.join(dstDir, 'config');
    const userJava = fs.readFileSync(path.join(javaDir, 'User.java'), 'utf8');
    expect(userJava).toContain('public void createAll(config.ConfigMgr mgr, configgen.genjava.ConfigInput input)');
    expect(userJava).toContain('int c = input.readInt();');
    expect(userJava).toContain('mgr.user_All = new java.util.LinkedHashMap<>(c);');
    expect(userJava).toContain('User self = User._create(input);');
    expect(userJava).toContain('mgr.user_All.put(self.id, self);');
    expect(userJava).toContain('public void resolveAll(config.ConfigMgr mgr)');
  });

  it('generates Builder file when builders parameter is set', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);
    // Write builders file listing "user" table
    writeFile(tempDir, 'builders.txt', 'user');

    const ctx = await Context.create(tempDir);
    const gen = new JavaCodeGenerator(mockParameter({ dir: dstDir, builders: path.join(tempDir, 'builders.txt') }));
    await gen.generate(ctx);

    const javaDir = path.join(dstDir, 'config');
    expect(fs.existsSync(path.join(javaDir, 'UserBuilder.java'))).toBe(true);
    const builderJava = fs.readFileSync(path.join(javaDir, 'UserBuilder.java'), 'utf8');
    expect(builderJava).toContain('package config;');
    expect(builderJava).toContain('public class UserBuilder {');
    expect(builderJava).toContain('public int id;');
    expect(builderJava).toContain('public String name;');
    expect(builderJava).toContain('public User build()');
  });

  it('generates hashCode and equals for struct (non-table)', async () => {
    const structCfg = `struct point {
  x:int;
  y:int;
}
table pos[id] {
  id:int;
  px:int;
  py:int;
}
`;
    const posCsv = `ID,PX,PY
id,px,py
1,1,2
`;
    writeFile(tempDir, 'config.cfg', structCfg);
    writeFile(tempDir, 'pos.csv', posCsv);

    const ctx = await Context.create(tempDir);
    const gen = new JavaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const javaDir = path.join(dstDir, 'config');
    expect(fs.existsSync(path.join(javaDir, 'Point.java'))).toBe(true);
    const pointJava = fs.readFileSync(path.join(javaDir, 'Point.java'), 'utf8');
    expect(pointJava).toContain('public int hashCode()');
    expect(pointJava).toContain('java.util.Objects.hash(x, y)');
    expect(pointJava).toContain('public boolean equals(Object other)');
    expect(pointJava).toContain('return x == o.x && y == o.y;');
  });

  it('generates sealed interface with permits clause', async () => {
    const ifaceCfg = `interface shape {
  struct circle {
    radius:int;
  }
  struct square {
    side:int;
  }
}
`;
    writeFile(tempDir, 'config.cfg', ifaceCfg);

    const ctx = await Context.create(tempDir);
    const gen = new JavaCodeGenerator(mockParameter({ dir: dstDir }));
    await gen.generate(ctx);

    const javaDir = path.join(dstDir, 'config');
    // Sealed interface file is in shape/ subdirectory
    const shapeDir = path.join(javaDir, 'shape');
    expect(fs.existsSync(path.join(shapeDir, 'Shape.java'))).toBe(true);
    const ifaceJava = fs.readFileSync(path.join(shapeDir, 'Shape.java'), 'utf8');
    expect(ifaceJava).toContain('public sealed interface Shape');
    expect(ifaceJava).toContain('permits');
  });

  it('generates non-sealed interface when noSealed is set', async () => {
    const ifaceCfg = `interface shape {
  struct circle {
    radius:int;
  }
  struct square {
    side:int;
  }
}
`;
    writeFile(tempDir, 'config.cfg', ifaceCfg);

    const ctx = await Context.create(tempDir);
    const gen = new JavaCodeGenerator(mockParameter({ dir: dstDir, noSealed: 'true' }));
    await gen.generate(ctx);

    const javaDir = path.join(dstDir, 'config');
    // Non-sealed interface file is at root level (not in shape/ subdirectory)
    expect(fs.existsSync(path.join(javaDir, 'Shape.java'))).toBe(true);
    const ifaceJava = fs.readFileSync(path.join(javaDir, 'Shape.java'), 'utf8');
    expect(ifaceJava).toContain('public interface Shape {');
    expect(ifaceJava).not.toContain('sealed');
    expect(ifaceJava).not.toContain('permits');
  });
});
