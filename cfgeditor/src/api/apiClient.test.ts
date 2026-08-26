/**
 * apiClient tests — T12.1
 *
 * 改造后 apiClient 直接调用 @cfgforge/editor-core 的服务类，
 * 不再经过 axios HTTP 层。测试用临时数据目录验证每个函数
 * 正确调用 editor-core 并返回符合类型契约的结果。
 *
 * 测试策略：创建临时 config.cfg + CSV 数据文件，调用 initEditor()
 * 初始化 EditorService，然后逐个验证 apiClient 导出函数。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {describe, it, expect, beforeEach, afterEach} from 'vitest';

import {initEditor, shutdownEditor} from './apiClient';

// --- 临时数据目录辅助 ---

function writeFile(dir: string, filename: string, content: string): void {
    fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

function rmSync(dir: string): void {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, {recursive: true, force: true});
    }
}

const CFG = `table user[id] {
  id:int;
  name:str;
  age:int;
}

table item[id] {
  id:int;
  name:str;
  price:float;
  owner:int ->user;
}
`;

const USER_CSV = `用户ID,姓名,年龄,好友
id,name,age,friend
1,Alice,25,2
2,Bob,30,1
3,Charlie,35,
`;

const ITEM_CSV = `物品ID,名称,价格,持有者
id,name,price,owner
1,Sword,100.5,1
2,Shield,50.0,2
`;

// ---

describe('apiClient', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-api-'));
        writeFile(tempDir, 'config.cfg', CFG);
        writeFile(tempDir, 'user.csv', USER_CSV);
        writeFile(tempDir, 'item.csv', ITEM_CSV);
        await initEditor(tempDir);
    });

    afterEach(() => {
        shutdownEditor();
        rmSync(tempDir);
    });

    // -----------------------------------------------------------------
    // fetchSchema
    // -----------------------------------------------------------------
    describe('fetchSchema', () => {
        it('returns RawSchema with items and isEditable', async () => {
            const {fetchSchema} = await import('./apiClient');
            const schema = await fetchSchema();
            expect(schema.isEditable).toBe(true);
            expect(schema.items.length).toBe(2); // user table + item table
            const tableNames = schema.items
                .filter((i) => i.type === 'table')
                .map((i) => i.name);
            expect(tableNames).toContain('user');
            expect(tableNames).toContain('item');
        });
    });

    // -----------------------------------------------------------------
    // fetchRecord
    // -----------------------------------------------------------------
    describe('fetchRecord', () => {
        it('returns record with object and refs', async () => {
            const {fetchRecord} = await import('./apiClient');
            const result = await fetchRecord('user', '1');
            expect(result.resultCode).toBe('ok');
            expect(result.table).toBe('user');
            expect(result.id).toBe('1');
            expect(result.object).not.toBeNull();
        });

        it('returns idNotFound for missing record', async () => {
            const {fetchRecord} = await import('./apiClient');
            const result = await fetchRecord('user', '999');
            expect(result.resultCode).toBe('idNotFound');
        });

        it('returns tableNotFound for unknown table', async () => {
            const {fetchRecord} = await import('./apiClient');
            const result = await fetchRecord('unknown', '1');
            expect(result.resultCode).toBe('tableNotFound');
        });
    });

    // -----------------------------------------------------------------
    // fetchRecordRefIds
    // -----------------------------------------------------------------
    describe('fetchRecordRefIds', () => {
        it('returns ref ids with depths', async () => {
            const {fetchRecordRefIds} = await import('./apiClient');
            const result = await fetchRecordRefIds('user', '1', 1, 1, 100);
            expect(result.resultCode).toBe('ok');
            expect(result.recordRefIds.length).toBeGreaterThan(0);
            // Self is depth 0
            const self = result.recordRefIds.find((r) => r.depth === 0);
            expect(self).toBeDefined();
            expect(self!.table).toBe('user');
            expect(self!.id).toBe('1');
        });
    });

    // -----------------------------------------------------------------
    // fetchRecordRefs
    // -----------------------------------------------------------------
    describe('fetchRecordRefs', () => {
        it('returns refs graph', async () => {
            const {fetchRecordRefs} = await import('./apiClient');
            const result = await fetchRecordRefs('user', '1', 2, 100, false);
            expect(result.resultCode).toBe('ok');
            expect(result.refs).not.toBeNull();
            expect(result.refs!.length).toBeGreaterThan(0);
        });

        it('with refIn=true includes inbound refs', async () => {
            const {fetchRecordRefs} = await import('./apiClient');
            const result = await fetchRecordRefs('user', '1', 2, 100, true);
            expect(result.resultCode).toBe('ok');
            expect(result.in).toBe(true);
            // User 1 is referenced by item 1 (owner → user 1)
            const refIns = result.refs!.filter((r) => r.depth === -1);
            expect(refIns.length).toBeGreaterThan(0);
        });
    });

    // -----------------------------------------------------------------
    // fetchUnreferencedRecords
    // -----------------------------------------------------------------
    describe('fetchUnreferencedRecords', () => {
        it('returns unreferenced records in a table', async () => {
            const {fetchUnreferencedRecords} = await import('./apiClient');
            const result = await fetchUnreferencedRecords('user', 100);
            expect(result.resultCode).toBe('ok');
            // User 3 (Charlie) has no inbound refs
            const charlie = result.refs!.find((r) => r.id === '3');
            expect(charlie).toBeDefined();
        });
    });

    // -----------------------------------------------------------------
    // addOrUpdateRecord
    // -----------------------------------------------------------------
    describe('addOrUpdateRecord', () => {
        it('adds a new record', async () => {
            const {addOrUpdateRecord} = await import('./apiClient');
            const json = {
                $type: 'user',
                id: 10,
                name: 'NewUser',
                age: 20,
            };
            const result = await addOrUpdateRecord('user', json);
            expect(['addOk', 'updateOk']).toContain(result.resultCode);
            expect(result.table).toBe('user');
        });

        it('updates an existing record', async () => {
            const {addOrUpdateRecord} = await import('./apiClient');
            const json = {
                $type: 'user',
                id: 1,
                name: 'AliceUpdated',
                age: 26,
            };
            const result = await addOrUpdateRecord('user', json);
            expect(result.resultCode).toBe('updateOk');
        });
    });

    // -----------------------------------------------------------------
    // deleteRecord
    // -----------------------------------------------------------------
    describe('deleteRecord', () => {
        it('deletes an existing record', async () => {
            const {deleteRecord} = await import('./apiClient');
            const result = await deleteRecord('user', '2');
            expect(result.resultCode).toBe('deleteOk');
        });

        it('returns idNotFound for missing record', async () => {
            const {deleteRecord} = await import('./apiClient');
            const result = await deleteRecord('user', '999');
            expect(result.resultCode).toBe('idNotFound');
        });
    });

    // -----------------------------------------------------------------
    // fetchNotes / updateNote
    // -----------------------------------------------------------------
    describe('fetchNotes', () => {
        it('returns notes (possibly empty if no note file)', async () => {
            const {fetchNotes} = await import('./apiClient');
            const notes = await fetchNotes();
            expect(notes).toBeDefined();
            expect(Array.isArray(notes.notes)).toBe(true);
        });
    });

    describe('updateNote', () => {
        it('adds a note', async () => {
            const {updateNote, fetchNotes} = await import('./apiClient');
            const result = await updateNote('key1', 'This is a note');
            expect(['addOk', 'updateOk']).toContain(result.resultCode);

            const notes = await fetchNotes();
            const found = notes.notes.find((n) => n.key === 'key1');
            expect(found).toBeDefined();
            expect(found!.note).toBe('This is a note');
        });

        it('deletes a note by setting empty value', async () => {
            const {updateNote, fetchNotes} = await import('./apiClient');
            await updateNote('key2', 'To be deleted');
            const result = await updateNote('key2', '');
            expect(result.resultCode).toBe('deleteOk');

            const notes = await fetchNotes();
            const found = notes.notes.find((n) => n.key === 'key2');
            expect(found).toBeUndefined();
        });
    });

    // -----------------------------------------------------------------
    // getPrompt
    // -----------------------------------------------------------------
    describe('getPrompt', () => {
        it('returns prompt for a valid table', async () => {
            const {getPrompt} = await import('./apiClient');
            const result = await getPrompt('user');
            expect(result.resultCode).toBe('ok');
            expect(result.prompt.length).toBeGreaterThan(0);
        });

        it('returns tableNotFound for unknown table', async () => {
            const {getPrompt} = await import('./apiClient');
            const result = await getPrompt('unknown');
            expect(result.resultCode).toBe('tableNotFound');
        });
    });

    // -----------------------------------------------------------------
    // checkJson
    // -----------------------------------------------------------------
    describe('checkJson', () => {
        it('validates correct JSON', async () => {
            const {checkJson} = await import('./apiClient');
            // CheckJsonService.extractJson requires ```json code block wrapping
            const json = '```json\n' + JSON.stringify({
                $type: 'user',
                id: 5,
                name: 'TestUser',
                age: 20,
            }) + '\n```';
            const result = await checkJson('user', json);
            expect(result.resultCode).toBe('ok');
            expect(result.jsonResult.length).toBeGreaterThan(0);
        });

        it('returns ParseJsonError for invalid JSON', async () => {
            const {checkJson} = await import('./apiClient');
            const result = await checkJson('user', '{invalid json}');
            expect(['ParseJsonError', 'JsonNotFound']).toContain(result.resultCode);
        });
    });

    // -----------------------------------------------------------------
    // searchServer
    // -----------------------------------------------------------------
    describe('searchServer', () => {
        it('returns search results', async () => {
            const {searchServer} = await import('./apiClient');
            const result = await searchServer('Alice', 100);
            expect(result.resultCode).toBe('ok');
            expect(result.items.length).toBeGreaterThan(0);
            expect(result.items[0].table).toBe('user');
        });

        it('returns empty for no match', async () => {
            const {searchServer} = await import('./apiClient');
            const result = await searchServer('NonExistent', 100);
            expect(result.resultCode).toBe('ok');
            expect(result.items.length).toBe(0);
        });
    });

    // -----------------------------------------------------------------
    // fetchSchemaText / writeSchemaText
    // -----------------------------------------------------------------
    describe('fetchSchemaText', () => {
        it('returns concatenated cfg text', async () => {
            const {fetchSchemaText} = await import('./apiClient');
            const result = await fetchSchemaText();
            expect(result.text).toContain('table user');
            expect(result.text).toContain('table item');
        });
    });

    describe('writeSchemaText', () => {
        it('writes valid schema text', async () => {
            const {writeSchemaText, fetchSchemaText} = await import('./apiClient');
            // Delete old CSV files so autoFix doesn't restore old tables on reload
            fs.unlinkSync(path.join(tempDir, 'user.csv'));
            fs.unlinkSync(path.join(tempDir, 'item.csv'));
            // Create matching CSV so autoFix keeps weapon table after reload
            writeFile(tempDir, 'weapon.csv', 'ID,Name,Damage\nid,name,damage\n1,Sword,100\n');
            const newSchema = `table weapon[id] {
  id:int;
  name:str;
  damage:int;
}
`;
            const result = await writeSchemaText(newSchema);
            expect(result.ok).toBe(true);
            expect(result.errors.length).toBe(0);

            const text = await fetchSchemaText();
            expect(text.text).toContain('table weapon');
        });

        it('returns errors for invalid schema', async () => {
            const {writeSchemaText} = await import('./apiClient');
            const result = await writeSchemaText('this is not valid cfg');
            expect(result.ok).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });

    // -----------------------------------------------------------------
    // createTable
    // -----------------------------------------------------------------
    describe('createTable', () => {
        it('creates a new table', async () => {
            const {createTable} = await import('./apiClient');
            const result = await createTable({
                type: 'table',
                name: 'weapon',
                fields: [
                    {name: 'id', type: 'int', comment: 'Weapon ID'},
                    {name: 'name', type: 'str', comment: 'Weapon name'},
                    {name: 'damage', type: 'int', comment: 'Damage value'},
                ],
                primaryKey: ['id'],
                withDataFile: true,
            });
            expect(result.ok).toBe(true);
        });

        it('creates a new struct', async () => {
            const {createTable} = await import('./apiClient');
            const result = await createTable({
                type: 'struct',
                name: 'Stats',
                fields: [
                    {name: 'hp', type: 'int'},
                    {name: 'mp', type: 'int'},
                ],
            });
            expect(result.ok).toBe(true);
        });

        it('returns error for duplicate name', async () => {
            const {createTable} = await import('./apiClient');
            const result = await createTable({
                type: 'table',
                name: 'user',
                fields: [{name: 'id', type: 'int'}],
                primaryKey: ['id'],
            });
            expect(result.ok).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });

    // -----------------------------------------------------------------
    // createDataFile
    // -----------------------------------------------------------------
    describe('createDataFile', () => {
        it('creates an empty CSV data file for a table', async () => {
            // Create a table WITH data file so autoFix keeps it after reload
            const {createTable, createDataFile} = await import('./apiClient');
            await createTable({
                type: 'table',
                name: 'quest',
                fields: [
                    {name: 'id', type: 'int'},
                    {name: 'title', type: 'str'},
                ],
                primaryKey: ['id'],
                withDataFile: true, // creates quest.csv so autoFix won't delete it
            });

            // Delete the CSV so createDataFile has work to do
            fs.unlinkSync(path.join(tempDir, 'quest.csv'));

            const result = await createDataFile('quest');
            expect(result.ok).toBe(true);
            // Verify CSV file exists
            expect(fs.existsSync(path.join(tempDir, 'quest.csv'))).toBe(true);
        });

        it('returns error when data file already exists', async () => {
            const {createDataFile} = await import('./apiClient');
            // user.csv already exists
            const result = await createDataFile('user');
            expect(result.ok).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });
});
