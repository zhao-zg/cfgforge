/**
 * End-to-end regression tests — Phase 2 T2.24.
 *
 * Tests the full pipeline: discover .cfg files → parse → resolve → assert no errors.
 *
 * Test data:
 * - example/config/ (multi-file, multi-namespace, full integration)
 * - samples/buff/buff.cfg (complex interfaces, large single file)
 * - samples/test/test.cfg (cross-namespace refs, standalone parse only)
 * - samples/trigger/trigger.cfg (interfaces with recursion)
 * - samples/video/video.cfg (interfaces + tables)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { CfgUtil } from '../cfg/CfgUtil';
import { CfgSchemas, type CfgFileInfo } from '../CfgSchemas';
import { CfgReader } from '../cfg/CfgReader';
import { CfgWriter } from '../cfg/CfgWriter';
import type { Nameable } from '../Nameable';
import type { TableSchema } from '../TableSchema';
import type { StructSchema } from '../StructSchema';
import type { InterfaceSchema } from '../InterfaceSchema';

// ---------------------------------------------------------------------------
// Paths to test data
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const EXAMPLE_CONFIG_DIR = path.join(REPO_ROOT, 'example', 'config');
const SAMPLES_DIR = path.join(REPO_ROOT, 'samples');

// ---------------------------------------------------------------------------
// Helper: discover .cfg files using CfgUtil.findConfigFilesRecursively
// ---------------------------------------------------------------------------

function discoverCfgFiles(rootDir: string): CfgFileInfo[] {
  const cfgFiles = new Map<string, CfgFileInfo>();
  const rootCfg = path.join(rootDir, 'config.cfg');
  CfgUtil.findConfigFilesRecursively(
    rootCfg, null, 'cfg', '', rootDir, cfgFiles,
  );
  // Sort by pkgNameDot for consistent ordering (matches Java DirectoryStructure.getCfgFiles)
  return Array.from(cfgFiles.values()).sort((a, b) =>
    a.pkgNameDot.localeCompare(b.pkgNameDot),
  );
}

// ---------------------------------------------------------------------------
// example/config: full integration test
// ---------------------------------------------------------------------------

describe('E2E: example/config', () => {
  const cfgFiles = discoverCfgFiles(EXAMPLE_CONFIG_DIR);

  it('discovers all 5 .cfg files', () => {
    expect(cfgFiles.length).toBe(5);
    const pkgNames = cfgFiles.map(c => c.pkgNameDot).sort();
    expect(pkgNames).toEqual(['', 'ai.', 'equip.', 'other.', 'task.']);
  });

  it('parses and resolves without errors', () => {
    const cfg = CfgSchemas.readFromDir(cfgFiles);
    const errs = cfg.resolve();
    expect(errs.errs.length).toBe(0);
  });

  it('contains expected tables and structs', () => {
    const cfg = CfgSchemas.readFromDir(cfgFiles);
    cfg.resolve();

    // Tables only (structs excluded)
    const tableNames = cfg.sortedTables().map((t: TableSchema) => t.name());
    // example config tables (name() returns lowercased fullName)
    // root: no tables (only structs: LevelRank, Position, Range)
    // equip: ability, equipconfig, jewelry, jewelryrandom, jewelrysuit, jewelrytype, rank
    // ai: ai, ai_action, ai_condition
    // other: drop, loot, lootitem, monster, signin, argcapturemode (enum)
    // task: completeconditiontype, task, taskextraexp, task2
    expect(tableNames).toContain('equip.ability');
    expect(tableNames).toContain('equip.jewelry');
    expect(tableNames).toContain('equip.rank');
    expect(tableNames).toContain('ai.ai');
    expect(tableNames).toContain('ai.ai_action');
    expect(tableNames).toContain('other.monster');
    expect(tableNames).toContain('task.task');
    expect(tableNames).toContain('task.task2');

    // Structs (via items, not just tables)
    const allNames = cfg.items().map((n: Nameable) => n.name());
    expect(allNames).toContain('Range');           // root struct
    expect(allNames).toContain('equip.TestPackBean'); // equip struct
  });

  it('has equip namespace tables', () => {
    const cfg = CfgSchemas.readFromDir(cfgFiles);
    cfg.resolve();

    const equipTables = cfg.sortedTables()
      .filter((t: TableSchema) => t.name().startsWith('equip.'))
      .map((t: TableSchema) => t.name());
    expect(equipTables).toContain('equip.ability');
    expect(equipTables).toContain('equip.jewelry');
    expect(equipTables).toContain('equip.rank');
  });

  it('has ai namespace with interface TriggerTick', () => {
    const cfg = CfgSchemas.readFromDir(cfgFiles);
    cfg.resolve();

    // TriggerTick is an interface in ai namespace
    const tickItem = cfg.findItem('ai.TriggerTick');
    expect(tickItem).toBeDefined();
  });

  it('has other namespace with enum ArgCaptureMode', () => {
    const cfg = CfgSchemas.readFromDir(cfgFiles);
    cfg.resolve();

    // ArgCaptureMode is an enum table; enum table names are NOT lowercased by resolver
    const enumItem = cfg.findTable('other.ArgCaptureMode');
    expect(enumItem).toBeDefined();
    expect(enumItem!.meta().hasEnumValues()).toBe(true);
  });

  it('has task namespace with interface completecondition', () => {
    const cfg = CfgSchemas.readFromDir(cfgFiles);
    cfg.resolve();

    const ccItem = cfg.findItem('task.completecondition');
    expect(ccItem).toBeDefined();
  });

  it('supports round-trip: parse → write → parse again', () => {
    // Read all files
    const cfg = CfgSchemas.readFromDir(cfgFiles);
    cfg.resolve();

    // Write back
    const tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cfgforge-e2e-'));
    try {
      const cfgPath = path.join(tempDir, 'config.cfg');
      CfgSchemas.writeToDir(cfgPath, cfg);

      // Read back
      const cfgFiles2 = discoverCfgFiles(tempDir);
      expect(cfgFiles2.length).toBe(cfgFiles.length);

      const cfg2 = CfgSchemas.readFromDir(cfgFiles2);
      cfg2.resolve();

      // Same number of items
      expect(cfg2.items().length).toBe(cfg.items().length);

      // Same names
      const names1 = cfg.items().map((n: Nameable) => n.name()).sort();
      const names2 = cfg2.items().map((n: Nameable) => n.name()).sort();
      expect(names2).toEqual(names1);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// samples/buff/buff.cfg: complex interface structures
// ---------------------------------------------------------------------------

describe('E2E: samples/buff/buff.cfg', () => {
  const buffPath = path.join(SAMPLES_DIR, 'buff', 'buff.cfg');
  const content = fs.readFileSync(buffPath, 'utf-8');

  it('parses without throwing', () => {
    expect(() => {
      const reader = new CfgReader();
      reader.read(content, 'buff.', 'buff.cfg');
    }).not.toThrow();
  });

  it('contains expected interfaces and tables', () => {
    const reader = new CfgReader();
    const cfg = reader.read(content, 'buff.', 'buff.cfg');

    const names = cfg.items().map((n: Nameable) => n.name()).sort();
    // Interfaces
    expect(names).toContain('buff.AddAttackBy');
    expect(names).toContain('buff.EffectLogic');
    expect(names).toContain('buff.BuffLogic');
    expect(names).toContain('buff.TargetSelector');
    expect(names).toContain('buff.Condition');
    expect(names).toContain('buff.ParamInt');
    expect(names).toContain('buff.ParamStr');
    expect(names).toContain('buff.HitHintZone');
    expect(names).toContain('buff.ObjCreateInfo');
    expect(names).toContain('buff.SkillLogic');
    // Tables
    expect(names).toContain('buff.buff');
    expect(names).toContain('buff.triggerevt');
    expect(names).toContain('buff.buffclass');
    expect(names).toContain('buff.skill');
    // Structs
    expect(names).toContain('buff.Modify');
    expect(names).toContain('buff.ModifyMax');
    expect(names).toContain('buff.Vec3');
    expect(names).toContain('buff.CostOrGain');
  });
});

// ---------------------------------------------------------------------------
// samples/trigger/trigger.cfg
// ---------------------------------------------------------------------------

describe('E2E: samples/trigger/trigger.cfg', () => {
  const triggerPath = path.join(SAMPLES_DIR, 'trigger', 'trigger.cfg');
  const content = fs.readFileSync(triggerPath, 'utf-8');

  it('parses without throwing', () => {
    expect(() => {
      const reader = new CfgReader();
      reader.read(content, 'trigger.', 'trigger.cfg');
    }).not.toThrow();
  });

  it('contains expected interfaces and table', () => {
    const reader = new CfgReader();
    const cfg = reader.read(content, 'trigger.', 'trigger.cfg');

    const names = cfg.items().map((n: Nameable) => n.name()).sort();
    expect(names).toContain('trigger.Trigger');
    expect(names).toContain('trigger.ParamInt');
    expect(names).toContain('trigger.Action');
    expect(names).toContain('trigger.Condition');
    expect(names).toContain('trigger.instancelogic');
  });
});

// ---------------------------------------------------------------------------
// samples/video/video.cfg
// ---------------------------------------------------------------------------

describe('E2E: samples/video/video.cfg', () => {
  const videoPath = path.join(SAMPLES_DIR, 'video', 'video.cfg');
  const content = fs.readFileSync(videoPath, 'utf-8');

  it('parses without throwing', () => {
    expect(() => {
      const reader = new CfgReader();
      reader.read(content, 'video.', 'video.cfg');
    }).not.toThrow();
  });

  it('contains expected interfaces and table', () => {
    const reader = new CfgReader();
    const cfg = reader.read(content, 'video.', 'video.cfg');

    const names = cfg.items().map((n: Nameable) => n.name()).sort();
    expect(names).toContain('video.choice'); // struct
    expect(names).toContain('video.condition'); // interface
    expect(names).toContain('video.action'); // interface
    expect(names).toContain('video.triggerAction'); // struct
    expect(names).toContain('video.video'); // table
  });
});

// ---------------------------------------------------------------------------
// samples/test/test.cfg (standalone parse, no resolve due to cross-namespace refs)
// ---------------------------------------------------------------------------

describe('E2E: samples/test/test.cfg', () => {
  const testPath = path.join(SAMPLES_DIR, 'test', 'test.cfg');
  const content = fs.readFileSync(testPath, 'utf-8');

  it('parses without throwing', () => {
    expect(() => {
      const reader = new CfgReader();
      reader.read(content, 'test.', 'test.cfg');
    }).not.toThrow();
  });

  it('contains expected tables', () => {
    const reader = new CfgReader();
    const cfg = reader.read(content, 'test.', 'test.cfg');

    const names = cfg.items().map((n: Nameable) => n.name()).sort();
    expect(names).toContain('test.test');
    expect(names).toContain('test.test2');
  });

  it('test table has expected fields including enum and ref', () => {
    const reader = new CfgReader();
    const cfg = reader.read(content, 'test.', 'test.cfg');

    const testTable = cfg.items().find(
      (n: Nameable) => n.name() === 'test.test',
    ) as TableSchema;
    expect(testTable).toBeDefined();
    const fieldNames = testTable.fields().map((f) => f.name);
    expect(fieldNames).toContain('id');
    expect(fieldNames).toContain('name');
    expect(fieldNames).toContain('testBools');
    expect(fieldNames).toContain('testInts');
    expect(fieldNames).toContain('enumInt');
    expect(fieldNames).toContain('enumStr');
    expect(fieldNames).toContain('ref');
    expect(fieldNames).toContain('testRefs');
  });

  it('test2 table has cond field with pack format', () => {
    const reader = new CfgReader();
    const cfg = reader.read(content, 'test.', 'test.cfg');

    const test2Table = cfg.items().find(
      (n: Nameable) => n.name() === 'test.test2',
    ) as TableSchema;
    expect(test2Table).toBeDefined();
    const condField = test2Table.fields().find(f => f.name === 'cond');
    expect(condField).toBeDefined();
    // cond: trigger.Condition (pack)
    expect(condField!.fmt.toString()).toContain('pack'); // or check isPack
  });
});
