/**
 * MockTauriFileSystem tests — Task 2
 *
 * 验证 MockTauriFileSystem 正确模拟 Tauri WebView 环境的关键行为差异：
 * 1. isSyncSupported = false，所有同步方法抛错
 * 2. readFile 返回 Uint8Array（非 Buffer）
 * 3. readDir 返回 string[]（仅文件名）
 * 4. resolvePath 使用 PathUtil（分隔符无关）
 * 5. 文件 CRUD / 目录操作 / 递归列表
 * 6. 测试辅助方法 writeTextFile/readTextFile
 */

import {describe, it, expect, beforeEach} from 'vitest';
import {MockTauriFileSystem} from './MockTauriFileSystem';

describe('MockTauriFileSystem', () => {
  let fs: MockTauriFileSystem;

  beforeEach(() => {
    fs = new MockTauriFileSystem('/test');
  });

  // -----------------------------------------------------------------
  // 环境检测
  // -----------------------------------------------------------------
  describe('environment', () => {
    it('isSyncSupported is false', () => {
      expect(fs.isSyncSupported).toBe(false);
    });
  });

  // -----------------------------------------------------------------
  // 同步方法抛错
  // -----------------------------------------------------------------
  describe('sync methods throw', () => {
    const syncMethods = [
      'readTextFileSync',
      'readFileSync',
      'writeTextFileSync',
      'writeFileSync',
      'existsSync',
      'isDirectorySync',
      'readDirSync',
      'mkdirsSync',
      'removeSync',
      'renameSync',
      'fileSizeSync',
      'lastModifiedSync',
    ] as const;

    for (const method of syncMethods) {
      it(`${method}() throws TauriFileSystem error`, () => {
        const fn = (fs as unknown as Record<string, (...args: unknown[]) => unknown>)[method];
        expect(() => {
          // 传 dummy 参数避免 arity 问题
          fn.call(fs, '/dummy', '/dummy2', 'utf-8', new Uint8Array(0));
        }).toThrow('TauriFileSystem: synchronous operations are not available in WebView environment');
      });
    }
  });

  // -----------------------------------------------------------------
  // resolvePath
  // -----------------------------------------------------------------
  describe('resolvePath', () => {
    it('joins and normalizes paths with / separators', () => {
      expect(fs.resolvePath('/test', 'sub', 'file.csv')).toBe('/test/sub/file.csv');
    });

    it('handles backslash separators (Tauri on Windows)', () => {
      expect(fs.resolvePath('/test', 'sub\\file.csv')).toBe('/test/sub/file.csv');
    });

    it('normalizes . and ..', () => {
      expect(fs.resolvePath('/test', 'sub/../other', './file.csv')).toBe('/test/other/file.csv');
    });

    it('returns root when paths are empty', () => {
      expect(fs.resolvePath('/test')).toBe('/test');
    });

    it('handles drive letter paths', () => {
      expect(fs.resolvePath('C:/Users', 'data', 'config.cfg')).toBe('C:/Users/data/config.cfg');
    });
  });

  // -----------------------------------------------------------------
  // writeFile / readFile
  // -----------------------------------------------------------------
  describe('writeFile / readFile', () => {
    it('writes and reads binary data', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      await fs.writeFile('/test/data.bin', data);
      const result = await fs.readFile('/test/data.bin');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
    });

    it('readFile returns a copy (modifying result does not affect stored data)', async () => {
      const data = new Uint8Array([1, 2, 3]);
      await fs.writeFile('/test/data.bin', data);
      const result = await fs.readFile('/test/data.bin');
      result[0] = 99;
      const result2 = await fs.readFile('/test/data.bin');
      expect(result2[0]).toBe(1);
    });

    it('readFile throws on missing file', async () => {
      await expect(fs.readFile('/test/missing.bin')).rejects.toThrow('File not found');
    });

    it('writeFile creates parent directories', async () => {
      await fs.writeFile('/test/a/b/c/file.txt', new Uint8Array([65]));
      expect(await fs.exists('/test/a/b/c/file.txt')).toBe(true);
    });

    it('writeFile stores a copy (modifying original does not affect stored data)', async () => {
      const data = new Uint8Array([1, 2, 3]);
      await fs.writeFile('/test/data.bin', data);
      data[0] = 99;
      const result = await fs.readFile('/test/data.bin');
      expect(result[0]).toBe(1);
    });
  });

  // -----------------------------------------------------------------
  // exists / isFile / isDirectory
  // -----------------------------------------------------------------
  describe('exists / isFile / isDirectory', () => {
    it('exists returns true for files', async () => {
      await fs.writeFile('/test/file.txt', new Uint8Array([65]));
      expect(await fs.exists('/test/file.txt')).toBe(true);
    });

    it('exists returns false for missing paths', async () => {
      expect(await fs.exists('/test/missing.txt')).toBe(false);
    });

    it('isFile returns true for files, false for dirs', async () => {
      await fs.writeFile('/test/file.txt', new Uint8Array([65]));
      expect(await fs.isFile('/test/file.txt')).toBe(true);
      expect(await fs.isFile('/test')).toBe(false);
    });

    it('isFile returns false for missing paths', async () => {
      expect(await fs.isFile('/test/missing.txt')).toBe(false);
    });

    it('isDirectory returns true for dirs, false for files', async () => {
      await fs.writeFile('/test/file.txt', new Uint8Array([65]));
      expect(await fs.isDirectory('/test')).toBe(true);
      expect(await fs.isDirectory('/test/file.txt')).toBe(false);
    });

    it('isDirectory returns true for implied directories (files under a path)', async () => {
      await fs.writeFile('/test/sub/file.txt', new Uint8Array([65]));
      expect(await fs.isDirectory('/test/sub')).toBe(true);
    });

    it('isDirectory returns false for missing paths', async () => {
      expect(await fs.isDirectory('/test/nonexistent')).toBe(false);
    });
  });

  // -----------------------------------------------------------------
  // readDir
  // -----------------------------------------------------------------
  describe('readDir', () => {
    beforeEach(async () => {
      await fs.writeFile('/test/config.cfg', new Uint8Array([65]));
      await fs.writeFile('/test/equip/equip.cfg', new Uint8Array([66]));
      await fs.writeFile('/test/equip/equip.csv', new Uint8Array([67]));
      await fs.writeFile('/test/task/task.cfg', new Uint8Array([68]));
    });

    it('returns only file names (not full paths, not DirEntry objects)', async () => {
      const entries = await fs.readDir('/test');
      expect(entries).toContain('config.cfg');
      expect(entries).toContain('equip');
      expect(entries).toContain('task');
      // 不含子目录内部文件
      expect(entries).not.toContain('equip.cfg');
    });

    it('returns entries in subdirectory', async () => {
      const entries = await fs.readDir('/test/equip');
      expect(entries).toContain('equip.cfg');
      expect(entries).toContain('equip.csv');
      expect(entries).not.toContain('config.cfg');
    });

    it('returns empty array for missing directory', async () => {
      const entries = await fs.readDir('/test/nonexistent');
      expect(entries).toEqual([]);
    });

    it('returns string[] type (each entry is a string)', async () => {
      const entries = await fs.readDir('/test');
      for (const entry of entries) {
        expect(typeof entry).toBe('string');
      }
    });
  });

  // -----------------------------------------------------------------
  // mkdirs / remove
  // -----------------------------------------------------------------
  describe('mkdirs / remove', () => {
    it('mkdirs creates nested directories', async () => {
      await fs.mkdirs('/test/a/b/c');
      expect(await fs.isDirectory('/test/a/b/c')).toBe(true);
    });

    it('mkdirs is idempotent', async () => {
      await fs.mkdirs('/test/a/b');
      await fs.mkdirs('/test/a/b'); // 不抛错
      expect(await fs.isDirectory('/test/a/b')).toBe(true);
    });

    it('remove deletes a file', async () => {
      await fs.writeFile('/test/file.txt', new Uint8Array([65]));
      await fs.remove('/test/file.txt');
      expect(await fs.exists('/test/file.txt')).toBe(false);
    });

    it('remove deletes a directory recursively', async () => {
      await fs.writeFile('/test/a/b/c.txt', new Uint8Array([65]));
      await fs.remove('/test/a');
      expect(await fs.exists('/test/a')).toBe(false);
      expect(await fs.exists('/test/a/b/c.txt')).toBe(false);
    });

    it('remove is silent for missing path', async () => {
      await expect(fs.remove('/test/nonexistent')).resolves.toBeUndefined();
    });
  });

  // -----------------------------------------------------------------
  // rename
  // -----------------------------------------------------------------
  describe('rename', () => {
    it('moves a file to a new path', async () => {
      await fs.writeFile('/test/old.txt', new Uint8Array([65]));
      await fs.rename('/test/old.txt', '/test/new.txt');
      expect(await fs.exists('/test/old.txt')).toBe(false);
      expect(await fs.exists('/test/new.txt')).toBe(true);
      const data = await fs.readFile('/test/new.txt');
      expect(data[0]).toBe(65);
    });

    it('creates parent directory for destination', async () => {
      await fs.writeFile('/test/old.txt', new Uint8Array([65]));
      await fs.rename('/test/old.txt', '/test/sub/new.txt');
      expect(await fs.exists('/test/sub/new.txt')).toBe(true);
    });
  });

  // -----------------------------------------------------------------
  // fileSize / lastModified
  // -----------------------------------------------------------------
  describe('fileSize / lastModified', () => {
    it('fileSize returns correct byte count', async () => {
      const data = new Uint8Array(42);
      await fs.writeFile('/test/data.bin', data);
      expect(await fs.fileSize('/test/data.bin')).toBe(42);
    });

    it('fileSize returns 0 for missing file', async () => {
      expect(await fs.fileSize('/test/missing.bin')).toBe(0);
    });

    it('lastModified returns a positive number for existing file', async () => {
      await fs.writeFile('/test/file.txt', new Uint8Array([65]));
      const mtime = await fs.lastModified('/test/file.txt');
      expect(mtime).toBeGreaterThan(0);
    });

    it('lastModified returns 0 for missing file', async () => {
      expect(await fs.lastModified('/test/missing.txt')).toBe(0);
    });
  });

  // -----------------------------------------------------------------
  // listFilesRecursive
  // -----------------------------------------------------------------
  describe('listFilesRecursive', () => {
    beforeEach(async () => {
      await fs.writeFile('/test/config.cfg', new Uint8Array([65]));
      await fs.writeFile('/test/equip/equip.cfg', new Uint8Array([66]));
      await fs.writeFile('/test/equip/equip.csv', new Uint8Array([67]));
      await fs.writeFile('/test/task/task.cfg', new Uint8Array([68]));
      await fs.writeFile('/test/task/sub/inner.cfg', new Uint8Array([69]));
    });

    it('lists all files recursively with full paths', async () => {
      const files = await fs.listFilesRecursive('/test');
      expect(files).toContain('/test/config.cfg');
      expect(files).toContain('/test/equip/equip.cfg');
      expect(files).toContain('/test/equip/equip.csv');
      expect(files).toContain('/test/task/task.cfg');
      expect(files).toContain('/test/task/sub/inner.cfg');
      expect(files.length).toBe(5);
    });

    it('lists files in a subdirectory', async () => {
      const files = await fs.listFilesRecursive('/test/equip');
      expect(files).toContain('/test/equip/equip.cfg');
      expect(files).toContain('/test/equip/equip.csv');
      expect(files.length).toBe(2);
    });

    it('returns empty for missing directory', async () => {
      const files = await fs.listFilesRecursive('/test/nonexistent');
      expect(files).toEqual([]);
    });
  });

  // -----------------------------------------------------------------
  // 测试辅助方法
  // -----------------------------------------------------------------
  describe('test helper methods', () => {
    it('writeTextFile writes UTF-8 encoded text', async () => {
      fs.writeTextFile('/test/hello.txt', 'Hello, 世界!');
      const result = await fs.readFile('/test/hello.txt');
      expect(new TextDecoder().decode(result)).toBe('Hello, 世界!');
    });

    it('readTextFile reads UTF-8 decoded text', () => {
      fs.writeTextFile('/test/hello.txt', 'Hello!');
      expect(fs.readTextFile('/test/hello.txt')).toBe('Hello!');
    });

    it('readTextFile throws on missing file', () => {
      expect(() => fs.readTextFile('/test/missing.txt')).toThrow('File not found');
    });

    it('writeTextFile creates parent directories', async () => {
      fs.writeTextFile('/test/a/b/c.txt', 'nested');
      expect(await fs.exists('/test/a/b/c.txt')).toBe(true);
    });
  });

  // -----------------------------------------------------------------
  // 集成场景：模拟 cfgforge 配表目录
  // -----------------------------------------------------------------
  describe('integration: cfgforge config directory', () => {
    it('simulates a typical config directory structure', async () => {
      // Setup: 模拟配表目录
      fs.writeTextFile('/test/config/config.cfg', 'table user[id] { id:int; name:str; }');
      fs.writeTextFile('/test/config/user.csv', 'ID,Name\nid,name\n1,Alice\n');
      fs.writeTextFile('/test/config/equip/equip.cfg', 'table equip[id] { id:int; name:str; }');
      fs.writeTextFile('/test/config/equip/equip.csv', 'ID,Name\nid,name\n1,Sword\n');

      // exists
      expect(await fs.exists('/test/config/config.cfg')).toBe(true);
      expect(await fs.exists('/test/config/equip/equip.csv')).toBe(true);

      // isDirectory
      expect(await fs.isDirectory('/test/config/equip')).toBe(true);
      expect(await fs.isDirectory('/test/config/config.cfg')).toBe(false);

      // isFile
      expect(await fs.isFile('/test/config/config.cfg')).toBe(true);
      expect(await fs.isFile('/test/config/equip')).toBe(false);

      // readDir
      const rootEntries = await fs.readDir('/test/config');
      expect(rootEntries).toContain('config.cfg');
      expect(rootEntries).toContain('user.csv');
      expect(rootEntries).toContain('equip');

      const equipEntries = await fs.readDir('/test/config/equip');
      expect(equipEntries).toContain('equip.cfg');
      expect(equipEntries).toContain('equip.csv');

      // listFilesRecursive
      const allFiles = await fs.listFilesRecursive('/test/config');
      expect(allFiles.length).toBe(4);

      // readFile returns Uint8Array
      const data = await fs.readFile('/test/config/config.cfg');
      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.byteLength).toBeGreaterThan(0);
      expect(new TextDecoder().decode(data)).toContain('table user');

      // fileSize
      expect(await fs.fileSize('/test/config/equip/equip.csv')).toBeGreaterThan(0);
    });
  });
});
