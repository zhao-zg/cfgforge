/**
 * DirectoryStructure async tests — createAsync/reloadAsync/updateExcelFileLastModifiedAsync (T12.0c-4)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DirectoryStructure } from '../DirectoryStructure';
import { ExplicitDir } from '../ExplicitDir';
import { FileFmt } from '@cfggen/data';
import { setDefaultFileSystem, NodeFileSystem } from '@cfggen/shared';

describe('DirectoryStructure async', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-dsa-'));
    setDefaultFileSystem(new NodeFileSystem());
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // -- Config file discovery (async) --

  describe('config file discovery (async)', () => {
    it('discovers config.cfg in root directory', async () => {
      fs.writeFileSync(path.join(tempDir, 'config.cfg'), 'table user[id] {\n  id:int;\n  name:str;\n}\n');

      const ds = await DirectoryStructure.createAsync(tempDir);
      const cfgFiles = ds.getCfgFiles();

      expect(cfgFiles.length).toBe(1);
      expect(cfgFiles[0].relativePath).toBe('config.cfg');
      expect(cfgFiles[0].lastModified).toBeGreaterThan(0);
    });

    it('discovers nested config files', async () => {
      fs.writeFileSync(path.join(tempDir, 'config.cfg'), 'table user[id] {\n  id:int;\n}\n');
      fs.mkdirSync(path.join(tempDir, 'equip'));
      fs.writeFileSync(path.join(tempDir, 'equip', 'equip.cfg'), 'table equip[id] {\n  id:int;\n}\n');

      const ds = await DirectoryStructure.createAsync(tempDir);
      const cfgFiles = ds.getCfgFiles();

      expect(cfgFiles.length).toBe(2);
      const pkgNames = cfgFiles.map((c) => c.pkgNameDot).sort();
      expect(pkgNames).toEqual(['', 'equip.']);
    });
  });

  // -- Excel/CSV discovery (async) --

  describe('excel file discovery (async)', () => {
    it('discovers CSV files in root directory', async () => {
      fs.writeFileSync(path.join(tempDir, 'user.csv'), 'id,name\n1,Alice\n2,Bob\n');

      const ds = await DirectoryStructure.createAsync(tempDir);
      const excelFiles = ds.getExcelFiles();

      expect(excelFiles.length).toBe(1);
      expect(excelFiles[0].relativePath).toBe('user.csv');
      expect(excelFiles[0].fmt).toBe(FileFmt.CSV);
      expect(excelFiles[0].lastModified).toBeGreaterThan(0);
    });

    it('discovers CSV files in nested directories', async () => {
      fs.mkdirSync(path.join(tempDir, 'equip'));
      fs.writeFileSync(path.join(tempDir, 'equip', 'weapon.csv'), 'id,name\n1,sword\n');

      const ds = await DirectoryStructure.createAsync(tempDir);
      const excelFiles = ds.getExcelFiles();

      expect(excelFiles.length).toBe(1);
      expect(excelFiles[0].relativePath).toContain(path.join('weapon.csv'));
    });

    it('ignores files starting with ~', async () => {
      fs.writeFileSync(path.join(tempDir, '~temp.csv'), 'hidden');
      fs.writeFileSync(path.join(tempDir, 'visible.csv'), 'id\n1\n');

      const ds = await DirectoryStructure.createAsync(tempDir);
      const excelFiles = ds.getExcelFiles();

      expect(excelFiles.length).toBe(1);
      expect(excelFiles[0].relativePath).toBe('visible.csv');
    });
  });

  // -- JSON file discovery (async) --

  describe('JSON file discovery (async)', () => {
    it('discovers JSON files in root-level _table_dir', async () => {
      const jsonDir = path.join(tempDir, '_user');
      fs.mkdirSync(jsonDir);
      fs.writeFileSync(path.join(jsonDir, '1.json'), '{"id": 1, "name": "Alice"}');

      const ds = await DirectoryStructure.createAsync(tempDir);
      const jsonFiles = ds.getJsonFilesByTable('user');

      expect(jsonFiles.length).toBe(1);
      expect(jsonFiles[0].relativePath).toContain('1.json');
      expect(jsonFiles[0].lastModified).toBeGreaterThan(0);
    });

    it('discovers nested JSON files under module/_subDir', async () => {
      const jsonDir = path.join(tempDir, 'buff', '_skill');
      fs.mkdirSync(jsonDir, { recursive: true });
      fs.writeFileSync(path.join(jsonDir, '1.json'), '{"id": 1}');

      const ds = await DirectoryStructure.createAsync(tempDir);
      const jsonFiles = ds.getJsonFilesByTable('buff.skill');

      expect(jsonFiles.length).toBe(1);
    });

    it('discovers deeply nested JSON (a/b/_c → a.b.c)', async () => {
      const jsonDir = path.join(tempDir, 'a', 'b', '_c');
      fs.mkdirSync(jsonDir, { recursive: true });
      fs.writeFileSync(path.join(jsonDir, '1.json'), '{"id": 1}');

      const ds = await DirectoryStructure.createAsync(tempDir);
      const jsonFiles = ds.getJsonFilesByTable('a.b.c');

      expect(jsonFiles.length).toBe(1);
    });

    it('sorts JSON files by integer ID', async () => {
      const jsonDir = path.join(tempDir, '_user');
      fs.mkdirSync(jsonDir);
      fs.writeFileSync(path.join(jsonDir, '10.json'), '{"id": 10}');
      fs.writeFileSync(path.join(jsonDir, '2.json'), '{"id": 2}');
      fs.writeFileSync(path.join(jsonDir, '1.json'), '{"id": 1}');

      const ds = await DirectoryStructure.createAsync(tempDir);
      const jsonFiles = ds.getJsonFilesByTable('user');

      expect(jsonFiles.length).toBe(3);
      expect(jsonFiles[0].integerId).toBe(1);
      expect(jsonFiles[1].integerId).toBe(2);
      expect(jsonFiles[2].integerId).toBe(10);
    });
  });

  // -- JSON conflict detection (async) --

  describe('JSON conflict detection (async)', () => {
    it('throws when both nested and root-level dirs exist for same table', async () => {
      const nestedDir = path.join(tempDir, 'buff', '_skill');
      fs.mkdirSync(nestedDir, { recursive: true });
      fs.writeFileSync(path.join(nestedDir, '1.json'), '{"id": 1}');

      const rootDir = path.join(tempDir, '_buff_skill');
      fs.mkdirSync(rootDir);
      fs.writeFileSync(path.join(rootDir, '2.json'), '{"id": 2}');

      await expect(DirectoryStructure.createAsync(tempDir)).rejects.toThrow(/conflict/i);
    });
  });

  // -- reloadAsync --

  describe('reloadAsync', () => {
    it('returns a new instance with same data', async () => {
      fs.writeFileSync(path.join(tempDir, 'config.cfg'), 'table user[id] {\n  id:int;\n}\n');

      const original = await DirectoryStructure.createAsync(tempDir);
      const reloaded = await original.reloadAsync();

      expect(reloaded).not.toBe(original);
      expect(reloaded.getCfgFiles().length).toBe(original.getCfgFiles().length);
    });

    it('picks up new files after reload', async () => {
      fs.writeFileSync(path.join(tempDir, 'config.cfg'), 'table user[id] {\n  id:int;\n}\n');

      const ds1 = await DirectoryStructure.createAsync(tempDir);
      expect(ds1.getExcelFiles().length).toBe(0);

      fs.writeFileSync(path.join(tempDir, 'user.csv'), 'id\n1\n');

      const ds2 = await ds1.reloadAsync();
      expect(ds2.getExcelFiles().length).toBe(1);
    });
  });

  // -- updateExcelFileLastModifiedAsync --

  describe('updateExcelFileLastModifiedAsync', () => {
    it('updates lastModified for an existing excel file', async () => {
      const csvPath = path.join(tempDir, 'user.csv');
      fs.writeFileSync(csvPath, 'id\n1\n');

      const ds = await DirectoryStructure.createAsync(tempDir);
      const original = ds.getExcelFiles()[0];
      const originalMtime = original.lastModified;

      await new Promise((r) => setTimeout(r, 50));
      const now = new Date();
      fs.utimesSync(csvPath, now, now);

      await ds.updateExcelFileLastModifiedAsync('user.csv');
      const updated = ds.getExcelFiles()[0];
      expect(updated.lastModified).toBeGreaterThan(originalMtime);
    });

    it('does nothing for non-existent file', async () => {
      const ds = await DirectoryStructure.createAsync(tempDir);
      await expect(ds.updateExcelFileLastModifiedAsync('nonexistent.csv')).resolves.toBeUndefined();
    });
  });

  // -- ExplicitDir mode (async) --

  describe('explicit directory mode (async)', () => {
    it('discovers excel files only from explicit dirs', async () => {
      const excelDir = path.join(tempDir, 'excel_files');
      fs.mkdirSync(excelDir);
      fs.writeFileSync(path.join(excelDir, 'user.csv'), 'id,name\n1,Alice\n');
      fs.writeFileSync(path.join(tempDir, 'hidden.csv'), 'id\n1\n');

      const explicitDir = new ExplicitDir(new Map(), new Set(['excel_files']), new Set());
      const ds = await DirectoryStructure.createAsync(tempDir, explicitDir);
      const excelFiles = ds.getExcelFiles();

      expect(excelFiles.length).toBe(1);
      expect(excelFiles[0].relativePath).toContain('user.csv');
    });

    it('discovers txt-as-tsv files via explicit dir map', async () => {
      const txtDir = path.join(tempDir, 'txtdata');
      fs.mkdirSync(txtDir);
      fs.writeFileSync(path.join(txtDir, 'table1.txt'), 'id\tname\n1\tAlice\n');

      const explicitDir = new ExplicitDir(
        new Map([['txtdata', 'noserver']]),
        new Set(),
        new Set(),
      );
      const ds = await DirectoryStructure.createAsync(tempDir, explicitDir);
      const excelFiles = ds.getExcelFiles();

      expect(excelFiles.length).toBe(1);
      expect(excelFiles[0].fmt).toBe(FileFmt.TXT_AS_TSV);
      expect(excelFiles[0].nullableAddTag).toBe('noserver');
    });

    it('discovers JSON files from explicit json dirs', async () => {
      const jsonDir = path.join(tempDir, '_user');
      fs.mkdirSync(jsonDir);
      fs.writeFileSync(path.join(jsonDir, '1.json'), '{"id": 1}');

      const explicitDir = new ExplicitDir(new Map(), new Set(), new Set(['_user']));
      const ds = await DirectoryStructure.createAsync(tempDir, explicitDir);
      const jsonFiles = ds.getJsonFilesByTable('user');

      expect(jsonFiles.length).toBe(1);
    });
  });

  // -- Parity with sync version --

  describe('parity with sync DirectoryStructure', () => {
    it('produces same cfg/excel/json counts as sync', async () => {
      fs.writeFileSync(path.join(tempDir, 'config.cfg'), 'table user[id] {\n  id:int;\n}\n');
      fs.mkdirSync(path.join(tempDir, 'equip'));
      fs.writeFileSync(path.join(tempDir, 'equip', 'weapon.csv'), 'id,name\n1,sword\n');
      const jsonDir = path.join(tempDir, '_user');
      fs.mkdirSync(jsonDir);
      fs.writeFileSync(path.join(jsonDir, '1.json'), '{"id": 1}');

      const syncDs = new DirectoryStructure(tempDir);
      const asyncDs = await DirectoryStructure.createAsync(tempDir);

      expect(asyncDs.getCfgFiles().length).toBe(syncDs.getCfgFiles().length);
      expect(asyncDs.getExcelFiles().length).toBe(syncDs.getExcelFiles().length);
      expect(asyncDs.getJsonFilesByTable('user').length).toBe(syncDs.getJsonFilesByTable('user').length);
    });
  });
});
