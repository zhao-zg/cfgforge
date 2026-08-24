/**
 * CfgValueParser tests — T4.4
 *
 * Tests the value parsing orchestrator:
 * - parseCfgValue with Excel data (DTable path)
 * - parseCfgValue with JSON data (VTableJsonParser path)
 * - parseCfgValue with mixed (some Excel, some JSON)
 * - parseCfgValue with no data (empty subSchema)
 * - error collection from multiple tables merged
 * - RefValidator called after parsing
 * - TextValue.setTranslatedForTable called (null langFinder = no-op)
 */

import { describe, it, expect } from 'vitest';
import { CfgValueParser } from '../CfgValueParser';
import { CfgValueErrs } from '../CfgValueErrs';
import { ValueEnv } from '../ValueEnv';
import { LangTextFinder } from '../LangTextFinder';
import { DCell, DRowId, DTable, CfgData, CfgDataStat, HeadRows } from '@cfggen/data';
import type { JsonTableFiles } from '@cfggen/data';
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
} from '@cfggen/schema';

// ---------------------------------------------------------------------------
// Helpers
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

function makeEmptyJsonTableFiles(): JsonTableFiles {
  return {
    jsonFilesOf: (_tableName: string) => [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CfgValueParser', () => {

  // -------------------------------------------------------------------------
  // Parse with Excel data (DTable path)
  // -------------------------------------------------------------------------

  it('should parse a single table from Excel data', () => {
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
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, makeEmptyJsonTableFiles());

    const parser = new CfgValueParser(fullSchema, env, errs);
    const cfgValue = parser.parseCfgValue();

    expect(cfgValue).toBeDefined();
    const vTable = cfgValue.getTable('item');
    expect(vTable).toBeDefined();
    expect(vTable!.valueList).toHaveLength(2);
    expect(vTable!.primaryKeyMap.size).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Parse with no data (empty schema)
  // -------------------------------------------------------------------------

  it('should handle empty schema gracefully', () => {
    const fullSchema = makeCfgSchemaWithTables([]);
    const cfgData = makeCfgDataWithTables(new Map());
    const errs = CfgValueErrs.of();
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, makeEmptyJsonTableFiles());

    const parser = new CfgValueParser(fullSchema, env, errs);
    const cfgValue = parser.parseCfgValue();

    expect(cfgValue).toBeDefined();
    expect(cfgValue.vTableMap.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Parse with JSON data (no DTable → VTableJsonParser path)
  // -------------------------------------------------------------------------

  it('should parse a table from JSON data when no DTable exists', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const tableSchema = makeTableSchema('item', [idField, nameField], ['id']);
    const fullSchema = makeCfgSchemaWithTables([tableSchema]);

    // No DTable → VTableJsonParser path
    const cfgData = makeCfgDataWithTables(new Map());

    // Create a mock JsonTableFiles that returns an empty list
    // (file doesn't actually exist, so VTableJsonParser will add a read error
    //  but should not crash)
    const mockJsonFiles: JsonTableFiles = {
      jsonFilesOf: (_tableName: string) => [],
    };

    const errs = CfgValueErrs.of();
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, mockJsonFiles);

    const parser = new CfgValueParser(fullSchema, env, errs);
    const cfgValue = parser.parseCfgValue();

    expect(cfgValue).toBeDefined();
    // No JSON files → empty table, but should not crash
    const vTable = cfgValue.getTable('item');
    // VTable should exist (even with 0 records) since the table is in schema
    expect(vTable).toBeDefined();
    expect(vTable!.valueList).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Parse with mixed data (some Excel, some JSON)
  // -------------------------------------------------------------------------

  it('should handle mixed Excel and JSON tables', () => {
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

    const mockJsonFiles: JsonTableFiles = {
      jsonFilesOf: (_tableName: string) => [],
    };

    const errs = CfgValueErrs.of();
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, mockJsonFiles);

    const parser = new CfgValueParser(fullSchema, env, errs);
    const cfgValue = parser.parseCfgValue();

    // item should be parsed from Excel
    const itemTable = cfgValue.getTable('item');
    expect(itemTable).toBeDefined();
    expect(itemTable!.valueList).toHaveLength(1);

    // prop should have an empty VTable (no JSON files, no DTable)
    const propTable = cfgValue.getTable('prop');
    expect(propTable).toBeDefined();
    expect(propTable!.valueList).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Constructor validation
  // -------------------------------------------------------------------------

  it('should throw if subSchema is null', () => {
    const fullSchema = makeCfgSchemaWithTables([]);
    const cfgData = makeCfgDataWithTables(new Map());
    const errs = CfgValueErrs.of();
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, makeEmptyJsonTableFiles());

    expect(() => new CfgValueParser(null as any, env, errs)).toThrow();
  });

  it('should throw if env is null', () => {
    const fullSchema = makeCfgSchemaWithTables([]);
    const errs = CfgValueErrs.of();

    expect(() => new CfgValueParser(fullSchema, null as any, errs)).toThrow();
  });

  it('should throw if errs is null', () => {
    const fullSchema = makeCfgSchemaWithTables([]);
    const cfgData = makeCfgDataWithTables(new Map());
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, makeEmptyJsonTableFiles());

    expect(() => new CfgValueParser(fullSchema, env, null as any)).toThrow();
  });

  // -------------------------------------------------------------------------
  // RefValidator called after parsing
  // -------------------------------------------------------------------------

  it('should call RefValidator and collect reference errors', () => {
    // Create a schema with a foreign key from 'item.refId' to 'reftable.id'
    // 'reftable' has id=1, but item references id=100 (not found)
    const idField = makeFieldSchema('id', Primitive.INT);
    const refField = makeFieldSchema('refId', Primitive.INT);
    const fk = makeForeignKey('refId', ['refId'], 'reftable', new RefPrimary(false), [refField]);
    const itemSchema = makeTableSchema('item', [idField, refField], ['id'], [fk]);

    // reftable must exist in schema so FK resolution succeeds
    const refIdField = makeFieldSchema('id', Primitive.INT);
    const refNameField = makeFieldSchema('name', Primitive.STRING);
    const refTableSchema = makeTableSchema('reftable', [refIdField, refNameField], ['id']);

    const fullSchema = makeCfgSchemaWithTables([itemSchema, refTableSchema]);

    // item has a row referencing refId=100 (not in reftable)
    const dTableItem = makeDTable([
      [makeCell('1', 0, 0), makeCell('100', 0, 1)],
    ]);
    // reftable has id=1 only
    const dTableRef = makeDTable([
      [makeCell('1', 0, 0), makeCell('goblin', 0, 1)],
    ]);

    const cfgData = makeCfgDataWithTables(new Map([
      ['item', dTableItem],
      ['reftable', dTableRef],
    ]));
    const errs = CfgValueErrs.of();
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, makeEmptyJsonTableFiles());

    const parser = new CfgValueParser(fullSchema, env, errs);
    const cfgValue = parser.parseCfgValue();

    // Should have reference errors (refId=100 doesn't exist in reftable)
    expect(errs.errs.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Null langFinder = no crash
  // -------------------------------------------------------------------------

  it('should not crash with null langFinder', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const tableSchema = makeTableSchema('item', [idField, nameField], ['id']);
    const fullSchema = makeCfgSchemaWithTables([tableSchema]);

    const dTable = makeDTable([
      [makeCell('1', 0, 0), makeCell('sword', 0, 1)],
    ]);

    const cfgData = makeCfgDataWithTables(new Map([['item', dTable]]));
    const errs = CfgValueErrs.of();
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, makeEmptyJsonTableFiles());

    const parser = new CfgValueParser(fullSchema, env, errs);
    const cfgValue = parser.parseCfgValue();

    // Should not throw
    expect(cfgValue).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // LangTextFinder set (non-null) with no TextFinder for table
  // -------------------------------------------------------------------------

  it('should not crash with non-null langFinder but no TextFinder', () => {
    const idField = makeFieldSchema('id', Primitive.INT);
    const nameField = makeFieldSchema('name', Primitive.STRING);
    const tableSchema = makeTableSchema('item', [idField, nameField], ['id']);
    const fullSchema = makeCfgSchemaWithTables([tableSchema]);

    const dTable = makeDTable([
      [makeCell('1', 0, 0), makeCell('sword', 0, 1)],
    ]);

    const cfgData = makeCfgDataWithTables(new Map([['item', dTable]]));
    const errs = CfgValueErrs.of();
    const langFinder = new LangTextFinder(); // no TextFinder set
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, langFinder, makeEmptyJsonTableFiles());

    const parser = new CfgValueParser(fullSchema, env, errs);
    const cfgValue = parser.parseCfgValue();

    expect(cfgValue).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Multiple tables
  // -------------------------------------------------------------------------

  it('should parse multiple tables from Excel data', () => {
    // Table 1
    const idField1 = makeFieldSchema('id', Primitive.INT);
    const nameField1 = makeFieldSchema('name', Primitive.STRING);
    const tableSchema1 = makeTableSchema('item', [idField1, nameField1], ['id']);

    // Table 2
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
    const env = new ValueEnv(fullSchema, cfgData, HeadRows.A2_Default, null, makeEmptyJsonTableFiles());

    const parser = new CfgValueParser(fullSchema, env, errs);
    const cfgValue = parser.parseCfgValue();

    const itemTable = cfgValue.getTable('item');
    expect(itemTable).toBeDefined();
    expect(itemTable!.valueList).toHaveLength(2);

    const propTable = cfgValue.getTable('prop');
    expect(propTable).toBeDefined();
    expect(propTable!.valueList).toHaveLength(1);
  });
});
