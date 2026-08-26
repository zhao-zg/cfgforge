/**
 * CfgUtil async tests — findConfigFilesRecursivelyAsync via CfgFileSystem (T12.0c-3)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CfgUtil } from '../cfg/CfgUtil';
import type { CfgFileInfo } from '../CfgSchemas';
import { setDefaultFileSystem, NodeFileSystem } from '@cfggen/shared';

describe('CfgUtil.findConfigFilesRecursivelyAsync', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-cfu-'));
    setDefaultFileSystem(new NodeFileSystem());
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('finds root config.cfg', async () => {
    const rootCfg = path.join(tempDir, 'config.cfg');
    fs.writeFileSync(rootCfg, 'table weapon [id] {\n\tid:int;\n}\n');

    const cfgFiles = new Map<string, CfgFileInfo>();
    await CfgUtil.findConfigFilesRecursivelyAsync(
      rootCfg, null, 'cfg', '', tempDir, cfgFiles,
    );

    expect(cfgFiles.size).toBe(1);
    const info = cfgFiles.get('config.cfg');
    expect(info).toBeDefined();
    expect(info!.pkgNameDot).toBe('');
    expect(info!.content).toBe('table weapon [id] {\n\tid:int;\n}\n');
    expect(info!.lastModified).toBeGreaterThan(0);
  });

  it('finds nested .cfg files in subdirectories', async () => {
    const rootCfg = path.join(tempDir, 'config.cfg');
    fs.writeFileSync(rootCfg, 'table weapon [id] {\n\tid:int;\n}\n');

    fs.mkdirSync(path.join(tempDir, 'equip'));
    fs.writeFileSync(path.join(tempDir, 'equip', 'equip.cfg'), 'table ability [id] {\n\tid:int;\n}\n');

    fs.mkdirSync(path.join(tempDir, 'task'));
    fs.writeFileSync(path.join(tempDir, 'task', 'task.cfg'), 'table daily [id] {\n\tid:int;\n}\n');

    const cfgFiles = new Map<string, CfgFileInfo>();
    await CfgUtil.findConfigFilesRecursivelyAsync(
      rootCfg, null, 'cfg', '', tempDir, cfgFiles,
    );

    expect(cfgFiles.size).toBe(3);
    expect(cfgFiles.has('config.cfg')).toBe(true);
    expect(cfgFiles.has(path.join('equip', 'equip.cfg'))).toBe(true);
    expect(cfgFiles.has(path.join('task', 'task.cfg'))).toBe(true);

    expect(cfgFiles.get(path.join('equip', 'equip.cfg'))!.pkgNameDot).toBe('equip.');
    expect(cfgFiles.get(path.join('task', 'task.cfg'))!.pkgNameDot).toBe('task.');
  });

  it('finds deeply nested cfg files (a/b/b.cfg)', async () => {
    const rootCfg = path.join(tempDir, 'config.cfg');
    fs.writeFileSync(rootCfg, 'table root [id] {\n\tid:int;\n}\n');

    fs.mkdirSync(path.join(tempDir, 'equip', 'weapon'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'equip', 'equip.cfg'), 'table equip [id] {\n\tid:int;\n}\n');
    fs.writeFileSync(path.join(tempDir, 'equip', 'weapon', 'weapon.cfg'), 'table weapon [id] {\n\tid:int;\n}\n');

    const cfgFiles = new Map<string, CfgFileInfo>();
    await CfgUtil.findConfigFilesRecursivelyAsync(
      rootCfg, null, 'cfg', '', tempDir, cfgFiles,
    );

    expect(cfgFiles.size).toBe(3);
    expect(cfgFiles.get(path.join('equip', 'weapon', 'weapon.cfg'))!.pkgNameDot).toBe('equip.weapon.');
  });

  it('respects whiteListSubDirs filter', async () => {
    const rootCfg = path.join(tempDir, 'config.cfg');
    fs.writeFileSync(rootCfg, 'table root [id] {\n\tid:int;\n}\n');

    fs.mkdirSync(path.join(tempDir, 'equip'));
    fs.writeFileSync(path.join(tempDir, 'equip', 'equip.cfg'), 'table equip [id] {\n\tid:int;\n}\n');

    fs.mkdirSync(path.join(tempDir, 'task'));
    fs.writeFileSync(path.join(tempDir, 'task', 'task.cfg'), 'table task [id] {\n\tid:int;\n}\n');

    const cfgFiles = new Map<string, CfgFileInfo>();
    await CfgUtil.findConfigFilesRecursivelyAsync(
      rootCfg, new Set(['equip']), 'cfg', '', tempDir, cfgFiles,
    );

    expect(cfgFiles.size).toBe(2);
    expect(cfgFiles.has('config.cfg')).toBe(true);
    expect(cfgFiles.has(path.join('equip', 'equip.cfg'))).toBe(true);
    expect(cfgFiles.has(path.join('task', 'task.cfg'))).toBe(false);
  });

  it('produces same results as sync version', async () => {
    const rootCfg = path.join(tempDir, 'config.cfg');
    fs.writeFileSync(rootCfg, 'table root [id] {\n\tid:int;\n}\n');
    fs.mkdirSync(path.join(tempDir, 'equip'));
    fs.writeFileSync(path.join(tempDir, 'equip', 'equip.cfg'), 'table equip [id] {\n\tid:int;\n}\n');

    const syncFiles = new Map<string, CfgFileInfo>();
    CfgUtil.findConfigFilesRecursively(rootCfg, null, 'cfg', '', tempDir, syncFiles);

    const asyncFiles = new Map<string, CfgFileInfo>();
    await CfgUtil.findConfigFilesRecursivelyAsync(rootCfg, null, 'cfg', '', tempDir, asyncFiles);

    expect(asyncFiles.size).toBe(syncFiles.size);
    for (const [key, syncInfo] of syncFiles) {
      const asyncInfo = asyncFiles.get(key);
      expect(asyncInfo).toBeDefined();
      expect(asyncInfo!.pkgNameDot).toBe(syncInfo.pkgNameDot);
      expect(asyncInfo!.content).toBe(syncInfo.content);
      expect(asyncInfo!.lastModified).toBe(syncInfo.lastModified);
    }
  });
});
