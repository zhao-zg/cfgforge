/**
 * RecordEditService tests — T9.4
 *
 * RecordEditService bridges EditorService with AddOrUpdateService and
 * DeleteService from the write package.
 *
 * Tests cover:
 * - addOrUpdateRecord: add a new record → addOk
 * - addOrUpdateRecord: update an existing record → updateOk
 * - addOrUpdateRecord: null table → tableNotSet
 * - addOrUpdateRecord: nonexistent table → tableNotFound
 * - addOrUpdateRecord: invalid JSON → jsonParseErr
 * - deleteRecord: delete an existing record → deleteOk
 * - deleteRecord: null table → tableNotSet
 * - deleteRecord: null id → idNotSet
 * - deleteRecord: nonexistent table → tableNotFound
 * - deleteRecord: nonexistent id → idNotFound
 * - after write, editor's cfgValue reflects the new state
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EditorService } from '../EditorService';
import { RecordEditService } from '../RecordEditService';

function writeFile(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const USER_CFG = `table user[id] (title='name') {
  id:int;
  name:str;
  age:int;
}
`;

const USER_CSV = `用户ID,姓名,年龄
id,name,age
1,Alice,25
2,Bob,30
`;

describe('RecordEditService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-recedit-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  async function createEditor(): Promise<EditorService> {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);
    return EditorService.create(tempDir);
  }

  // -------------------------------------------------------------------------
  // addOrUpdateRecord
  // -------------------------------------------------------------------------

  it('adds a new record → addOk', async () => {
    const editor = await createEditor();
    const result = await RecordEditService.addOrUpdateRecord(
      editor, 'user',
      JSON.stringify({ id: 3, name: 'Charlie', age: 35 }),
    );

    expect(result.resultCode).toBe('addOk');
    expect(result.table).toBe('user');
    expect(result.id).toBe('3');

    // Editor's cfgValue should reflect the new state
    const vTable = editor.cfgValue().getTable('user');
    expect(vTable).toBeDefined();
    expect(vTable!.valueList.length).toBe(3);
  });

  it('updates an existing record → updateOk', async () => {
    const editor = await createEditor();
    const result = await RecordEditService.addOrUpdateRecord(
      editor, 'user',
      JSON.stringify({ id: 1, name: 'Alice Updated', age: 26 }),
    );

    expect(result.resultCode).toBe('updateOk');
    expect(result.table).toBe('user');
    expect(result.id).toBe('1');

    // Record count stays the same
    const vTable = editor.cfgValue().getTable('user');
    expect(vTable!.valueList.length).toBe(2);
  });

  it('returns tableNotSet when table is null', async () => {
    const editor = await createEditor();
    const result = await RecordEditService.addOrUpdateRecord(
      editor, null,
      JSON.stringify({ id: 1, name: 'Test', age: 1 }),
    );

    expect(result.resultCode).toBe('tableNotSet');
    expect(result.table).toBe('');
    expect(result.id).toBe('');
  });

  it('returns tableNotFound for nonexistent table', async () => {
    const editor = await createEditor();
    const result = await RecordEditService.addOrUpdateRecord(
      editor, 'nonexistent',
      JSON.stringify({ id: 1, name: 'Test', age: 1 }),
    );

    expect(result.resultCode).toBe('tableNotFound');
    expect(result.table).toBe('nonexistent');
  });

  it('returns jsonParseErr for invalid JSON', async () => {
    const editor = await createEditor();
    const result = await RecordEditService.addOrUpdateRecord(
      editor, 'user', '{invalid json}',
    );

    expect(result.resultCode).toBe('jsonParseErr');
    expect(result.table).toBe('user');
    expect(result.valueErrs.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // deleteRecord
  // -------------------------------------------------------------------------

  it('deletes an existing record → deleteOk', async () => {
    const editor = await createEditor();
    const result = await RecordEditService.deleteRecord(editor, 'user', '1');

    expect(result.resultCode).toBe('deleteOk');
    expect(result.table).toBe('user');
    expect(result.id).toBe('1');

    // Editor's cfgValue should reflect the deletion
    const vTable = editor.cfgValue().getTable('user');
    expect(vTable!.valueList.length).toBe(1);
  });

  it('returns tableNotSet when table is null', async () => {
    const editor = await createEditor();
    const result = await RecordEditService.deleteRecord(editor, null, '1');

    expect(result.resultCode).toBe('tableNotSet');
    expect(result.table).toBe('');
    expect(result.id).toBe('');
  });

  it('returns idNotSet when id is null', async () => {
    const editor = await createEditor();
    const result = await RecordEditService.deleteRecord(editor, 'user', null);

    expect(result.resultCode).toBe('idNotSet');
    expect(result.table).toBe('user');
    expect(result.id).toBe('');
  });

  it('returns tableNotFound for nonexistent table', async () => {
    const editor = await createEditor();
    const result = await RecordEditService.deleteRecord(editor, 'nonexistent', '1');

    expect(result.resultCode).toBe('tableNotFound');
    expect(result.table).toBe('nonexistent');
  });

  it('returns idNotFound for nonexistent id', async () => {
    const editor = await createEditor();
    const result = await RecordEditService.deleteRecord(editor, 'user', '999');

    expect(result.resultCode).toBe('idNotFound');
    expect(result.table).toBe('user');
    expect(result.id).toBe('999');
  });

  // Note: 'abc' as int type currently parses to VInt(0) with errors collected,
  // but DeleteService only checks pkValue === null (not errs.length).
  // This results in idNotFound (0 not in primaryKeyMap), not idParseErr.
  // This is a pre-existing behavior in the write package's DeleteService.
});
