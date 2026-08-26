import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CachedIndentPrinter } from '../CachedIndentPrinter';

describe('CachedIndentPrinter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('basic printing', () => {
    it('prints a line with no indent', () => {
      const filePath = path.join(tmpDir, 'test.txt');
      const ps = new CachedIndentPrinter(filePath);
      ps.println('hello');
      ps.close();

      expect(fs.readFileSync(filePath, 'utf8')).toBe('hello\n');
    });

    it('prints multiple lines', () => {
      const filePath = path.join(tmpDir, 'test.txt');
      const ps = new CachedIndentPrinter(filePath);
      ps.println('line1');
      ps.println('line2');
      ps.close();

      expect(fs.readFileSync(filePath, 'utf8')).toBe('line1\nline2\n');
    });
  });

  describe('indent control', () => {
    it('inc/dec controls indentation', () => {
      const filePath = path.join(tmpDir, 'test.txt');
      const ps = new CachedIndentPrinter(filePath);
      ps.println('top');
      ps.inc();
      ps.println('inner');
      ps.dec();
      ps.println('top2');
      ps.close();

      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toBe('top\n    inner\ntop2\n');
    });

    it('dec below zero throws', () => {
      const filePath = path.join(tmpDir, 'test.txt');
      const ps = new CachedIndentPrinter(filePath);
      expect(() => ps.dec()).toThrow();
      ps.close();
    });

    it('println1-7 add temporary indent', () => {
      const filePath = path.join(tmpDir, 'test.txt');
      const ps = new CachedIndentPrinter(filePath);
      ps.println('level0');     // 0 indent
      ps.println1('level1');    // 1 indent temporary
      ps.println2('level2');    // 2 indent temporary
      ps.println('level0b');    // back to 0
      ps.close();

      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toBe(
        'level0\n' +
        '    level1\n' +
        '        level2\n' +
        'level0b\n'
      );
    });
  });

  describe('printlnIf', () => {
    it('skips empty format string', () => {
      const filePath = path.join(tmpDir, 'test.txt');
      const ps = new CachedIndentPrinter(filePath);
      ps.println('before');
      ps.printlnIf('');
      ps.println('after');
      ps.close();

      expect(fs.readFileSync(filePath, 'utf8')).toBe('before\nafter\n');
    });

    it('prints non-empty format string', () => {
      const filePath = path.join(tmpDir, 'test.txt');
      const ps = new CachedIndentPrinter(filePath);
      ps.printlnIf('visible');
      ps.close();

      expect(fs.readFileSync(filePath, 'utf8')).toBe('visible\n');
    });
  });

  describe('println()', () => {
    it('prints just a newline', () => {
      const filePath = path.join(tmpDir, 'test.txt');
      const ps = new CachedIndentPrinter(filePath);
      ps.println('a');
      ps.println();
      ps.println('b');
      ps.close();

      expect(fs.readFileSync(filePath, 'utf8')).toBe('a\n\nb\n');
    });
  });

  describe('writeContent', () => {
    it('writes raw content without indent or newline', () => {
      const filePath = path.join(tmpDir, 'test.txt');
      const ps = new CachedIndentPrinter(filePath);
      ps.writeContent('raw');
      ps.close();

      expect(fs.readFileSync(filePath, 'utf8')).toBe('raw');
    });
  });
});
