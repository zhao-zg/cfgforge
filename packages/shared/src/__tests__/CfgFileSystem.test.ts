import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { NodeFileSystem } from '../NodeFileSystem';
import {
  setDefaultFileSystem,
  getDefaultFileSystem,
  hasDefaultFileSystem,
  ensureDefaultFileSystem,
  type CfgFileSystem,
} from '../CfgFileSystem';

describe('CfgFileSystem', () => {
  let tmpDir: string;
  let nodeFs: NodeFileSystem;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-fs-test-'));
    nodeFs = new NodeFileSystem();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('NodeFileSystem', () => {
    it('readFile/writeFile round-trip bytes', async () => {
      const filePath = path.join(tmpDir, 'a.bin');
      await nodeFs.writeFile(filePath, new Uint8Array([1, 2, 3]));
      const data = await nodeFs.readFile(filePath);
      expect(Array.from(data)).toEqual([1, 2, 3]);
    });

    it('writeFile creates parent directories', async () => {
      const filePath = path.join(tmpDir, 'sub', 'deep', 'f.txt');
      await nodeFs.writeFile(filePath, new Uint8Array([65]));
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('exists/isDirectory/isFile', async () => {
      const filePath = path.join(tmpDir, 'f.txt');
      await nodeFs.writeFile(filePath, new Uint8Array([65]));
      expect(await nodeFs.exists(filePath)).toBe(true);
      expect(await nodeFs.isFile(filePath)).toBe(true);
      expect(await nodeFs.isDirectory(filePath)).toBe(false);
      expect(await nodeFs.isDirectory(tmpDir)).toBe(true);
      expect(await nodeFs.exists(path.join(tmpDir, 'nope'))).toBe(false);
    });

    it('readDir lists entries', async () => {
      await nodeFs.writeFile(path.join(tmpDir, 'a.txt'), new Uint8Array([1]));
      await nodeFs.mkdirs(path.join(tmpDir, 'sub'));
      const entries = await nodeFs.readDir(tmpDir);
      expect(entries.sort()).toEqual(['a.txt', 'sub']);
    });

    it('remove deletes recursively', async () => {
      const dir = path.join(tmpDir, 'rmdir');
      await nodeFs.writeFile(path.join(dir, 'x.txt'), new Uint8Array([1]));
      await nodeFs.remove(dir);
      expect(fs.existsSync(dir)).toBe(false);
    });

    it('rename moves file', async () => {
      const from = path.join(tmpDir, 'from.txt');
      const to = path.join(tmpDir, 'to.txt');
      await nodeFs.writeFile(from, new Uint8Array([65]));
      await nodeFs.rename(from, to);
      expect(fs.existsSync(from)).toBe(false);
      expect(fs.existsSync(to)).toBe(true);
    });

    it('fileSize returns 0 for missing file', async () => {
      expect(await nodeFs.fileSize(path.join(tmpDir, 'nope'))).toBe(0);
      const filePath = path.join(tmpDir, 'size.bin');
      await nodeFs.writeFile(filePath, new Uint8Array([1, 2, 3, 4]));
      expect(await nodeFs.fileSize(filePath)).toBe(4);
    });

    it('listFilesRecursive walks nested dirs', async () => {
      await nodeFs.writeFile(path.join(tmpDir, 'a.txt'), new Uint8Array([1]));
      await nodeFs.writeFile(path.join(tmpDir, 'sub', 'b.txt'), new Uint8Array([2]));
      await nodeFs.writeFile(path.join(tmpDir, 'sub', 'deep', 'c.txt'), new Uint8Array([3]));
      const files = await nodeFs.listFilesRecursive(tmpDir);
      expect(files.map((f) => path.basename(f)).sort()).toEqual(['a.txt', 'b.txt', 'c.txt']);
    });

    // ---- 同步方法 ----
    it('sync methods work', () => {
      const filePath = path.join(tmpDir, 'sync.txt');
      nodeFs.writeTextFileSync(filePath, 'hello');
      expect(nodeFs.readTextFileSync(filePath, 'utf8')).toBe('hello');
      expect(nodeFs.existsSync(filePath)).toBe(true);
      expect(nodeFs.isDirectorySync(filePath)).toBe(false);
      expect(nodeFs.fileSizeSync(filePath)).toBe(5);
      expect(nodeFs.readDirSync(tmpDir)).toContain('sync.txt');
    });
  });

  describe('global singleton', () => {
    it('set/get/has round-trip', () => {
      setDefaultFileSystem(nodeFs);
      expect(hasDefaultFileSystem()).toBe(true);
      expect(getDefaultFileSystem()).toBe(nodeFs);
    });

    it('ensureDefaultFileSystem keeps existing instance', () => {
      setDefaultFileSystem(nodeFs);
      ensureDefaultFileSystem();
      expect(getDefaultFileSystem()).toBe(nodeFs);
    });

    it('getDefaultFileSystem uses NodeFileSystem after ensure in Node', () => {
      setDefaultFileSystem(nodeFs);
      const fsImpl = getDefaultFileSystem();
      expect(fsImpl.readTextFileSync).toBeDefined();
    });
  });
});