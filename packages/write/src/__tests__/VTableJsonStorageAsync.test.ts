/**
 * VTableJsonStorage async tests — addOrUpdateRecordAsync/deleteRecordAsync/
 * resolveJsonDirRelativePathAsync (T12.0d)
 *
 * Tests cover:
 * - resolveJsonDirRelativePathAsync: nested vs fallback paths
 * - addOrUpdateRecordAsync: async write JSON file to correct directory
 * - deleteRecordAsync: async remove JSON file
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { VTableJsonStorage } from '../storages/VTableJsonStorage';
import { ValueToJson } from '@cfggen/value';
import { setDefaultFileSystem, NodeFileSystem } from '@cfggen/shared';

const TEMP_DIR = path.join(__dirname, '..', '..', '..', '..', '.temp', 'write-vtablejsonstorage-async-tests');

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

describe('VTableJsonStorage async', () => {
  beforeEach(() => {
    ensureTempDir();
    setDefaultFileSystem(new NodeFileSystem());
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
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  });

  // -----------------------------------------------------------------------
  // resolveJsonDirRelativePathAsync
  // -----------------------------------------------------------------------

  describe('resolveJsonDirRelativePathAsync', () => {
    it('should use nested path when module dir exists', async () => {
      fs.mkdirSync(path.join(TEMP_DIR, 'buff'));

      const result = await VTableJsonStorage.resolveJsonDirRelativePathAsync('buff.skill', TEMP_DIR);

      expect(result).toBe(path.join('buff', '_skill'));
    });

    it('should use nested path when module dir has Chinese suffix', async () => {
      fs.mkdirSync(path.join(TEMP_DIR, 'skill_技能'));

      const result = await VTableJsonStorage.resolveJsonDirRelativePathAsync('skill.buff', TEMP_DIR);

      expect(result).toBe(path.join('skill_技能', '_buff'));
    });

    it('should fallback to root-level when module dir does not exist', async () => {
      const result = await VTableJsonStorage.resolveJsonDirRelativePathAsync('buff.skill', TEMP_DIR);

      expect(result).toBe('_buff_skill');
    });

    it('should handle deeply nested path', async () => {
      fs.mkdirSync(path.join(TEMP_DIR, 'a', 'b'), { recursive: true });

      const result = await VTableJsonStorage.resolveJsonDirRelativePathAsync('a.b.c', TEMP_DIR);

      expect(result).toBe(path.join('a', 'b', '_c'));
    });

    it('should fallback when partial module chain is missing', async () => {
      fs.mkdirSync(path.join(TEMP_DIR, 'a'));

      const result = await VTableJsonStorage.resolveJsonDirRelativePathAsync('a.b.c', TEMP_DIR);

      expect(result).toBe('_a_b_c');
    });

    it('should handle table without dot', async () => {
      const result = await VTableJsonStorage.resolveJsonDirRelativePathAsync('simpletable', TEMP_DIR);

      expect(result).toBe('_simpletable');
    });

    it('should deeply nest with Chinese suffix dir', async () => {
      fs.mkdirSync(path.join(TEMP_DIR, 'a', 'b_数据'), { recursive: true });

      const result = await VTableJsonStorage.resolveJsonDirRelativePathAsync('a.b.c', TEMP_DIR);

      expect(result).toBe(path.join('a', 'b_数据', '_c'));
    });
  });

  // -----------------------------------------------------------------------
  // addOrUpdateRecordAsync
  // -----------------------------------------------------------------------

  describe('addOrUpdateRecordAsync', () => {
    it('writes a JSON file to the resolved directory (flat fallback)', async () => {
      const record = mockVStruct('Skill', ['name', 'level'], ['fireball', 5]);
      const dataDir = TEMP_DIR;

      const relPath = await VTableJsonStorage.addOrUpdateRecordAsync(
        record, 'skill', 'fireball', dataDir, null,
      );

      expect(relPath).toBe(path.join('_skill', 'fireball.json'));

      const fullPath = path.join(dataDir, relPath);
      expect(fs.existsSync(fullPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      expect(content.$type).toBe('Skill');
      expect(content.name).toBe('fireball');
      expect(content.level).toBe(5);
    });

    it('writes a JSON file to nested path when module dir exists', async () => {
      fs.mkdirSync(path.join(TEMP_DIR, 'buff'));
      const record = mockVStruct('BuffSkill', ['id', 'effect'], [1, 'stun']);
      const dataDir = TEMP_DIR;

      const relPath = await VTableJsonStorage.addOrUpdateRecordAsync(
        record, 'buff.skill', 'rec001', dataDir, null,
      );

      expect(relPath).toBe(path.join('buff', '_skill', 'rec001.json'));

      const fullPath = path.join(dataDir, relPath);
      expect(fs.existsSync(fullPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      expect(content.$type).toBe('BuffSkill');
      expect(content.id).toBe(1);
      expect(content.effect).toBe('stun');
    });

    it('overwrites existing record file on update', async () => {
      const record1 = mockVStruct('Item', ['name'], ['sword']);
      const record2 = mockVStruct('Item', ['name'], ['shield']);
      const dataDir = TEMP_DIR;

      await VTableJsonStorage.addOrUpdateRecordAsync(record1, 'item', 'i001', dataDir, null);
      await VTableJsonStorage.addOrUpdateRecordAsync(record2, 'item', 'i001', dataDir, null);

      const fullPath = path.join(dataDir, '_item', 'i001.json');
      const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      expect(content.name).toBe('shield');
    });

    it('uses directoryStructure.getJsonTableDir when provided', async () => {
      const record = mockVStruct('Effect', ['power'], [42]);
      const dataDir = TEMP_DIR;

      const dirStruct = {
        getJsonTableDir: (_table: string) => 'custom/path',
      } as any;

      const relPath = await VTableJsonStorage.addOrUpdateRecordAsync(
        record, 'effect', 'e001', dataDir, dirStruct,
      );

      expect(relPath).toBe(path.join('custom', 'path', 'e001.json'));
      const fullPath = path.join(dataDir, relPath);
      expect(fs.existsSync(fullPath)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // deleteRecordAsync
  // -----------------------------------------------------------------------

  describe('deleteRecordAsync', () => {
    it('deletes an existing JSON record file', async () => {
      const record = mockVStruct('Pet', ['name'], ['cat']);
      const dataDir = TEMP_DIR;

      const relPath = await VTableJsonStorage.addOrUpdateRecordAsync(
        record, 'pet', 'p001', dataDir, null,
      );
      const fullPath = path.join(dataDir, relPath);
      expect(fs.existsSync(fullPath)).toBe(true);

      const delRelPath = await VTableJsonStorage.deleteRecordAsync('pet', 'p001', dataDir, null);
      expect(delRelPath).toBe(relPath);
      expect(fs.existsSync(fullPath)).toBe(false);
    });

    it('does not throw when deleting non-existent record (remove is silent)', async () => {
      // CfgFileSystem.remove is silent on non-existent files
      const delRelPath = await VTableJsonStorage.deleteRecordAsync('missing', 'x001', TEMP_DIR, null);
      expect(delRelPath).toBeDefined();
    });

    it('rejects invalid id in deleteRecordAsync', async () => {
      await expect(
        VTableJsonStorage.deleteRecordAsync('table', '../escape', TEMP_DIR, null),
      ).rejects.toThrow();
    });
  });
});
