/**
 * Tests for VTableJsonParser — TypeScript port of Java `configgen.value.VTableJsonParser`.
 *
 * VTableJsonParser reads JSON files from disk (via JsonTableFiles port),
 * parses each into a VStruct (using ValueJsonParser), extracts the primary
 * key, tracks lastModified times in CfgValueStat, and creates a VTable
 * (via VTableCreator).
 *
 * Since VTableJsonParser reads actual files, tests use a mock JsonTableFiles
 * implementation that returns in-memory JsonFileInfo objects pointing to
 * real temp files.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { VTableJsonParser } from '../VTableJsonParser';
import { CfgValueErrs, jsonFileReadErr } from '../CfgValueErrs';
import { CfgValueStat, VTable, VStruct, VInt, VString } from '../CfgValue';
import { ValueUtil } from '../ValueUtil';
import { DFile, JsonFileInfo, type JsonTableFiles } from '@cfggen/data';
import {
  Primitive,
  TableSchema,
  StructSchema,
  KeySchema,
  ENo,
  Metadata_of,
  AutoOrPack,
  FieldSchema,
} from '@cfggen/schema';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFieldSchema(name: string, type: any): FieldSchema {
  return new FieldSchema(name, type, AutoOrPack.AUTO, Metadata_of());
}

function makeTableSchema(name: string, fields: FieldSchema[], pkName: string = 'id'): TableSchema {
  const pk = new KeySchema([pkName]);
  // Set fieldSchemas so findFieldIndices works without CfgSchemaResolver
  const pkFieldSchema = fields.find(f => f.name === pkName);
  if (pkFieldSchema) {
    pk.setFieldSchemas([pkFieldSchema]);
  }
  return new TableSchema(
    name,
    pk,
    ENo.NO,
    false,
    Metadata_of(),
    fields,
    [],
    [],
  );
}

function makeErrs(): CfgValueErrs {
  return CfgValueErrs.of();
}

/**
 * Mock JsonTableFiles that returns a fixed list of JsonFileInfo.
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

/**
 * Creates a temp JSON file and returns JsonFileInfo for it.
 */
function createTempJsonFile(dir: string, relativePath: string, content: string): JsonFileInfo {
  const fullPath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
  const absPath = path.resolve(fullPath);
  return JsonFileInfo.of(absPath, relativePath);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VTableJsonParser', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vtablejson-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // --- Basic parsing ---

  test('parses single JSON file into VTable', () => {
    const ts = makeTableSchema('T', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('name', Primitive.STRING),
    ]);
    const errs = makeErrs();
    const stat = new CfgValueStat();
    const mockFiles = new MockJsonTableFiles();
    const jf = createTempJsonFile(tempDir, '1.json', '{"id": 1, "name": "alice"}');
    mockFiles.setFiles('T', [jf]);

    const parser = new VTableJsonParser(ts, false, mockFiles, ts, errs, stat);
    const vtable = parser.parseTable();

    expect(vtable).toBeInstanceOf(VTable);
    expect(vtable.valueList).toHaveLength(1);
    expect((vtable.valueList[0].values[0] as VInt).value).toBe(1);
    expect((vtable.valueList[0].values[1] as VString).value).toBe('alice');
  });

  test('parses multiple JSON files into VTable', () => {
    const ts = makeTableSchema('T', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('name', Primitive.STRING),
    ]);
    const errs = makeErrs();
    const stat = new CfgValueStat();
    const mockFiles = new MockJsonTableFiles();
    mockFiles.setFiles('T', [
      createTempJsonFile(tempDir, '1.json', '{"id": 1, "name": "a"}'),
      createTempJsonFile(tempDir, '2.json', '{"id": 2, "name": "b"}'),
      createTempJsonFile(tempDir, '3.json', '{"id": 3, "name": "c"}'),
    ]);

    const parser = new VTableJsonParser(ts, false, mockFiles, ts, errs, stat);
    const vtable = parser.parseTable();

    expect(vtable.valueList).toHaveLength(3);
  });

  test('empty file list produces empty VTable', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('id', Primitive.INT)]);
    const errs = makeErrs();
    const stat = new CfgValueStat();
    const mockFiles = new MockJsonTableFiles();

    const parser = new VTableJsonParser(ts, false, mockFiles, ts, errs, stat);
    const vtable = parser.parseTable();

    expect(vtable.valueList).toHaveLength(0);
    expect(vtable.primaryKeyMap.size).toBe(0);
  });

  // --- Primary key map ---

  test('builds primary key map from parsed structs', () => {
    const ts = makeTableSchema('T', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('name', Primitive.STRING),
    ]);
    const errs = makeErrs();
    const stat = new CfgValueStat();
    const mockFiles = new MockJsonTableFiles();
    mockFiles.setFiles('T', [
      createTempJsonFile(tempDir, '1.json', '{"id": 10, "name": "x"}'),
      createTempJsonFile(tempDir, '2.json', '{"id": 20, "name": "y"}'),
    ]);

    const parser = new VTableJsonParser(ts, false, mockFiles, ts, errs, stat);
    const vtable = parser.parseTable();

    expect(vtable.primaryKeyMap.size).toBe(2);
  });

  // --- CfgValueStat tracking ---

  test('records lastModified times in CfgValueStat', () => {
    const ts = makeTableSchema('T', [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('name', Primitive.STRING),
    ]);
    const errs = makeErrs();
    const stat = new CfgValueStat();
    const mockFiles = new MockJsonTableFiles();
    mockFiles.setFiles('T', [
      createTempJsonFile(tempDir, '1.json', '{"id": 1, "name": "a"}'),
      createTempJsonFile(tempDir, '2.json', '{"id": 2, "name": "b"}'),
    ]);

    const parser = new VTableJsonParser(ts, false, mockFiles, ts, errs, stat);
    parser.parseTable();

    const modMap = stat.getLastModifiedMap();
    expect(modMap.has('T')).toBe(true);
    const tableMap = modMap.get('T')!;
    expect(tableMap.size).toBe(2);
    expect(tableMap.has('1')).toBe(true);
    expect(tableMap.has('2')).toBe(true);
  });

  // --- Error handling ---

  test('file read error is reported and skipped', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('id', Primitive.INT)]);
    const errs = makeErrs();
    const stat = new CfgValueStat();
    const mockFiles = new MockJsonTableFiles();
    // Point to a non-existent file
    const jf = new JsonFileInfo(0, path.join(tempDir, 'nonexistent.json'), 'nonexistent.json', false, -1);
    mockFiles.setFiles('T', [jf]);

    const parser = new VTableJsonParser(ts, false, mockFiles, ts, errs, stat);
    const vtable = parser.parseTable();

    expect(vtable.valueList).toHaveLength(0);
    expect(errs.errs.length).toBeGreaterThan(0);
  });

  test('invalid JSON content reports error but continues', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('id', Primitive.INT)]);
    const errs = makeErrs();
    const stat = new CfgValueStat();
    const mockFiles = new MockJsonTableFiles();
    mockFiles.setFiles('T', [
      createTempJsonFile(tempDir, '1.json', '{invalid}'),
    ]);

    const parser = new VTableJsonParser(ts, false, mockFiles, ts, errs, stat);
    const vtable = parser.parseTable();

    // ValueJsonParser returns default struct on parse error, so we still get 1 entry
    expect(vtable.valueList).toHaveLength(1);
    expect(errs.errs.length).toBeGreaterThan(0);
  });

  // --- isPartial mode ---

  test('isPartial=true suppresses extra field warnings', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('id', Primitive.INT)]);
    const errs = makeErrs();
    const stat = new CfgValueStat();
    const mockFiles = new MockJsonTableFiles();
    mockFiles.setFiles('T', [
      createTempJsonFile(tempDir, '1.json', '{"id": 1, "extra": 2}'),
    ]);

    const parser = new VTableJsonParser(ts, true, mockFiles, ts, errs, stat);
    parser.parseTable();

    expect(errs.warns.length).toBe(0);
  });

  test('isPartial=false triggers extra field warnings', () => {
    const ts = makeTableSchema('T', [makeFieldSchema('id', Primitive.INT)]);
    const errs = makeErrs();
    const stat = new CfgValueStat();
    const mockFiles = new MockJsonTableFiles();
    mockFiles.setFiles('T', [
      createTempJsonFile(tempDir, '1.json', '{"id": 1, "extra": 2}'),
    ]);

    const parser = new VTableJsonParser(ts, false, mockFiles, ts, errs, stat);
    parser.parseTable();

    expect(errs.warns.length).toBeGreaterThan(0);
  });

  // --- subTableSchema vs tableSchema ---

  test('uses subTableSchema for parsing and tableSchema name for file lookup', () => {
    // Create a sub-table schema (e.g. for nested struct as table)
    const subFields = [
      makeFieldSchema('id', Primitive.INT),
      makeFieldSchema('val', Primitive.STRING),
    ];
    const subPk = new KeySchema(['id']);
    subPk.setFieldSchemas([subFields[0]]);
    const subTs = new TableSchema(
      'T.Inner',
      subPk,
      ENo.NO,
      false,
      Metadata_of(),
      subFields,
      [],
      [],
    );
    const tablePk = new KeySchema(['id']);
    tablePk.setFieldSchemas([subFields[0]]);
    const tableTs = new TableSchema(
      'T',
      tablePk,
      ENo.NO,
      false,
      Metadata_of(),
      subFields,
      [],
      [],
    );

    const errs = makeErrs();
    const stat = new CfgValueStat();
    const mockFiles = new MockJsonTableFiles();
    mockFiles.setFiles('T', [
      createTempJsonFile(tempDir, '1.json', '{"id": 5, "val": "hello"}'),
    ]);

    const parser = new VTableJsonParser(subTs, false, mockFiles, tableTs, errs, stat);
    const vtable = parser.parseTable();

    expect(vtable.valueList).toHaveLength(1);
    expect((vtable.valueList[0].values[0] as VInt).value).toBe(5);
    expect((vtable.valueList[0].values[1] as VString).value).toBe('hello');
  });
});
