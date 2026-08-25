/**
 * DirectoryStructure tests — T6.2
 *
 * Tests ported from Java DirectoryStructureBehaviorTest.java.
 * Uses real temp directories created via os.tmpdir() + random suffix.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DirectoryStructure } from '../DirectoryStructure';
import { ExplicitDir } from '../ExplicitDir';
import { FileFmt } from '@cfggen/data';

describe('DirectoryStructure', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-ds-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  // -- Cfg file discovery --

  describe('config file discovery', () => {
    it('discovers config.cfg in root directory', () => {
      const cfgContent = 'table user[id] {\n  id:int;\n  name:str;\n}\n';
      fs.writeFileSync(path.join(tempDir, 'config.cfg'), cfgContent);

      const ds = new DirectoryStructure(tempDir);
      const cfgFiles = ds.getCfgFiles();

      expect(cfgFiles.length).toBe(1);
      expect(cfgFiles[0].relativePath).toBe('config.cfg');
      expect(cfgFiles[0].lastModified).toBeGreaterThan(0);
    });

    it('discovers nested config files in module directories', () => {
      const cfgContent = 'table user[id] {\n  id:int;\n}\n';
      fs.writeFileSync(path.join(tempDir, 'config.cfg'), cfgContent);

      const equipDir = path.join(tempDir, 'equip');
      fs.mkdirSync(equipDir);
      fs.writeFileSync(path.join(equipDir, 'equip.cfg'), 'table equip[id] {\n  id:int;\n}\n');

      const ds = new DirectoryStructure(tempDir);
      const cfgFiles = ds.getCfgFiles();

      expect(cfgFiles.length).toBe(2);
      const pkgNames = cfgFiles.map((c) => c.pkgNameDot).sort();
      expect(pkgNames).toEqual(['', 'equip.']);
    });
  });

  // -- Excel/CSV file discovery --

  describe('excel file discovery', () => {
    it('discovers CSV files in root directory', () => {
      const csvData = 'id,name\n1,Alice\n2,Bob\n';
      fs.writeFileSync(path.join(tempDir, 'user.csv'), csvData);

      const ds = new DirectoryStructure(tempDir);
      const excelFiles = ds.getExcelFiles();

      expect(excelFiles.length).toBe(1);
      expect(excelFiles[0].relativePath).toBe('user.csv');
      expect(excelFiles[0].fmt).toBe(FileFmt.CSV);
      expect(excelFiles[0].lastModified).toBeGreaterThan(0);
    });

    it('discovers CSV files in nested directories', () => {
      fs.mkdirSync(path.join(tempDir, 'equip'));
      fs.writeFileSync(path.join(tempDir, 'equip', 'weapon.csv'), 'id,name\n1,sword\n');

      const ds = new DirectoryStructure(tempDir);
      const excelFiles = ds.getExcelFiles();

      expect(excelFiles.length).toBe(1);
      expect(excelFiles[0].relativePath).toContain('weapon.csv');
    });

    it('ignores files starting with ~', () => {
      fs.writeFileSync(path.join(tempDir, '~temp.csv'), 'hidden');
      fs.writeFileSync(path.join(tempDir, 'visible.csv'), 'id\n1\n');

      const ds = new DirectoryStructure(tempDir);
      const excelFiles = ds.getExcelFiles();

      expect(excelFiles.length).toBe(1);
      expect(excelFiles[0].relativePath).toBe('visible.csv');
    });

    it('ignores files starting with dot', () => {
      fs.writeFileSync(path.join(tempDir, '.hidden.csv'), 'hidden');
      fs.writeFileSync(path.join(tempDir, 'visible.csv'), 'id\n1\n');

      const ds = new DirectoryStructure(tempDir);
      const excelFiles = ds.getExcelFiles();

      expect(excelFiles.length).toBe(1);
      expect(excelFiles[0].relativePath).toBe('visible.csv');
    });

    it('ignores directories with non-identifier first char', () => {
      // Directory starting with digit should be skipped (getCodeName returns null)
      const numDir = path.join(tempDir, '123dir');
      fs.mkdirSync(numDir);
      fs.writeFileSync(path.join(numDir, 'data.csv'), 'id\n1\n');

      const ds = new DirectoryStructure(tempDir);
      const excelFiles = ds.getExcelFiles();

      expect(excelFiles.length).toBe(0);
    });
  });

  // -- JSON file discovery: root-level format --

  describe('JSON root-level format', () => {
    it('discovers JSON files in root-level _table_dir', () => {
      const jsonDir = path.join(tempDir, '_user');
      fs.mkdirSync(jsonDir);
      fs.writeFileSync(path.join(jsonDir, '1.json'), '{"id": 1, "name": "Alice"}');

      const ds = new DirectoryStructure(tempDir);
      const jsonFiles = ds.getJsonFilesByTable('user');

      expect(jsonFiles.length).toBe(1);
      expect(jsonFiles[0].relativePath).toContain('1.json');
      expect(jsonFiles[0].lastModified).toBeGreaterThan(0);
    });

    it('returns empty array for unknown table', () => {
      const ds = new DirectoryStructure(tempDir);
      const jsonFiles = ds.getJsonFilesByTable('nonexistent');
      expect(jsonFiles).toEqual([]);
    });

    it('discovers root-level _buff_skill as buff.skill table', () => {
      const jsonDir = path.join(tempDir, '_buff_skill');
      fs.mkdirSync(jsonDir);
      fs.writeFileSync(path.join(jsonDir, '1.json'), '{"id": 1}');

      const ds = new DirectoryStructure(tempDir);
      const jsonFiles = ds.getJsonFilesByTable('buff.skill');

      expect(jsonFiles.length).toBe(1);
    });
  });

  // -- JSON file discovery: nested format --

  describe('JSON nested format', () => {
    it('discovers nested JSON files under module/_subDir', () => {
      const moduleDir = path.join(tempDir, 'buff');
      const jsonDir = path.join(moduleDir, '_skill');
      fs.mkdirSync(jsonDir, { recursive: true });
      fs.writeFileSync(path.join(jsonDir, '1.json'), '{"id": 1}');

      const ds = new DirectoryStructure(tempDir);
      const jsonFiles = ds.getJsonFilesByTable('buff.skill');

      expect(jsonFiles.length).toBe(1);
    });

    it('discovers nested JSON with Chinese suffix module dir', () => {
      // "skill_技能" → getCodeName strips at Chinese → "skill"
      const moduleDir = path.join(tempDir, 'skill_技能');
      const jsonDir = path.join(moduleDir, '_buff');
      fs.mkdirSync(jsonDir, { recursive: true });
      fs.writeFileSync(path.join(jsonDir, '1.json'), '{"id": 1}');

      const ds = new DirectoryStructure(tempDir);
      const jsonFiles = ds.getJsonFilesByTable('skill.buff');

      expect(jsonFiles.length).toBe(1);
    });

    it('discovers deeply nested JSON files (a/b/_c → a.b.c)', () => {
      const jsonDir = path.join(tempDir, 'a', 'b', '_c');
      fs.mkdirSync(jsonDir, { recursive: true });
      fs.writeFileSync(path.join(jsonDir, '1.json'), '{"id": 1}');

      const ds = new DirectoryStructure(tempDir);
      const jsonFiles = ds.getJsonFilesByTable('a.b.c');

      expect(jsonFiles.length).toBe(1);
    });

    it('discovers multiple nested tables under same module', () => {
      const moduleDir = path.join(tempDir, 'buff');
      fs.mkdirSync(path.join(moduleDir, '_buff'), { recursive: true });
      fs.mkdirSync(path.join(moduleDir, '_skill'), { recursive: true });
      fs.writeFileSync(path.join(moduleDir, '_buff', '1.json'), '{"id": 1}');
      fs.writeFileSync(path.join(moduleDir, '_skill', '2.json'), '{"id": 2}');

      const ds = new DirectoryStructure(tempDir);

      expect(ds.getJsonFilesByTable('buff.buff').length).toBe(1);
      expect(ds.getJsonFilesByTable('buff.skill').length).toBe(1);
    });

    it('does not treat non-underscore subdir as JSON table', () => {
      const moduleDir = path.join(tempDir, 'equip');
      const normalSubDir = path.join(moduleDir, 'sub');
      fs.mkdirSync(normalSubDir, { recursive: true });
      fs.writeFileSync(path.join(normalSubDir, '1.json'), '{"id": 1}');

      const ds = new DirectoryStructure(tempDir);
      const jsonFiles = ds.getJsonFilesByTable('equip.sub');

      expect(jsonFiles.length).toBe(0);
    });
  });

  // -- JSON conflict detection --

  describe('JSON conflict detection', () => {
    it('throws when both nested and root-level dirs exist for same table', () => {
      const moduleDir = path.join(tempDir, 'buff');
      const nestedDir = path.join(moduleDir, '_skill');
      fs.mkdirSync(nestedDir, { recursive: true });
      fs.writeFileSync(path.join(nestedDir, '1.json'), '{"id": 1}');

      const rootDir = path.join(tempDir, '_buff_skill');
      fs.mkdirSync(rootDir);
      fs.writeFileSync(path.join(rootDir, '2.json'), '{"id": 2}');

      expect(() => new DirectoryStructure(tempDir)).toThrow(/conflict/i);
    });

    it('records root-level dir and does not create nested dir on rescan', () => {
      // Bug repro: _skill_buff at root, and skill/ module dir exists
      const rootLevelDir = path.join(tempDir, '_skill_buff');
      fs.mkdirSync(rootLevelDir);
      fs.writeFileSync(path.join(rootLevelDir, '1.json'), '{"id": 1}');

      fs.mkdirSync(path.join(tempDir, 'skill'));

      const ds = new DirectoryStructure(tempDir);

      const tableDir = ds.getJsonTableDir('skill.buff');
      expect(tableDir).not.toBeNull();
      expect(tableDir).toBe('_skill_buff');

      // Simulate write: add file at discovered location
      fs.writeFileSync(path.join(tempDir, tableDir!, '2.json'), '{"id": 2}');

      // Rescan should not throw conflict
      const rescanned = new DirectoryStructure(tempDir);
      expect(rescanned.getJsonFilesByTable('skill.buff').length).toBe(2);

      // Nested dir should not have been created
      expect(fs.existsSync(path.join(tempDir, 'skill', '_buff'))).toBe(false);
    });
  });

  // -- JSON runtime mutations --

  describe('addJsonFile', () => {
    it('adds a JSON file to an existing table directory', () => {
      const jsonDir = path.join(tempDir, '_user');
      fs.mkdirSync(jsonDir);
      fs.writeFileSync(path.join(jsonDir, '1.json'), '{"id": 1}');

      const ds = new DirectoryStructure(tempDir);

      // Add new file
      fs.writeFileSync(path.join(jsonDir, '2.json'), '{"id": 2}');
      const added = ds.addJsonFile('user', path.join('_user', '2.json'));

      expect(added).toBeDefined();
      expect(added.relativePath).toContain('2.json');

      const jsonFiles = ds.getJsonFilesByTable('user');
      expect(jsonFiles.length).toBe(2);
    });

    it('creates new table entry when adding to non-existent table', () => {
      const jsonDir = path.join(tempDir, '_newtable');
      fs.mkdirSync(jsonDir);
      fs.writeFileSync(path.join(jsonDir, '1.json'), '{"id": 1}');

      const ds = new DirectoryStructure(tempDir);
      const added = ds.addJsonFile('newtable', path.join('_newtable', '1.json'));

      expect(added).toBeDefined();
      expect(ds.getJsonFilesByTable('newtable').length).toBe(1);
    });
  });

  describe('removeJsonFile', () => {
    it('removes a JSON file from a table', () => {
      const jsonDir = path.join(tempDir, '_user');
      fs.mkdirSync(jsonDir);
      fs.writeFileSync(path.join(jsonDir, '1.json'), '{"id": 1}');

      const ds = new DirectoryStructure(tempDir);
      expect(ds.getJsonFilesByTable('user').length).toBe(1);

      ds.removeJsonFile('user', path.join('_user', '1.json'));

      expect(ds.getJsonFilesByTable('user').length).toBe(0);
    });

    it('does nothing when removing from non-existent table', () => {
      const ds = new DirectoryStructure(tempDir);
      expect(() => ds.removeJsonFile('unknown', 'whatever.json')).not.toThrow();
    });

    it('does nothing when removing non-existent file', () => {
      const jsonDir = path.join(tempDir, '_user');
      fs.mkdirSync(jsonDir);
      fs.writeFileSync(path.join(jsonDir, '1.json'), '{"id": 1}');

      const ds = new DirectoryStructure(tempDir);
      ds.removeJsonFile('user', path.join('_user', '999.json'));
      expect(ds.getJsonFilesByTable('user').length).toBe(1);
    });
  });

  // -- updateExcelFileLastModified --

  describe('updateExcelFileLastModified', () => {
    it('updates lastModified for an existing excel file', async () => {
      const csvPath = path.join(tempDir, 'user.csv');
      fs.writeFileSync(csvPath, 'id\n1\n');

      const ds = new DirectoryStructure(tempDir);
      const original = ds.getExcelFiles()[0];
      const originalMtime = original.lastModified;

      // Wait a bit, then touch the file
      await new Promise((r) => setTimeout(r, 50));
      const now = new Date();
      fs.utimesSync(csvPath, now, now);

      ds.updateExcelFileLastModified('user.csv');
      const updated = ds.getExcelFiles()[0];
      expect(updated.lastModified).toBeGreaterThan(originalMtime);
    });

    it('does nothing for non-existent file', () => {
      const ds = new DirectoryStructure(tempDir);
      expect(() => ds.updateExcelFileLastModified('nonexistent.csv')).not.toThrow();
    });
  });

  // -- reload --

  describe('reload', () => {
    it('returns a new instance with same data', () => {
      fs.writeFileSync(path.join(tempDir, 'config.cfg'), 'table user[id] {\n  id:int;\n}\n');

      const original = new DirectoryStructure(tempDir);
      const reloaded = original.reload();

      expect(reloaded).not.toBe(original);
      expect(reloaded.getCfgFiles().length).toBe(original.getCfgFiles().length);
    });
  });

  // -- lastModifiedEquals --

  describe('lastModifiedEquals', () => {
    it('returns true for identical structures', () => {
      fs.writeFileSync(path.join(tempDir, 'config.cfg'), 'table user[id] {\n  id:int;\n}\n');

      const ds1 = new DirectoryStructure(tempDir);
      const ds2 = new DirectoryStructure(tempDir);

      expect(ds1.lastModifiedEquals(ds2)).toBe(true);
    });

    it('returns false when files are added', async () => {
      fs.writeFileSync(path.join(tempDir, 'config.cfg'), 'table user[id] {\n  id:int;\n}\n');

      const ds1 = new DirectoryStructure(tempDir);

      // Wait for mtime to differ
      await new Promise((r) => setTimeout(r, 50));
      fs.writeFileSync(path.join(tempDir, 'user.csv'), 'id\n1\n');

      const ds2 = new DirectoryStructure(tempDir);

      expect(ds1.lastModifiedEquals(ds2)).toBe(false);
    });

    it('returns false when cfg file count differs', () => {
      fs.writeFileSync(path.join(tempDir, 'config.cfg'), 'table user[id] {\n  id:int;\n}\n');

      const ds1 = new DirectoryStructure(tempDir);

      // Add a nested cfg file
      fs.mkdirSync(path.join(tempDir, 'equip'));
      fs.writeFileSync(path.join(tempDir, 'equip', 'equip.cfg'), 'table equip[id] {\n  id:int;\n}\n');

      const ds2 = new DirectoryStructure(tempDir);

      expect(ds1.lastModifiedEquals(ds2)).toBe(false);
    });
  });

  // -- ExplicitDir mode --

  describe('explicit directory mode', () => {
    it('discovers excel files only from explicit dirs', () => {
      const excelDir = path.join(tempDir, 'excel_files');
      fs.mkdirSync(excelDir);
      fs.writeFileSync(path.join(excelDir, 'user.csv'), 'id,name\n1,Alice\n');

      // Also create a file in root that should NOT be discovered
      fs.writeFileSync(path.join(tempDir, 'hidden.csv'), 'id\n1\n');

      const explicitDir = new ExplicitDir(
        new Map(),
        new Set(['excel_files']),
        new Set(),
      );

      const ds = new DirectoryStructure(tempDir, explicitDir);
      const excelFiles = ds.getExcelFiles();

      expect(excelFiles.length).toBe(1);
      expect(excelFiles[0].relativePath).toContain('user.csv');
    });

    it('discovers txt-as-tsv files via explicit dir map', () => {
      const txtDir = path.join(tempDir, 'txtdata');
      fs.mkdirSync(txtDir);
      fs.writeFileSync(path.join(txtDir, 'table1.txt'), 'id\tname\n1\tAlice\n');

      const explicitDir = new ExplicitDir(
        new Map([['txtdata', 'noserver']]),
        new Set(),
        new Set(),
      );

      const ds = new DirectoryStructure(tempDir, explicitDir);
      const excelFiles = ds.getExcelFiles();

      expect(excelFiles.length).toBe(1);
      expect(excelFiles[0].fmt).toBe(FileFmt.TXT_AS_TSV);
      expect(excelFiles[0].nullableAddTag).toBe('noserver');
      // For txt-as-tsv, relative path is just the filename (treated as root)
      expect(excelFiles[0].relativePath).toBe('table1.txt');
    });

    it('discovers JSON files from explicit json dirs', () => {
      // Explicit json dir name must be a table dir name (starts with _)
      const jsonDir = path.join(tempDir, '_user');
      fs.mkdirSync(jsonDir);
      fs.writeFileSync(path.join(jsonDir, '1.json'), '{"id": 1}');

      const explicitDir = new ExplicitDir(
        new Map(),
        new Set(),
        new Set(['_user']),
      );

      const ds = new DirectoryStructure(tempDir, explicitDir);
      const jsonFiles = ds.getJsonFilesByTable('user');

      expect(jsonFiles.length).toBe(1);
    });
  });

  // -- getJsonTableDir --

  describe('getJsonTableDir', () => {
    it('returns the relative path for a discovered table', () => {
      const jsonDir = path.join(tempDir, '_user');
      fs.mkdirSync(jsonDir);
      fs.writeFileSync(path.join(jsonDir, '1.json'), '{"id": 1}');

      const ds = new DirectoryStructure(tempDir);
      const tableDir = ds.getJsonTableDir('user');

      expect(tableDir).toBe('_user');
    });

    it('returns null for unknown table', () => {
      const ds = new DirectoryStructure(tempDir);
      expect(ds.getJsonTableDir('unknown')).toBeNull();
    });
  });

  // -- getCfgFilePathByPkgName --

  describe('getCfgFilePathByPkgName', () => {
    it('returns path for root config', () => {
      fs.writeFileSync(path.join(tempDir, 'config.cfg'), 'table user[id] {\n  id:int;\n}\n');

      const ds = new DirectoryStructure(tempDir);
      const cfgPath = ds.getCfgFilePathByPkgName('');

      expect(cfgPath).not.toBeNull();
      expect(cfgPath).toContain('config.cfg');
    });

    it('returns path for nested module config', () => {
      fs.writeFileSync(path.join(tempDir, 'config.cfg'), 'table user[id] {\n  id:int;\n}\n');
      fs.mkdirSync(path.join(tempDir, 'equip'));
      fs.writeFileSync(path.join(tempDir, 'equip', 'equip.cfg'), 'table equip[id] {\n  id:int;\n}\n');

      const ds = new DirectoryStructure(tempDir);
      const cfgPath = ds.getCfgFilePathByPkgName('equip');

      expect(cfgPath).not.toBeNull();
      expect(cfgPath).toContain('equip.cfg');
    });

    it('returns null for unknown package', () => {
      fs.writeFileSync(path.join(tempDir, 'config.cfg'), 'table user[id] {\n  id:int;\n}\n');

      const ds = new DirectoryStructure(tempDir);
      const cfgPath = ds.getCfgFilePathByPkgName('nonexistent');

      expect(cfgPath).toBeNull();
    });
  });

  // -- jsonFilesOf (JsonTableFiles interface) --

  describe('jsonFilesOf (JsonTableFiles interface)', () => {
    it('returns same as getJsonFilesByTable', () => {
      const jsonDir = path.join(tempDir, '_user');
      fs.mkdirSync(jsonDir);
      fs.writeFileSync(path.join(jsonDir, '1.json'), '{"id": 1}');

      const ds = new DirectoryStructure(tempDir);

      expect(ds.jsonFilesOf('user')).toEqual(ds.getJsonFilesByTable('user'));
      expect(ds.jsonFilesOf('user').length).toBe(1);
      expect(ds.jsonFilesOf('nonexistent')).toEqual([]);
    });
  });

  // -- Integer ID sorting --

  describe('JSON file sorting', () => {
    it('sorts JSON files by integer ID when all are integers', () => {
      const jsonDir = path.join(tempDir, '_user');
      fs.mkdirSync(jsonDir);
      fs.writeFileSync(path.join(jsonDir, '10.json'), '{"id": 10}');
      fs.writeFileSync(path.join(jsonDir, '2.json'), '{"id": 2}');
      fs.writeFileSync(path.join(jsonDir, '1.json'), '{"id": 1}');

      const ds = new DirectoryStructure(tempDir);
      const jsonFiles = ds.getJsonFilesByTable('user');

      expect(jsonFiles.length).toBe(3);
      expect(jsonFiles[0].integerId).toBe(1);
      expect(jsonFiles[1].integerId).toBe(2);
      expect(jsonFiles[2].integerId).toBe(10);
    });
  });
});

// Helper: recursive rm
function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
