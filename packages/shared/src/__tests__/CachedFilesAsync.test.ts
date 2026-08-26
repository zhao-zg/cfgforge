import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CachedFiles } from '../CachedFiles';
import { setDefaultFileSystem } from '../CfgFileSystem';
import { NodeFileSystem } from '../NodeFileSystem';

describe('CachedFiles async (T12.0b)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-test-'));
    setDefaultFileSystem(new NodeFileSystem());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('writeFileAsync', () => {
    it('creates new file', async () => {
      const filePath = path.join(tmpDir, 'new.txt');
      await CachedFiles.writeFileAsync(filePath, Buffer.from('hello'));
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe('hello');
    });

    it('creates parent directories if needed', async () => {
      const filePath = path.join(tmpDir, 'sub', 'dir', 'file.txt');
      await CachedFiles.writeFileAsync(filePath, Buffer.from('content'));
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe('content');
    });

    it('does not overwrite if content is identical', async () => {
      const filePath = path.join(tmpDir, 'same.txt');
      fs.writeFileSync(filePath, 'same');
      const mtime1 = fs.statSync(filePath).mtimeMs;
      await CachedFiles.writeFileAsync(filePath, Buffer.from('same'));
      expect(fs.readFileSync(filePath, 'utf8')).toBe('same');
      expect(fs.statSync(filePath).mtimeMs).toBe(mtime1);
    });

    it('overwrites if content differs', async () => {
      const filePath = path.join(tmpDir, 'change.txt');
      fs.writeFileSync(filePath, 'old');
      await CachedFiles.writeFileAsync(filePath, Buffer.from('new'));
      expect(fs.readFileSync(filePath, 'utf8')).toBe('new');
    });

    it('overwrites if size differs', async () => {
      const filePath = path.join(tmpDir, 'size.txt');
      fs.writeFileSync(filePath, 'short');
      await CachedFiles.writeFileAsync(filePath, Buffer.from('much longer content'));
      expect(fs.readFileSync(filePath, 'utf8')).toBe('much longer content');
    });

    it('accepts plain Uint8Array (not just Buffer)', async () => {
      const filePath = path.join(tmpDir, 'uint8.txt');
      await CachedFiles.writeFileAsync(filePath, new Uint8Array([65, 66, 67]));
      expect(fs.readFileSync(filePath, 'utf8')).toBe('ABC');
    });
  });

  describe('deleteAsync', () => {
    it('deletes a file and returns true', async () => {
      const filePath = path.join(tmpDir, 'todelete.txt');
      fs.writeFileSync(filePath, 'content');
      const result = await CachedFiles.deleteAsync(filePath);
      expect(result).toBe(true);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('returns false for non-existent file', async () => {
      const result = await CachedFiles.deleteAsync(path.join(tmpDir, 'noexist.txt'));
      expect(result).toBe(false);
    });

    it('deletes a directory recursively', async () => {
      const dir = path.join(tmpDir, 'rmdir');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'x.txt'), 'x');
      const result = await CachedFiles.deleteAsync(dir);
      expect(result).toBe(true);
      expect(fs.existsSync(dir)).toBe(false);
    });
  });

  describe('finalExitAsync', () => {
    it('deletes files not in keep set', async () => {
      const keepPath = path.join(tmpDir, 'keep.txt');
      await CachedFiles.writeFileAsync(keepPath, Buffer.from('keep'));

      const junkPath = path.join(tmpDir, 'junk.txt');
      fs.writeFileSync(junkPath, 'junk');

      CachedFiles.deleteOtherFiles(tmpDir);
      await CachedFiles.finalExitAsync();

      expect(fs.existsSync(keepPath)).toBe(true);
      expect(fs.existsSync(junkPath)).toBe(false);
    });

    it('keeps .meta file when base file is kept (keepMetaAndDeleteOtherFiles)', async () => {
      // keep base file
      const basePath = path.join(tmpDir, 'data.bin');
      await CachedFiles.writeFileAsync(basePath, Buffer.from('data'));

      // stale meta file should be removed, base kept
      const staleMeta = path.join(tmpDir, 'stale.bin.meta');
      fs.writeFileSync(staleMeta, 'meta');

      CachedFiles.keepMetaAndDeleteOtherFiles(tmpDir);
      await CachedFiles.finalExitAsync();

      expect(fs.existsSync(basePath)).toBe(true);
      expect(fs.existsSync(staleMeta)).toBe(false);
    });

    it('clears state after finalExitAsync', async () => {
      const filePath = path.join(tmpDir, 'a.txt');
      await CachedFiles.writeFileAsync(filePath, Buffer.from('a'));
      CachedFiles.deleteOtherFiles(tmpDir);
      await CachedFiles.finalExitAsync();

      const newFile = path.join(tmpDir, 'new.txt');
      fs.writeFileSync(newFile, 'new');
      await CachedFiles.finalExitAsync();
      expect(fs.existsSync(newFile)).toBe(true);
    });
  });
});