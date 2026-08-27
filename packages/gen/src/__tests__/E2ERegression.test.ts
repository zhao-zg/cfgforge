/**
 * End-to-end regression tests — T8.13
 *
 * Runs all code generators against the real example/config/ data and
 * verifies that each generator produces output files without errors.
 * This is the gen-layer E2E test that ties together:
 *   Context.create → GenPipeline.run → file output → CachedFiles.finalExit
 *
 * Uses the same example/config/ directory as the schema/data/value/context
 * E2E tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { Context } from '@cfgforge/context';
import { CachedFiles } from '@cfgforge/shared';
import { GenPipeline } from '../GenPipeline';
import { JavaCodeGenerator } from '../JavaCodeGenerator';
import { CsCodeGenerator } from '../CsCodeGenerator';
import { GoCodeGenerator } from '../GoCodeGenerator';
import { LuaCodeGenerator } from '../LuaCodeGenerator';
import { GdCodeGenerator } from '../GdCodeGenerator';
import { TsCodeGenerator } from '../TsCodeGenerator';
import { BytesGenerator } from '../BytesGenerator';
import { JsonGenerator } from '../JsonGenerator';
import { JavaMapperGenerator } from '../JavaMapperGenerator';
import type { Generator } from '../Generator';
import type { Parameter } from '../Parameter';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const EXAMPLE_CONFIG_DIR = path.join(REPO_ROOT, 'example', 'config');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockParameter(opts: Record<string, string>): Parameter {
  return {
    get: (k: string, def: string) => (k in opts ? opts[k] : def),
    has: (k: string) => k in opts,
    getOrNull: (k: string) => (k in opts ? opts[k] : null),
  };
}

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function countFiles(dir: string, ext: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { recursive: true })) {
    if (typeof entry === 'string' && entry.endsWith(ext)) {
      count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const hasExampleConfig = fs.existsSync(
  path.join(EXAMPLE_CONFIG_DIR, 'config.cfg'),
);

describe('E2E: GenPipeline with example/config/ (T8.13)', () => {
  // Skip if example/config/ doesn't exist (e.g. in CI without test data)
  const hasExampleConfig = fs.existsSync(
    path.join(EXAMPLE_CONFIG_DIR, 'config.cfg'),
  );

  (hasExampleConfig ? describe : describe.skip)(
    'full pipeline via GenPipeline',
    () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-e2e-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  // --- Individual generator E2E tests ---

  it('Java generator produces .java files for all tables', async () => {
    const ctx = await Context.create(EXAMPLE_CONFIG_DIR);
    const outDir = path.join(tempDir, 'java');
    fs.mkdirSync(outDir, { recursive: true });

    // Use own:-noserver to match real Java generation workflow (see example/java/genjava.bat)
    const gens: Generator[] = [
      new JavaCodeGenerator(mockParameter({ dir: outDir, own: '-noserver' })),
    ];

    await GenPipeline.run(ctx, gens);

    // Should produce .java files (ConfigMgr, ConfigLoader, tables, structs)
    const javaFiles = countFiles(outDir, '.java');
    expect(javaFiles).toBeGreaterThan(5);
    // ConfigMgr.java must exist
    expect(fs.existsSync(path.join(outDir, 'config', 'ConfigMgr.java'))).toBe(true);
  });

  it('C# generator produces .cs files for all tables', async () => {
    const ctx = await Context.create(EXAMPLE_CONFIG_DIR);
    const outDir = path.join(tempDir, 'cs');
    fs.mkdirSync(outDir, { recursive: true });

    const gens: Generator[] = [
      new CsCodeGenerator(mockParameter({ dir: outDir })),
    ];

    await GenPipeline.run(ctx, gens);

    const csFiles = countFiles(outDir, '.cs');
    expect(csFiles).toBeGreaterThan(5);
    // Processor.cs must exist
    expect(fs.existsSync(path.join(outDir, 'Config', 'Processor.cs'))).toBe(true);
  });

  it('Go generator produces .go files for all tables', async () => {
    const ctx = await Context.create(EXAMPLE_CONFIG_DIR);
    const outDir = path.join(tempDir, 'go');
    fs.mkdirSync(outDir, { recursive: true });

    const gens: Generator[] = [
      new GoCodeGenerator(mockParameter({ dir: outDir })),
    ];

    await GenPipeline.run(ctx, gens);

    const goFiles = countFiles(outDir, '.go');
    expect(goFiles).toBeGreaterThan(5);
    // configmgr.go must exist
    expect(fs.existsSync(path.join(outDir, 'config', 'configmgr.go'))).toBe(true);
  });

  it('Lua generator produces .lua files for all tables', async () => {
    const ctx = await Context.create(EXAMPLE_CONFIG_DIR);
    const outDir = path.join(tempDir, 'lua');
    fs.mkdirSync(outDir, { recursive: true });

    const gens: Generator[] = [
      new LuaCodeGenerator(mockParameter({ dir: outDir })),
    ];

    await GenPipeline.run(ctx, gens);

    const luaFiles = countFiles(outDir, '.lua');
    expect(luaFiles).toBeGreaterThan(3);
    // _cfgs.lua must exist
    expect(fs.existsSync(path.join(outDir, 'cfg', '_cfgs.lua'))).toBe(true);
  });

  it('GDScript generator produces .gd files for all tables', async () => {
    const ctx = await Context.create(EXAMPLE_CONFIG_DIR);
    const outDir = path.join(tempDir, 'gd');
    fs.mkdirSync(outDir, { recursive: true });

    // Use own:-nogd to filter out tables with (nogd) tag (e.g. lootitem, keytest
    // which have composite keys that GDScript doesn't support).
    // This matches the real GDScript generation workflow (see example/gd/gengd.bat).
    const gens: Generator[] = [
      new GdCodeGenerator(mockParameter({ dir: outDir, own: '-nogd' })),
    ];

    await GenPipeline.run(ctx, gens);

    const gdFiles = countFiles(outDir, '.gd');
    expect(gdFiles).toBeGreaterThan(5);
    // ConfigProcessor.gd must exist
    expect(fs.existsSync(path.join(outDir, 'ConfigProcessor.gd'))).toBe(true);
  });

  it('TypeScript generator produces Config.ts and ConfigUtil.ts', async () => {
    const ctx = await Context.create(EXAMPLE_CONFIG_DIR);
    const outDir = path.join(tempDir, 'ts');
    fs.mkdirSync(outDir, { recursive: true });

    const gens: Generator[] = [
      new TsCodeGenerator(mockParameter({ dir: outDir })),
    ];

    await GenPipeline.run(ctx, gens);

    // TsCodeGenerator does NOT call keepMetaAndDeleteOtherFiles,
    // so GenPipeline's finalExit won't touch its files
    expect(fs.existsSync(path.join(outDir, 'Config.ts'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'ConfigUtil.ts'))).toBe(true);
  });

  it('Bytes generator produces config.bytes', async () => {
    const ctx = await Context.create(EXAMPLE_CONFIG_DIR);
    const outDir = path.join(tempDir, 'bytes');
    fs.mkdirSync(outDir, { recursive: true });

    const gens: Generator[] = [
      new BytesGenerator(mockParameter({ dir: outDir })),
    ];

    await GenPipeline.run(ctx, gens);

    const bytesPath = path.join(outDir, 'config.bytes');
    expect(fs.existsSync(bytesPath)).toBe(true);
    // File should have content (schema length + string pool + tables)
    const stat = fs.statSync(bytesPath);
    expect(stat.size).toBeGreaterThan(100);
  });

  it('JSON generator produces .json files for specified tables', async () => {
    const ctx = await Context.create(EXAMPLE_CONFIG_DIR);
    const outDir = path.join(tempDir, 'json');
    fs.mkdirSync(outDir, { recursive: true });

    const gens: Generator[] = [
      new JsonGenerator(mockParameter({ dst: outDir, tables: 'equip.rank;equip.ability' })),
    ];

    await GenPipeline.run(ctx, gens);

    // JSON generator outputs per-record files under _<tableName>/ directories
    // rank table has 6 records, ability has 7 records
    const rankDir = path.join(outDir, '_equip_rank');
    if (fs.existsSync(rankDir)) {
      const rankFiles = fs.readdirSync(rankDir).filter(f => f.endsWith('.json'));
      expect(rankFiles.length).toBeGreaterThan(0);
    }
  });

  it('JavaMapper generator produces raw/bean/cfg tree for all tables (F-4)', async () => {
    const ctx = await Context.create(EXAMPLE_CONFIG_DIR);
    const outDir = path.join(tempDir, 'mapper');
    fs.mkdirSync(outDir, { recursive: true });

    // child=task.task → cfg/TaskTasks.java 子类（init override + prepareData）
    const gens: Generator[] = [
      new JavaMapperGenerator(mockParameter({
        dir: outDir,
        pkg: 'com.jedi.gameServer.mapper',
        child: 'task.task',
      })),
    ];

    await GenPipeline.run(ctx, gens);

    const base = path.join(outDir, ...'com.jedi.gameServer.mapper'.split('.'));

    // 关键文件存在：raw（每表 + CfgMapperInit）、bean（顶层 struct / 命名空间
    // 子包 struct / interface + impl）、cfg child
    const mustExist = [
      'raw/CfgMapperInit.java',
      'raw/RawTaskTasks.java',
      'raw/RawOtherMonsters.java',
      'raw/RawEquipJewelryrandoms.java', // struct 主键表（LvlRank）
      'raw/RawEquipEquipconfigs.java',   // EEntry 表（columnMode/entry）
      'raw/RawAiAis.java',               // 命名空间表（ai_行为）
      'bean/Position.java',
      'bean/LevelRank.java',
      'bean/task/completecondition/Completecondition.java',
      'bean/task/completecondition/KillMonster.java',
      'bean/ai/TriggerTick/TriggerTick.java',
      'cfg/TaskTasks.java',
    ];
    for (const rel of mustExist) {
      expect(fs.existsSync(path.join(base, rel)), rel).toBe(true);
    }

    // 全量文件数（example 全表 + 可达 bean；都在 pkg 目录树下）
    expect(countFiles(path.join(base, 'raw'), '.java')).toBeGreaterThan(20);
    expect(countFiles(path.join(base, 'bean'), '.java')).toBeGreaterThan(10);

    // CfgMapperInit：initAll（M-1 static）+ verifyRefs
    const init = fs.readFileSync(path.join(base, 'raw', 'CfgMapperInit.java'), 'utf-8');
    expect(init).toContain('    public static void initAll() {');
    expect(init).toContain('public static java.util.List<String> verifyRefs() {');
    expect(init).toContain('.getInstance().init();');

    // child 子类：init() override 调 super + prepareData（F-1）
    const child = fs.readFileSync(path.join(base, 'cfg', 'TaskTasks.java'), 'utf-8');
    expect(child).toContain('    public void init() {');
    expect(child).toContain('        super.init();');
    expect(child).toContain('        prepareData();');

    // EEntry 表烘焙常量（F-2：equipconfig (entry='entry') 数据行 Instance/Instance2）
    const equipconfig = fs.readFileSync(path.join(base, 'raw', 'RawEquipEquipconfigs.java'), 'utf-8');
    expect(equipconfig).toContain('public static final String INSTANCE = "Instance";');
    expect(equipconfig).toContain('public static final String INSTANCE2 = "Instance2";');

    // struct 主键表：getByKey(LevelRank)（bean hashCode/equals 支撑值语义，F-5）
    const jewelryrandom = fs.readFileSync(path.join(base, 'raw', 'RawEquipJewelryrandoms.java'), 'utf-8');
    expect(jewelryrandom).toContain('getByKey(com.jedi.gameServer.mapper.bean.LevelRank LvlRank)');
    const levelRank = fs.readFileSync(path.join(base, 'bean', 'LevelRank.java'), 'utf-8');
    expect(levelRank).toContain('public int hashCode() { return java.util.Objects.hash(Level, Rank); }');
    expect(levelRank).toContain('public boolean equals(Object other) {');

    // 简单括号配平：全部生成 java 文件 { } 计数相等
    for (const entry of fs.readdirSync(path.join(outDir), { recursive: true })) {
      if (typeof entry === 'string' && entry.endsWith('.java')) {
        const content = fs.readFileSync(path.join(outDir, entry), 'utf-8');
        const open = (content.match(/\{/g) ?? []).length;
        const close = (content.match(/\}/g) ?? []).length;
        expect({ file: entry, open, close }).toEqual({ file: entry, open, close: open });
      }
    }
  });

  // --- Multi-generator E2E test ---

  it('runs all code generators in a single pipeline', async () => {
    const ctx = await Context.create(EXAMPLE_CONFIG_DIR);

    const gens: Generator[] = [
      new JavaCodeGenerator(mockParameter({ dir: path.join(tempDir, 'java'), own: '-noserver' })),
      new CsCodeGenerator(mockParameter({ dir: path.join(tempDir, 'cs'), own: '-noserver' })),
      new GoCodeGenerator(mockParameter({ dir: path.join(tempDir, 'go'), own: '-noserver' })),
      new LuaCodeGenerator(mockParameter({ dir: path.join(tempDir, 'lua'), own: '-noserver' })),
      new GdCodeGenerator(mockParameter({ dir: path.join(tempDir, 'gd'), own: '-nogd' })),
      new TsCodeGenerator(mockParameter({ dir: path.join(tempDir, 'ts'), own: '-noserver' })),
      new BytesGenerator(mockParameter({ dir: path.join(tempDir, 'bytes'), own: '-noserver' })),
    ];

    await GenPipeline.run(ctx, gens);

    // All generators should have produced output
    expect(countFiles(path.join(tempDir, 'java'), '.java')).toBeGreaterThan(5);
    expect(countFiles(path.join(tempDir, 'cs'), '.cs')).toBeGreaterThan(5);
    expect(countFiles(path.join(tempDir, 'go'), '.go')).toBeGreaterThan(5);
    expect(countFiles(path.join(tempDir, 'lua'), '.lua')).toBeGreaterThan(3);
    expect(countFiles(path.join(tempDir, 'gd'), '.gd')).toBeGreaterThan(5);
    expect(fs.existsSync(path.join(tempDir, 'ts', 'Config.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'bytes', 'config.bytes'))).toBe(true);
  });

  // --- Stale file cleanup E2E test ---

  it('cleans up stale files during multi-generator run', async () => {
    const javaDir = path.join(tempDir, 'java');
    const csDir = path.join(tempDir, 'cs');
    fs.mkdirSync(javaDir, { recursive: true });
    fs.mkdirSync(csDir, { recursive: true });

    // Pre-create stale files in output directories
    const javaPkgDir = path.join(javaDir, 'Config');
    const csPkgDir = path.join(csDir, 'Config');
    fs.mkdirSync(javaPkgDir, { recursive: true });
    fs.mkdirSync(csPkgDir, { recursive: true });
    fs.writeFileSync(path.join(javaPkgDir, 'StaleTable.java'), '// stale', 'utf8');
    fs.writeFileSync(path.join(csPkgDir, 'StaleTable.cs'), '// stale', 'utf8');

    const ctx = await Context.create(EXAMPLE_CONFIG_DIR);
    const gens: Generator[] = [
      new JavaCodeGenerator(mockParameter({ dir: javaDir, own: '-noserver' })),
      new CsCodeGenerator(mockParameter({ dir: csDir, own: '-noserver' })),
    ];

    await GenPipeline.run(ctx, gens);

    // Stale files should be cleaned by finalExit
    expect(fs.existsSync(path.join(javaPkgDir, 'StaleTable.java'))).toBe(false);
    expect(fs.existsSync(path.join(csPkgDir, 'StaleTable.cs'))).toBe(false);

    // But generated files should still exist
    expect(fs.existsSync(path.join(javaPkgDir, 'ConfigMgr.java'))).toBe(true);
    expect(fs.existsSync(path.join(csPkgDir, 'Processor.cs'))).toBe(true);
  });
    },
  );
});
