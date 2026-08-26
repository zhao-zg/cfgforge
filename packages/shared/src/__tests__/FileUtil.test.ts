import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { moveDirFilesToAnotherDir, moveOneFile, hasFiles, assureFileExist } from '../FileUtil';

describe('FileUtil', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('moveDirFilesToAnotherDir', () => {
    it('moves all files from source to target dir', () => {
      const from = path.join(tmpDir, 'from');
      const to = path.join(tmpDir, 'to');
      fs.mkdirSync(from);
      fs.writeFileSync(path.join(from, 'a.txt'), 'A');
      fs.writeFileSync(path.join(from, 'b.txt'), 'B');

      moveDirFilesToAnotherDir(from, to);

      expect(fs.existsSync(path.join(to, 'a.txt'))).toBe(true);
      expect(fs.existsSync(path.join(to, 'b.txt'))).toBe(true);
      expect(fs.readFileSync(path.join(to, 'a.txt'), 'utf8')).toBe('A');
    });

    it('clears target dir before moving', () => {
      const from = path.join(tmpDir, 'from');
      const to = path.join(tmpDir, 'to');
      fs.mkdirSync(from);
      fs.mkdirSync(to);
      fs.writeFileSync(path.join(to, 'old.txt'), 'old');
      fs.writeFileSync(path.join(from, 'new.txt'), 'new');

      moveDirFilesToAnotherDir(from, to);

      expect(fs.existsSync(path.join(to, 'old.txt'))).toBe(false);
      expect(fs.existsSync(path.join(to, 'new.txt'))).toBe(true);
    });
  });

  describe('moveOneFile', () => {
    it('moves a single file', () => {
      const from = path.join(tmpDir, 'a.txt');
      const to = path.join(tmpDir, 'b.txt');
      fs.writeFileSync(from, 'content');

      moveOneFile(from, to);

      expect(fs.existsSync(from)).toBe(false);
      expect(fs.existsSync(to)).toBe(true);
      expect(fs.readFileSync(to, 'utf8')).toBe('content');
    });

    it('overwrites existing target file', () => {
      const from = path.join(tmpDir, 'new.txt');
      const to = path.join(tmpDir, 'old.txt');
      fs.writeFileSync(from, 'new');
      fs.writeFileSync(to, 'old');

      moveOneFile(from, to);

      expect(fs.readFileSync(to, 'utf8')).toBe('new');
    });
  });

  describe('hasFiles', () => {
    it('returns false for non-existent dir', () => {
      expect(hasFiles(path.join(tmpDir, 'noexist'))).toBe(false);
    });

    it('returns false for empty dir', () => {
      const dir = path.join(tmpDir, 'empty');
      fs.mkdirSync(dir);
      expect(hasFiles(dir)).toBe(false);
    });

    it('returns true for dir with files', () => {
      const dir = path.join(tmpDir, 'has');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'file.txt'), 'content');
      expect(hasFiles(dir)).toBe(true);
    });
  });

  describe('assureFileExist', () => {
    it('passes when file exists', () => {
      const filePath = path.join(tmpDir, 'exists.txt');
      fs.writeFileSync(filePath, 'content');
      expect(() => assureFileExist(filePath)).not.toThrow();
    });

    it('throws when file does not exist', () => {
      expect(() => assureFileExist(path.join(tmpDir, 'noexist.txt'))).toThrow();
    });

    it('passes for null input', () => {
      expect(() => assureFileExist(null as any)).not.toThrow();
    });
  });
});
