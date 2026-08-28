/**
 * SchemaRelationService tests — TDD for relation (FK) editing.
 *
 * Covers:
 * - addForeignKey: ref primary (no refKeys), ref unique key (with refKeys),
 *   composite keys, nullable FK, independent FK name
 * - addForeignKey error cases: FK name conflict, missing target table,
 *   refKeys not a unique key
 * - updateForeignKey: rename
 * - removeForeignKey
 * - listFks
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
import { SchemaRelationService } from '../SchemaRelationService';
import type {
  FKAddRequest,
  FKListResult,
  FKMutateResult,
} from '../SchemaRelationService';

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

const CFG = `table item[id] {
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
}
`;

// Two-row header (comment row + name row), matching HeadRows.A2_Default.
const ITEM_CSV = `物品ID,名称,等级
id,name,level
1,sword,1
`;

const WEAPON_CSV = `武器ID,名称,伤害
id,name,damage
1,sword,10
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SchemaRelationService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-relation-'));
    // Ensure Context can align schema to data.
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
  // addForeignKey
  // -------------------------------------------------------------------------

  it('adds FK referencing primary key (no refKeys)', async () => {
    const svc = await createService(CFG);

    const req: FKAddRequest = {
      table: 'weapon',
      fkName: 'itemId',
      keys: ['id'],
      refTable: 'item',
    };
    const result = SchemaRelationService.addForeignKey(svc, req) as FKMutateResult;

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);

    const cfgText = readFileSync(tempDir, 'config.cfg');
    // FK name differs from field name id → standalone FK line:
    //   ->itemId:[id] ->item;
    expect(cfgText).toContain('->itemId:[id] ->item;');
  });

  it('adds FK referencing a unique key (refKeys)', async () => {
    const svc = await createService(CFG);

    const req: FKAddRequest = {
      table: 'weapon',
      fkName: 'itemName',
      keys: ['name'],
      refTable: 'item',
      refKeys: ['name'],
    };
    const result = SchemaRelationService.addForeignKey(svc, req) as FKMutateResult;

    expect(result.ok).toBe(true);

    const cfgText = readFileSync(tempDir, 'config.cfg');
    // RefUniq standalone: ->itemName:[name] ->item[name];
    expect(cfgText).toContain('->itemName:[name] ->item[name];');
  });

  it('adds FK with composite keys', async () => {
    const svc = await createService(CFG);

    const req: FKAddRequest = {
      table: 'weapon',
      fkName: 'itemNameDmg',
      keys: ['name', 'damage'],
      refTable: 'item',
      refKeys: ['name', 'level'],
    };
    const result = SchemaRelationService.addForeignKey(svc, req) as FKMutateResult;

    expect(result.ok).toBe(true);

    const cfg = readFileSync(tempDir, 'config.cfg');
    // Standalone FK row: ->itemNameDmg:[name,damage] ->item[name,level];
    expect(cfg).toContain('->itemNameDmg:[name,damage] ->item[name,level];');
  });

  it('creates nullable FK', async () => {
    const svc = await createService(CFG);

    const req: FKAddRequest = {
      table: 'weapon',
      fkName: 'itemId',
      keys: ['id'],
      refTable: 'item',
      nullable: true,
    };
    const result = SchemaRelationService.addForeignKey(svc, req) as FKMutateResult;

    expect(result.ok).toBe(true);

    const cfg = readFileSync(tempDir, 'config.cfg');
    // Nullable marker is a metadata tag inside parens: (nullable)
    expect(cfg).toContain('->itemId:[id] ->item (nullable);');
  });

  it('writes independent FK name as separate line', async () => {
    const svc = await createService(CFG);

    const req: FKAddRequest = {
      table: 'weapon',
      fkName: 'fkToItem',
      keys: ['id'],
      refTable: 'item',
    };
    const result = SchemaRelationService.addForeignKey(svc, req) as FKMutateResult;

    expect(result.ok).toBe(true);

    const cfg = readFileSync(tempDir, 'config.cfg');
    // Independent FK name (differs from field name id): ->fkToItem:[id] ->item;
    expect(cfg).toContain('->fkToItem:[id] ->item;');
  });

  it('auto-generates FK name when omitted', async () => {
    const svc = await createService(CFG);

    const req: FKAddRequest = {
      table: 'weapon',
      keys: ['id'],
      refTable: 'item',
    };
    const result = SchemaRelationService.addForeignKey(svc, req as FKAddRequest);

    expect(result.ok).toBe(true);

    const cfg = readFileSync(tempDir, 'config.cfg');
    // keys[0]_refTable → id_item, standalone line since it differs from id field
    expect(cfg).toContain('->id_item:[id] ->item;');
  });

  it('auto-generated FK name avoids conflicts', async () => {
    const svc = await createService(CFG);

    const first = SchemaRelationService.addForeignKey(svc, {
      table: 'weapon',
      keys: ['id'],
      refTable: 'item',
    });
    expect(first.ok).toBe(true);

    const second = SchemaRelationService.addForeignKey(svc, {
      table: 'weapon',
      keys: ['id'],
      refTable: 'item',
    });
    expect(second.ok).toBe(true);

    const cfg = readFileSync(tempDir, 'config.cfg');
    // Second FK should get name id_item_2
    expect(cfg).toContain('->id_item:[id] ->item;');
    expect(cfg).toContain('->id_item_2:[id] ->item;');
  });

  it('rejects FK name conflict and leaves config unchanged', async () => {
    const svc = await createService(CFG);
    const original = readFileSync(tempDir, 'config.cfg');

    const req: FKAddRequest = {
      table: 'weapon',
      fkName: 'name', // conflicts with existing field name
      keys: ['id'],
      refTable: 'item',
    };
    const result = SchemaRelationService.addForeignKey(svc, req) as FKMutateResult;

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('conflict');

    expect(readFileSync(tempDir, 'config.cfg')).toBe(original);
  });

  it('rejects missing target table', async () => {
    const svc = await createService(CFG);
    const original = readFileSync(tempDir, 'config.cfg');

    const req: FKAddRequest = {
      table: 'weapon',
      fkName: 'itemId',
      keys: ['id'],
      refTable: 'nonexistent',
    };
    const result = SchemaRelationService.addForeignKey(svc, req) as FKMutateResult;

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('RefTableNotFound');

    expect(readFileSync(tempDir, 'config.cfg')).toBe(original);
  });

  it('rejects refKeys that are not a unique key', async () => {
    const svc = await createService(CFG);
    const original = readFileSync(tempDir, 'config.cfg');

    const req: FKAddRequest = {
      table: 'weapon',
      fkName: 'itemId',
      keys: ['id'],
      refTable: 'item',
      refKeys: ['id'], // item's primary key is NOT in uniqueKeys() → not uniq
    };
    const result = SchemaRelationService.addForeignKey(svc, req) as FKMutateResult;

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('RefTableKeyNotUniq');

    expect(readFileSync(tempDir, 'config.cfg')).toBe(original);
  });

  // -------------------------------------------------------------------------
  // updateForeignKey
  // -------------------------------------------------------------------------

  it('updateForeignKey renames an FK', async () => {
    const svc = await createService(CFG);

    const add = SchemaRelationService.addForeignKey(svc, {
      table: 'weapon',
      fkName: 'oldFk',
      keys: ['id'],
      refTable: 'item',
    });
    expect(add.ok).toBe(true);

    const update = SchemaRelationService.updateForeignKey(svc, 'weapon', 'oldFk', {
      table: 'weapon',
      fkName: 'newFk',
      keys: ['id'],
      refTable: 'item',
    }) as FKMutateResult;
    expect(update.ok).toBe(true);

    const cfg = readFileSync(tempDir, 'config.cfg');
    expect(cfg).not.toContain('oldFk');
    expect(cfg).toContain('->newFk:[id] ->item;');
  });

  it('updateForeignKey preserves inline FK name (FK name == field name)', async () => {
    // Inline FK: `owner:int ->item;` — the FK name equals the field name.
    // Updating its attributes must NOT be rejected as a field-name conflict.
    const CFG_INLINE = `table item[id] {
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
    writeFile(tempDir, 'config.cfg', CFG_INLINE);
    // weapon now has an owner column — CSV must match or the table is dropped.
    writeFile(
      tempDir,
      'weapon.csv',
      `武器ID,名称,伤害,所属
id,name,damage,owner
1,sword,10,1
`,
    );
    const svc = await EditorService.create(tempDir);

    // Change only the ref target; keep the inline FK name 'owner' explicitly.
    const update = SchemaRelationService.updateForeignKey(svc, 'weapon', 'owner', {
      table: 'weapon',
      fkName: 'owner',
      keys: ['owner'],
      refTable: 'item',
      nullable: true,
    }) as FKMutateResult;

    expect(update.ok).toBe(true);
    expect(update.errors).toEqual([]);

    const cfg = readFileSync(tempDir, 'config.cfg');
    // Inline form retained with updated nullable tag: owner:int ->item (nullable);
    expect(cfg).toContain('owner:int ->item');
  });

  // -------------------------------------------------------------------------
  // removeForeignKey
  // -------------------------------------------------------------------------

  it('removeForeignKey deletes the FK from cfg', async () => {
    const svc = await createService(CFG);

    const add = SchemaRelationService.addForeignKey(svc, {
      table: 'weapon',
      fkName: 'itemId',
      keys: ['id'],
      refTable: 'item',
    });
    expect(add.ok).toBe(true);

    const remove = SchemaRelationService.removeForeignKey(svc, 'weapon', 'itemId') as FKMutateResult;
    expect(remove.ok).toBe(true);

    const cfg = readFileSync(tempDir, 'config.cfg');
    expect(cfg).not.toContain('->item');
    expect(cfg).not.toContain('itemId');
  });

  it('removeForeignKey rejects unknown FK name', async () => {
    const svc = await createService(CFG);
    const original = readFileSync(tempDir, 'config.cfg');

    const remove = SchemaRelationService.removeForeignKey(svc, 'weapon', 'nope') as FKMutateResult;

    expect(remove.ok).toBe(false);
    expect(readFileSync(tempDir, 'config.cfg')).toBe(original);
  });

  // -------------------------------------------------------------------------
  // listFks
  // -------------------------------------------------------------------------

  it('listFks returns the FK list of a table', async () => {
    const svc = await createService(CFG);

    SchemaRelationService.addForeignKey(svc, {
      table: 'weapon',
      fkName: 'itemId',
      keys: ['id'],
      refTable: 'item',
    });

    const result = SchemaRelationService.listFks(svc, 'weapon') as FKListResult;
    expect(result.ok).toBe(true);
    expect(result.fks.length).toBe(1);

    const fk = result.fks[0];
    expect(fk.name).toBe('itemId');
    expect(fk.keys).toEqual(['id']);
    expect(fk.refTable).toBe('item');
    expect(fk.refType).toBe('rPrimary');
  });

  // -------------------------------------------------------------------------
  // async variants
  // -------------------------------------------------------------------------

  it('async variants match sync results', async () => {
    const svc = await createService(CFG);

    const syncReq: FKAddRequest = {
      table: 'weapon',
      fkName: 'itemId',
      keys: ['id'],
      refTable: 'item',
    };
    const asyncReq: FKAddRequest = {
      table: 'weapon',
      fkName: 'itemName',
      keys: ['name'],
      refTable: 'item',
      refKeys: ['name'],
    };

    // Apply once via sync and once via async (different names to avoid
    // conflicts); each call re-reads config.cfg from disk.
    const syncResult = SchemaRelationService.addForeignKey(svc, syncReq);
    const asyncResult = await SchemaRelationService.addForeignKeyAsync(svc, asyncReq);

    expect(syncResult.ok).toBe(true);
    expect(asyncResult.ok).toBe(true);

    // Both persisted FKs must be visible via both read paths.
    const syncList = SchemaRelationService.listFks(svc, 'weapon');
    const asyncList = await SchemaRelationService.listFksAsync(svc, 'weapon');
    expect(syncList.ok).toBe(true);
    expect(asyncList.ok).toBe(true);
    expect(asyncList.fks.length).toBe(syncList.fks.length);
    expect(asyncList.fks.length).toBe(2);

    const byName = (name: string) => asyncList.fks.find((f) => f.name === name)!;
    const syncById = syncList.fks.find((f) => f.name === 'itemId')!;
    const asyncByName = byName('itemName');
    expect(syncById.name).toBe('itemId');
    expect(syncById.keys).toEqual(['id']);
    expect(syncById.refTable).toBe('item');
    expect(syncById.refType).toBe('rPrimary');
    expect(asyncByName.name).toBe('itemName');
    expect(asyncByName.keys).toEqual(['name']);
    expect(asyncByName.refTable).toBe('item');
    expect(asyncByName.refKeys).toEqual(['name']);
    expect(asyncByName.refType).toBe('rUniq');
  });
});