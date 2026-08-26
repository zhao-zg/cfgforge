/**
 * VTableJsonStorage tests — T7.3
 *
 * Tests cover:
 * - resolveJsonDirRelativePath: nested vs fallback paths (ported from Java tests)
 * - addOrUpdateRecord: write JSON file to correct directory
 * - deleteRecord: remove JSON file
 * - validateId: reject path separators and ".."
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { VTableJsonStorage } from '../storages/VTableJsonStorage';
import { ValueToJson } from '@cfgforge/value';

const TEMP_DIR = path.join(__dirname, '..', '..', '..', '..', '.temp', 'write-vtablejsonstorage-tests');

function ensureTempDir(): void {
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Create a mock VStruct. ValueToJson.toJsonStr is mocked in beforeEach,
 * so the VStruct shape just needs to be a plain object.
 */
function mockVStruct(typeName: string, fieldNames: string[], fieldValues: any[]): any {
  return {
    _typeName: typeName,
    _fieldNames: fieldNames,
    _fieldValues: fieldValues,
  };
}

describe('VTableJsonStorage', () => {
  beforeEach(() => {
    ensureTempDir();
    // Mock ValueToJson.toJsonStr so we don't need real V* instances
    vi.spyOn(ValueToJson, 'toJsonStr').mockImplementation((record: any) => {
      const obj: Record<string, unknown> = { $type: record._typeName };
      for (let i = 0; i < record._fieldNames.length; i++) {
        obj[record._fieldNames[i]] = record._fieldValues[i];
      }
      return JSON.stringify(obj, null, 2);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // resolveJsonDirRelativePath — ported from Java VTableJsonStorageTest
  // -------------------------------------------------------------------------

  describe('resolveJsonDirRelativePath', () => {
    it('should use nested path when module dir exists', () => {
      // Given: 存在模块目录 buff
      fs.mkdirSync(path.join(TEMP_DIR, 'buff'));

      // When
      const result = VTableJsonStorage.resolveJsonDirRelativePath('buff.skill', TEMP_DIR);

      // Then: buff/_skill
      expect(result).toBe(path.join('buff', '_skill'));
    });

    it('should use nested path when module dir has Chinese suffix', () => {
      // Given: 模块目录名为 "skill_技能"（codeName = "skill"）
      fs.mkdirSync(path.join(TEMP_DIR, 'skill_技能'));

      // When
      const result = VTableJsonStorage.resolveJsonDirRelativePath('skill.buff', TEMP_DIR);

      // Then: "skill_技能/_buff"
      expect(result).toBe(path.join('skill_技能', '_buff'));
    });

    it('should fallback to root-level when module dir does not exist', () => {
      // Given: 没有模块目录

      // When
      const result = VTableJsonStorage.resolveJsonDirRelativePath('buff.skill', TEMP_DIR);

      // Then: 回退旧格式 _buff_skill
      expect(result).toBe('_buff_skill');
    });

    it('should handle deeply nested path', () => {
      // Given: 多层模块目录 a/b
      fs.mkdirSync(path.join(TEMP_DIR, 'a', 'b'), { recursive: true });

      // When
      const result = VTableJsonStorage.resolveJsonDirRelativePath('a.b.c', TEMP_DIR);

      // Then: a/b/_c
      expect(result).toBe(path.join('a', 'b', '_c'));
    });

    it('should fallback when partial module chain is missing', () => {
      // Given: 只有 a/ 目录，没有 a/b/
      fs.mkdirSync(path.join(TEMP_DIR, 'a'));

      // When
      const result = VTableJsonStorage.resolveJsonDirRelativePath('a.b.c', TEMP_DIR);

      // Then: 链不完整，回退 _a_b_c
      expect(result).toBe('_a_b_c');
    });

    it('should handle table without dot', () => {
      // Given: 表名没有点号

      // When
      const result = VTableJsonStorage.resolveJsonDirRelativePath('simpletable', TEMP_DIR);

      // Then: 回退 _simpletable
      expect(result).toBe('_simpletable');
    });

    it('should deeply nest with Chinese suffix dir', () => {
      // Given: a/b_数据/ 目录结构（codeName 分别为 a, b）
      fs.mkdirSync(path.join(TEMP_DIR, 'a', 'b_数据'), { recursive: true });

      // When
      const result = VTableJsonStorage.resolveJsonDirRelativePath('a.b.c', TEMP_DIR);

      // Then: a/b_数据/_c
      expect(result).toBe(path.join('a', 'b_数据', '_c'));
    });
  });

  // -------------------------------------------------------------------------
  // validateId
  // -------------------------------------------------------------------------

  describe('validateId', () => {
    it('accepts a normal id', () => {
      expect(() => VTableJsonStorage.validateId('myRecord001')).not.toThrow();
    });

    it('rejects id with forward slash', () => {
      expect(() => VTableJsonStorage.validateId('foo/bar')).toThrow();
    });

    it('rejects id with backslash', () => {
      expect(() => VTableJsonStorage.validateId('foo\\bar')).toThrow();
    });

    it('rejects id with ..', () => {
      expect(() => VTableJsonStorage.validateId('..')).toThrow();
    });

    it('rejects id containing .. within text', () => {
      expect(() => VTableJsonStorage.validateId('foo..bar')).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // addOrUpdateRecord
  // -------------------------------------------------------------------------

  describe('addOrUpdateRecord', () => {
    it('writes a JSON file to the resolved directory (flat fallback)', () => {
      const record = mockVStruct('Skill', ['name', 'level'], ['fireball', 5]);
      const dataDir = TEMP_DIR;

      const relPath = VTableJsonStorage.addOrUpdateRecord(
        record, 'skill', 'fireball', dataDir, null,
      );

      // Fallback: _skill/fireball.json
      expect(relPath).toBe(path.join('_skill', 'fireball.json'));

      const fullPath = path.join(dataDir, relPath);
      expect(fs.existsSync(fullPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      expect(content.$type).toBe('Skill');
      expect(content.name).toBe('fireball');
      expect(content.level).toBe(5);
    });

    it('writes a JSON file to nested path when module dir exists', () => {
      fs.mkdirSync(path.join(TEMP_DIR, 'buff'));
      const record = mockVStruct('BuffSkill', ['id', 'effect'], [1, 'stun']);
      const dataDir = TEMP_DIR;

      const relPath = VTableJsonStorage.addOrUpdateRecord(
        record, 'buff.skill', 'rec001', dataDir, null,
      );

      // Nested: buff/_skill/rec001.json
      expect(relPath).toBe(path.join('buff', '_skill', 'rec001.json'));

      const fullPath = path.join(dataDir, relPath);
      expect(fs.existsSync(fullPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      expect(content.$type).toBe('BuffSkill');
      expect(content.id).toBe(1);
      expect(content.effect).toBe('stun');
    });

    it('overwrites existing record file on update', () => {
      const record1 = mockVStruct('Item', ['name'], ['sword']);
      const record2 = mockVStruct('Item', ['name'], ['shield']);
      const dataDir = TEMP_DIR;

      // Write initial
      VTableJsonStorage.addOrUpdateRecord(record1, 'item', 'i001', dataDir, null);

      // Overwrite
      VTableJsonStorage.addOrUpdateRecord(record2, 'item', 'i001', dataDir, null);

      const fullPath = path.join(dataDir, '_item', 'i001.json');
      const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      expect(content.name).toBe('shield');
    });

    it('uses directoryStructure.getJsonTableDir when provided', () => {
      const record = mockVStruct('Effect', ['power'], [42]);
      const dataDir = TEMP_DIR;

      // Mock DirectoryStructure
      const dirStruct = {
        getJsonTableDir: (_table: string) => 'custom/path',
      } as any;

      const relPath = VTableJsonStorage.addOrUpdateRecord(
        record, 'effect', 'e001', dataDir, dirStruct,
      );

      expect(relPath).toBe(path.join('custom', 'path', 'e001.json'));
      const fullPath = path.join(dataDir, relPath);
      expect(fs.existsSync(fullPath)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // deleteRecord
  // -------------------------------------------------------------------------

  describe('deleteRecord', () => {
    it('deletes an existing JSON record file', () => {
      const record = mockVStruct('Pet', ['name'], ['cat']);
      const dataDir = TEMP_DIR;

      // Create file first
      const relPath = VTableJsonStorage.addOrUpdateRecord(
        record, 'pet', 'p001', dataDir, null,
      );
      const fullPath = path.join(dataDir, relPath);
      expect(fs.existsSync(fullPath)).toBe(true);

      // Delete
      const delRelPath = VTableJsonStorage.deleteRecord('pet', 'p001', dataDir, null);
      expect(delRelPath).toBe(relPath);
      expect(fs.existsSync(fullPath)).toBe(false);
    });

    it('throws when deleting non-existent record', () => {
      expect(() =>
        VTableJsonStorage.deleteRecord('missing', 'x001', TEMP_DIR, null),
      ).toThrow();
    });

    it('rejects invalid id in deleteRecord', () => {
      expect(() =>
        VTableJsonStorage.deleteRecord('table', '../escape', TEMP_DIR, null),
      ).toThrow();
    });
  });
});
