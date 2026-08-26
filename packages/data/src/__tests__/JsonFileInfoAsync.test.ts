/**
 * JsonFileInfo async tests — ofAsync via CfgFileSystem (T12.0c-2)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { JsonFileInfo } from '../JsonFileInfo';
import { setDefaultFileSystem, NodeFileSystem } from '@cfgforge/shared';

describe('JsonFileInfo.ofAsync', () => {
  beforeEach(() => {
    setDefaultFileSystem(new NodeFileSystem());
  });

  it('creates JsonFileInfo with lastModified from real file', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-jfi-'));
    const filePath = path.join(tmpDir, '42.json');
    fs.writeFileSync(filePath, '{"id": 42}');

    const info = await JsonFileInfo.ofAsync(filePath, '_table/42.json');
    expect(info.isIntegerId).toBe(true);
    expect(info.integerId).toBe(42);
    expect(info.path).toBe(filePath);
    expect(info.relativePath).toBe('_table/42.json');
    expect(info.lastModified).toBeGreaterThan(0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('sets lastModified=0 for non-existent file', async () => {
    const info = await JsonFileInfo.ofAsync('/nonexistent/_t/1.json', '_t/1.json');
    expect(info.lastModified).toBe(0);
    expect(info.isIntegerId).toBe(true);
    expect(info.integerId).toBe(1);
  });

  it('sets isIntegerId=false for non-integer filename', async () => {
    const info = await JsonFileInfo.ofAsync('/data/_t/abc.json', '_t/abc.json');
    expect(info.isIntegerId).toBe(false);
    expect(info.integerId).toBe(-1);
  });

  it('matches of() result for same real file', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-jfi-'));
    const filePath = path.join(tmpDir, '7.json');
    fs.writeFileSync(filePath, '{"id": 7}');

    const syncInfo = JsonFileInfo.of(filePath, '_t/7.json');
    const asyncInfo = await JsonFileInfo.ofAsync(filePath, '_t/7.json');

    expect(asyncInfo.isIntegerId).toBe(syncInfo.isIntegerId);
    expect(asyncInfo.integerId).toBe(syncInfo.integerId);
    expect(asyncInfo.path).toBe(syncInfo.path);
    expect(asyncInfo.relativePath).toBe(syncInfo.relativePath);
    expect(asyncInfo.lastModified).toBe(syncInfo.lastModified);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
