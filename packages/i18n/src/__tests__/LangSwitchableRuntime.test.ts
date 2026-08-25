/**
 * LangSwitchableRuntime tests — T5.2
 *
 * Tests:
 * - constructor: initializes arrays based on languageCount
 * - enterTable: pre-loads TextFinder refs for each language
 * - findAllLangText: returns [original, ...translations]
 * - findAllLangText: empty original → array of empty strings
 * - findAllLangText: no finder for table → falls back to original
 * - findAllLangText: finder returns null → falls back to original
 */

import { describe, it, expect } from 'vitest';
import { LangSwitchable } from '../LangSwitchable';
import { LangSwitchableRuntime } from '../LangSwitchableRuntime';
import { LangTextFinder, type TextFinder } from '../LangTextFinder';

describe('LangSwitchableRuntime', () => {
  describe('constructor', () => {
    it('initializes with correct language count', () => {
      const langMap = new Map<string, LangTextFinder>();
      langMap.set('en_us', new LangTextFinder());
      const ls = new LangSwitchable(langMap, 'zh_cn');
      const runtime = new LangSwitchableRuntime(ls);

      // languageCount = 2 (default + en_us)
      // findAllLangText with empty original should return 2 empty strings
      const result = runtime.findAllLangText('1', ['name'], '');
      expect(result.length).toBe(2);
      expect(result[0]).toBe('');
      expect(result[1]).toBe('');
    });
  });

  describe('enterTable + findAllLangText', () => {
    it('returns [original, ...translations] for all languages', () => {
      // Set up a LangSwitchable with one translation language
      const mockFinder: TextFinder = {
        findText: (_pk: string, _fc: string[], original: string) => {
          if (original === 'hello') return '你好';
          return null;
        },
        foreachText: () => {},
      };

      const langFinder = new LangTextFinder();
      langFinder.setTextFinder('actor', mockFinder);

      const langMap = new Map<string, LangTextFinder>();
      langMap.set('zh_cn', langFinder);
      const ls = new LangSwitchable(langMap, 'en_us');

      const runtime = new LangSwitchableRuntime(ls);
      runtime.enterTable('actor');

      const result = runtime.findAllLangText('1', ['name'], 'hello');
      expect(result.length).toBe(2);
      expect(result[0]).toBe('hello');  // default language = original
      expect(result[1]).toBe('你好');   // zh_cn translation
    });

    it('returns empty array values for empty original', () => {
      const mockFinder: TextFinder = {
        findText: () => 'should not be called',
        foreachText: () => {},
      };

      const langFinder = new LangTextFinder();
      langFinder.setTextFinder('actor', mockFinder);

      const langMap = new Map<string, LangTextFinder>();
      langMap.set('zh_cn', langFinder);
      const ls = new LangSwitchable(langMap, 'en_us');

      const runtime = new LangSwitchableRuntime(ls);
      runtime.enterTable('actor');

      const result = runtime.findAllLangText('1', ['name'], '');
      expect(result.length).toBe(2);
      expect(result[0]).toBe('');
      expect(result[1]).toBe('');
    });

    it('falls back to original when finder is null (table not found)', () => {
      const langMap = new Map<string, LangTextFinder>();
      langMap.set('zh_cn', new LangTextFinder()); // empty, no TextFinder for 'actor'
      const ls = new LangSwitchable(langMap, 'en_us');

      const runtime = new LangSwitchableRuntime(ls);
      runtime.enterTable('actor'); // no finder in zh_cn for 'actor'

      const result = runtime.findAllLangText('1', ['name'], 'hello');
      expect(result[0]).toBe('hello');
      expect(result[1]).toBe('hello'); // fallback to original
    });

    it('falls back to original when finder returns null', () => {
      const mockFinder: TextFinder = {
        findText: () => null, // always returns null
        foreachText: () => {},
      };

      const langFinder = new LangTextFinder();
      langFinder.setTextFinder('actor', mockFinder);

      const langMap = new Map<string, LangTextFinder>();
      langMap.set('zh_cn', langFinder);
      const ls = new LangSwitchable(langMap, 'en_us');

      const runtime = new LangSwitchableRuntime(ls);
      runtime.enterTable('actor');

      const result = runtime.findAllLangText('1', ['name'], 'unknown');
      expect(result[0]).toBe('unknown');
      expect(result[1]).toBe('unknown'); // fallback to original
    });

    it('handles multiple languages', () => {
      // Two languages: zh_cn and ja_jp
      const zhFinder = new LangTextFinder();
      zhFinder.setTextFinder('actor', {
        findText: () => '你好',
        foreachText: () => {},
      });

      const jaFinder = new LangTextFinder();
      jaFinder.setTextFinder('actor', {
        findText: () => 'こんにちは',
        foreachText: () => {},
      });

      const langMap = new Map<string, LangTextFinder>();
      langMap.set('zh_cn', zhFinder);
      langMap.set('ja_jp', jaFinder);
      const ls = new LangSwitchable(langMap, 'en_us');

      const runtime = new LangSwitchableRuntime(ls);
      runtime.enterTable('actor');

      const result = runtime.findAllLangText('1', ['name'], 'hello');
      expect(result.length).toBe(3);
      expect(result[0]).toBe('hello');
      expect(result[1]).toBe('你好');
      expect(result[2]).toBe('こんにちは');
    });
  });
});
