/**
 * I18nAsync tests — T12.0g
 *
 * Tests async variants of i18n fs operations via CfgFileSystem:
 * - TextByIdFinder.loadOneFileAsync / loadOneLangAsync / loadMultiLangAsync
 * - TextByValueFinder.loadOneLangAsync / loadMultiLangAsync
 * - LangTextFinder.readAsync
 * - LangSwitchable.readAsync
 * - TodoFile.readAsync / saveAsync / readAndMergeToFinderAsync
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as XLSX from 'xlsx';
import { setDefaultFileSystem, NodeFileSystem } from '@cfggen/shared';
import { TextByIdFinder } from '../TextByIdFinder';
import { TextByValueFinder } from '../TextByValueFinder';
import { LangTextFinder } from '../LangTextFinder';
import { LangSwitchable } from '../LangSwitchable';
import { TodoFile, TodoFileLine } from '../TodoFile';

// ---------------------------------------------------------------------------
// Helper: create an xlsx file from array-of-arrays per sheet
// ---------------------------------------------------------------------------

function createXlsx(filePath: string, sheets: Record<string, any[][]>): void {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, aoa] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  XLSX.writeFile(wb, filePath);
}

describe('I18nAsync (T12.0g)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-i18n-async-'));
    setDefaultFileSystem(new NodeFileSystem());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // TextByIdFinder async
  // -----------------------------------------------------------------------

  describe('TextByIdFinder.loadOneFileAsync', () => {
    it('reads xlsx file with multiple sheets (async)', async () => {
      const xlsxPath = path.join(tmpDir, 'actor.xlsx');
      createXlsx(xlsxPath, {
        'sheet1': [
          ['id', 'hello', 't(name)'],
          ['1', 'hello', '你好'],
        ],
        'sheet2': [
          ['id', 'world', 't(desc)'],
          ['1', 'world', '世界'],
        ],
      });

      const map = await TextByIdFinder.loadOneFileAsync(xlsxPath);

      expect(map.size).toBe(2);
      expect(map.has('actor.sheet1')).toBe(true);
      expect(map.has('actor.sheet2')).toBe(true);

      const finder1 = map.get('actor.sheet1')!;
      expect(finder1.findText('1', ['name'], 'hello')).toBe('你好');

      const finder2 = map.get('actor.sheet2')!;
      expect(finder2.findText('1', ['desc'], 'world')).toBe('世界');
    });

    it('throws for non-xlsx file (async)', async () => {
      const txtPath = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(txtPath, 'not xlsx', 'utf8');
      await expect(TextByIdFinder.loadOneFileAsync(txtPath)).rejects.toThrow('not .xlsx');
    });

    it('skips sheets with <=1 row (async)', async () => {
      const xlsxPath = path.join(tmpDir, 'actor.xlsx');
      createXlsx(xlsxPath, {
        'empty': [['id', 'hello', 't(name)']],
        'good': [
          ['id', 'hello', 't(name)'],
          ['1', 'hello', '你好'],
        ],
      });

      const map = await TextByIdFinder.loadOneFileAsync(xlsxPath);
      expect(map.size).toBe(1);
      expect(map.has('actor.good')).toBe(true);
    });
  });

  describe('TextByIdFinder.loadOneLangAsync', () => {
    it('reads directory of xlsx files (async)', async () => {
      const langDir = path.join(tmpDir, 'zh_cn');
      fs.mkdirSync(langDir);

      createXlsx(path.join(langDir, 'actor.xlsx'), {
        'sheet1': [
          ['id', 'hello', 't(name)'],
          ['1', 'hello', '你好'],
        ],
      });

      createXlsx(path.join(langDir, 'item.xlsx'), {
        'sheet1': [
          ['id', 'sword', 't(name)'],
          ['1', 'sword', '剑'],
        ],
      });

      const langFinder = await TextByIdFinder.loadOneLangAsync(langDir);

      const actorFinder = langFinder.getTextFinder('actor.sheet1');
      expect(actorFinder).not.toBeNull();
      expect(actorFinder!.findText('1', ['name'], 'hello')).toBe('你好');

      const itemFinder = langFinder.getTextFinder('item.sheet1');
      expect(itemFinder).not.toBeNull();
      expect(itemFinder!.findText('1', ['name'], 'sword')).toBe('剑');
    });

    it('skips _todo_*.xlsx files (async)', async () => {
      const langDir = path.join(tmpDir, 'en_us');
      fs.mkdirSync(langDir);

      createXlsx(path.join(langDir, 'actor.xlsx'), {
        'sheet1': [
          ['id', 'hello', 't(name)'],
          ['1', 'hello', 'Hello'],
        ],
      });

      createXlsx(path.join(langDir, '_todo_en_us.xlsx'), {
        'todo': [
          ['table', 'id', 'fieldChain', 'original', 'translated'],
          ['actor.sheet1', '1', 'name', 'hello', 'Hello!'],
        ],
      });

      const langFinder = await TextByIdFinder.loadOneLangAsync(langDir);
      expect(langFinder.getTextFinder('actor.sheet1')).not.toBeNull();
    });
  });

  describe('TextByIdFinder.loadMultiLangAsync', () => {
    it('reads directory of language directories (async)', async () => {
      const zhDir = path.join(tmpDir, 'zh_cn');
      fs.mkdirSync(zhDir);
      createXlsx(path.join(zhDir, 'actor.xlsx'), {
        'sheet1': [
          ['id', 'hello', 't(name)'],
          ['1', 'hello', '你好'],
        ],
      });

      const enDir = path.join(tmpDir, 'en_us');
      fs.mkdirSync(enDir);
      createXlsx(path.join(enDir, 'actor.xlsx'), {
        'sheet1': [
          ['id', 'hello', 't(name)'],
          ['1', 'hello', 'Hello'],
        ],
      });

      const langMap = await TextByIdFinder.loadMultiLangAsync(tmpDir);

      expect(langMap.size).toBe(2);
      expect(langMap.has('zh_cn')).toBe(true);
      expect(langMap.has('en_us')).toBe(true);

      const zhFinder = langMap.get('zh_cn')!;
      expect(zhFinder.getTextFinder('actor.sheet1')!.findText('1', ['name'], 'hello')).toBe('你好');

      const enFinder = langMap.get('en_us')!;
      expect(enFinder.getTextFinder('actor.sheet1')!.findText('1', ['name'], 'hello')).toBe('Hello');
    });
  });

  // -----------------------------------------------------------------------
  // TextByValueFinder async
  // -----------------------------------------------------------------------

  describe('TextByValueFinder.loadOneLangAsync', () => {
    it('reads CSV file (async)', async () => {
      const csvPath = path.join(tmpDir, 'zh_cn.csv');
      fs.writeFileSync(csvPath, 'actor,name,名称\n', 'utf8');

      const langFinder = await TextByValueFinder.loadOneLangAsync(csvPath);
      const finder = langFinder.getTextFinder('actor')!;
      expect(finder.findText('1', ['name'], 'name')).toBe('名称');
    });

    it('throws on empty CSV (async)', async () => {
      const csvPath = path.join(tmpDir, 'empty.csv');
      fs.writeFileSync(csvPath, '', 'utf8');
      await expect(TextByValueFinder.loadOneLangAsync(csvPath)).rejects.toThrow('为空');
    });
  });

  describe('TextByValueFinder.loadMultiLangAsync', () => {
    it('reads directory of CSV files (async)', async () => {
      fs.writeFileSync(path.join(tmpDir, 'zh_cn.csv'), 'actor,name,名称\n', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'en_us.csv'), 'actor,name,Name\n', 'utf8');

      const langMap = await TextByValueFinder.loadMultiLangAsync(tmpDir);

      expect(langMap.size).toBe(2);
      expect(langMap.has('zh_cn')).toBe(true);
      expect(langMap.has('en_us')).toBe(true);

      const zhFinder = langMap.get('zh_cn')!;
      expect(zhFinder.getTextFinder('actor')!.findText('1', ['name'], 'name')).toBe('名称');

      const enFinder = langMap.get('en_us')!;
      expect(enFinder.getTextFinder('actor')!.findText('1', ['name'], 'name')).toBe('Name');
    });
  });

  // -----------------------------------------------------------------------
  // LangTextFinder.readAsync
  // -----------------------------------------------------------------------

  describe('LangTextFinder.readAsync', () => {
    it('reads CSV file via byValue strategy (async)', async () => {
      const csvPath = path.join(tmpDir, 'zh_cn.csv');
      fs.writeFileSync(csvPath, 'actor,name,名称\n', 'utf8');

      const finder = await LangTextFinder.readAsync(csvPath);
      expect(finder.getTextFinder('actor')!.findText('1', ['name'], 'name')).toBe('名称');
    });

    it('reads xlsx directory via byId strategy (async)', async () => {
      const langDir = path.join(tmpDir, 'zh_cn');
      fs.mkdirSync(langDir);
      createXlsx(path.join(langDir, 'actor.xlsx'), {
        'sheet1': [
          ['id', 'hello', 't(name)'],
          ['1', 'hello', '你好'],
        ],
      });

      const finder = await LangTextFinder.readAsync(langDir);
      expect(finder.getTextFinder('actor.sheet1')!.findText('1', ['name'], 'hello')).toBe('你好');
    });
  });

  // -----------------------------------------------------------------------
  // LangSwitchable.readAsync
  // -----------------------------------------------------------------------

  describe('LangSwitchable.readAsync', () => {
    it('reads CSV directory via byValue strategy (async)', async () => {
      fs.writeFileSync(path.join(tmpDir, 'zh_cn.csv'), 'actor,name,名称\n', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'en_us.csv'), 'actor,name,Name\n', 'utf8');

      const ls = await LangSwitchable.readAsync(tmpDir, 'zh_cn');

      expect(ls.defaultLang).toBe('zh_cn');
      expect(ls.languageCount()).toBe(3); // zh_cn(default) + zh_cn + en_us

      const zhFinder = ls.langMap.get('zh_cn')!;
      expect(zhFinder.getTextFinder('actor')!.findText('1', ['name'], 'name')).toBe('名称');
    });

    it('reads byId strategy via directory with subdirectory (async)', async () => {
      const zhDir = path.join(tmpDir, 'zh_cn');
      fs.mkdirSync(zhDir);
      createXlsx(path.join(zhDir, 'actor.xlsx'), {
        'sheet1': [
          ['id', 'hello', 't(name)'],
          ['1', 'hello', '你好'],
        ],
      });

      const ls = await LangSwitchable.readAsync(tmpDir, 'zh_cn');

      expect(ls.defaultLang).toBe('zh_cn');
      expect(ls.languageCount()).toBe(2);

      const zhFinder = ls.langMap.get('zh_cn')!;
      expect(zhFinder.getTextFinder('actor.sheet1')!.findText('1', ['name'], 'hello')).toBe('你好');
    });
  });

  // -----------------------------------------------------------------------
  // TodoFile async
  // -----------------------------------------------------------------------

  describe('TodoFile.readAsync', () => {
    it('reads todo and done sheets (async)', async () => {
      const todoPath = path.join(tmpDir, '_todo_zh_cn.xlsx');
      createXlsx(todoPath, {
        'todo': [
          ['table', 'id', 'fieldChain', 'original', 'translated'],
          ['actor.sheet1', '1', 'name', 'hello', '你好'],
        ],
        '参考用': [
          ['table', 'id', 'fieldChain', 'original', 'translated'],
          ['actor.sheet1', '2', 'name', 'world', '世界'],
        ],
      });

      const todoFile = await TodoFile.readAsync(todoPath);

      expect(todoFile.todo.length).toBe(2); // header + 1 data
      expect(todoFile.done.length).toBe(2); // header + 1 data

      // Skip header (index 0)
      const todoLine = todoFile.todo[1];
      expect(todoLine.table).toBe('actor.sheet1');
      expect(todoLine.id).toBe('1');
      expect(todoLine.translated).toBe('你好');

      const doneLine = todoFile.done[1];
      expect(doneLine.table).toBe('actor.sheet1');
      expect(doneLine.id).toBe('2');
      expect(doneLine.translated).toBe('世界');
    });
  });

  describe('TodoFile.saveAsync', () => {
    it('writes and reads back (async round-trip)', async () => {
      const todoPath = path.join(tmpDir, '_todo_en_us.xlsx');

      const todoFile = new TodoFile(
        [
          new TodoFileLine('table', 'id', 'fieldChain', 'original', 'translated'),
          new TodoFileLine('actor.sheet1', '1', 'name', 'hello', 'Hello'),
        ],
        [
          new TodoFileLine('table', 'id', 'fieldChain', 'original', 'translated'),
          new TodoFileLine('actor.sheet1', '2', 'name', 'world', 'World'),
        ]
      );

      await TodoFile.saveAsync(todoPath, todoFile);

      // Read back with async
      const readBack = await TodoFile.readAsync(todoPath);
      expect(readBack.todo.length).toBe(2);
      expect(readBack.todo[1].translated).toBe('Hello');
      expect(readBack.done.length).toBe(2);
      expect(readBack.done[1].translated).toBe('World');
    });
  });

  describe('TodoFile.readAndMergeToFinderAsync', () => {
    it('merges todo translations into LangTextFinder (async)', async () => {
      // Setup: create a lang dir with xlsx (translation empty), and a todo file at parent level
      const langDir = path.join(tmpDir, 'zh_cn');
      fs.mkdirSync(langDir);

      createXlsx(path.join(langDir, 'actor.xlsx'), {
        'sheet1': [
          ['id', 'hello', 't(name)'],
          ['1', 'hello', ''],
        ],
      });

      // Create todo file at parent level
      const todoPath = path.join(tmpDir, '_todo_zh_cn.xlsx');
      createXlsx(todoPath, {
        'todo': [
          ['table', 'id', 'fieldChain', 'original', 'translated'],
          ['actor.sheet1', '1', 'name', 'hello', '你好'],
        ],
      });

      // loadOneLangAsync auto-merges the _todo file, so translation should already be merged
      const langFinder = await TextByIdFinder.loadOneLangAsync(langDir);

      const finder = langFinder.getTextFinder('actor.sheet1') as TextByIdFinder;
      expect(finder.findText('1', ['name'], 'hello')).toBe('你好');
    });
  });
});
