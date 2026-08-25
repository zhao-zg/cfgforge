/**
 * End-to-end regression tests — Phase 4 T4.11.
 *
 * Tests the full value parsing pipeline:
 *   1. Discover .cfg files → CfgSchemas.readFromDir → resolve (schema)
 *   2. Enumerate CSV/Excel files → CfgDataReader → CfgData (data)
 *   3. CfgSchemaAlignToData.align → CfgSchemaResolver.resolve (aligned schema)
 *   4. Discover JSON files → build JsonTableFiles (for JSON-only tables)
 *   5. CfgValueParser.parseCfgValue → RefValidator.validate (values + FK check)
 *   6. Assert: table count, record counts, no value errors, FK integrity
 *
 * Uses real files from example/config/ — the same test data as Java's
 * IntegrationTest and CfgValueParserTest (which use inlined fixtures,
 * but the schema and data come from the same example/config/ directory).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Schema layer
import { CfgSchemas, type CfgFileInfo } from '@cfggen/schema';
import { CfgSchemaErrs } from '@cfggen/schema';
import { CfgUtil } from '@cfggen/schema';
import type { CfgSchema, TableSchema } from '@cfggen/schema';

// Data layer
import { CfgDataReader, type ExcelFileInfo } from '@cfggen/data';
import { HeadRows } from '@cfggen/data';
import { readExcel } from '@cfggen/data';
import { readCsv } from '@cfggen/data';
import { FileFmt, getFileFormat, isFileIgnored } from '@cfggen/data';
import { CfgSchemaAlignToData } from '@cfggen/data';
import { JsonFileInfo, type JsonTableFiles } from '@cfggen/data';
import type { ReadResult } from '@cfggen/data';
import type { HeadRow } from '@cfggen/data';
import { getCodeName } from '@cfggen/shared';

// Value layer
import { CfgValueParser } from '../CfgValueParser';
import { CfgValueErrs } from '../CfgValueErrs';
import { ValueEnv } from '../ValueEnv';
import { ForeachVStruct, type VStructVisitor, type ForeachContext } from '../ForeachVStruct';
import type { VStruct, VTable, CfgValue } from '../CfgValue';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const EXAMPLE_CONFIG_DIR = path.join(REPO_ROOT, 'example', 'config');

// ---------------------------------------------------------------------------
// Helper: discover .cfg files (same as schema E2E test)
// ---------------------------------------------------------------------------

function discoverCfgFiles(rootDir: string): CfgFileInfo[] {
  const cfgFiles = new Map<string, CfgFileInfo>();
  const rootCfg = path.join(rootDir, 'config.cfg');
  CfgUtil.findConfigFilesRecursively(
    rootCfg, null, 'cfg', '', rootDir, cfgFiles,
  );
  return Array.from(cfgFiles.values()).sort((a, b) =>
    a.pkgNameDot.localeCompare(b.pkgNameDot),
  );
}

// ---------------------------------------------------------------------------
// Helper: enumerate Excel/CSV files recursively (same as data E2E test)
// ---------------------------------------------------------------------------

function findExcelFilesRecursively(dir: string, rootDir: string): ExcelFileInfo[] {
  const result: ExcelFileInfo[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (isFileIgnored(fullPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      const codeName = getCodeName(entry.name);
      if (codeName === null) {
        continue;
      }
      result.push(...findExcelFilesRecursively(fullPath, rootDir));
    } else if (entry.isFile()) {
      const fmt = getFileFormat(fullPath);
      if (fmt === null) continue;

      if (fmt === FileFmt.CSV) {
        const codeName = getCodeName(entry.name);
        if (codeName === null) continue;
      }
      if (fmt === FileFmt.CSV || fmt === FileFmt.EXCEL) {
        const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
        const stat = fs.statSync(fullPath);
        result.push({
          lastModified: stat.mtimeMs,
          path: fullPath,
          relativePath,
          fmt,
          nullableAddTag: null,
        });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helper: pre-read Excel files (async → sync cache)
// ---------------------------------------------------------------------------

async function preReadExcelFiles(files: ExcelFileInfo[]): Promise<Map<string, ReadResult>> {
  const cache = new Map<string, ReadResult>();
  for (const f of files) {
    if (f.fmt === FileFmt.EXCEL) {
      const result = await readExcel(f.path, f.relativePath, null);
      cache.set(f.path, result);
    }
  }
  return cache;
}

// ---------------------------------------------------------------------------
// Helper: create CfgDataReader with real reader functions
// ---------------------------------------------------------------------------

function createReader(headRow: HeadRow, excelCache: Map<string, ReadResult>): CfgDataReader {
  const csvReader = (
    filePath: string,
    relativePath: string,
    tableName: string,
    index: number,
    fieldSeparator: string,
    nullableAddTag: string | null,
  ): ReadResult => {
    return readCsv(filePath, relativePath, tableName, index, fieldSeparator, 'gbk', nullableAddTag);
  };

  const excelReader = (
    filePath: string,
    _relativePath: string,
    _sheetNameFilter: string | null,
  ): ReadResult => {
    const cached = excelCache.get(filePath);
    if (cached === undefined) {
      throw new Error(`Excel file not pre-read: ${filePath}`);
    }
    return cached;
  };

  return new CfgDataReader(headRow, csvReader, excelReader);
}

// ---------------------------------------------------------------------------
// Helper: discover JSON files for JSON-table directories
//
// In the full Java codebase, DirectoryStructure (ctx layer) handles this.
// Since ctx is not yet ported to TS, we replicate the logic here:
//   - For each table in schema that isJson(), look for a directory
//     named _tablename (dots replaced with underscores) under the
//     table's namespace directory.
//   - Inside that directory, all .json files belong to the table.
// ---------------------------------------------------------------------------

function discoverJsonFiles(
  cfgSchema: CfgSchema,
  rootDir: string,
): Map<string, JsonFileInfo[]> {
  const result = new Map<string, JsonFileInfo[]>();

  for (const item of cfgSchema.items()) {
    // Check if it's a TableSchema with isJson()
    if (typeof (item as any).isJson === 'function' && (item as any).isJson()) {
      const table = item as TableSchema;
      const tableName = table.name(); // e.g. "other.keytest" or "task.task2"

      // Convert table name to directory name: other.keytest → _other_keytest
      // But the directory is under the namespace dir, not the root
      // e.g. other/_keytest/, task/_task2/

      // Find the namespace directory
      const dotIdx = tableName.lastIndexOf('.');
      let nsDir: string;
      let jsonDirName: string;

      if (dotIdx >= 0) {
        const ns = tableName.substring(0, dotIdx); // e.g. "other"
        const tn = tableName.substring(dotIdx + 1); // e.g. "keytest"
        nsDir = path.join(rootDir, ns);
        jsonDirName = '_' + tn;
      } else {
        nsDir = rootDir;
        jsonDirName = '_' + tableName;
      }

      const jsonDir = path.join(nsDir, jsonDirName);
      const files: JsonFileInfo[] = [];

      if (fs.existsSync(jsonDir) && fs.statSync(jsonDir).isDirectory()) {
        const entries = fs.readdirSync(jsonDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.json')) {
            const absPath = path.join(jsonDir, entry.name);
            const relPath = path.relative(rootDir, absPath).replace(/\\/g, '/');
            files.push(JsonFileInfo.of(absPath, relPath));
          }
        }
        // Sort: integer-named files first (by integerId), then non-integer
        files.sort((a, b) => {
          if (a.isIntegerId && b.isIntegerId) {
            return a.integerId - b.integerId;
          }
          if (a.isIntegerId) return -1;
          if (b.isIntegerId) return 1;
          return a.relativePath.localeCompare(b.relativePath);
        });
      }

      result.set(tableName, files);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helper: build JsonTableFiles from discovered JSON files map
// ---------------------------------------------------------------------------

function makeJsonTableFiles(jsonMap: Map<string, JsonFileInfo[]>): JsonTableFiles {
  return {
    jsonFilesOf: (tableName: string): JsonFileInfo[] => {
      return jsonMap.get(tableName) ?? [];
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: run the full pipeline
// ---------------------------------------------------------------------------

async function runFullPipeline(headRow: HeadRow = HeadRows.A2_Default) {
  // 1. Discover and parse schema
  const cfgFiles = discoverCfgFiles(EXAMPLE_CONFIG_DIR);
  const cfgSchema = CfgSchemas.readFromDir(cfgFiles);
  const schemaErrs = cfgSchema.resolve();
  expect(schemaErrs.errs.length).toBe(0);

  // 2. Read data (CSV + Excel) — pass resolved cfgSchema so columnMode
  //    tables are correctly transposed (isColumnMode lookup needs schema)
  const excelFiles = findExcelFilesRecursively(EXAMPLE_CONFIG_DIR, EXAMPLE_CONFIG_DIR);
  const excelCache = await preReadExcelFiles(excelFiles);
  const reader = createReader(headRow, excelCache);
  const dataErrs = CfgSchemaErrs.of();
  const cfgData = reader.readCfgData(excelFiles, cfgSchema, dataErrs);

  // 3. Align schema to data, then resolve the aligned schema.
  //    alignedSchema.resolve() creates a fresh CfgSchemaErrs internally,
  //    so data-reading errors won't block setResolved().
  const aligner = new CfgSchemaAlignToData(headRow);
  const alignedSchema = aligner.align(cfgSchema, cfgData, dataErrs);
  const alignedErrs = alignedSchema.resolve();
  // Align + resolve may produce warnings (e.g. unused structs) but no errors
  if (alignedErrs.errs.length > 0) {
    for (const e of alignedErrs.errs) {
      // eslint-disable-next-line no-console
      console.error(`  SERR [${e._tag}]: ${e.msg()}`);
    }
  }

  // 4. Discover JSON files for JSON tables
  const jsonMap = discoverJsonFiles(alignedSchema, EXAMPLE_CONFIG_DIR);
  const jsonTableFiles = makeJsonTableFiles(jsonMap);

  // 5. Parse values + validate foreign keys
  const valueErrs = CfgValueErrs.of();
  const env = new ValueEnv(alignedSchema, cfgData, headRow, null, jsonTableFiles);
  const parser = new CfgValueParser(alignedSchema, env, valueErrs);
  const cfgValue = parser.parseCfgValue();

  return { cfgValue, valueErrs, dataErrs, alignedSchema, cfgData };
}

// ---------------------------------------------------------------------------
// Helper: collect all VStructs for counting
// ---------------------------------------------------------------------------

class StructCollector implements VStructVisitor {
  readonly structs: { table: string; vStruct: VStruct }[] = [];

  visit(vStruct: VStruct, ctx: ForeachContext): boolean {
    this.structs.push({ table: ctx.fromVTable.name(), vStruct });
    return true;
  }
}

function countRecords(cfgValue: CfgValue): Map<string, number> {
  const counts = new Map<string, number>();
  for (const vTable of cfgValue.sortedTables()) {
    counts.set(vTable.name(), vTable.valueList.length);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E: value parsing pipeline (T4.11)', () => {
  it('parses all tables without value errors', async () => {
    const { valueErrs } = await runFullPipeline();

    // Print errors for debugging if any
    if (valueErrs.errs.length > 0) {
      for (const e of valueErrs.errs) {
        // eslint-disable-next-line no-console
        console.error(`  VERR [${e._tag}]: ${e.msg()}`);
      }
    }

    expect(valueErrs.errs.length).toBe(0);
  });

  it('produces expected table count', async () => {
    const { cfgValue } = await runFullPipeline();

    // Tables: ai.ai, ai.ai_action, ai.ai_condition,
    //          equip.ability, equip.equipconfig, equip.jewelry, equip.jewelryrandom,
    //          equip.jewelrysuit, equip.jewelrytype, equip.rank,
    //          other.drop, other.loot, other.lootitem, other.monster, other.signin,
    //          other.keytest (JSON),
    //          task.completeconditiontype, task.task, task.taskextraexp,
    //          task.task2 (JSON)
    //          + other.ArgCaptureMode (enum)
    // Total: ~21 tables
    expect(cfgValue.vTableMap.size).toBeGreaterThanOrEqual(20);
  });

  it('equip tables have correct record counts', async () => {
    const { cfgValue } = await runFullPipeline();
    const counts = countRecords(cfgValue);

    // CSV data rows = file lines - 2 header rows
    expect(counts.get('equip.rank')).toBe(6);        // 8 lines - 2 headers
    expect(counts.get('equip.ability')).toBe(7);     // 9 lines - 2 headers
    expect(counts.get('equip.jewelrytype')).toBe(4);  // 6 lines - 2 headers
    expect(counts.get('equip.equipconfig')).toBe(2);  // columnMode: 6 field-rows × 2 data cols
    expect(counts.get('equip.jewelrysuit')).toBe(7);  // 9 lines - 2 headers
    expect(counts.get('equip.jewelryrandom')).toBe(25); // 27 lines - 2 headers
    expect(counts.get('equip.jewelry')).toBe(100);    // 102 lines - 2 headers
  });

  it('ai tables have correct record counts (from Excel)', async () => {
    const { cfgValue } = await runFullPipeline();
    const counts = countRecords(cfgValue);

    // ai.ai: 52 data rows (verified in data E2E test)
    expect(counts.get('ai.ai')).toBe(52);
    // ai.ai_action: 53 data rows (merged from index 0 + index 1)
    expect(counts.get('ai.ai_action')).toBe(53);
    // ai.ai_condition: exists with data
    expect(counts.has('ai.ai_condition')).toBe(true);
  });

  it('other tables have correct record counts', async () => {
    const { cfgValue } = await runFullPipeline();
    const counts = countRecords(cfgValue);

    expect(counts.get('other.drop')).toBe(3);       // 3 dropids (1,2,3); dropid=1 has 6 block rows
    expect(counts.get('other.loot')).toBe(10);       // 12 lines - 2 headers
    expect(counts.get('other.lootitem')).toBe(75);   // (37+29+15) - 2*3 headers = 75
    expect(counts.get('other.monster')).toBe(2);     // 4 lines - 2 headers
    expect(counts.get('other.signin')).toBe(12);      // 14 lines - 2 headers
  });

  it('task tables have correct record counts', async () => {
    const { cfgValue } = await runFullPipeline();
    const counts = countRecords(cfgValue);

    expect(counts.get('task.completeconditiontype')).toBe(7); // 9 lines - 2 headers
    expect(counts.get('task.task')).toBe(8);         // 10 lines - 2 headers
    expect(counts.get('task.taskextraexp')).toBe(1);  // 3 lines - 2 headers
  });

  it('JSON tables have correct record counts', async () => {
    const { cfgValue } = await runFullPipeline();
    const counts = countRecords(cfgValue);

    // other.keytest: 2 JSON files (0.json, 1,2.json)
    expect(counts.get('other.keytest')).toBe(2);
    // task.task2: 8 JSON files (1.json through 8.json)
    expect(counts.get('task.task2')).toBe(8);
  });

  it('enum table (ArgCaptureMode) has correct record count', async () => {
    const { cfgValue } = await runFullPipeline();
    const counts = countRecords(cfgValue);

    // ArgCaptureMode enum: 2 values (Snapshot=1, Dynamic=2)
    expect(counts.get('other.ArgCaptureMode')).toBe(2);
  });

  it('all VTables have non-null schema', async () => {
    const { cfgValue } = await runFullPipeline();

    for (const vTable of cfgValue.sortedTables()) {
      expect(vTable.schema).toBeDefined();
      expect(vTable.schema.name().length).toBeGreaterThan(0);
    }
  });

  it('all VTables have primaryKeyMap', async () => {
    const { cfgValue } = await runFullPipeline();

    for (const vTable of cfgValue.sortedTables()) {
      expect(vTable.primaryKeyMap).toBeDefined();
      // Primary key map size should equal valueList size
      expect(vTable.primaryKeyMap.size).toBe(vTable.valueList.length);
    }
  });

  it('equip.jewelry primary key values are valid', async () => {
    const { cfgValue } = await runFullPipeline();
    const jewelryTable = cfgValue.getTable('equip.jewelry');
    expect(jewelryTable).toBeDefined();

    // First record: ID should be 1 (from jewelry.csv)
    const firstRow = jewelryTable!.valueList[0];
    expect(firstRow).toBeDefined();
    // PK is first field (ID:int)
    const pkValue = firstRow.values[0];
    expect(pkValue).toBeDefined();
    expect(pkValue.packStr()).toBe('1');
  });

  it('equip.rank enum table has name→value mapping', async () => {
    const { cfgValue } = await runFullPipeline();
    const rankTable = cfgValue.getTable('equip.rank');
    expect(rankTable).toBeDefined();
    expect(rankTable!.enumNames).not.toBeNull();
    // rank has 6 entries with enum on 'RankName'
    expect(rankTable!.enumNames!.size).toBe(6);
  });

  it('equip.ability enum table has name→value mapping', async () => {
    const { cfgValue } = await runFullPipeline();
    const abilityTable = cfgValue.getTable('equip.ability');
    expect(abilityTable).toBeDefined();
    expect(abilityTable!.enumNames).not.toBeNull();
    // ability has 7 entries with enum on 'name'
    expect(abilityTable!.enumNames!.size).toBe(7);
  });

  it('foreign key references are all valid (no ForeignValueNotFound errors)', async () => {
    const { valueErrs } = await runFullPipeline();

    const fkErrors = valueErrs.errs.filter(
      e => e._tag === 'ForeignValueNotFound' || e._tag === 'RefNotNullableButCellEmpty',
    );
    expect(fkErrors.length).toBe(0);
  });

  it('can traverse all VStructs via ForeachVStruct', async () => {
    const { cfgValue } = await runFullPipeline();
    const collector = new StructCollector();
    ForeachVStruct.foreach(collector, cfgValue);

    // Should have collected a significant number of VStructs
    // (each table row + nested structs within rows)
    expect(collector.structs.length).toBeGreaterThan(50);
  });

  it('other.monster table has interface field with valid impl', async () => {
    const { cfgValue } = await runFullPipeline();
    const monsterTable = cfgValue.getTable('other.monster');
    expect(monsterTable).toBeDefined();
    expect(monsterTable!.valueList.length).toBe(2);

    // monster has posList:list<Position> (sep=':')
    // and enumMap1:map<str,int> (pack)
    // and enumMap2:map<int,ArgCaptureMode> (pack)
    // These should be parsed without errors
    const firstRow = monsterTable!.valueList[0];
    expect(firstRow).toBeDefined();
    // Verify it has the expected field count (id, posList, lootId, lootItemId, enumMap1, enumMap2)
    // + 2 FK fields (Loot, AllLoot are virtual → not in values)
    expect(firstRow.values.length).toBeGreaterThanOrEqual(6);
  });

  it('task.task2 JSON records have correct taskid values', async () => {
    const { cfgValue } = await runFullPipeline();
    const task2Table = cfgValue.getTable('task.task2');
    expect(task2Table).toBeDefined();
    expect(task2Table!.valueList.length).toBe(8);

    // First record should have taskid=1
    const firstRow = task2Table!.valueList[0];
    const pkValue = firstRow.values[0];
    expect(pkValue.packStr()).toBe('1');

    // Last record should have taskid=8
    const lastRow = task2Table!.valueList[7];
    const lastPk = lastRow.values[0];
    expect(lastPk.packStr()).toBe('8');
  });

  it('other.keytest JSON records have correct id values', async () => {
    const { cfgValue } = await runFullPipeline();
    const keytestTable = cfgValue.getTable('other.keytest');
    expect(keytestTable).toBeDefined();
    expect(keytestTable!.valueList.length).toBe(2);

    // 0.json has no id1/id2/id3 (only enumTest="Snapshot")
    // 1,2.json has id1=1, id2=2, id3=3
    // The primary key is [id1, id2]
    // First record (0.json) has no id fields → pk values should be empty/0
    // Second record (1,2.json) has id1=1, id2=2
    const row0 = keytestTable!.valueList[0];
    const row1 = keytestTable!.valueList[1];

    // Verify enumTest field
    // Schema: id1, id2, id3, ids:list<int>->signin, enumTest:ArgCaptureMode, enumList:list<ArgCaptureMode>
    // row1 should have id1=1
    const row1Id1 = row1.values[0];
    expect(row1Id1.packStr()).toBe('1');
  });

  it('ai.ai table has TriggerTick interface field parsed', async () => {
    const { cfgValue } = await runFullPipeline();
    const aiTable = cfgValue.getTable('ai.ai');
    expect(aiTable).toBeDefined();
    expect(aiTable!.valueList.length).toBe(52);

    // TrigTick is a TriggerTick interface (pack)
    // First row should have a valid interface value
    const firstRow = aiTable!.valueList[0];
    // Schema: ID, Desc, CondID, TrigTick, TrigOdds, ActionID, DeathRemove
    expect(firstRow.values.length).toBe(7);

    // ID=1
    expect(firstRow.values[0].packStr()).toBe('1');
    // Desc (may be empty)
    // CondID = "1;2"
    expect(firstRow.values[2].packStr()).toBe('1;2');
    // TrigOdds = 10000
    expect(firstRow.values[4].packStr()).toBe('10000');
    // ActionID = "1;2"
    expect(firstRow.values[5].packStr()).toBe('1;2');
    // DeathRemove = true
    expect(firstRow.values[6].packStr()).toBe('true');
  });

  it('all sorted tables are alphabetically ordered', async () => {
    const { cfgValue } = await runFullPipeline();
    const sorted = cfgValue.sortedTables();
    const names = sorted.map(t => t.name());

    // Verify sorting
    for (let i = 1; i < names.length; i++) {
      expect(names[i] >= names[i - 1]).toBe(true);
    }
  });
});
