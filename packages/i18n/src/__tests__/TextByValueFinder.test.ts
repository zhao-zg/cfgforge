/**
 * TextByValueFinder tests — T5.1
 *
 * Tests:
 * - findText: finds translation by original text
 * - findText: returns null for unknown original
 * - findText: returns null for empty translated text
 * - findText: normalizes \r\n in original before lookup
 * - findText: pk and fieldChain are ignored (byValue strategy)
 * - foreachText: visits all (original, translated) pairs
 * - loadOneLang: reads CSV with 3 columns → builds LangTextFinder
 * - loadOneLang: throws on empty file
 * - loadOneLang: throws on wrong column count
 * - loadOneLang: skips malformed rows (not 3 columns)
 * - loadOneLang: multiple tables in same CSV
 * - loadOneLang: duplicate original overwrites previous
 * - loadMultiLang: reads directory of CSV files → Map<lang, LangTextFinder>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TextByValueFinder } from '../TextByValueFinder';
import type { TextVisitor } from '../LangTextFinder';

describe('TextByValueFinder', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-i18n-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('findText', () => {
    it('finds translation by original text', () => {
      const finder = new TextByValueFinder();
      finder.originalToTranslated.set('hello', '你好');
      expect(finder.findText('pk1', ['field1'], 'hello')).toBe('你好');
    });

    it('returns null for unknown original', () => {
      const finder = new TextByValueFinder();
      finder.originalToTranslated.set('hello', '你好');
      expect(finder.findText('pk1', ['field1'], 'world')).toBeNull();
    });

    it('returns null for empty translated text', () => {
      const finder = new TextByValueFinder();
      finder.originalToTranslated.set('hello', '');
      expect(finder.findText('pk1', ['field1'], 'hello')).toBeNull();
    });

    it('normalizes \\r\\n in original before lookup', () => {
      const finder = new TextByValueFinder();
      // stored as normalized (with \n)
      finder.originalToTranslated.set('line1\nline2', '翻译');
      // input with \r\n should match
      expect(finder.findText('pk1', ['field1'], 'line1\r\nline2')).toBe('翻译');
    });

    it('ignores pk and fieldChain (byValue strategy)', () => {
      const finder = new TextByValueFinder();
      finder.originalToTranslated.set('hello', '你好');
      // different pk and fieldChain, same original → same translation
      expect(finder.findText('pkA', ['fieldA'], 'hello')).toBe('你好');
      expect(finder.findText('pkB', ['fieldB', 'sub'], 'hello')).toBe('你好');
    });
  });

  describe('foreachText', () => {
    it('visits all (original, translated) pairs', () => {
      const finder = new TextByValueFinder();
      finder.originalToTranslated.set('hello', '你好');
      finder.originalToTranslated.set('world', '世界');

      const visited: Array<[string, string]> = [];
      const visitor: TextVisitor = {
        visit(original: string, translated: string) {
          visited.push([original, translated]);
        },
      };

      finder.foreachText(visitor);

      expect(visited.length).toBe(2);
      // Map preserves insertion order in JS
      expect(visited[0]).toEqual(['hello', '你好']);
      expect(visited[1]).toEqual(['world', '世界']);
    });

    it('visits empty finder without error', () => {
      const finder = new TextByValueFinder();
      const visited: Array<[string, string]> = [];
      const visitor: TextVisitor = {
        visit(original: string, translated: string) {
          visited.push([original, translated]);
        },
      };

      finder.foreachText(visitor);
      expect(visited.length).toBe(0);
    });
  });

  describe('loadOneLang', () => {
    it('reads CSV with 3 columns and builds LangTextFinder', () => {
      const csvPath = path.join(tmpDir, 'zh_cn.csv');
      fs.writeFileSync(csvPath, 'actor,name,名称\nactor,desc,描述\nitem,name,名称\n', 'utf8');

      const langFinder = TextByValueFinder.loadOneLang(csvPath);

      // Two tables: actor and item
      const actorFinder = langFinder.getTextFinder('actor');
      expect(actorFinder).not.toBeNull();
      expect(actorFinder!.findText('1', ['name'], 'name')).toBe('名称');
      expect(actorFinder!.findText('1', ['desc'], 'desc')).toBe('描述');

      const itemFinder = langFinder.getTextFinder('item');
      expect(itemFinder).not.toBeNull();
      expect(itemFinder!.findText('1', ['name'], 'name')).toBe('名称');
    });

    it('throws on empty file', () => {
      const csvPath = path.join(tmpDir, 'empty.csv');
      fs.writeFileSync(csvPath, '', 'utf8');

      expect(() => TextByValueFinder.loadOneLang(csvPath)).toThrow('为空');
    });

    it('throws on wrong column count (not 3)', () => {
      const csvPath = path.join(tmpDir, 'bad.csv');
      fs.writeFileSync(csvPath, 'a,b\n1,2\n', 'utf8');

      expect(() => TextByValueFinder.loadOneLang(csvPath)).toThrow('列数不为3');
    });

    it('skips malformed rows (not 3 columns)', () => {
      const csvPath = path.join(tmpDir, 'mixed.csv');
      // First row has 3 cols (validation passes), subsequent rows vary
      fs.writeFileSync(csvPath, 'actor,name,名称\nactor,bad\nactor,desc,描述\n', 'utf8');

      // Should not throw, just skip the bad row
      const langFinder = TextByValueFinder.loadOneLang(csvPath);
      const actorFinder = langFinder.getTextFinder('actor');
      expect(actorFinder).not.toBeNull();
      expect(actorFinder!.findText('1', ['name'], 'name')).toBe('名称');
      expect(actorFinder!.findText('1', ['desc'], 'desc')).toBe('描述');
    });

    it('handles duplicate original (last wins)', () => {
      const csvPath = path.join(tmpDir, 'dup.csv');
      fs.writeFileSync(csvPath, 'actor,name,名称\nactor,name,名字\n', 'utf8');

      const langFinder = TextByValueFinder.loadOneLang(csvPath);
      const actorFinder = langFinder.getTextFinder('actor');
      expect(actorFinder!.findText('1', ['name'], 'name')).toBe('名字');
    });

    it('normalizes \\r\\n in original text from CSV', () => {
      const csvPath = path.join(tmpDir, 'crlf.csv');
      // CSV: original (col 2) contains \r\n inside quotes, translated (col 3) is plain
      fs.writeFileSync(csvPath, 'actor,"line1\r\nline2","翻译"\n', 'utf8');

      const langFinder = TextByValueFinder.loadOneLang(csvPath);
      const actorFinder = langFinder.getTextFinder('actor');
      // Lookup with \r\n should match (normalized to \n internally)
      expect(actorFinder!.findText('1', ['desc'], 'line1\r\nline2')).toBe('翻译');
      // Also lookup with \n should match
      expect(actorFinder!.findText('1', ['desc'], 'line1\nline2')).toBe('翻译');
    });
  });

  describe('loadMultiLang', () => {
    it('reads directory of CSV files → Map<lang, LangTextFinder>', () => {
      // Create two language CSV files
      const zhPath = path.join(tmpDir, 'zh_cn.csv');
      fs.writeFileSync(zhPath, 'actor,name,名称\n', 'utf8');

      const enPath = path.join(tmpDir, 'en_us.csv');
      fs.writeFileSync(enPath, 'actor,name,Name\n', 'utf8');

      // Also create a non-CSV file that should be ignored
      const txtPath = path.join(tmpDir, 'readme.txt');
      fs.writeFileSync(txtPath, 'ignore me', 'utf8');

      const langMap = TextByValueFinder.loadMultiLang(tmpDir);

      expect(langMap.size).toBe(2);
      expect(langMap.has('zh_cn')).toBe(true);
      expect(langMap.has('en_us')).toBe(true);

      const zhFinder = langMap.get('zh_cn')!;
      expect(zhFinder.getTextFinder('actor')!.findText('1', ['name'], 'name')).toBe('名称');

      const enFinder = langMap.get('en_us')!;
      expect(enFinder.getTextFinder('actor')!.findText('1', ['name'], 'name')).toBe('Name');
    });

    it('returns empty map for directory with no CSV files', () => {
      const txtPath = path.join(tmpDir, 'readme.txt');
      fs.writeFileSync(txtPath, 'ignore me', 'utf8');

      const langMap = TextByValueFinder.loadMultiLang(tmpDir);
      expect(langMap.size).toBe(0);
    });
  });
});
