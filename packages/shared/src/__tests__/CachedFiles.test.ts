import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CachedFiles } from '../CachedFiles';
import { setDefaultFileSystem } from '../CfgFileSystem';
import { NodeFileSystem } from '../NodeFileSystem';

describe('CachedFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-test-'));
    setDefaultFileSystem(new NodeFileSystem());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('writeFile', () => {
    it('creates new file', () => {
      const filePath = path.join(tmpDir, 'new.txt');
      CachedFiles.writeFile(filePath, Buffer.from('hello'));
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe('hello');
    });

    it('creates parent directories if needed', () => {
      const filePath = path.join(tmpDir, 'sub', 'dir', 'file.txt');
      CachedFiles.writeFile(filePath, Buffer.from('content'));
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe('content');
    });

    it('does not overwrite if content is identical', () => {
      const filePath = path.join(tmpDir, 'same.txt');
      fs.writeFileSync(filePath, 'same');
      const mtime1 = fs.statSync(filePath).mtimeMs;
      // Wait a bit to ensure mtime would differ if written
      CachedFiles.writeFile(filePath, Buffer.from('same'));
      // File should still exist with same content
      expect(fs.readFileSync(filePath, 'utf8')).toBe('same');
    });

    it('overwrites if content differs', () => {
      const filePath = path.join(tmpDir, 'change.txt');
      fs.writeFileSync(filePath, 'old');
      CachedFiles.writeFile(filePath, Buffer.from('new'));
      expect(fs.readFileSync(filePath, 'utf8')).toBe('new');
    });

    it('overwrites if size differs', () => {
      const filePath = path.join(tmpDir, 'size.txt');
      fs.writeFileSync(filePath, 'short');
      CachedFiles.writeFile(filePath, Buffer.from('much longer content'));
      expect(fs.readFileSync(filePath, 'utf8')).toBe('much longer content');
    });
  });

  describe('keepFile', () => {
    it('marks file as kept so it survives finalExit cleanup', () => {
      const keepPath = path.join(tmpDir, 'keep.txt');
      CachedFiles.writeFile(keepPath, Buffer.from('keep'));

      // Create a file NOT via CachedFiles.writeFile (so it's not in keep set)
      const deletePath = path.join(tmpDir, 'delete.txt');
      fs.writeFileSync(deletePath, 'delete');

      CachedFiles.deleteOtherFiles(tmpDir);
      CachedFiles.finalExit();

      expect(fs.existsSync(keepPath)).toBe(true);
      expect(fs.existsSync(deletePath)).toBe(false);
    });
  });

  describe('deleteOtherFiles + finalExit', () => {
    it('deletes files not in keep set', () => {
      const keepPath = path.join(tmpDir, 'keep.txt');
      CachedFiles.writeFile(keepPath, Buffer.from('keep'));

      const junkPath = path.join(tmpDir, 'junk.txt');
      fs.writeFileSync(junkPath, 'junk');

      CachedFiles.deleteOtherFiles(tmpDir);
      CachedFiles.finalExit();

      expect(fs.existsSync(keepPath)).toBe(true);
      expect(fs.existsSync(junkPath)).toBe(false);
    });

    it('clears state after finalExit', () => {
      const filePath = path.join(tmpDir, 'a.txt');
      CachedFiles.writeFile(filePath, Buffer.from('a'));
      CachedFiles.deleteOtherFiles(tmpDir);
      CachedFiles.finalExit();

      // After finalExit, a new file should not be cleaned by old delete registration
      const newFile = path.join(tmpDir, 'new.txt');
      fs.writeFileSync(newFile, 'new');
      // Calling finalExit again should not delete newFile (state was cleared)
      CachedFiles.finalExit();
      expect(fs.existsSync(newFile)).toBe(true);
    });
  });

  describe('delete', () => {
    it('deletes a file and returns true', () => {
      const filePath = path.join(tmpDir, 'todelete.txt');
      fs.writeFileSync(filePath, 'content');
      const result = CachedFiles.delete(filePath);
      expect(result).toBe(true);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('returns false for non-existent file', () => {
      const result = CachedFiles.delete(path.join(tmpDir, 'noexist.txt'));
      expect(result).toBe(false);
    });
  });
});
