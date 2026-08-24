/**
 * DataUtil tests — TypeScript port of Java `configgen.data.DataUtil`.
 */

import { describe, it, expect } from 'vitest';
import {
  FileFmt,
  getFileFormat,
  isFileIgnored,
  getTableNameIndex,
  getJsonTableDirName,
  getTableNameIfTableDirForJson,
  getSubTableNameIfJsonSubDir,
  isTableDirForJson,
} from '../DataUtil';

describe('DataUtil', () => {
  describe('getFileFormat', () => {
    it('returns TXT_AS_TSV for .txt', () => {
      expect(getFileFormat('data/test.txt')).toBe(FileFmt.TXT_AS_TSV);
    });
    it('returns CSV for .csv', () => {
      expect(getFileFormat('data/test.csv')).toBe(FileFmt.CSV);
    });
    it('returns EXCEL for .xlsx', () => {
      expect(getFileFormat('data/test.xlsx')).toBe(FileFmt.EXCEL);
    });
    it('returns EXCEL for .xls', () => {
      expect(getFileFormat('data/test.xls')).toBe(FileFmt.EXCEL);
    });
    it('returns CFG for .cfg', () => {
      expect(getFileFormat('config.cfg')).toBe(FileFmt.CFG);
    });
    it('returns JSON for .json', () => {
      expect(getFileFormat('data/test.json')).toBe(FileFmt.JSON);
    });
    it('returns null for unknown extension', () => {
      expect(getFileFormat('data/test.xml')).toBeNull();
    });
    it('is case-insensitive', () => {
      expect(getFileFormat('data/TEST.XLSX')).toBe(FileFmt.EXCEL);
      expect(getFileFormat('data/TEST.CSV')).toBe(FileFmt.CSV);
    });
  });

  describe('isFileIgnored', () => {
    it('returns true for ~ prefixed files', () => {
      expect(isFileIgnored('~temp.xlsx')).toBe(true);
    });
    it('returns true for dot files', () => {
      expect(isFileIgnored('.gitkeep')).toBe(true);
    });
    it('returns false for normal files', () => {
      expect(isFileIgnored('test.xlsx')).toBe(false);
    });
  });

  describe('getTableNameIndex', () => {
    it('parses simple file path', () => {
      const result = getTableNameIndex('task');
      expect(result).not.toBeNull();
      expect(result!.tableName).toBe('task');
      expect(result!.index).toBe(0);
    });

    it('parses file path with _0 suffix', () => {
      const result = getTableNameIndex('task_0');
      expect(result).not.toBeNull();
      expect(result!.tableName).toBe('task');
      expect(result!.index).toBe(0);
    });

    it('parses file path with _3 suffix', () => {
      const result = getTableNameIndex('task_3');
      expect(result).not.toBeNull();
      expect(result!.tableName).toBe('task');
      expect(result!.index).toBe(3);
    });

    it('parses multi-segment path', () => {
      const result = getTableNameIndex('equip/weapon');
      expect(result).not.toBeNull();
      expect(result!.tableName).toBe('equip.weapon');
      expect(result!.index).toBe(0);
    });

    it('parses multi-segment path with index suffix', () => {
      const result = getTableNameIndex('equip/weapon_2');
      expect(result).not.toBeNull();
      expect(result!.tableName).toBe('equip.weapon');
      expect(result!.index).toBe(2);
    });

    it('returns null for invalid code name (starts with number)', () => {
      expect(getTableNameIndex('1abc')).toBeNull();
    });

    it('returns null for invalid code name (starts with underscore)', () => {
      expect(getTableNameIndex('_internal')).toBeNull();
    });

    it('returns null for Chinese file name', () => {
      expect(getTableNameIndex('中文名.xlsx')).toBeNull();
    });

    it('handles file path + sheet name', () => {
      // Excel: relativePath='ai_行为/ai行为.xlsx', sheetName='ai'
      const result = getTableNameIndex('ai_行为/ai行为.xlsx', 'ai');
      // parent of 'ai_行为/ai行为.xlsx' is 'ai_行为', joined with 'ai' => 'ai_行为/ai'
      // getCodeName('ai_行为') => 'ai' (strips Chinese), getCodeName('ai') => 'ai'
      // fullName = 'ai.ai', no _N suffix => tableName='ai.ai', index=0
      expect(result).not.toBeNull();
      expect(result!.tableName).toBe('ai.ai');
      expect(result!.index).toBe(0);
    });

    it('handles file path + sheet name with index', () => {
      // Java: filePath.getParent().resolve(sheetName) = 'data/task_1'
      // getCodeName('data')='data', getCodeName('task_1')='task_1'
      // fullName='data.task_1' → tableName='data.task', index=1
      const result = getTableNameIndex('data/task.xlsx', 'task_1');
      expect(result).not.toBeNull();
      expect(result!.tableName).toBe('data.task');
      expect(result!.index).toBe(1);
    });

    it('handles file path without parent + sheet name with index', () => {
      // Java: filePath.getParent()=null → path=Path.of('task_1')
      const result = getTableNameIndex('task.xlsx', 'task_1');
      expect(result).not.toBeNull();
      expect(result!.tableName).toBe('task');
      expect(result!.index).toBe(1);
    });
  });

  describe('JSON directory helpers', () => {
    it('getJsonTableDirName converts table name', () => {
      expect(getJsonTableDirName('task')).toBe('_task');
      expect(getJsonTableDirName('equip.weapon')).toBe('_equip_weapon');
    });

    it('isTableDirForJson identifies _ prefixed dirs', () => {
      expect(isTableDirForJson('_task')).toBe(true);
      expect(isTableDirForJson('_equip_weapon')).toBe(true);
      expect(isTableDirForJson('task')).toBe(false);
      expect(isTableDirForJson('_')).toBe(false);
      expect(isTableDirForJson('_1abc')).toBe(false); // starts with number after _
      expect(isTableDirForJson('_中文')).toBe(false); // Chinese after _
    });

    it('getTableNameIfTableDirForJson converts dir name', () => {
      expect(getTableNameIfTableDirForJson('_task')).toBe('task');
      expect(getTableNameIfTableDirForJson('_equip_weapon')).toBe('equip.weapon');
      expect(getTableNameIfTableDirForJson('task')).toBeNull();
    });

    it('getSubTableNameIfJsonSubDir extracts sub name', () => {
      expect(getSubTableNameIfJsonSubDir('_instancelogic')).toBe('instancelogic');
      expect(getSubTableNameIfJsonSubDir('_buff')).toBe('buff');
      expect(getSubTableNameIfJsonSubDir('buff')).toBeNull();
    });
  });
});
