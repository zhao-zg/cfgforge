/**
 * LangSwitchable tests — T5.2
 *
 * Tests:
 * - constructor: stores langMap and defaultLang
 * - constructor: throws on null langMap
 * - constructor: throws on null defaultLang
 * - languages: returns [defaultLang, ...langMap keys]
 * - languageCount: langMap.size + 1
 * - read: byValue strategy (CSV directory, no subdirs)
 * - read: throws for byId strategy (directory with subdirectory)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LangSwitchable } from '../LangSwitchable';
import { LangTextFinder, type TextFinder } from '../LangTextFinder';

describe('LangSwitchable', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-langsw-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('stores langMap and defaultLang', () => {
      const langMap = new Map<string, LangTextFinder>();
      const ls = new LangSwitchable(langMap, 'zh_cn');
      expect(ls.defaultLang).toBe('zh_cn');
      expect(ls.langMap).toBe(langMap);
    });

    it('throws on null langMap', () => {
      expect(() => new LangSwitchable(null as any, 'zh_cn')).toThrow();
    });

    it('throws on null defaultLang', () => {
      const langMap = new Map<string, LangTextFinder>();
      expect(() => new LangSwitchable(langMap, null as any)).toThrow();
    });
  });

  describe('languages', () => {
    it('returns [defaultLang, ...langMap keys]', () => {
      const langMap = new Map<string, LangTextFinder>();
      langMap.set('en_us', new LangTextFinder());
      langMap.set('ja_jp', new LangTextFinder());
      const ls = new LangSwitchable(langMap, 'zh_cn');

      const langs = ls.languages();
      expect(langs.length).toBe(3);
      expect(langs[0]).toBe('zh_cn');
      expect(langs).toContain('en_us');
      expect(langs).toContain('ja_jp');
    });

    it('returns just [defaultLang] when langMap is empty', () => {
      const ls = new LangSwitchable(new Map(), 'zh_cn');
      expect(ls.languages()).toEqual(['zh_cn']);
    });
  });

  describe('languageCount', () => {
    it('returns langMap.size + 1', () => {
      const langMap = new Map<string, LangTextFinder>();
      langMap.set('en_us', new LangTextFinder());
      const ls = new LangSwitchable(langMap, 'zh_cn');
      expect(ls.languageCount()).toBe(2);
    });

    it('returns 1 when langMap is empty', () => {
      const ls = new LangSwitchable(new Map(), 'zh_cn');
      expect(ls.languageCount()).toBe(1);
    });
  });

  describe('read', () => {
    it('reads CSV directory (byValue strategy)', () => {
      // Create two CSV language files
      const zhPath = path.join(tmpDir, 'zh_cn.csv');
      fs.writeFileSync(zhPath, 'actor,name,名称\n', 'utf8');
      const enPath = path.join(tmpDir, 'en_us.csv');
      fs.writeFileSync(enPath, 'actor,name,Name\n', 'utf8');

      const ls = LangSwitchable.read(tmpDir, 'zh_cn');

      expect(ls.defaultLang).toBe('zh_cn');
      expect(ls.languageCount()).toBe(3); // zh_cn(default) + zh_cn + en_us

      const zhFinder = ls.langMap.get('zh_cn')!;
      expect(zhFinder.getTextFinder('actor')!.findText('1', ['name'], 'name')).toBe('名称');

      const enFinder = ls.langMap.get('en_us')!;
      expect(enFinder.getTextFinder('actor')!.findText('1', ['name'], 'name')).toBe('Name');
    });

    it('reads byId strategy (directory with subdirectory)', () => {
      // Create a language directory with xlsx files
      const zhDir = path.join(tmpDir, 'zh_cn');
      fs.mkdirSync(zhDir);
      const xlsxPath = path.join(zhDir, 'actor.xlsx');
      const XLSX = require('xlsx');
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['id', 'hello', 't(name)'],
        ['1', 'hello', '你好'],
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'sheet1');
      XLSX.writeFile(wb, xlsxPath);

      const ls = LangSwitchable.read(tmpDir, 'zh_cn');

      expect(ls.defaultLang).toBe('zh_cn');
      expect(ls.languageCount()).toBe(2); // zh_cn(default) + zh_cn

      const zhFinder = ls.langMap.get('zh_cn')!;
      expect(zhFinder.getTextFinder('actor.sheet1')!.findText('1', ['name'], 'hello')).toBe('你好');
    });
  });
});
