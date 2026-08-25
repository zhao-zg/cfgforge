/**
 * TextByIdFinder tests — T5.3
 *
 * Tests:
 * - OneText: constructor, null validation
 * - OneRecord: constructor
 * - findText: finds translation by pk + fieldChain
 * - findText: returns null for unknown fieldChain
 * - findText: returns null for unknown pk
 * - findText: returns null when original text doesn't match
 * - findText: normalizes \r\n in original
 * - foreachText: visits all (original, translated) pairs, skipping nulls
 * - getTableName: with and without dot in sheetName
 * - getTodoFileName: builds _todo_[lang].xlsx
 * - loadOneSheet: parses header with t(field) columns
 * - loadOneSheet: handles description column
 * - loadOneSheet: handles empty sheet (<=1 row)
 * - loadOneSheet: handles no t() columns
 * - loadOneFile: reads xlsx file with multiple sheets
 * - loadOneLang: reads directory of xlsx files
 * - loadMultiLang: reads directory of language directories
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as XLSX from 'xlsx';
import { TextByIdFinder, OneText, OneRecord } from '../TextByIdFinder';
import type { TextVisitor } from '../LangTextFinder';

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

describe('TextByIdFinder', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-byid-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // Data classes
  // -----------------------------------------------------------------------

  describe('OneText', () => {
    it('stores original and translated', () => {
      const ot = new OneText('hello', '你好');
      expect(ot.original).toBe('hello');
      expect(ot.translated).toBe('你好');
    });

    it('throws on null original', () => {
      expect(() => new OneText(null as any, '你好')).toThrow();
    });

    it('throws on null translated', () => {
      expect(() => new OneText('hello', null as any)).toThrow();
    });
  });

  describe('OneRecord', () => {
    it('stores description and texts', () => {
      const texts = [new OneText('a', 'A'), null, new OneText('b', 'B')];
      const rec = new OneRecord('desc', texts);
      expect(rec.description).toBe('desc');
      expect(rec.texts.length).toBe(3);
      expect(rec.texts[1]).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // findText
  // -----------------------------------------------------------------------

  describe('findText', () => {
    it('finds translation by pk + fieldChain', () => {
      const finder = new TextByIdFinder();
      finder.getFieldChainToIndex().set('name', 0);
      finder.getPkToTexts().set('1', new OneRecord(null, [new OneText('hello', '你好')]));

      expect(finder.findText('1', ['name'], 'hello')).toBe('你好');
    });

    it('returns null for unknown fieldChain', () => {
      const finder = new TextByIdFinder();
      finder.getFieldChainToIndex().set('name', 0);
      finder.getPkToTexts().set('1', new OneRecord(null, [new OneText('hello', '你好')]));

      expect(finder.findText('1', ['unknown'], 'hello')).toBeNull();
    });

    it('returns null for unknown pk', () => {
      const finder = new TextByIdFinder();
      finder.getFieldChainToIndex().set('name', 0);
      finder.getPkToTexts().set('1', new OneRecord(null, [new OneText('hello', '你好')]));

      expect(finder.findText('999', ['name'], 'hello')).toBeNull();
    });

    it('returns null when original text does not match', () => {
      const finder = new TextByIdFinder();
      finder.getFieldChainToIndex().set('name', 0);
      finder.getPkToTexts().set('1', new OneRecord(null, [new OneText('hello', '你好')]));

      expect(finder.findText('1', ['name'], 'world')).toBeNull();
    });

    it('normalizes \\r\\n in original before matching', () => {
      const finder = new TextByIdFinder();
      finder.getFieldChainToIndex().set('desc', 0);
      // stored normalized (with \n)
      finder.getPkToTexts().set('1', new OneRecord(null, [new OneText('line1\nline2', '翻译')]));

      // lookup with \r\n should match
      expect(finder.findText('1', ['desc'], 'line1\r\nline2')).toBe('翻译');
    });

    it('handles multiple field chains', () => {
      const finder = new TextByIdFinder();
      finder.getFieldChainToIndex().set('name', 0);
      finder.getFieldChainToIndex().set('desc', 1);
      finder.getPkToTexts().set('1', new OneRecord(null, [
        new OneText('hello', '你好'),
        new OneText('world', '世界'),
      ]));

      expect(finder.findText('1', ['name'], 'hello')).toBe('你好');
      expect(finder.findText('1', ['desc'], 'world')).toBe('世界');
    });

    it('handles multi-element fieldChain', () => {
      const finder = new TextByIdFinder();
      // fieldChain ["person","name"] → "person-name"
      finder.getFieldChainToIndex().set('person-name', 0);
      finder.getPkToTexts().set('1', new OneRecord(null, [new OneText('hello', '你好')]));

      expect(finder.findText('1', ['person', 'name'], 'hello')).toBe('你好');
    });
  });

  // -----------------------------------------------------------------------
  // foreachText
  // -----------------------------------------------------------------------

  describe('foreachText', () => {
    it('visits all non-null (original, translated) pairs', () => {
      const finder = new TextByIdFinder();
      finder.getFieldChainToIndex().set('name', 0);
      finder.getFieldChainToIndex().set('desc', 1);
      finder.getPkToTexts().set('1', new OneRecord(null, [
        new OneText('hello', '你好'),
        null,
        new OneText('world', '世界'),
      ]));
      finder.getPkToTexts().set('2', new OneRecord(null, [
        new OneText('foo', 'bar'),
      ]));

      const visited: Array<[string, string]> = [];
      const visitor: TextVisitor = {
        visit(original: string, translated: string) {
          visited.push([original, translated]);
        },
      };

      finder.foreachText(visitor);

      expect(visited.length).toBe(3); // skips null
      expect(visited).toContainEqual(['hello', '你好']);
      expect(visited).toContainEqual(['world', '世界']);
      expect(visited).toContainEqual(['foo', 'bar']);
    });
  });

  // -----------------------------------------------------------------------
  // Static utility methods
  // -----------------------------------------------------------------------

  describe('getTableName', () => {
    it('returns sheetName directly if it contains dot', () => {
      expect(TextByIdFinder.getTableName('module', 'sub.table')).toBe('sub.table');
    });

    it('prefixes with moduleName if no dot', () => {
      expect(TextByIdFinder.getTableName('actor', 'sheet1')).toBe('actor.sheet1');
    });
  });

  describe('getTodoFileName', () => {
    it('builds _todo_[lang].xlsx', () => {
      expect(TextByIdFinder.getTodoFileName('zh_cn')).toBe('_todo_zh_cn.xlsx');
      expect(TextByIdFinder.getTodoFileName('en_us')).toBe('_todo_en_us.xlsx');
    });
  });

  // -----------------------------------------------------------------------
  // loadOneSheet
  // -----------------------------------------------------------------------

  describe('loadOneSheet', () => {
    it('parses header with t(field) columns and data rows', () => {
      const rawRows: any[][] = [
        // Header: pk | orig1 | t(name) | orig2 | t(desc)
        ['id', 'hello', 't(name)', 'world', 't(desc)'],
        // Data row
        ['1', 'hello', '你好', 'world', '世界'],
      ];

      const finder = TextByIdFinder.loadOneSheet(rawRows);

      expect(finder.getFieldChainToIndex().size).toBe(2);
      expect(finder.getFieldChainToIndex().get('name')).toBe(0);
      expect(finder.getFieldChainToIndex().get('desc')).toBe(1);

      const record = finder.getPkToTexts().get('1');
      expect(record).toBeDefined();
      expect(record!.texts.length).toBe(2);
      expect(record!.texts[0]!.original).toBe('hello');
      expect(record!.texts[0]!.translated).toBe('你好');
      expect(record!.texts[1]!.original).toBe('world');
      expect(record!.texts[1]!.translated).toBe('世界');

      // Verify findText works
      expect(finder.findText('1', ['name'], 'hello')).toBe('你好');
      expect(finder.findText('1', ['desc'], 'world')).toBe('世界');
    });

    it('handles description column', () => {
      // Header: pk | desc | orig1 | t(name)
      const rawRows: any[][] = [
        ['id', 'description', 'hello', 't(name)'],
        ['1', 'desc1', 'hello', '你好'],
      ];

      const finder = TextByIdFinder.loadOneSheet(rawRows);

      // t(name) is at column 3, so tColumns[0] = 3, which is > 2 → hasDescription
      expect(finder.getNullableDescriptionName()).toBe('description');

      const record = finder.getPkToTexts().get('1');
      expect(record!.description).toBe('desc1');
    });

    it('returns empty finder for sheet with <=1 row', () => {
      const rawRows: any[][] = [['id', 'hello', 't(name)']];
      const finder = TextByIdFinder.loadOneSheet(rawRows);
      expect(finder.getPkToTexts().size).toBe(0);
    });

    it('returns empty finder when no t() columns', () => {
      const rawRows: any[][] = [
        ['id', 'hello', 'name', 'world'],
        ['1', 'hello', '你好', 'world'],
      ];
      const finder = TextByIdFinder.loadOneSheet(rawRows);
      expect(finder.getFieldChainToIndex().size).toBe(0);
      expect(finder.getPkToTexts().size).toBe(0);
    });

    it('handles null texts (both original and translated empty)', () => {
      const rawRows: any[][] = [
        ['id', 'hello', 't(name)'],
        ['1', null, null],
      ];

      const finder = TextByIdFinder.loadOneSheet(rawRows);
      const record = finder.getPkToTexts().get('1');
      expect(record!.texts[0]).toBeNull();
    });

    it('skips rows with null pk', () => {
      const rawRows: any[][] = [
        ['id', 'hello', 't(name)'],
        [null, 'hello', '你好'],
        ['2', 'hello', '你好'],
      ];

      const finder = TextByIdFinder.loadOneSheet(rawRows);
      expect(finder.getPkToTexts().size).toBe(1);
      expect(finder.getPkToTexts().has('2')).toBe(true);
    });

    it('handles multi-element fieldChain in t() header', () => {
      // t(person-name) → fieldChainStr = "person-name"
      const rawRows: any[][] = [
        ['id', 'hello', 't(person-name)'],
        ['1', 'hello', '你好'],
      ];

      const finder = TextByIdFinder.loadOneSheet(rawRows);
      expect(finder.getFieldChainToIndex().get('person-name')).toBe(0);
      // findText with ["person", "name"] → fieldChainStr = "person-name"
      expect(finder.findText('1', ['person', 'name'], 'hello')).toBe('你好');
    });
  });

  // -----------------------------------------------------------------------
  // loadOneFile
  // -----------------------------------------------------------------------

  describe('loadOneFile', () => {
    it('reads xlsx file with multiple sheets', () => {
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

      const map = TextByIdFinder.loadOneFile(xlsxPath);

      // Table names: actor.sheet1, actor.sheet2
      expect(map.size).toBe(2);
      expect(map.has('actor.sheet1')).toBe(true);
      expect(map.has('actor.sheet2')).toBe(true);

      const finder1 = map.get('actor.sheet1')!;
      expect(finder1.findText('1', ['name'], 'hello')).toBe('你好');

      const finder2 = map.get('actor.sheet2')!;
      expect(finder2.findText('1', ['desc'], 'world')).toBe('世界');
    });

    it('throws for non-xlsx file', () => {
      const txtPath = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(txtPath, 'not xlsx', 'utf8');
      expect(() => TextByIdFinder.loadOneFile(txtPath)).toThrow('not .xlsx');
    });

    it('skips sheets with <=1 row', () => {
      const xlsxPath = path.join(tmpDir, 'actor.xlsx');
      createXlsx(xlsxPath, {
        'empty': [['id', 'hello', 't(name)']],  // header only
        'good': [
          ['id', 'hello', 't(name)'],
          ['1', 'hello', '你好'],
        ],
      });

      const map = TextByIdFinder.loadOneFile(xlsxPath);
      expect(map.size).toBe(1);
      expect(map.has('actor.good')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // loadOneLang
  // -----------------------------------------------------------------------

  describe('loadOneLang', () => {
    it('reads directory of xlsx files', () => {
      // Language dir: tmpDir/zh_cn/
      const langDir = path.join(tmpDir, 'zh_cn');
      fs.mkdirSync(langDir);

      const xlsx1 = path.join(langDir, 'actor.xlsx');
      createXlsx(xlsx1, {
        'sheet1': [
          ['id', 'hello', 't(name)'],
          ['1', 'hello', '你好'],
        ],
      });

      const xlsx2 = path.join(langDir, 'item.xlsx');
      createXlsx(xlsx2, {
        'sheet1': [
          ['id', 'sword', 't(name)'],
          ['1', 'sword', '剑'],
        ],
      });

      const langFinder = TextByIdFinder.loadOneLang(langDir);

      // Tables: actor.sheet1, item.sheet1
      const actorFinder = langFinder.getTextFinder('actor.sheet1');
      expect(actorFinder).not.toBeNull();
      expect(actorFinder!.findText('1', ['name'], 'hello')).toBe('你好');

      const itemFinder = langFinder.getTextFinder('item.sheet1');
      expect(itemFinder).not.toBeNull();
      expect(itemFinder!.findText('1', ['name'], 'sword')).toBe('剑');
    });

    it('skips _todo_*.xlsx files', () => {
      const langDir = path.join(tmpDir, 'en_us');
      fs.mkdirSync(langDir);

      // Regular xlsx
      const xlsx1 = path.join(langDir, 'actor.xlsx');
      createXlsx(xlsx1, {
        'sheet1': [
          ['id', 'hello', 't(name)'],
          ['1', 'hello', 'Hello'],
        ],
      });

      // Todo file (at parent level, but we also put one inside langDir)
      const todoPath = path.join(langDir, '_todo_en_us.xlsx');
      createXlsx(todoPath, {
        'todo': [
          ['table', 'id', 'fieldChain', 'original', 'translated'],
          ['actor.sheet1', '1', 'name', 'hello', 'Hello!'],
        ],
      });

      // loadOneLang should skip the _todo_ file inside langDir
      const langFinder = TextByIdFinder.loadOneLang(langDir);
      // Should have actor.sheet1 but NOT process the todo file inside langDir
      expect(langFinder.getTextFinder('actor.sheet1')).not.toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // loadMultiLang
  // -----------------------------------------------------------------------

  describe('loadMultiLang', () => {
    it('reads directory of language directories', () => {
      // Two language dirs
      const zhDir = path.join(tmpDir, 'zh_cn');
      fs.mkdirSync(zhDir);
      const zhXlsx = path.join(zhDir, 'actor.xlsx');
      createXlsx(zhXlsx, {
        'sheet1': [
          ['id', 'hello', 't(name)'],
          ['1', 'hello', '你好'],
        ],
      });

      const enDir = path.join(tmpDir, 'en_us');
      fs.mkdirSync(enDir);
      const enXlsx = path.join(enDir, 'actor.xlsx');
      createXlsx(enXlsx, {
        'sheet1': [
          ['id', 'hello', 't(name)'],
          ['1', 'hello', 'Hello'],
        ],
      });

      const langMap = TextByIdFinder.loadMultiLang(tmpDir);

      expect(langMap.size).toBe(2);
      expect(langMap.has('zh_cn')).toBe(true);
      expect(langMap.has('en_us')).toBe(true);

      const zhFinder = langMap.get('zh_cn')!;
      expect(zhFinder.getTextFinder('actor.sheet1')!.findText('1', ['name'], 'hello')).toBe('你好');

      const enFinder = langMap.get('en_us')!;
      expect(enFinder.getTextFinder('actor.sheet1')!.findText('1', ['name'], 'hello')).toBe('Hello');
    });
  });
});
