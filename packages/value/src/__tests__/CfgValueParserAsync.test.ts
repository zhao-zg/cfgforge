/**
 * CfgValueParserAsync tests — Task 6
 *
 * 验证 parseCfgValueAsync 异步解析管线：
 * 1. Excel/CSV 路径（DTable 存在时，仍走同步 VTableParser）
 * 2. JSON 路径（DTable 不存在时，走异步 VTableJsonParser.parseTableAsync）
 * 3. 同步 vs 异步结果等价性
 * 4. 多表混合（Excel + JSON）
 * 5. 空 schema、错误处理
 * 6. RefValidator 在异步路径也被调用
 *
 * 测试策略：使用 NodeFileSystem（支持同步和异步），创建临时 JSON 文件，
 * 喂 fixture 断言输出。遵循项目约定"不 mock"。
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {CfgValueParser} from '../CfgValueParser';
import {CfgValueErrs} from '../CfgValueErrs';
import {ValueEnv} from '../ValueEnv';
import {CfgValueStat, VTable, VInt, VString} from '../CfgValue';
import {DCell, DRowId, DTable, CfgData, CfgDataStat, HeadRows, JsonFileInfo, type JsonTableFiles} from '@cfgforge/data';
import {
  CfgSchema,
  TableSchema,
  KeySchema,
  FieldSchema,
  Metadata_of,
  Primitive,
  AutoOrPack,
  ENo,
  ForeignKeySchema,
  RefPrimary,
  fieldSpan,
} from '@cfgforge/schema';
import {setDefaultFileSystem} from '@cfgforge/shared';
import {NodeFileSystem} from '@cfgforge/shared';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Helpers (mirrors CfgValueParser.test.ts)
// ---------------------------------------------------------------------------

function makeFieldSchema(name: string, type: any): FieldSchema {
  return new FieldSchema(name, type, AutoOrPack.AUTO, Metadata_of());
}

function makeTableSchema(
  name: string,
  fields: FieldSchema[],
  pkFields: string[],
  foreignKeys: ForeignKeySchema[] = [],
): TableSchema {
  const pk = new KeySchema(pkFields);
  const pkFieldSchemas = pkFields.map((fName) => {
    const f = fields.find((f) => f.name === fName);
    if (!f) throw new Error(`pk field ${fName} not found`);
    return f;
  });
  pk.setFieldSchemas(pkFieldSchemas);

  const meta = Metadata_of();
  let totalSpan = 0;
  for (const f of fields) {
    totalSpan += fieldSpan(f);
  }
  meta.putSpan(totalSpan);

  return new TableSchema(
    name,
    pk,
    ENo.NO,
    false,
    meta,
    fields,
    foreignKeys,
    [],
  );
}

function makeForeignKey(
  name: string,
  keyFields: string[],
  refTable: string,
  refKey: RefPrimary,
  localFields: FieldSchema[],
): ForeignKeySchema {
  const fkKey = new KeySchema(keyFields);
  fkKey.setFieldSchemas(localFields);
  return new ForeignKeySchema(name, fkKey, refTable, refKey, Metadata_of());
}

function makeCfgSchemaWithTables(tables: TableSchema[]): CfgSchema {
  const schema = CfgSchema.of();
  for (const t of tables) {
    schema.add(t);
  }
  schema.resolve();
  return schema;
}

function makeCell(value: string, row: number, col: number): DCell {
  return new DCell(value, new DRowId('test.csv', '', row), col, 0);
}

function makeDTable(rows: DCell[][]): DTable {
  return new DTable('test', [], rows, [], null);
}

function makeCfgDataWithTables(tableMap: Map<string, DTable>): CfgData {
  return new CfgData(tableMap, new CfgDataStat());
}

/**
 * Mock JsonTableFiles that returns a fixed list of JsonFileInfo.
 * Points to real temp files on disk (read via NodeFileSystem async readFile).
 */
class MockJsonTableFiles implements JsonTableFiles {
  private files: Map<string, JsonFileInfo[]> = new Map();

  setFiles(tableName: string, files: JsonFileInfo[]): void {
    this.files.set(tableName, files);
  }

  jsonFilesOf(tableName: string): JsonFileInfo[] {
    return this.files.get(tableName) ?? [];
  }
}

function createTempJsonFile(dir: string, relativePath: string, content: string): JsonFileInfo {
  const fullPath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), {recursive: true});
  fs.writeFileSync(fullPath, content, 'utf-8');
  const absPath = path.resolve(fullPath);
  return JsonFileInfo.of(absPath, relativePath);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CfgValueParserAsync', () => {
  let tempDir: string;

  beforeEach(() => {
    setDefaultFileSystem(new NodeFileSystem());
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgvalueparser-async-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, {recursive: true, force: true});
  });

  // -------------------------------------------------------------------------
  // Excel/CSV path (DTable exists — sync path within async method)
  // -------------------------------------------------------------------------

  it('should parse a single table from Excel data (async method, sync DTable path)', async () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const tableSchema = makeTableSchema('item', [idField, nameField], ['id']);
    const fullSchema = makeCfgSchemaWithTables([tableSchema]);

    const dTable = makeDTable([
      [makeCell('1', 0, 0), makeCell('sword', 0, 1)],
      [makeCell('2', 1, 0), makeCell('shield', 1, 1)],
    ]);

    const cfgData = makeCfgDataWithTables(new Map([['item', dTable]]));
    const errs = CfgValueErrs.of();
    const mockJsonFiles = new MockJsonTableFiles();
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, mockJsonFiles);

    const parser = new CfgValueParser(fullSchema, env, errs);
    const cfgValue = await parser.parseCfgValueAsync();

    expect(cfgValue).toBeDefined();
    const vTable = cfgValue.getTable('item');
    expect(vTable).toBeDefined();
    expect(vTable!.valueList).toHaveLength(2);
    expect(vTable!.primaryKeyMap.size).toBe(2);
  });

  // -------------------------------------------------------------------------
  // JSON path (no DTable — async VTableJsonParser.parseTableAsync)
  // -------------------------------------------------------------------------

  it('should parse a table from JSON files via async path', async () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const tableSchema = makeTableSchema('item', [idField, nameField], ['id']);
    const fullSchema = makeCfgSchemaWithTables([tableSchema]);

    // No DTable → VTableJsonParser async path
    const cfgData = makeCfgDataWithTables(new Map());
    const mockJsonFiles = new MockJsonTableFiles();
    mockJsonFiles.setFiles('item', [
      createTempJsonFile(tempDir, '1.json', '{"id": 1, "name": "alice"}'),
      createTempJsonFile(tempDir, '2.json', '{"id": 2, "name": "bob"}'),
    ]);

    const errs = CfgValueErrs.of();
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, mockJsonFiles);

    const parser = new CfgValueParser(fullSchema, env, errs);
    const cfgValue = await parser.parseCfgValueAsync();

    expect(cfgValue).toBeDefined();
    const vTable = cfgValue.getTable('item');
    expect(vTable).toBeDefined();
    expect(vTable!.valueList).toHaveLength(2);
    expect(vTable!.primaryKeyMap.size).toBe(2);
    // Verify actual values
    expect((vTable!.valueList[0].values[0] as VInt).value).toBe(1);
    expect((vTable!.valueList[0].values[1] as VString).value).toBe('alice');
  });

  // -------------------------------------------------------------------------
  // Sync vs Async equivalence
  // -------------------------------------------------------------------------

  it('should produce same results for sync and async on Excel data', async () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const tableSchema = makeTableSchema('item', [idField, nameField], ['id']);
    const fullSchema = makeCfgSchemaWithTables([tableSchema]);

    const dTable = makeDTable([
      [makeCell('1', 0, 0), makeCell('sword', 0, 1)],
      [makeCell('2', 1, 0), makeCell('shield', 1, 1)],
      [makeCell('3', 2, 0), makeCell('potion', 2, 1)],
    ]);

    const cfgData = makeCfgDataWithTables(new Map([['item', dTable]]));
    const mockJsonFiles = new MockJsonTableFiles();

    // Sync
    const errsSync = CfgValueErrs.of();
    const envSync = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, mockJsonFiles);
    const parserSync = new CfgValueParser(fullSchema, envSync, errsSync);
    const cfgValueSync = parserSync.parseCfgValue();

    // Async
    const errsAsync = CfgValueErrs.of();
    const envAsync = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, mockJsonFiles);
    const parserAsync = new CfgValueParser(fullSchema, envAsync, errsAsync);
    const cfgValueAsync = await parserAsync.parseCfgValue();

    // Compare
    const syncTable = cfgValueSync.getTable('item');
    const asyncTable = cfgValueAsync.getTable('item');
    expect(syncTable!.valueList).toHaveLength(3);
    expect(asyncTable!.valueList).toHaveLength(3);
    expect(asyncTable!.primaryKeyMap.size).toBe(syncTable!.primaryKeyMap.size);
    // Compare values
    for (let i = 0; i < 3; i++) {
      expect((asyncTable!.valueList[i].values[0] as VInt).value).toBe(
        (syncTable!.valueList[i].values[0] as VInt).value,
      );
      expect((asyncTable!.valueList[i].values[1] as VString).value).toBe(
        (syncTable!.valueList[i].values[1] as VString).value,
      );
    }
    // Compare errors
    expect(errsAsync.errs.length).toBe(errsSync.errs.length);
  });

  it('should produce same results for sync and async on JSON data', async () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const tableSchema = makeTableSchema('item', [idField, nameField], ['id']);
    const fullSchema = makeCfgSchemaWithTables([tableSchema]);

    const cfgData = makeCfgDataWithTables(new Map());
    const mockJsonFiles = new MockJsonTableFiles();
    mockJsonFiles.setFiles('item', [
      createTempJsonFile(tempDir, '1.json', '{"id": 10, "name": "x"}'),
      createTempJsonFile(tempDir, '2.json', '{"id": 20, "name": "y"}'),
    ]);

    // Sync
    const errsSync = CfgValueErrs.of();
    const envSync = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, mockJsonFiles);
    const parserSync = new CfgValueParser(fullSchema, envSync, errsSync);
    const cfgValueSync = parserSync.parseCfgValue();

    // Async
    const errsAsync = CfgValueErrs.of();
    const envAsync = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, mockJsonFiles);
    const parserAsync = new CfgValueParser(fullSchema, envAsync, errsAsync);
    const cfgValueAsync = await parserAsync.parseCfgValueAsync();

    const syncTable = cfgValueSync.getTable('item');
    const asyncTable = cfgValueAsync.getTable('item');
    expect(asyncTable!.valueList).toHaveLength(syncTable!.valueList.length);
    expect(asyncTable!.primaryKeyMap.size).toBe(syncTable!.primaryKeyMap.size);
    for (let i = 0; i < syncTable!.valueList.length; i++) {
      expect((asyncTable!.valueList[i].values[0] as VInt).value).toBe(
        (syncTable!.valueList[i].values[0] as VInt).value,
      );
      expect((asyncTable!.valueList[i].values[1] as VString).value).toBe(
        (syncTable!.valueList[i].values[1] as VString).value,
      );
    }
  });

  // -------------------------------------------------------------------------
  // Mixed Excel + JSON tables
  // -------------------------------------------------------------------------

  it('should handle mixed Excel and JSON tables in async path', async () => {
    // Table 1: Excel data
    const idField1 = makeFieldSchema('id', Primitive.INT);
    const nameField1 = makeFieldSchema('name', Primitive.STRING);
    const tableSchema1 = makeTableSchema('item', [idField1, nameField1], ['id']);

    // Table 2: JSON-only (no DTable)
    const idField2 = makeFieldSchema('id', Primitive.INT);
    const valField2 = makeFieldSchema('val', Primitive.INT);
    const tableSchema2 = makeTableSchema('prop', [idField2, valField2], ['id']);

    const fullSchema = makeCfgSchemaWithTables([tableSchema1, tableSchema2]);

    const dTable1 = makeDTable([
      [makeCell('1', 0, 0), makeCell('a', 0, 1)],
    ]);

    // Only item has DTable, prop does not
    const cfgData = makeCfgDataWithTables(new Map([['item', dTable1]]));

    const mockJsonFiles = new MockJsonTableFiles();
    mockJsonFiles.setFiles('prop', [
      createTempJsonFile(tempDir, 'prop/1.json', '{"id": 100, "val": 42}'),
    ]);

    const errs = CfgValueErrs.of();
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, mockJsonFiles);

    const parser = new CfgValueParser(fullSchema, env, errs);
    const cfgValue = await parser.parseCfgValueAsync();

    // item parsed from Excel (sync within async)
    const itemTable = cfgValue.getTable('item');
    expect(itemTable).toBeDefined();
    expect(itemTable!.valueList).toHaveLength(1);

    // prop parsed from JSON (async)
    const propTable = cfgValue.getTable('prop');
    expect(propTable).toBeDefined();
    expect(propTable!.valueList).toHaveLength(1);
    expect((propTable!.valueList[0].values[0] as VInt).value).toBe(100);
    expect((propTable!.valueList[0].values[1] as VInt).value).toBe(42);
  });

  // -------------------------------------------------------------------------
  // Empty schema
  // -------------------------------------------------------------------------

  it('should handle empty schema gracefully (async)', async () => {
    const fullSchema = makeCfgSchemaWithTables([]);
    const cfgData = makeCfgDataWithTables(new Map());
    const errs = CfgValueErrs.of();
    const mockJsonFiles = new MockJsonTableFiles();
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, mockJsonFiles);

    const parser = new CfgValueParser(fullSchema, env, errs);
    const cfgValue = await parser.parseCfgValueAsync();

    expect(cfgValue).toBeDefined();
    expect(cfgValue.vTableMap.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Error handling: file not found
  // -------------------------------------------------------------------------

  it('should report error for missing JSON file but not crash (async)', async () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const tableSchema = makeTableSchema('item', [idField], ['id']);
    const fullSchema = makeCfgSchemaWithTables([tableSchema]);

    const cfgData = makeCfgDataWithTables(new Map());
    const mockJsonFiles = new MockJsonTableFiles();
    // Point to a non-existent file
    const jf = new JsonFileInfo(0, path.join(tempDir, 'nonexistent.json'), 'nonexistent.json', false, -1);
    mockJsonFiles.setFiles('item', [jf]);

    const errs = CfgValueErrs.of();
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, mockJsonFiles);

    const parser = new CfgValueParser(fullSchema, env, errs);
    const cfgValue = await parser.parseCfgValueAsync();

    expect(cfgValue).toBeDefined();
    const vTable = cfgValue.getTable('item');
    expect(vTable).toBeDefined();
    expect(vTable!.valueList).toHaveLength(0);
    expect(errs.errs.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Error handling: invalid JSON content
  // -------------------------------------------------------------------------

  it('should handle invalid JSON content gracefully (async)', async () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const tableSchema = makeTableSchema('item', [idField, nameField], ['id']);
    const fullSchema = makeCfgSchemaWithTables([tableSchema]);

    const cfgData = makeCfgDataWithTables(new Map());
    const mockJsonFiles = new MockJsonTableFiles();
    mockJsonFiles.setFiles('item', [
      createTempJsonFile(tempDir, 'bad.json', '{invalid}'),
    ]);

    const errs = CfgValueErrs.of();
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, mockJsonFiles);

    const parser = new CfgValueParser(fullSchema, env, errs);
    const cfgValue = await parser.parseCfgValueAsync();

    // ValueJsonParser returns default struct on parse error, so we still get 1 entry
    const vTable = cfgValue.getTable('item');
    expect(vTable).toBeDefined();
    expect(vTable!.valueList).toHaveLength(1);
    expect(errs.errs.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // RefValidator called in async path
  // -------------------------------------------------------------------------

  it('should call RefValidator and collect reference errors (async)', async () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const refField = makeFieldSchema('refId', Primitive.INT);
    const fk = makeForeignKey('refId', ['refId'], 'reftable', new RefPrimary(false), [refField]);
    const itemSchema = makeTableSchema('item', [idField, refField], ['id'], [fk]);

    const refIdField = makeFieldSchema('id', Primitive.INT);
    const refNameField = makeFieldSchema('name', Primitive.STRING);
    const refTableSchema = makeTableSchema('reftable', [refIdField, refNameField], ['id']);

    const fullSchema = makeCfgSchemaWithTables([itemSchema, refTableSchema]);

    // item references refId=100 (not in reftable)
    const dTableItem = makeDTable([
      [makeCell('1', 0, 0), makeCell('100', 0, 1)],
    ]);
    const dTableRef = makeDTable([
      [makeCell('1', 0, 0), makeCell('goblin', 0, 1)],
    ]);

    const cfgData = makeCfgDataWithTables(new Map([
      ['item', dTableItem],
      ['reftable', dTableRef],
    ]));
    const errs = CfgValueErrs.of();
    const mockJsonFiles = new MockJsonTableFiles();
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, mockJsonFiles);

    const parser = new CfgValueParser(fullSchema, env, errs);
    const cfgValue = await parser.parseCfgValueAsync();

    expect(cfgValue).toBeDefined();
    expect(errs.errs.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Multiple JSON files for one table
  // -------------------------------------------------------------------------

  it('should parse multiple JSON files for one table (async)', async () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const tableSchema = makeTableSchema('item', [idField, nameField], ['id']);
    const fullSchema = makeCfgSchemaWithTables([tableSchema]);

    const cfgData = makeCfgDataWithTables(new Map());
    const mockJsonFiles = new MockJsonTableFiles();
    mockJsonFiles.setFiles('item', [
      createTempJsonFile(tempDir, '1.json', '{"id": 1, "name": "a"}'),
      createTempJsonFile(tempDir, '2.json', '{"id": 2, "name": "b"}'),
      createTempJsonFile(tempDir, '3.json', '{"id": 3, "name": "c"}'),
    ]);

    const errs = CfgValueErrs.of();
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, mockJsonFiles);

    const parser = new CfgValueParser(fullSchema, env, errs);
    const cfgValue = await parser.parseCfgValueAsync();

    const vTable = cfgValue.getTable('item');
    expect(vTable!.valueList).toHaveLength(3);
    expect(vTable!.primaryKeyMap.size).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Constructor validation (same as sync)
  // -------------------------------------------------------------------------

  it('should throw if subSchema is null (async constructor)', () => {
    const fullSchema = makeCfgSchemaWithTables([]);
    const cfgData = makeCfgDataWithTables(new Map());
    const errs = CfgValueErrs.of();
    const mockJsonFiles = new MockJsonTableFiles();
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, mockJsonFiles);

    expect(() => new CfgValueParser(null as any, env, errs)).toThrow();
  });

  it('should throw if env is null (async constructor)', () => {
    const fullSchema = makeCfgSchemaWithTables([]);
    const errs = CfgValueErrs.of();

    expect(() => new CfgValueParser(fullSchema, null as any, errs)).toThrow();
  });

  it('should throw if errs is null (async constructor)', () => {
    const fullSchema = makeCfgSchemaWithTables([]);
    const cfgData = makeCfgDataWithTables(new Map());
    const mockJsonFiles = new MockJsonTableFiles();
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, mockJsonFiles);

    expect(() => new CfgValueParser(fullSchema, env, null as any)).toThrow();
  });

  // -------------------------------------------------------------------------
  // Multiple Excel tables
  // -------------------------------------------------------------------------

  it('should parse multiple tables from Excel data (async)', async () => {
    const idField1 = makeFieldSchema('id', Primitive.INT);
    const nameField1 = makeFieldSchema('name', Primitive.STRING);
    const tableSchema1 = makeTableSchema('item', [idField1, nameField1], ['id']);

    const idField2 = makeFieldSchema('id', Primitive.INT);
    const valField2 = makeFieldSchema('val', Primitive.INT);
    const tableSchema2 = makeTableSchema('prop', [idField2, valField2], ['id']);

    const fullSchema = makeCfgSchemaWithTables([tableSchema1, tableSchema2]);

    const dTable1 = makeDTable([
      [makeCell('1', 0, 0), makeCell('a', 0, 1)],
      [makeCell('2', 1, 0), makeCell('b', 1, 1)],
    ]);
    const dTable2 = makeDTable([
      [makeCell('10', 0, 0), makeCell('100', 0, 1)],
    ]);

    const cfgData = makeCfgDataWithTables(new Map([
      ['item', dTable1],
      ['prop', dTable2],
    ]));

    const errs = CfgValueErrs.of();
    const mockJsonFiles = new MockJsonTableFiles();
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, mockJsonFiles);

    const parser = new CfgValueParser(fullSchema, env, errs);
    const cfgValue = await parser.parseCfgValueAsync();

    const itemTable = cfgValue.getTable('item');
    expect(itemTable!.valueList).toHaveLength(2);

    const propTable = cfgValue.getTable('prop');
    expect(propTable!.valueList).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Null langFinder = no crash (async)
  // -------------------------------------------------------------------------

  it('should not crash with null langFinder (async)', async () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const tableSchema = makeTableSchema('item', [idField, nameField], ['id']);
    const fullSchema = makeCfgSchemaWithTables([tableSchema]);

    const dTable = makeDTable([
      [makeCell('1', 0, 0), makeCell('sword', 0, 1)],
    ]);

    const cfgData = makeCfgDataWithTables(new Map([['item', dTable]]));
    const errs = CfgValueErrs.of();
    const mockJsonFiles = new MockJsonTableFiles();
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, mockJsonFiles);

    const parser = new CfgValueParser(fullSchema, env, errs);
    const cfgValue = await parser.parseCfgValueAsync();

    expect(cfgValue).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // CfgValueStat tracking (async JSON path)
  // -------------------------------------------------------------------------

  it('should track lastModified in CfgValueStat for JSON tables (async)', async () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const tableSchema = makeTableSchema('item', [idField, nameField], ['id']);
    const fullSchema = makeCfgSchemaWithTables([tableSchema]);

    const cfgData = makeCfgDataWithTables(new Map());
    const mockJsonFiles = new MockJsonTableFiles();
    mockJsonFiles.setFiles('item', [
      createTempJsonFile(tempDir, '1.json', '{"id": 1, "name": "a"}'),
      createTempJsonFile(tempDir, '2.json', '{"id": 2, "name": "b"}'),
    ]);

    const errs = CfgValueErrs.of();
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, mockJsonFiles);

    const parser = new CfgValueParser(fullSchema, env, errs);
    const cfgValue = await parser.parseCfgValueAsync();

    // CfgValueStat should have lastModified entries for the 'item' table
    const modMap = cfgValue.valueStat.getLastModifiedMap();
    expect(modMap.has('item')).toBe(true);
    const tableMap = modMap.get('item')!;
    expect(tableMap.size).toBe(2);
    expect(tableMap.has('1')).toBe(true);
    expect(tableMap.has('2')).toBe(true);
  });
});
