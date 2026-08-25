/**
 * ContextCfg tests — T6.1
 *
 * Tests:
 * - of(): creates default config with standard settings
 * - constructor: stores all fields correctly
 * - constructor: throws on null dataDir
 * - constructor: throws on null headRow
 * - constructor: throws on null encoding
 * - custom config with all fields set
 */

import { describe, it, expect } from 'vitest';
import { ContextCfg } from '../ContextCfg';
import { HeadRows } from '@cfggen/data';
import { ExplicitDir } from '../ExplicitDir';

describe('ContextCfg', () => {
  describe('of', () => {
    it('creates default config with standard settings', () => {
      const cfg = ContextCfg.of('/path/to/data');

      expect(cfg.dataDir).toBe('/path/to/data');
      expect(cfg.explicitDir).toBeNull();
      expect(cfg.headRow).toBe(HeadRows.A2_Default);
      expect(cfg.csvOrTsvDefaultEncoding).toBe('UTF-8');
      expect(cfg.i18nFilename).toBeNull();
      expect(cfg.langSwitchDir).toBeNull();
      expect(cfg.langSwitchDefaultLang).toBeNull();
      expect(cfg.allowValueErr).toBe(false);
    });
  });

  describe('constructor', () => {
    it('stores all fields correctly', () => {
      const explicitDir = new ExplicitDir(new Map(), new Set(), new Set());
      const cfg = new ContextCfg(
        '/data',
        explicitDir,
        HeadRows.A3,
        'GBK',
        'zh_cn.csv',
        '/langs',
        'zh_cn',
        true,
      );

      expect(cfg.dataDir).toBe('/data');
      expect(cfg.explicitDir).toBe(explicitDir);
      expect(cfg.headRow).toBe(HeadRows.A3);
      expect(cfg.csvOrTsvDefaultEncoding).toBe('GBK');
      expect(cfg.i18nFilename).toBe('zh_cn.csv');
      expect(cfg.langSwitchDir).toBe('/langs');
      expect(cfg.langSwitchDefaultLang).toBe('zh_cn');
      expect(cfg.allowValueErr).toBe(true);
    });

    it('throws on null dataDir', () => {
      expect(() => new ContextCfg(
        null as any,
        null,
        HeadRows.A2_Default,
        'UTF-8',
        null, null, null, false,
      )).toThrow();
    });

    it('throws on null headRow', () => {
      expect(() => new ContextCfg(
        '/data',
        null,
        null as any,
        'UTF-8',
        null, null, null, false,
      )).toThrow();
    });

    it('throws on null encoding', () => {
      expect(() => new ContextCfg(
        '/data',
        null,
        HeadRows.A2_Default,
        null as any,
        null, null, null, false,
      )).toThrow();
    });

    it('allows null explicitDir', () => {
      const cfg = new ContextCfg(
        '/data',
        null,
        HeadRows.A2_Default,
        'UTF-8',
        null, null, null, false,
      );
      expect(cfg.explicitDir).toBeNull();
    });

    it('allows null i18n fields', () => {
      const cfg = new ContextCfg(
        '/data',
        null,
        HeadRows.A2_Default,
        'UTF-8',
        null, null, null, false,
      );
      expect(cfg.i18nFilename).toBeNull();
      expect(cfg.langSwitchDir).toBeNull();
      expect(cfg.langSwitchDefaultLang).toBeNull();
    });
  });
});

/**
 * ExplicitDir tests — T6.1
 *
 * Tests:
 * - constructor: stores fields
 * - constructor: throws on null fields
 * - parse: returns null when all args empty/null
 * - parse: parses asRoot into map
 * - parse: parses excelDirs into set
 * - parse: parses jsonDirs into set
 * - parse: returns ExplicitDir when any arg has data
 */
describe('ExplicitDir', () => {
  describe('constructor', () => {
    it('stores all fields', () => {
      const tagMap = new Map([['ClientTables', 'noserver']]);
      const excels = new Set(['excels1', 'excels2']);
      const jsons = new Set(['jsons1']);

      const ed = new ExplicitDir(tagMap, excels, jsons);
      expect(ed.txtAsTsvFileInThisDirAsInRoot_To_AddTag_Map).toBe(tagMap);
      expect(ed.excelFileDirs).toBe(excels);
      expect(ed.jsonFileDirs).toBe(jsons);
    });

    it('throws on null tagMap', () => {
      expect(() => new ExplicitDir(null as any, new Set(), new Set())).toThrow();
    });

    it('throws on null excelFileDirs', () => {
      expect(() => new ExplicitDir(new Map(), null as any, new Set())).toThrow();
    });

    it('throws on null jsonFileDirs', () => {
      expect(() => new ExplicitDir(new Map(), new Set(), null as any)).toThrow();
    });

    it('allows empty collections', () => {
      const ed = new ExplicitDir(new Map(), new Set(), new Set());
      expect(ed.txtAsTsvFileInThisDirAsInRoot_To_AddTag_Map.size).toBe(0);
      expect(ed.excelFileDirs.size).toBe(0);
      expect(ed.jsonFileDirs.size).toBe(0);
    });
  });

  describe('parse', () => {
    it('returns null when all args are null', () => {
      expect(ExplicitDir.parse(null, null, null)).toBeNull();
    });

    it('returns null when all args are empty strings', () => {
      expect(ExplicitDir.parse('', '', '')).toBeNull();
    });

    it('parses asRoot into tag map', () => {
      const ed = ExplicitDir.parse('ClientTables:noserver,PublicTables', null, null);
      expect(ed).not.toBeNull();
      expect(ed!.txtAsTsvFileInThisDirAsInRoot_To_AddTag_Map.size).toBe(2);
      expect(ed!.txtAsTsvFileInThisDirAsInRoot_To_AddTag_Map.get('clienttables')).toBe('noserver');
      // "publictables" has null value (no tag specified)
      expect(ed!.txtAsTsvFileInThisDirAsInRoot_To_AddTag_Map.get('publictables')).toBeNull();
    });

    it('parses excelDirs into set', () => {
      const ed = ExplicitDir.parse(null, 'dir1,dir2,dir3', null);
      expect(ed).not.toBeNull();
      expect(ed!.excelFileDirs.size).toBe(3);
      expect(ed!.excelFileDirs.has('dir1')).toBe(true);
      expect(ed!.excelFileDirs.has('dir2')).toBe(true);
      expect(ed!.excelFileDirs.has('dir3')).toBe(true);
    });

    it('parses jsonDirs into set', () => {
      const ed = ExplicitDir.parse(null, null, 'json1,json2');
      expect(ed).not.toBeNull();
      expect(ed!.jsonFileDirs.size).toBe(2);
      expect(ed!.jsonFileDirs.has('json1')).toBe(true);
      expect(ed!.jsonFileDirs.has('json2')).toBe(true);
    });

    it('returns ExplicitDir when only one arg has data', () => {
      const ed = ExplicitDir.parse(null, 'onlyExcel', null);
      expect(ed).not.toBeNull();
      expect(ed!.excelFileDirs.size).toBe(1);
      expect(ed!.txtAsTsvFileInThisDirAsInRoot_To_AddTag_Map.size).toBe(0);
      expect(ed!.jsonFileDirs.size).toBe(0);
    });
  });
});
