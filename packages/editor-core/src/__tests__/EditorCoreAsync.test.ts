/**
 * editor-core async tests — SchemaWriteService/NoteEditService/TableCreateService async variants (T12.0e)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { setDefaultFileSystem, NodeFileSystem } from '@cfggen/shared';
import { EditorService } from '../EditorService';
import { SchemaWriteService } from '../SchemaWriteService';
import { TableCreateService } from '../TableCreateService';
import { NoteEditService } from '../NoteEditService';

let tempDir: string;

function writeFile(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

// Fixtures (same pattern as SchemaWriteService.test.ts / TableCreateService.test.ts)

const SIMPLE_CFG = `table item[id] (title='name') {
  id:int;
  name:str;
}
`;

const SIMPLE_CSV = `ID,名称
id,name
100,剑
`;

const USER_CFG = `table user[id] {
  id:int;
  name:str;
}
`;

const USER_CSV = `ID
id
1
`;

const WEAPON_CFG = `table weapon[id] (title='name') {
  id:int;
  name:str;
}
`;

const WEAPON_CSV = `ID,名称
id,name
1,剑
`;

describe('editor-core async (T12.0e)', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-ec-async-'));
    setDefaultFileSystem(new NodeFileSystem());
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function createService(
    cfg: string,
    csvs: Record<string, string>,
  ): Promise<EditorService> {
    writeFile(tempDir, 'config.cfg', cfg);
    for (const [name, content] of Object.entries(csvs)) {
      writeFile(tempDir, name, content);
    }
    return EditorService.create(tempDir);
  }

  // -------------------------------------------------------------------------
  // SchemaWriteService async
  // -------------------------------------------------------------------------

  describe('SchemaWriteService async', () => {
    it('readSchemaTextAsync reads concatenated cfg files', async () => {
      const svc = await createService(SIMPLE_CFG, { 'item.csv': SIMPLE_CSV });
      const result = await SchemaWriteService.readSchemaTextAsync(svc);
      expect(result.text).toContain('table item');
      expect(result.text).toContain('id:int');
    });

    it('writeSchemaTextAsync writes valid schema', async () => {
      const svc = await createService(SIMPLE_CFG, { 'item.csv': SIMPLE_CSV });

      const newSchema = `table item[id] (title='name') {
  id:int;
  name:str;
}
`;
      const result = await SchemaWriteService.writeSchemaTextAsync(svc, newSchema);

      expect(result.ok).toBe(true);
      expect(result.errors.length).toBe(0);

      // Verify file was written
      const content = fs.readFileSync(path.join(tempDir, 'config.cfg'), 'utf8');
      expect(content).toContain('table item');
    });

    it('writeSchemaTextAsync returns errors for invalid schema', async () => {
      const svc = await createService(SIMPLE_CFG, { 'item.csv': SIMPLE_CSV });

      const result = await SchemaWriteService.writeSchemaTextAsync(svc, 'invalid cfg {{{ }');
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // NoteEditService async
  // -------------------------------------------------------------------------

  describe('NoteEditService async', () => {
    it('create async loads notes from CSV', async () => {
      const notePath = path.join(tempDir, 'note.csv');
      fs.writeFileSync(notePath, 'key1,note1\nkey2,note2\n', 'utf8');

      const svc = await NoteEditService.create(notePath);
      const result = svc.getNotes();

      expect(result.notes.length).toBe(2);
      expect(result.notes).toContainEqual({ key: 'key1', note: 'note1' });
      expect(result.notes).toContainEqual({ key: 'key2', note: 'note2' });
    });

    it('create async returns empty when file does not exist', async () => {
      const svc = await NoteEditService.create(path.join(tempDir, 'nonexistent.csv'));
      const result = svc.getNotes();
      expect(result.notes.length).toBe(0);
    });

    it('updateNoteAsync adds a new note and persists', async () => {
      const notePath = path.join(tempDir, 'note_async.csv');
      const svc = await NoteEditService.create(notePath);

      const result = await svc.updateNoteAsync('newKey', 'new note');
      expect(result.resultCode).toBe('addOk');

      // Verify persistence: create a new instance and read
      const svc2 = await NoteEditService.create(notePath);
      const notes = svc2.getNotes();
      expect(notes.notes).toContainEqual({ key: 'newKey', note: 'new note' });
    });

    it('updateNoteAsync deletes note with empty value', async () => {
      const notePath = path.join(tempDir, 'note_del.csv');
      fs.writeFileSync(notePath, 'key1,note1\n', 'utf8');

      const svc = await NoteEditService.create(notePath);
      const result = await svc.updateNoteAsync('key1', '');
      expect(result.resultCode).toBe('deleteOk');

      const svc2 = await NoteEditService.create(notePath);
      expect(svc2.getNotes().notes.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // TableCreateService async
  // -------------------------------------------------------------------------

  describe('TableCreateService async', () => {
    it('createTableAsync creates a new table and writes config.cfg', async () => {
      const svc = await createService(SIMPLE_CFG, { 'item.csv': SIMPLE_CSV });

      const result = await TableCreateService.createTableAsync(svc, {
        type: 'table',
        name: 'weapon',
        fields: [{ name: 'id', type: 'int' }, { name: 'name', type: 'str' }],
        primaryKey: ['id'],
        withDataFile: true,
      });

      expect(result.ok).toBe(true);
      expect(result.errors.length).toBe(0);

      // config.cfg should contain 'weapon' table
      const cfgContent = fs.readFileSync(path.join(tempDir, 'config.cfg'), 'utf8');
      expect(cfgContent).toContain('table weapon');

      // CSV should exist
      expect(fs.existsSync(path.join(tempDir, 'weapon.csv'))).toBe(true);
    });

    it('createTableAsync rejects duplicate name', async () => {
      const svc = await createService(SIMPLE_CFG, { 'item.csv': SIMPLE_CSV });

      const result = await TableCreateService.createTableAsync(svc, {
        type: 'table',
        name: 'item',
        fields: [{ name: 'id', type: 'int' }],
      });

      expect(result.ok).toBe(false);
      expect(result.errors).toContain('Name already exists: item');
    });

    it('createDataFileAsync creates empty CSV for existing table', async () => {
      const svc = await createService(WEAPON_CFG, { 'weapon.csv': WEAPON_CSV });

      // Delete the CSV first so createDataFileAsync can create it
      fs.unlinkSync(path.join(tempDir, 'weapon.csv'));

      const result = await TableCreateService.createDataFileAsync(svc, 'weapon');
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'weapon.csv'))).toBe(true);
    });

    it('createDataFileAsync rejects if file already exists', async () => {
      const svc = await createService(WEAPON_CFG, { 'weapon.csv': WEAPON_CSV });

      const result = await TableCreateService.createDataFileAsync(svc, 'weapon');
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain('already exists');
    });
  });
});
