/**
 * CfgUtil tests — TypeScript port of Java `configgen.schema.cfg.CfgUtil`.
 *
 * Java has no tests for CfgUtil, so tests are written from scratch.
 *
 * Covers:
 * - isIdentifier: valid/invalid identifier names
 * - separate: split CfgSchema by namespace
 * - getCfgFilePathByNamespace: namespace → file path mapping
 * - findConfigFilesRecursively: recursive directory traversal
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { CfgUtil } from '../cfg/CfgUtil';
import { CfgSchema } from '../CfgSchema';
import { CfgReader } from '../cfg/CfgReader';
import { CfgWriter } from '../cfg/CfgWriter';
import { CfgSchemas, CfgFileInfo } from '../CfgSchemas';
import { TableSchema } from '../TableSchema';
import { StructSchema } from '../StructSchema';
import { KeySchema } from '../KeySchema';
import { FieldSchema } from '../FieldSchema';
import { ENo } from '../EntryType';
import { Primitive } from '../FieldType';
import { AutoOrPack } from '../FieldFormat';
import { Metadata_of } from '../Metadata';
import type { Nameable } from '../Nameable';

// ---------------------------------------------------------------------------
// isIdentifier
// ---------------------------------------------------------------------------

describe('CfgUtil.isIdentifier', () => {
  it('accepts simple lowercase names', () => {
    expect(CfgUtil.isIdentifier('abc')).toBe(true);
  });

  it('accepts names with underscores', () => {
    expect(CfgUtil.isIdentifier('my_field')).toBe(true);
  });

  it('accepts names starting with underscore', () => {
    expect(CfgUtil.isIdentifier('_private')).toBe(true);
  });

  it('accepts names with digits (not first)', () => {
    expect(CfgUtil.isIdentifier('abc123')).toBe(true);
  });

  it('accepts single letter', () => {
    expect(CfgUtil.isIdentifier('a')).toBe(true);
  });

  it('accepts uppercase letters', () => {
    expect(CfgUtil.isIdentifier('ABC')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(CfgUtil.isIdentifier('')).toBe(false);
  });

  it('rejects names starting with digit', () => {
    expect(CfgUtil.isIdentifier('1abc')).toBe(false);
  });

  it('rejects names with spaces', () => {
    expect(CfgUtil.isIdentifier('my field')).toBe(false);
  });

  it('rejects names with dots', () => {
    expect(CfgUtil.isIdentifier('a.b')).toBe(false);
  });

  it('rejects names with hyphens', () => {
    expect(CfgUtil.isIdentifier('a-b')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// separate
// ---------------------------------------------------------------------------

describe('CfgUtil.separate', () => {
  it('returns empty map for empty schema', () => {
    const cfg = CfgSchema.of();
    const result = CfgUtil.separate(cfg);
    expect(result.size).toBe(0);
  });

  it('separates items by namespace', () => {
    const cfg = CfgSchema.of();
    // root namespace items
    cfg.add(makeTable('weapon', 'id'));
    // equip namespace items
    cfg.add(makeTable('equip.ability', 'id'));
    cfg.add(makeTable('equip.jewelry', 'id'));
    // task namespace items
    cfg.add(makeTable('task.daily', 'id'));

    const result = CfgUtil.separate(cfg);
    expect(result.size).toBe(3);
    expect(result.has('')).toBe(true);
    expect(result.has('equip')).toBe(true);
    expect(result.has('task')).toBe(true);

    expect(result.get('')!.items().length).toBe(1);
    expect(result.get('equip')!.items().length).toBe(2);
    expect(result.get('task')!.items().length).toBe(1);
  });

  it('preserves item order within each namespace', () => {
    const cfg = CfgSchema.of();
    cfg.add(makeTable('equip.ability', 'id'));
    cfg.add(makeTable('equip.jewelry', 'id'));
    cfg.add(makeTable('equip.rank', 'id'));

    const result = CfgUtil.separate(cfg);
    const equipCfg = result.get('equip')!;
    expect(equipCfg.items().length).toBe(3);
    expect((equipCfg.items()[0] as TableSchema).name()).toBe('equip.ability');
    expect((equipCfg.items()[1] as TableSchema).name()).toBe('equip.jewelry');
    expect((equipCfg.items()[2] as TableSchema).name()).toBe('equip.rank');
  });

  it('handles nested namespaces', () => {
    const cfg = CfgSchema.of();
    cfg.add(makeTable('equip.weapon.sword', 'id'));
    cfg.add(makeTable('equip.weapon.bow', 'id'));
    cfg.add(makeTable('equip.armor', 'id'));

    const result = CfgUtil.separate(cfg);
    expect(result.size).toBe(2);
    expect(result.get('equip.weapon')!.items().length).toBe(2);
    expect(result.get('equip')!.items().length).toBe(1);
  });

  it('transfers fileEndComments to separated schemas', () => {
    const cfg = CfgSchema.of();
    cfg.add(makeTable('equip.ability', 'id'));
    cfg.setFileEndComment('equip', 'end of equip');

    const result = CfgUtil.separate(cfg);
    const equipCfg = result.get('equip')!;
    // After separation, fileEndComment is stored with empty key (single-file scenario)
    expect(equipCfg.getFileEndComment('')).toBe('end of equip');
  });

  it('does not set empty fileEndComment when source has none', () => {
    const cfg = CfgSchema.of();
    cfg.add(makeTable('equip.ability', 'id'));

    const result = CfgUtil.separate(cfg);
    const equipCfg = result.get('equip')!;
    expect(equipCfg.getFileEndComment('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// getCfgFilePathByNamespace
// ---------------------------------------------------------------------------

describe('CfgUtil.getCfgFilePathByNamespace', () => {
  it('returns root path for empty namespace', () => {
    const result = CfgUtil.getCfgFilePathByNamespace('', '/output');
    expect(result).toBe('/output');
  });

  it('returns config.cfg path for empty namespace when path has parent', () => {
    // Java: if ns is empty, returns absoluteTopDst itself
    // This means the root config.cfg path is just the destination dir itself
    const result = CfgUtil.getCfgFilePathByNamespace('', '/output/config.cfg');
    expect(result).toBe('/output/config.cfg');
  });

  it('maps single-level namespace to dir/config.cfg', () => {
    // Java: ns="equip" → parent of dst + equip/equip.cfg
    // But since ns is "equip", it goes: cur = dst.getParent(), then for "equip":
    //   subDir(equip, cur) → cur/equip, lastName = "equip"
    //   return cur/equip/equip.cfg
    const dst = '/output/config.cfg';
    const result = CfgUtil.getCfgFilePathByNamespace('equip', dst);
    // parent of /output/config.cfg is /output
    // then subDir(equip, /output) → /output/equip
    // result: /output/equip/equip.cfg
    expect(result).toBe(path.join('/output', 'equip', 'equip.cfg'));
  });

  it('maps multi-level namespace', () => {
    const dst = '/output/config.cfg';
    const result = CfgUtil.getCfgFilePathByNamespace('equip.weapon', dst);
    // parent of /output/config.cfg is /output
    // for "equip": subDir(equip, /output) → /output/equip, lastName = "equip"
    // for "weapon": subDir(weapon, /output/equip) → /output/equip/weapon, lastName = "weapon"
    // result: /output/equip/weapon/weapon.cfg
    expect(result).toBe(path.join('/output', 'equip', 'weapon', 'weapon.cfg'));
  });
});

// ---------------------------------------------------------------------------
// findConfigFilesRecursively
// ---------------------------------------------------------------------------

describe('CfgUtil.findConfigFilesRecursively', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temp directory structure mirroring example/config
    tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cfgforge-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('finds root config.cfg', () => {
    // Create: tempDir/config.cfg
    const rootCfg = path.join(tempDir, 'config.cfg');
    fs.writeFileSync(rootCfg, 'table weapon [id] {\n\tid:int;\n}\n');

    const cfgFiles = new Map<string, CfgFileInfo>();
    CfgUtil.findConfigFilesRecursively(
      rootCfg, null, 'cfg', '', tempDir, cfgFiles,
    );

    expect(cfgFiles.size).toBe(1);
    const info = cfgFiles.get('config.cfg');
    expect(info).toBeDefined();
    expect(info!.pkgNameDot).toBe('');
    expect(info!.content).toBe('table weapon [id] {\n\tid:int;\n}\n');
  });

  it('finds nested .cfg files in subdirectories', () => {
    // Create structure:
    // tempDir/config.cfg
    // tempDir/equip/equip.cfg
    // tempDir/task/task.cfg
    const rootCfg = path.join(tempDir, 'config.cfg');
    fs.writeFileSync(rootCfg, 'table weapon [id] {\n\tid:int;\n}\n');

    fs.mkdirSync(path.join(tempDir, 'equip'));
    fs.writeFileSync(path.join(tempDir, 'equip', 'equip.cfg'), 'table ability [id] {\n\tid:int;\n}\n');

    fs.mkdirSync(path.join(tempDir, 'task'));
    fs.writeFileSync(path.join(tempDir, 'task', 'task.cfg'), 'table daily [id] {\n\tid:int;\n}\n');

    const cfgFiles = new Map<string, CfgFileInfo>();
    CfgUtil.findConfigFilesRecursively(
      rootCfg, null, 'cfg', '', tempDir, cfgFiles,
    );

    expect(cfgFiles.size).toBe(3);
    expect(cfgFiles.has('config.cfg')).toBe(true);
    expect(cfgFiles.has(path.join('equip', 'equip.cfg'))).toBe(true);
    expect(cfgFiles.has(path.join('task', 'task.cfg'))).toBe(true);

    const equipInfo = cfgFiles.get(path.join('equip', 'equip.cfg'));
    expect(equipInfo!.pkgNameDot).toBe('equip.');
    const taskInfo = cfgFiles.get(path.join('task', 'task.cfg'));
    expect(taskInfo!.pkgNameDot).toBe('task.');
  });

  it('finds deeply nested .cfg files', () => {
    // tempDir/config.cfg
    // tempDir/equip/equip.cfg
    // tempDir/equip/weapon/weapon.cfg
    const rootCfg = path.join(tempDir, 'config.cfg');
    fs.writeFileSync(rootCfg, 'table root [id] {\n\tid:int;\n}\n');

    fs.mkdirSync(path.join(tempDir, 'equip'));
    fs.writeFileSync(path.join(tempDir, 'equip', 'equip.cfg'), 'table ability [id] {\n\tid:int;\n}\n');

    fs.mkdirSync(path.join(tempDir, 'equip', 'weapon'));
    fs.writeFileSync(path.join(tempDir, 'equip', 'weapon', 'weapon.cfg'), 'table sword [id] {\n\tid:int;\n}\n');

    const cfgFiles = new Map<string, CfgFileInfo>();
    CfgUtil.findConfigFilesRecursively(
      rootCfg, null, 'cfg', '', tempDir, cfgFiles,
    );

    expect(cfgFiles.size).toBe(3);

    const weaponInfo = cfgFiles.get(path.join('equip', 'weapon', 'weapon.cfg'));
    expect(weaponInfo).toBeDefined();
    expect(weaponInfo!.pkgNameDot).toBe('equip.weapon.');
  });

  it('handles Chinese directory names with code name extraction', () => {
    // "ai_行为" → codeName "ai" → looks for "ai.cfg" inside
    const rootCfg = path.join(tempDir, 'config.cfg');
    fs.writeFileSync(rootCfg, 'table root [id] {\n\tid:int;\n}\n');

    fs.mkdirSync(path.join(tempDir, 'ai_行为'));
    fs.writeFileSync(path.join(tempDir, 'ai_行为', 'ai.cfg'), 'table behavior [id] {\n\tid:int;\n}\n');

    const cfgFiles = new Map<string, CfgFileInfo>();
    CfgUtil.findConfigFilesRecursively(
      rootCfg, null, 'cfg', '', tempDir, cfgFiles,
    );

    expect(cfgFiles.size).toBe(2);
    const aiInfo = cfgFiles.get(path.join('ai_行为', 'ai.cfg'));
    expect(aiInfo).toBeDefined();
    expect(aiInfo!.pkgNameDot).toBe('ai.');
  });

  it('respects whiteListSubDirs filter', () => {
    const rootCfg = path.join(tempDir, 'config.cfg');
    fs.writeFileSync(rootCfg, 'table root [id] {\n\tid:int;\n}\n');

    fs.mkdirSync(path.join(tempDir, 'equip'));
    fs.writeFileSync(path.join(tempDir, 'equip', 'equip.cfg'), 'table ability [id] {\n\tid:int;\n}\n');

    fs.mkdirSync(path.join(tempDir, 'task'));
    fs.writeFileSync(path.join(tempDir, 'task', 'task.cfg'), 'table daily [id] {\n\tid:int;\n}\n');

    const cfgFiles = new Map<string, CfgFileInfo>();
    CfgUtil.findConfigFilesRecursively(
      rootCfg, new Set(['equip']), 'cfg', '', tempDir, cfgFiles,
    );

    // Should find root + equip, but NOT task
    expect(cfgFiles.size).toBe(2);
    expect(cfgFiles.has('config.cfg')).toBe(true);
    expect(cfgFiles.has(path.join('equip', 'equip.cfg'))).toBe(true);
    expect(cfgFiles.has(path.join('task', 'task.cfg'))).toBe(false);
  });

  it('skips directories with non-letter first char', () => {
    const rootCfg = path.join(tempDir, 'config.cfg');
    fs.writeFileSync(rootCfg, 'table root [id] {\n\tid:int;\n}\n');

    // Directory starting with number → getCodeName returns null → skipped
    fs.mkdirSync(path.join(tempDir, '123bad'));
    fs.writeFileSync(path.join(tempDir, '123bad', '123bad.cfg'), 'table bad [id] {\n\tid:int;\n}\n');

    const cfgFiles = new Map<string, CfgFileInfo>();
    CfgUtil.findConfigFilesRecursively(
      rootCfg, null, 'cfg', '', tempDir, cfgFiles,
    );

    // Only root config found
    expect(cfgFiles.size).toBe(1);
    expect(cfgFiles.has('config.cfg')).toBe(true);
  });

  it('reads file content into CfgFileInfo', () => {
    const content = 'table weapon [id] {\n\tid:int;\n\tname:str;\n}\n';
    const rootCfg = path.join(tempDir, 'config.cfg');
    fs.writeFileSync(rootCfg, content);

    const cfgFiles = new Map<string, CfgFileInfo>();
    CfgUtil.findConfigFilesRecursively(
      rootCfg, null, 'cfg', '', tempDir, cfgFiles,
    );

    const info = cfgFiles.get('config.cfg');
    expect(info!.content).toBe(content);
  });

  it('handles non-existent root file gracefully', () => {
    const cfgFiles = new Map<string, CfgFileInfo>();
    const nonExistent = path.join(tempDir, 'nonexistent.cfg');
    CfgUtil.findConfigFilesRecursively(
      nonExistent, null, 'cfg', '', tempDir, cfgFiles,
    );

    // Should not add non-existent file, but should not throw
    expect(cfgFiles.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: CfgSchemas.readFromDir + writeToDir round-trip
// ---------------------------------------------------------------------------

describe('CfgUtil integration: read/write round-trip', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cfgforge-rt-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes separated schemas to directory and reads them back', () => {
    // Build a CfgSchema with multiple namespaces
    const cfg = CfgSchema.of();
    const reader = new CfgReader();

    const rootSrc = 'table weapon [id] {\n\tid:int;\n\tname:str;\n}\n';
    const equipSrc = 'table ability [id] {\n\tid:int;\n\tdesc:str;\n}\n';

    const rootSchema = reader.read(rootSrc, '', 'config.cfg');
    const equipSchema = reader.read(equipSrc, 'equip.', 'equip.cfg');

    for (const n of rootSchema.items()) cfg.add(n);
    for (const n of equipSchema.items()) cfg.add(n);

    // Write to directory
    const outDir = path.join(tempDir, 'output');
    fs.mkdirSync(outDir, { recursive: true });
    const cfgPath = path.join(outDir, 'config.cfg');
    CfgSchemas.writeToDir(cfgPath, cfg);

    // Verify files exist
    expect(fs.existsSync(cfgPath)).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'equip', 'equip.cfg'))).toBe(true);

    // Read back via findConfigFilesRecursively
    const cfgFiles = new Map<string, CfgFileInfo>();
    CfgUtil.findConfigFilesRecursively(
      cfgPath, null, 'cfg', '', outDir, cfgFiles,
    );

    expect(cfgFiles.size).toBe(2);
    const readBack = CfgSchemas.readFromDir(Array.from(cfgFiles.values()));

    // Verify the schemas match
    expect(readBack.items().length).toBe(2);
    const names = readBack.items().map((n: Nameable) => n.name());
    expect(names).toContain('weapon');
    expect(names).toContain('equip.ability');
  });

  it('writes single-namespace schema correctly', () => {
    const cfg = CfgSchema.of();
    const reader = new CfgReader();
    const src = 'struct myStruct {\n\tid:int;\n\tname:str;\n}\n';
    const one = reader.read(src, '', 'config.cfg');
    for (const n of one.items()) cfg.add(n);

    const outDir = path.join(tempDir, 'output');
    fs.mkdirSync(outDir, { recursive: true });
    const cfgPath = path.join(outDir, 'config.cfg');
    CfgSchemas.writeToDir(cfgPath, cfg);

    // Should write config.cfg in root
    expect(fs.existsSync(cfgPath)).toBe(true);
    const content = fs.readFileSync(cfgPath, 'utf-8');
    expect(content).toContain('struct myStruct');
  });
});

// ---------------------------------------------------------------------------
// Helper: create a TableSchema for testing
// ---------------------------------------------------------------------------

function makeTable(name: string, ...pkFields: string[]): TableSchema {
  const pk = new KeySchema(pkFields);
  const idField = new FieldSchema(
    'id', Primitive.INT, AutoOrPack.AUTO, Metadata_of(),
  );
  return new TableSchema(
    name,
    pk,
    ENo.NO,
    false,
    Metadata_of(),
    [idField],
    [],
    [],
  );
}
