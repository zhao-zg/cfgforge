/**
 * SchemaFieldService tests — TDD for field-level editing (add/update/remove).
 *
 * Covers:
 * - addField: append field with primitive type / struct ref / comment
 * - addField error cases: invalid identifier, duplicate name, missing table
 * - updateField: rename / retype / recomment; rename to existing name rejected
 * - updateField error: missing field
 * - removeField: delete field; primary key field rejected; local FK key
 *   rejected; cross-table FK reference rejected; config unchanged on error
 * - async variants match sync results
 *
 * Fixture note: Context.readSchemaAndData aligns schema with CSV data;
 * tables without a matching CSV file are removed, so each table in the CFG
 * fixture must have a CSV file (two header rows: comment row + name row).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EditorService } from '../EditorService';
import { SchemaFieldService } from '../SchemaFieldService';
import type {
  FieldMutateResult,
  FieldUpdateRequest,
} from '../SchemaFieldService';

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

const CFG = `struct skill {
  id:int;
  name:str;
}
table item[id] {
  id:int;
  name:str;
  level:int;
  [name];
  [name,level];
}
table weapon[id] {
  id:int;
  name:str;
  damage:int;
  owner:int ->item;
}
`;

const ITEM_CSV = `物品ID,名称,等级
id,name,level
1,sword,1
`;

// weapon has an extra `owner` column matching its FK to item.
const WEAPON_CSV = `武器ID,名称,伤害,所属
id,name,damage,owner
1,sword,10,1
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SchemaFieldService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-field-'));
    writeFile(tempDir, 'item.csv', ITEM_CSV);
    writeFile(tempDir, 'weapon.csv', WEAPON_CSV);
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  async function createService(cfg?: string): Promise<EditorService> {
    if (cfg !== undefined) {
      writeFile(tempDir, 'config.cfg', cfg);
    }
    return EditorService.create(tempDir);
  }

  // -------------------------------------------------------------------------
  // addField
  // -------------------------------------------------------------------------

  it('adds a primitive field', async () => {
    const svc = await createService(CFG);

    const result = SchemaFieldService.addField(svc, 'item', {
      name: 'cost',
      type: 'int',
      comment: '价格',
    }) as FieldMutateResult;

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);

    const cfg = readFileSync(tempDir, 'config.cfg');
    expect(cfg).toContain('cost:int');
  });

  it('adds a struct-ref field', async () => {
    const svc = await createService(CFG);

    const result = SchemaFieldService.addField(svc, 'item', {
      name: 'w',
      type: 'skill',
    }) as FieldMutateResult;

    expect(result.ok).toBe(true);

    const cfg = readFileSync(tempDir, 'config.cfg');
    // StructRef field: name is the struct's name (lowercased table name).
    expect(cfg).toContain('w:skill');
  });

  it('rejects duplicate field name and leaves config unchanged', async () => {
    const svc = await createService(CFG);
    const original = readFileSync(tempDir, 'config.cfg');

    const result = SchemaFieldService.addField(svc, 'item', {
      name: 'id',
      type: 'int',
    }) as FieldMutateResult;

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('already exists');

    expect(readFileSync(tempDir, 'config.cfg')).toBe(original);
  });

  it('rejects invalid field identifier', async () => {
    const svc = await createService(CFG);
    const original = readFileSync(tempDir, 'config.cfg');

    const result = SchemaFieldService.addField(svc, 'item', {
      name: '1bad',
      type: 'int',
    }) as FieldMutateResult;

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('valid identifier');

    expect(readFileSync(tempDir, 'config.cfg')).toBe(original);
  });

  it('rejects missing table', async () => {
    const svc = await createService(CFG);
    const original = readFileSync(tempDir, 'config.cfg');

    const result = SchemaFieldService.addField(svc, 'nope', {
      name: 'x',
      type: 'int',
    }) as FieldMutateResult;

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('Table not found');

    expect(readFileSync(tempDir, 'config.cfg')).toBe(original);
  });

  // -------------------------------------------------------------------------
  // updateField
  // -------------------------------------------------------------------------

  it('renames a field', async () => {
    const svc = await createService(CFG);

    const result = SchemaFieldService.updateField(svc, 'item', 'level', {
      name: 'lv',
    }) as FieldMutateResult;

    expect(result.ok).toBe(true);

    const cfg = readFileSync(tempDir, 'config.cfg');
    expect(cfg).toContain('lv:int');
    expect(cfg).not.toContain('level:int');
  });

  it('changes a field type', async () => {
    const svc = await createService(CFG);

    const result = SchemaFieldService.updateField(svc, 'item', 'level', {
      type: 'long',
    }) as FieldMutateResult;

    expect(result.ok).toBe(true);

    const cfg = readFileSync(tempDir, 'config.cfg');
    expect(cfg).toContain('level:long');
    expect(cfg).not.toContain('level:int');
  });

  it('rejects rename to an existing field name', async () => {
    const svc = await createService(CFG);
    const original = readFileSync(tempDir, 'config.cfg');

    const result = SchemaFieldService.updateField(svc, 'item', 'level', {
      name: 'name',
    }) as FieldMutateResult;

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('already exists');

    expect(readFileSync(tempDir, 'config.cfg')).toBe(original);
  });

  it('rejects update of a missing field', async () => {
    const svc = await createService(CFG);
    const original = readFileSync(tempDir, 'config.cfg');

    const result = SchemaFieldService.updateField(svc, 'item', 'nope', {
      type: 'long',
    }) as FieldMutateResult;

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('Field not found');

    expect(readFileSync(tempDir, 'config.cfg')).toBe(original);
  });

  // -------------------------------------------------------------------------
  // removeField
  // -------------------------------------------------------------------------

  it('removes a non-key field', async () => {
    const svc = await createService(CFG);

    const result = SchemaFieldService.removeField(svc, 'item', 'level') as FieldMutateResult;

    expect(result.ok).toBe(true);

    const cfg = readFileSync(tempDir, 'config.cfg');
    expect(cfg).not.toContain('level:int');
  });

  it('rejects removing the primary key field', async () => {
    // weapon.id is a primary key not referenced by any FK → reports PK error.
    const svc = await createService(CFG);
    const original = readFileSync(tempDir, 'config.cfg');

    const result = SchemaFieldService.removeField(svc, 'weapon', 'id') as FieldMutateResult;

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('primary key');

    expect(readFileSync(tempDir, 'config.cfg')).toBe(original);
  });

  it('rejects removing a local FK key field', async () => {
    const svc = await createService(CFG);
    const original = readFileSync(tempDir, 'config.cfg');

    const result = SchemaFieldService.removeField(svc, 'weapon', 'owner') as FieldMutateResult;

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('referenced by foreign key');

    expect(readFileSync(tempDir, 'config.cfg')).toBe(original);
  });

  it('rejects removing a field referenced by another table FK', async () => {
    // item.id is referenced by weapon.owner ->item FK → cross-table protection.
    const svc = await createService(CFG);
    const original = readFileSync(tempDir, 'config.cfg');

    const result = SchemaFieldService.removeField(svc, 'item', 'id') as FieldMutateResult;

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('referenced by foreign key');

    expect(readFileSync(tempDir, 'config.cfg')).toBe(original);
  });

  it('rejects removing a missing field', async () => {
    const svc = await createService(CFG);
    const original = readFileSync(tempDir, 'config.cfg');

    const result = SchemaFieldService.removeField(svc, 'item', 'nope') as FieldMutateResult;

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('Field not found');

    expect(readFileSync(tempDir, 'config.cfg')).toBe(original);
  });

  // -------------------------------------------------------------------------
  // async variants
  // -------------------------------------------------------------------------

  it('async variants match sync results', async () => {
    const svc = await createService(CFG);

    const syncAdd = SchemaFieldService.addField(svc, 'item', {
      name: 'cost',
      type: 'int',
    }) as FieldMutateResult;
    const asyncUpdate = await SchemaFieldService.updateFieldAsync(svc, 'item', 'level', {
      type: 'long',
    }) as FieldMutateResult;
    const asyncRemove = await SchemaFieldService.removeFieldAsync(svc, 'item', 'level') as FieldMutateResult;

    expect(syncAdd.ok).toBe(true);
    expect(asyncUpdate.ok).toBe(true);
    expect(asyncRemove.ok).toBe(true);

    const cfg = readFileSync(tempDir, 'config.cfg');
    expect(cfg).toContain('cost:int');
    expect(cfg).not.toContain('level');
  });
});