/**
 * TableCreateService tests — T9.7
 *
 * TableCreateService creates new table/struct/enum definitions:
 *   - createTable: parse existing config.cfg, add new element, validate, write back
 *   - createDataFile: create empty CSV data file for an existing table
 *
 * Tests cover:
 * - createTable with table type (basic)
 * - createTable with struct type
 * - createTable with enum type
 * - createTable rejects duplicate name
 * - createTable rejects invalid name
 * - createTable with withDataFile creates CSV
 * - createTable rejects unknown type
 * - createTable rejects uppercase table name
 * - createTable on empty config.cfg
 * - createDataFile creates empty CSV
 * - createDataFile rejects non-existent table
 * - createDataFile rejects enum table
 * - createDataFile rejects if file already exists
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EditorService } from '../EditorService';
import { TableCreateService } from '../TableCreateService';
import type { CreateResult } from '../TableCreateService';

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

const EXISTING_CFG = `table item[id] (title='name') {
  id:int;
  name:str;
}
`;

const EXISTING_CSV = `ID,名称
id,name
100,剑
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TableCreateService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-tablecreate-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  async function createService(
    cfg?: string,
    csvs?: Record<string, string>,
  ): Promise<EditorService> {
    if (cfg !== undefined) {
      writeFile(tempDir, 'config.cfg', cfg);
    }
    if (csvs) {
      for (const [name, content] of Object.entries(csvs)) {
        writeFile(tempDir, name, content);
      }
    }
    return EditorService.create(tempDir);
  }

  // -------------------------------------------------------------------------
  // createTable — table type
  // -------------------------------------------------------------------------

  it('createTable creates a new table and writes config.cfg', async () => {
    const svc = await createService(EXISTING_CFG, { 'item.csv': EXISTING_CSV });

    const request = {
      type: 'table',
      name: 'weapon',
      fields: [
        { name: 'id', type: 'int' },
        { name: 'name', type: 'string' },
        { name: 'damage', type: 'int' },
      ],
      primaryKey: ['id'],
    };

    const result = TableCreateService.createTable(svc, request) as CreateResult;

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);

    // Verify config.cfg was updated with new table
    const cfgText = readFileSync(tempDir, 'config.cfg');
    expect(cfgText).toContain('table weapon');
    expect(cfgText).toContain('id:int');
    expect(cfgText).toContain('name:str');
    expect(cfgText).toContain('damage:int');
    // Original table should still be there
    expect(cfgText).toContain('table item');
  });

  it('createTable with withDataFile creates empty CSV', async () => {
    const svc = await createService(EXISTING_CFG, { 'item.csv': EXISTING_CSV });

    const request = {
      type: 'table',
      name: 'weapon',
      fields: [
        { name: 'id', type: 'int' },
        { name: 'name', type: 'string' },
      ],
      primaryKey: ['id'],
      withDataFile: true,
    };

    const result = TableCreateService.createTable(svc, request) as CreateResult;

    expect(result.ok).toBe(true);

    // Verify CSV was created
    const csvPath = path.join(tempDir, 'weapon.csv');
    expect(fs.existsSync(csvPath)).toBe(true);

    const csvContent = readFileSync(tempDir, 'weapon.csv');
    // Should have a name row and a comment row (2 rows total)
    const lines = csvContent.split('\r\n').filter((l) => l.length > 0);
    expect(lines.length).toBe(2);
    // Name row should contain field names
    expect(csvContent).toContain('id');
    expect(csvContent).toContain('name');
  });

  // -------------------------------------------------------------------------
  // createTable — struct type
  // -------------------------------------------------------------------------

  it('createTable creates a struct', async () => {
    const svc = await createService(EXISTING_CFG, { 'item.csv': EXISTING_CSV });

    const request = {
      type: 'struct',
      name: 'range',
      fields: [
        { name: 'min', type: 'int' },
        { name: 'max', type: 'int' },
      ],
    };

    const result = TableCreateService.createTable(svc, request) as CreateResult;

    expect(result.ok).toBe(true);

    const cfgText = readFileSync(tempDir, 'config.cfg');
    expect(cfgText).toContain('struct range');
    expect(cfgText).toContain('min:int');
    expect(cfgText).toContain('max:int');
  });

  // -------------------------------------------------------------------------
  // createTable — enum type
  // -------------------------------------------------------------------------

  it('createTable creates an enum table', async () => {
    const svc = await createService(EXISTING_CFG, { 'item.csv': EXISTING_CSV });

    const request = {
      type: 'enum',
      name: 'color',
      enumValues: [
        { name: 'RED', comment: '红色' },
        { name: 'GREEN', comment: '绿色' },
        { name: 'BLUE', comment: '蓝色' },
      ],
    };

    const result = TableCreateService.createTable(svc, request) as CreateResult;

    expect(result.ok).toBe(true);

    const cfgText = readFileSync(tempDir, 'config.cfg');
    // CfgWriter outputs enum tables as `enum <name>` syntax
    expect(cfgText).toContain('enum color');
    // Enum should have name field
    expect(cfgText).toContain('RED = 0');
    expect(cfgText).toContain('GREEN = 1');
    expect(cfgText).toContain('BLUE = 2');
  });

  // -------------------------------------------------------------------------
  // createTable — error cases
  // -------------------------------------------------------------------------

  it('createTable rejects duplicate name', async () => {
    const svc = await createService(EXISTING_CFG, { 'item.csv': EXISTING_CSV });

    const request = {
      type: 'table',
      name: 'item',
      fields: [
        { name: 'id', type: 'int' },
        { name: 'name', type: 'string' },
      ],
      primaryKey: ['id'],
    };

    const result = TableCreateService.createTable(svc, request) as CreateResult;

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('already exists');
  });

  it('createTable rejects invalid name', async () => {
    const svc = await createService(EXISTING_CFG, { 'item.csv': EXISTING_CSV });

    const request = {
      type: 'table',
      name: '123bad',
      fields: [{ name: 'id', type: 'int' }],
      primaryKey: ['id'],
    };

    const result = TableCreateService.createTable(svc, request) as CreateResult;

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('createTable rejects unknown type', async () => {
    const svc = await createService(EXISTING_CFG, { 'item.csv': EXISTING_CSV });

    const request = {
      type: 'unknown',
      name: 'newthing',
      fields: [{ name: 'id', type: 'int' }],
    };

    const result = TableCreateService.createTable(svc, request) as CreateResult;

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('createTable rejects uppercase table name', async () => {
    const svc = await createService(EXISTING_CFG, { 'item.csv': EXISTING_CSV });

    const request = {
      type: 'table',
      name: 'Weapon',
      fields: [{ name: 'id', type: 'int' }],
      primaryKey: ['id'],
    };

    const result = TableCreateService.createTable(svc, request) as CreateResult;

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('createTable rejects empty fields', async () => {
    const svc = await createService(EXISTING_CFG, { 'item.csv': EXISTING_CSV });

    const request = {
      type: 'table',
      name: 'empty',
      fields: [],
      primaryKey: ['id'],
    };

    const result = TableCreateService.createTable(svc, request) as CreateResult;

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('createTable does not modify config.cfg on error', async () => {
    const svc = await createService(EXISTING_CFG, { 'item.csv': EXISTING_CSV });
    const original = readFileSync(tempDir, 'config.cfg');

    const request = {
      type: 'table',
      name: 'item', // duplicate
      fields: [{ name: 'id', type: 'int' }],
      primaryKey: ['id'],
    };

    TableCreateService.createTable(svc, request);

    const after = readFileSync(tempDir, 'config.cfg');
    expect(after).toBe(original);
  });

  // -------------------------------------------------------------------------
  // createTable — on empty config.cfg
  // -------------------------------------------------------------------------

  it('createTable on empty config.cfg succeeds', async () => {
    const svc = await createService('', {});

    const request = {
      type: 'table',
      name: 'item',
      fields: [
        { name: 'id', type: 'int' },
        { name: 'name', type: 'string' },
      ],
      primaryKey: ['id'],
    };

    const result = TableCreateService.createTable(svc, request) as CreateResult;

    expect(result.ok).toBe(true);

    const cfgText = readFileSync(tempDir, 'config.cfg');
    expect(cfgText).toContain('table item');
  });

  // -------------------------------------------------------------------------
  // createDataFile
  // -------------------------------------------------------------------------

  it('createDataFile creates empty CSV for existing table', async () => {
    const svc = await createService(EXISTING_CFG, { 'item.csv': EXISTING_CSV });

    // Create a new table without data file first
    const createRequest = {
      type: 'table',
      name: 'weapon',
      fields: [
        { name: 'id', type: 'int' },
        { name: 'name', type: 'string' },
      ],
      primaryKey: ['id'],
    };
    TableCreateService.createTable(svc, createRequest);

    // Now create data file
    const result = TableCreateService.createDataFile(svc, 'weapon') as CreateResult;

    expect(result.ok).toBe(true);

    const csvPath = path.join(tempDir, 'weapon.csv');
    expect(fs.existsSync(csvPath)).toBe(true);
  });

  it('createDataFile rejects non-existent table', async () => {
    const svc = await createService(EXISTING_CFG, { 'item.csv': EXISTING_CSV });

    const result = TableCreateService.createDataFile(svc, 'nonexistent') as CreateResult;

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('createDataFile rejects if file already exists', async () => {
    const svc = await createService(EXISTING_CFG, { 'item.csv': EXISTING_CSV });

    const result = TableCreateService.createDataFile(svc, 'item') as CreateResult;

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('already exists');
  });
});
