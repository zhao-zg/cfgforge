/**
 * LangTextFinder tests — T5.1
 *
 * Tests:
 * - getTextFinder / setTextFinder: map operations
 * - read: file path → byValue strategy (TextByValueFinder)
 * - read: directory path → throws (byId not yet implemented)
 * - read: non-existent path → throws
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LangTextFinder, type TextFinder, type TextVisitor } from '../LangTextFinder';

describe('LangTextFinder', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-ltf-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getTextFinder / setTextFinder', () => {
    it('returns null for unknown table', () => {
      const ltf = new LangTextFinder();
      expect(ltf.getTextFinder('unknown')).toBeNull();
    });

    it('returns the finder set by setTextFinder', () => {
      const ltf = new LangTextFinder();
      const mockFinder: TextFinder = {
        findText: () => 'translated',
        foreachText: () => {},
      };

      ltf.setTextFinder('actor', mockFinder);
      const result = ltf.getTextFinder('actor');
      expect(result).toBe(mockFinder);
      expect(result!.findText('1', ['name'], 'hello')).toBe('translated');
    });

    it('overwrites previous finder for same table', () => {
      const ltf = new LangTextFinder();
      const finder1: TextFinder = {
        findText: () => 'first',
        foreachText: () => {},
      };
      const finder2: TextFinder = {
        findText: () => 'second',
        foreachText: () => {},
      };

      ltf.setTextFinder('actor', finder1);
      ltf.setTextFinder('actor', finder2);
      expect(ltf.getTextFinder('actor')!.findText('1', ['name'], 'hello')).toBe('second');
    });
  });

  describe('read', () => {
    it('reads CSV file → byValue strategy', () => {
      const csvPath = path.join(tmpDir, 'zh_cn.csv');
      fs.writeFileSync(csvPath, 'actor,name,名称\nactor,desc,描述\n', 'utf8');

      const ltf = LangTextFinder.read(csvPath);

      const actorFinder = ltf.getTextFinder('actor');
      expect(actorFinder).not.toBeNull();
      expect(actorFinder!.findText('1', ['name'], 'name')).toBe('名称');
      expect(actorFinder!.findText('1', ['desc'], 'desc')).toBe('描述');
    });

    it('throws for directory path (byId not yet implemented)', () => {
      // Create a directory (simulate byId path)
      const dirPath = path.join(tmpDir, 'langdir');
      fs.mkdirSync(dirPath);

      expect(() => LangTextFinder.read(dirPath)).toThrow('not yet implemented');
    });

    it('throws for non-existent path', () => {
      expect(() => LangTextFinder.read(path.join(tmpDir, 'nonexistent.csv'))).toThrow();
    });
  });
});
