/**
 * SchemaWriteService tests — T9.6
 *
 * SchemaWriteService reads and writes CFG schema text:
 *   - readSchemaText: concatenates all .cfg file contents
 *   - writeSchemaText: parses + validates + writes config.cfg
 *
 * Tests cover:
 * - readSchemaText: returns concatenated cfg file contents
 * - readSchemaText: single config.cfg
 * - writeSchemaText: valid schema writes to config.cfg
 * - writeSchemaText: syntax error returns ok=false + error message
 * - writeSchemaText: schema semantic error returns ok=false + error messages
 * - writeSchemaText: write then re-read roundtrip
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EditorService } from '../EditorService';
import { SchemaWriteService } from '../SchemaWriteService';
import type { SchemaTextResult, SchemaWriteResult } from '../SchemaWriteService';

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
// Fixture
// ---------------------------------------------------------------------------

const SIMPLE_CFG = `table item[id] (title='name') {
  id:int;
  name:str;
}
`;

const SIMPLE_CSV = `ID,名称
id,name
100,剑
`;

const TWO_TABLES_CFG = `table item[id] (title='name') {
  id:int;
  name:str;
}

table weapon[id] (title='name') {
  id:int;
  name:str;
  damage:int;
}
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SchemaWriteService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-schemawrite-'));
  });

  afterEach(() => {
    rmSync(tempDir);
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
  // readSchemaText
  // -------------------------------------------------------------------------

  it('readSchemaText returns concatenated cfg file contents', async () => {
    const svc = await createService(SIMPLE_CFG, { 'item.csv': SIMPLE_CSV });
    const result = SchemaWriteService.readSchemaText(svc);

    expect(result.text).toContain('table item');
    expect(result.text).toContain('id:int');
    expect(result.text).toContain('name:str');
  });

  it('readSchemaText returns content from single config.cfg', async () => {
    const svc = await createService(SIMPLE_CFG, { 'item.csv': SIMPLE_CSV });
    const result = SchemaWriteService.readSchemaText(svc);

    // Should match the original content
    expect(result.text).toBe(SIMPLE_CFG);
  });

  // -------------------------------------------------------------------------
  // writeSchemaText — valid schema
  // -------------------------------------------------------------------------

  it('writeSchemaText writes valid schema to config.cfg', async () => {
    const svc = await createService(SIMPLE_CFG, { 'item.csv': SIMPLE_CSV });

    const newCfg = `table weapon[id] (title='name') {
  id:int;
  name:str;
  damage:int;
}
`;
    const result = SchemaWriteService.writeSchemaText(svc, newCfg) as SchemaWriteResult;

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);

    // Verify file was written
    const written = readFileSync(tempDir, 'config.cfg');
    expect(written).toBe(newCfg);
  });

  it('writeSchemaText with multiple tables succeeds', async () => {
    const svc = await createService(SIMPLE_CFG, { 'item.csv': SIMPLE_CSV });

    const result = SchemaWriteService.writeSchemaText(svc, TWO_TABLES_CFG) as SchemaWriteResult;

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);

    const written = readFileSync(tempDir, 'config.cfg');
    expect(written).toBe(TWO_TABLES_CFG);
  });

  // -------------------------------------------------------------------------
  // writeSchemaText — syntax error
  // -------------------------------------------------------------------------

  it('writeSchemaText returns ok=false for syntax error', async () => {
    const svc = await createService(SIMPLE_CFG, { 'item.csv': SIMPLE_CSV });

    const badCfg = `table item[id] {
  id:int;
  name:str;
  // missing closing brace
`;
    const result = SchemaWriteService.writeSchemaText(svc, badCfg) as SchemaWriteResult;

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // Should contain some parse error message
    expect(result.errors[0]).toContain('Parse error');
  });

  // -------------------------------------------------------------------------
  // writeSchemaText — schema semantic error
  // -------------------------------------------------------------------------

  it('writeSchemaText returns ok=false for schema semantic error', async () => {
    const svc = await createService(SIMPLE_CFG, { 'item.csv': SIMPLE_CSV });

    // Duplicate table name should cause a schema error
    const badSchema = `table item[id] (title='name') {
  id:int;
  name:str;
}

table item[id] (title='name') {
  id:int;
  name:str;
}
`;
    const result = SchemaWriteService.writeSchemaText(svc, badSchema) as SchemaWriteResult;

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // writeSchemaText — file not written on error
  // -------------------------------------------------------------------------

  it('writeSchemaText does not modify config.cfg on error', async () => {
    const svc = await createService(SIMPLE_CFG, { 'item.csv': SIMPLE_CSV });

    const badCfg = `table item[id] {
  id:int;
  // missing closing brace
`;
    SchemaWriteService.writeSchemaText(svc, badCfg);

    // Original file should be unchanged
    const original = readFileSync(tempDir, 'config.cfg');
    expect(original).toBe(SIMPLE_CFG);
  });

  // -------------------------------------------------------------------------
  // Roundtrip: write then read
  // -------------------------------------------------------------------------

  it('writeSchemaText then readSchemaText roundtrip', async () => {
    const svc = await createService(SIMPLE_CFG, { 'item.csv': SIMPLE_CSV });

    const newCfg = `table item[id] (title='name') {
  id:int;
  name:str;
  desc:str;
}
`;

    // Write
    const writeResult = SchemaWriteService.writeSchemaText(svc, newCfg) as SchemaWriteResult;
    expect(writeResult.ok).toBe(true);

    // Read back — readSchemaText reads from disk, so it reflects the new content
    // without needing to reload the context.
    const readResult = SchemaWriteService.readSchemaText(svc) as SchemaTextResult;
    expect(readResult.text).toBe(newCfg);
  });
});
