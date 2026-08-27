/**
 * End-to-end regression tests — T9.11
 *
 * Verifies all editor-core API functions work together on a single
 * realistic data directory, matching the Java HTTP API surface:
 *
 *   1. getSchemas           → SchemaService.fromCfgValue
 *   2. getRecord            → RecordService (requestRecord)
 *   3. addOrUpdateRecord    → RecordEditService.addOrUpdateRecord
 *   4. deleteRecord        → RecordEditService.deleteRecord
 *   5. getRecordRefIds     → RecordRefIdsService
 *   6. search              → SearchService
 *   7. getSchemaText       → SchemaWriteService.readSchemaText
 *   8. writeSchemaText     → SchemaWriteService.writeSchemaText
 *   9. createTable         → TableCreateService.createTable
 *  10. checkJson           → CheckJsonService.checkJson
 *  11. getPrompt           → PromptService.getPrompt
 *  12. getNotes            → NoteEditService.getNotes
 *  13. updateNote          → NoteEditService.updateNote
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EditorService } from '../EditorService';
import { SchemaService } from '../SchemaService';
import { RecordService } from '../RecordService';
import { RecordEditService } from '../RecordEditService';
import { RecordRefIdsService } from '../RecordRefIdsService';
import { SearchService } from '../SearchService';
import { SchemaWriteService } from '../SchemaWriteService';
import { TableCreateService } from '../TableCreateService';
import { CheckJsonService } from '../CheckJsonService';
import { PromptService } from '../PromptService';
import { NoteEditService } from '../NoteEditService';

function writeFile(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function readFileSync(dir: string, filename: string): string {
  return fs.readFileSync(path.join(dir, filename), 'utf8');
}

// ---------------------------------------------------------------------------
// Fixture: a small game config with items, weapons, and users
// ---------------------------------------------------------------------------

const CFG = `table item[id] (title='name', description='name') {
  id:int;
  name:str;
  desc:text;
}

table weapon[id] (title='name', description='name,damage') {
  id:int;
  name:str;
  damage:int;
}

table user[id] (title='name', description='name,level') {
  id:int;
  name:str;
  level:int;
  weaponref:int -> weapon;
}
`;

const ITEM_CSV = `ID,名称,描述
id,name,desc
100,铁剑,一把普通铁剑
101,钢盾,一面钢制盾牌
102,长弓,一把长弓
`;

const WEAPON_CSV = `ID,名称,伤害
id,name,damage
1,铁剑1,15
2,钢盾1,30
3,长弓1,12
`;

const USER_CSV = `用户ID,姓名,等级,武器
id,name,level,weaponref
1,Alice,5,1
2,Bob,10,2
3,Charlie,3,3
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Editor API end-to-end regression', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-e2e-'));
    writeFile(tempDir, 'config.cfg', CFG);
    writeFile(tempDir, 'item.csv', ITEM_CSV);
    writeFile(tempDir, 'weapon.csv', WEAPON_CSV);
    writeFile(tempDir, 'user.csv', USER_CSV);
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  // -------------------------------------------------------------------------
  // 1. getSchemas
  // -------------------------------------------------------------------------
  it('getSchemas returns all tables with correct structure', async () => {
    const editor = await EditorService.create(tempDir);
    const result = SchemaService.fromCfgValue(editor.cfgValue());

    expect(result.isEditable).toBe(true);
    const tableNames = result.items.map(i => i.name);
    expect(tableNames).toContain('item');
    expect(tableNames).toContain('weapon');
    expect(tableNames).toContain('user');
  });

  // -------------------------------------------------------------------------
  // 2. getRecord
  // -------------------------------------------------------------------------
  it('getRecord returns record JSON and refs', async () => {
    const editor = await EditorService.create(tempDir);
    const svc = new RecordService(
      editor.cfgValue(), editor.graph(), 'user', '1', 1, false, 100, 'requestRecord',
    );
    const result = svc.retrieve();

    expect(result.resultCode).toBe('ok');
    expect(result.object).toBeDefined();
    const rec = result.object as Record<string, unknown>;
    expect(rec.id).toBe(1);
    expect(rec.name).toBe('Alice');
  });

  // -------------------------------------------------------------------------
  // 3. addOrUpdateRecord (add)
  // -------------------------------------------------------------------------
  it('addOrUpdateRecord adds a new user record', async () => {
    const editor = await EditorService.create(tempDir);
    const result = await RecordEditService.addOrUpdateRecord(
      editor, 'user',
      JSON.stringify({ id: 4, name: 'Dave', level: 1, weaponref: 1 }),
    );

    expect(result.resultCode).toBe('addOk');
  });

  // -------------------------------------------------------------------------
  // 4. deleteRecord
  // -------------------------------------------------------------------------
  it('deleteRecord removes an existing record', async () => {
    const editor = await EditorService.create(tempDir);
    const result = await RecordEditService.deleteRecord(editor, 'user', '3');

    expect(result.resultCode).toBe('deleteOk');
  });

  // -------------------------------------------------------------------------
  // 5. getRecordRefIds
  // -------------------------------------------------------------------------
  it('getRecordRefIds returns ref-out graph', async () => {
    const editor = await EditorService.create(tempDir);
    const svc = new RecordRefIdsService(
      editor.cfgValue(), editor.graph(), 'user', '1', 0, 1, 100,
    );
    const result = svc.retrieve();

    expect(result.resultCode).toBe('ok');
    // user(1) refs weapon(1) → should appear at depth 1
    const refIds = result.recordRefIds;
    const weaponRef = refIds.find(r => r.table === 'weapon');
    expect(weaponRef).toBeDefined();
    expect(weaponRef!.id).toBe('1');
  });

  // -------------------------------------------------------------------------
  // 6. search
  // -------------------------------------------------------------------------
  it('search finds string values across tables', async () => {
    const editor = await EditorService.create(tempDir);
    const result = SearchService.search(editor, '铁剑', 30);

    expect(result.resultCode).toBe('ok');
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    const tables = result.items.map(i => i.table);
    expect(tables).toContain('item');
  });

  it('search finds numeric values across tables', async () => {
    const editor = await EditorService.create(tempDir);
    const result = SearchService.search(editor, '100', 30);

    expect(result.resultCode).toBe('ok');
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    // item id=100
    const itemMatch = result.items.find(i => i.table === 'item' && i.value === '100');
    expect(itemMatch).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 7. getSchemaText
  // -------------------------------------------------------------------------
  it('getSchemaText returns config.cfg content', async () => {
    const editor = await EditorService.create(tempDir);
    const result = SchemaWriteService.readSchemaText(editor);

    expect(result.text).toContain('table item');
    expect(result.text).toContain('table weapon');
    expect(result.text).toContain('table user');
  });

  // -------------------------------------------------------------------------
  // 8. writeSchemaText
  // -------------------------------------------------------------------------
  it('writeSchemaText writes valid schema and reloads', async () => {
    const editor = await EditorService.create(tempDir);
    const newSchema = `table item[id] (title='name') {
  id:int;
  name:str;
  desc:text;
}

table weapon[id] (title='name') {
  id:int;
  name:str;
  damage:int;
}

table user[id] (title='name') {
  id:int;
  name:str;
  level:int;
  weaponref:int -> weapon;
}
`;
    const result = await SchemaWriteService.writeSchemaText(editor, newSchema);

    expect(result.ok).toBe(true);
    // Verify file was written
    const written = readFileSync(tempDir, 'config.cfg');
    expect(written).toContain('table item');
  });

  // -------------------------------------------------------------------------
  // 9. createTable
  // -------------------------------------------------------------------------
  it('createTable adds a new table to schema', async () => {
    const editor = await EditorService.create(tempDir);
    const result = TableCreateService.createTable(editor, {
      type: 'table',
      name: 'skill',
      fields: [
        { name: 'id', type: 'int' },
        { name: 'name', type: 'str' },
      ],
      primaryKey: ['id'],
      withDataFile: true,
    });

    expect(result.ok).toBe(true);
    // Verify schema file contains new table
    const cfg = readFileSync(tempDir, 'config.cfg');
    expect(cfg).toContain('table skill');
    // Verify CSV data file was created
    expect(fs.existsSync(path.join(tempDir, 'skill.csv'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 10. checkJson
  // -------------------------------------------------------------------------
  it('checkJson validates a JSON record against table schema', async () => {
    const editor = await EditorService.create(tempDir);
    const json = '```json\n{"id": 103, "name": "新装备", "desc": "测试装备"}\n```';
    const result = CheckJsonService.checkJson(editor, 'item', json);

    expect(result.resultCode).toBe('ok');
    const parsed = JSON.parse(result.jsonResult);
    expect(parsed.id).toBe(103);
    expect(parsed.name).toBe('新装备');
  });

  // -------------------------------------------------------------------------
  // 11. getPrompt
  // -------------------------------------------------------------------------
  it('getPrompt returns prompt text for a table', async () => {
    const editor = await EditorService.create(tempDir);
    const result = PromptService.gen(editor, 'item');

    expect(result.resultCode).toBe('ok');
    expect(result.prompt).toBeDefined();
    expect(result.prompt.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // 12. getNotes
  // -------------------------------------------------------------------------
  it('getNotes returns empty when no note file exists', async () => {
    const editor = await EditorService.create(tempDir);
    const noteSvc = new NoteEditService(path.join(tempDir, 'note.csv'));
    const result = noteSvc.getNotes();

    expect(result.notes).toEqual([]);
  });

  it('getNotes returns existing notes from file', async () => {
    writeFile(tempDir, 'note.csv', 'key1,备注1\r\nkey2,备注2\r\n');
    const noteSvc = await NoteEditService.create(path.join(tempDir, 'note.csv'));
    const result = noteSvc.getNotes();

    expect(result.notes.length).toBe(2);
    expect(result.notes[0].key).toBe('key1');
    expect(result.notes[0].note).toBe('备注1');
  });

  // -------------------------------------------------------------------------
  // 13. updateNote
  // -------------------------------------------------------------------------
  it('updateNote adds a new note and persists', async () => {
    const notePath = path.join(tempDir, 'note.csv');
    const noteSvc = await NoteEditService.create(notePath);
    const result = await noteSvc.updateNoteAsync('testKey', '测试备注');

    expect(result.resultCode).toBe('addOk');
    expect(fs.existsSync(notePath)).toBe(true);

    // Verify persistence via a new instance
    const noteSvc2 = await NoteEditService.create(notePath);
    const read = noteSvc2.getNotes();
    expect(read.notes.length).toBe(1);
    expect(read.notes[0].key).toBe('testKey');
    expect(read.notes[0].note).toBe('测试备注');
  });

  // -------------------------------------------------------------------------
  // Cross-service workflow: add record → search → refIds → delete
  // -------------------------------------------------------------------------
  it('workflow: add → search → refIds → delete works end-to-end', async () => {
    const editor = await EditorService.create(tempDir);

    // Step 1: Add a new user
    const addResult = await RecordEditService.addOrUpdateRecord(
      editor, 'user',
      JSON.stringify({ id: 10, name: 'TestHero', level: 99, weaponref: 3 }),
    );
    expect(addResult.resultCode).toBe('addOk');

    // Step 2: Search for the new user by name
    const searchResult = SearchService.search(editor, 'TestHero', 30);
    expect(searchResult.resultCode).toBe('ok');
    expect(searchResult.items.length).toBeGreaterThanOrEqual(1);
    const userMatch = searchResult.items.find(
      i => i.table === 'user' && i.value === 'TestHero',
    );
    expect(userMatch).toBeDefined();

    // Step 3: Get refIds for the new user
    const refSvc = new RecordRefIdsService(
      editor.cfgValue(), editor.graph(), 'user', '10', 0, 1, 100,
    );
    const refIdsResult = refSvc.retrieve();
    expect(refIdsResult.resultCode).toBe('ok');
    const weaponRef = refIdsResult.recordRefIds.find(r => r.table === 'weapon');
    expect(weaponRef).toBeDefined();
    expect(weaponRef!.id).toBe('3');

    // Step 4: Delete the user
    const deleteResult = await RecordEditService.deleteRecord(editor, 'user', '10');
    expect(deleteResult.resultCode).toBe('deleteOk');
  });
});
