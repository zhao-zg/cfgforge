/**
 * RecordRefIdsService tests — T9.5
 *
 * RecordRefIdsService returns a simplified reference graph (only table/id/title/depth)
 * with configurable inDepth and outDepth, and a maxRefIds truncation.
 *
 * Tests cover:
 * - Basic refOut: self(0) + referenced items at depth 1
 * - Multi-layer refOut: depth 2 expansion
 * - refIn: records that reference the target at depth -1
 * - Multi-layer refIn: depth -2 expansion
 * - Combined refIn + refOut
 * - Dedup: records already in result are not re-added
 * - maxRefIds truncation
 * - Error codes: tableNotSet, idNotSet, paramErr, tableNotFound, idParseErr, idNotFound
 * - title field from getBriefTitle
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EditorService } from '../EditorService';
import { RecordRefIdsService } from '../RecordRefIdsService';
import type { RecordRefIdsResult, RecordRefId } from '../RecordRefIdsService';

function writeFile(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Fixture: user -> item (ref-out), user -> weapon (ref-out)
// item and weapon have no outgoing refs.
// user(1) refs item(100), weapon(1)
// user(2) refs item(101), weapon(0) — weapon(0) doesn't exist
// user(3) refs item(200), weapon(0)
// ---------------------------------------------------------------------------

const ITEM_CFG = `table item[id] (title='name') {
  id:int;
  name:str;
}
`;

const ITEM_CSV = `ID,名称
id,name
100,剑
101,盾
200,弓
`;

const WEAPON_CFG = `table weapon[id] (title='name') {
  id:int;
  name:str;
}
`;

const WEAPON_CSV = `ID,名称
id,name
1,木剑
2,铁剑
`;

const USER_CFG = `table user[id] (title='name') {
  id:int;
  name:str;
  ref:int -> item;
  weaponref:int -> weapon;
}
`;

const USER_CSV = `用户ID,姓名,引用,武器引用
id,name,ref,weaponref
1,Alice,100,1
2,Bob,101,0
3,Charlie,200,0
`;

// ---------------------------------------------------------------------------
// Fixture for multi-layer: a -> b -> c
// a(1) refs b(10), b(10) refs c(100)
// ---------------------------------------------------------------------------

const C_CFG = `table c[id] (title='name') {
  id:int;
  name:str;
}
`;

const C_CSV = `ID,名称
id,name
100,ccc
`;

const B_CFG = `table b[id] (title='name') {
  id:int;
  name:str;
  cref:int -> c;
}
`;

const B_CSV = `ID,名称,引用
id,name,cref
10,bbb,100
`;

const A_CFG = `table a[id] (title='name') {
  id:int;
  name:str;
  bref:int -> b;
}
`;

const A_CSV = `ID,名称,引用
id,name,bref
1,aaa,10
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RecordRefIdsService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-refids-'));
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
  // Basic refOut
  // -------------------------------------------------------------------------

  it('returns self at depth 0 and refOut at depth 1', async () => {
    const svc = await createService(
      [ITEM_CFG, WEAPON_CFG, USER_CFG].join('\n'),
      {
        'item.csv': ITEM_CSV,
        'weapon.csv': WEAPON_CSV,
        'user.csv': USER_CSV,
      },
    );
    const svc2 = new RecordRefIdsService(
      svc.cfgValue(), svc.graph(), 'user', '1', 0, 1, 100,
    );
    const result = svc2.retrieve() as RecordRefIdsResult;

    expect(result.resultCode).toBe('ok');
    expect(result.table).toBe('user');
    expect(result.id).toBe('1');
    expect(result.inDepth).toBe(0);
    expect(result.outDepth).toBe(1);
    expect(result.maxRefIds).toBe(100);

    // Self at depth 0
    const self = result.recordRefIds.find((r) => r.table === 'user' && r.id === '1');
    expect(self).toBeDefined();
    expect(self!.depth).toBe(0);
    expect(self!.title).toBe('Alice');

    // refOut: item(100) at depth 1, weapon(1) at depth 1
    const itemRef = result.recordRefIds.find((r) => r.table === 'item' && r.id === '100');
    expect(itemRef).toBeDefined();
    expect(itemRef!.depth).toBe(1);
    expect(itemRef!.title).toBe('剑');

    const weaponRef = result.recordRefIds.find((r) => r.table === 'weapon' && r.id === '1');
    expect(weaponRef).toBeDefined();
    expect(weaponRef!.depth).toBe(1);
    expect(weaponRef!.title).toBe('木剑');
  });

  // -------------------------------------------------------------------------
  // Multi-layer refOut
  // -------------------------------------------------------------------------

  it('expands refOut to depth 2', async () => {
    const svc = await createService(
      [C_CFG, B_CFG, A_CFG].join('\n'),
      {
        'c.csv': C_CSV,
        'b.csv': B_CSV,
        'a.csv': A_CSV,
      },
    );
    const svc2 = new RecordRefIdsService(
      svc.cfgValue(), svc.graph(), 'a', '1', 0, 2, 100,
    );
    const result = svc2.retrieve() as RecordRefIdsResult;

    expect(result.resultCode).toBe('ok');

    // Self at depth 0
    const self = result.recordRefIds.find((r) => r.table === 'a' && r.id === '1');
    expect(self).toBeDefined();
    expect(self!.depth).toBe(0);

    // b(10) at depth 1
    const bRef = result.recordRefIds.find((r) => r.table === 'b' && r.id === '10');
    expect(bRef).toBeDefined();
    expect(bRef!.depth).toBe(1);

    // c(100) at depth 2
    const cRef = result.recordRefIds.find((r) => r.table === 'c' && r.id === '100');
    expect(cRef).toBeDefined();
    expect(cRef!.depth).toBe(2);
  });

  // -------------------------------------------------------------------------
  // refIn
  // -------------------------------------------------------------------------

  it('returns refIn at depth -1', async () => {
    const svc = await createService(
      [ITEM_CFG, WEAPON_CFG, USER_CFG].join('\n'),
      {
        'item.csv': ITEM_CSV,
        'weapon.csv': WEAPON_CSV,
        'user.csv': USER_CSV,
      },
    );
    // item(100) is referenced by user(1) → refIn
    const svc2 = new RecordRefIdsService(
      svc.cfgValue(), svc.graph(), 'item', '100', 1, 0, 100,
    );
    const result = svc2.retrieve() as RecordRefIdsResult;

    expect(result.resultCode).toBe('ok');

    // Self at depth 0
    const self = result.recordRefIds.find((r) => r.table === 'item' && r.id === '100');
    expect(self).toBeDefined();
    expect(self!.depth).toBe(0);

    // refIn: user(1) at depth -1
    const refInUser = result.recordRefIds.find((r) => r.table === 'user' && r.id === '1');
    expect(refInUser).toBeDefined();
    expect(refInUser!.depth).toBe(-1);
  });

  // -------------------------------------------------------------------------
  // Multi-layer refIn
  // -------------------------------------------------------------------------

  it('expands refIn to depth -2', async () => {
    const svc = await createService(
      [C_CFG, B_CFG, A_CFG].join('\n'),
      {
        'c.csv': C_CSV,
        'b.csv': B_CSV,
        'a.csv': A_CSV,
      },
    );
    // c(100) is referenced by b(10), b(10) is referenced by a(1)
    // Request refIn depth=2 for c:100
    const svc2 = new RecordRefIdsService(
      svc.cfgValue(), svc.graph(), 'c', '100', 2, 0, 100,
    );
    const result = svc2.retrieve() as RecordRefIdsResult;

    expect(result.resultCode).toBe('ok');

    // Self at depth 0
    const self = result.recordRefIds.find((r) => r.table === 'c' && r.id === '100');
    expect(self).toBeDefined();
    expect(self!.depth).toBe(0);

    // b(10) at depth -1 (references c:100)
    const bRef = result.recordRefIds.find((r) => r.table === 'b' && r.id === '10');
    expect(bRef).toBeDefined();
    expect(bRef!.depth).toBe(-1);

    // a(1) at depth -2 (references b:10)
    const aRef = result.recordRefIds.find((r) => r.table === 'a' && r.id === '1');
    expect(aRef).toBeDefined();
    expect(aRef!.depth).toBe(-2);
  });

  // -------------------------------------------------------------------------
  // Combined refIn + refOut
  // -------------------------------------------------------------------------

  it('returns combined refIn and refOut', async () => {
    const svc = await createService(
      [C_CFG, B_CFG, A_CFG].join('\n'),
      {
        'c.csv': C_CSV,
        'b.csv': B_CSV,
        'a.csv': A_CSV,
      },
    );
    // b(10): refOut to c(100), refIn from a(1)
    const svc2 = new RecordRefIdsService(
      svc.cfgValue(), svc.graph(), 'b', '10', 1, 1, 100,
    );
    const result = svc2.retrieve() as RecordRefIdsResult;

    expect(result.resultCode).toBe('ok');

    // Self at depth 0
    const self = result.recordRefIds.find((r) => r.table === 'b' && r.id === '10');
    expect(self).toBeDefined();
    expect(self!.depth).toBe(0);

    // refIn: a(1) at depth -1
    const aRef = result.recordRefIds.find((r) => r.table === 'a' && r.id === '1');
    expect(aRef).toBeDefined();
    expect(aRef!.depth).toBe(-1);

    // refOut: c(100) at depth 1
    const cRef = result.recordRefIds.find((r) => r.table === 'c' && r.id === '100');
    expect(cRef).toBeDefined();
    expect(cRef!.depth).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Dedup: self should not be re-added by refIn or refOut
  // -------------------------------------------------------------------------

  it('does not duplicate self in refIn or refOut', async () => {
    const svc = await createService(
      [ITEM_CFG, WEAPON_CFG, USER_CFG].join('\n'),
      {
        'item.csv': ITEM_CSV,
        'weapon.csv': WEAPON_CSV,
        'user.csv': USER_CSV,
      },
    );
    const svc2 = new RecordRefIdsService(
      svc.cfgValue(), svc.graph(), 'user', '1', 1, 1, 100,
    );
    const result = svc2.retrieve() as RecordRefIdsResult;

    // Only one entry for user:1
    const userEntries = result.recordRefIds.filter((r) => r.table === 'user' && r.id === '1');
    expect(userEntries.length).toBe(1);
    expect(userEntries[0].depth).toBe(0);
  });

  // -------------------------------------------------------------------------
  // maxRefIds truncation
  // -------------------------------------------------------------------------

  it('truncates results when maxRefIds is exceeded', async () => {
    const svc = await createService(
      [ITEM_CFG, WEAPON_CFG, USER_CFG].join('\n'),
      {
        'item.csv': ITEM_CSV,
        'weapon.csv': WEAPON_CSV,
        'user.csv': USER_CSV,
      },
    );
    // user(1) has refOut to item(100) and weapon(1), plus self = 3 entries total.
    // Java uses `result.size() > maxRefIds` (strictly greater) as the break condition,
    // so maxRefIds=1 allows self(1) + 1 ref = 2 entries before breaking.
    const svc2 = new RecordRefIdsService(
      svc.cfgValue(), svc.graph(), 'user', '1', 0, 1, 1,
    );
    const result = svc2.retrieve() as RecordRefIdsResult;

    expect(result.resultCode).toBe('ok');
    // Without truncation there would be 3 (self + item + weapon).
    // With maxRefIds=1, at most 2 entries (self + 1 ref before size > 1 triggers break).
    expect(result.recordRefIds.length).toBe(2);
    // Self should always be included
    const self = result.recordRefIds.find((r) => r.table === 'user' && r.id === '1');
    expect(self).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Error codes
  // -------------------------------------------------------------------------

  it('returns tableNotSet when table is null', async () => {
    const svc = await createService(
      [ITEM_CFG].join('\n'),
      { 'item.csv': ITEM_CSV },
    );
    const svc2 = new RecordRefIdsService(
      svc.cfgValue(), svc.graph(), null, '100', 0, 1, 100,
    );
    const result = svc2.retrieve() as RecordRefIdsResult;
    expect(result.resultCode).toBe('tableNotSet');
    expect(result.recordRefIds).toEqual([]);
  });

  it('returns idNotSet when id is null', async () => {
    const svc = await createService(
      [ITEM_CFG].join('\n'),
      { 'item.csv': ITEM_CSV },
    );
    const svc2 = new RecordRefIdsService(
      svc.cfgValue(), svc.graph(), 'item', null, 0, 1, 100,
    );
    const result = svc2.retrieve() as RecordRefIdsResult;
    expect(result.resultCode).toBe('idNotSet');
  });

  it('returns paramErr when inDepth < 0', async () => {
    const svc = await createService(
      [ITEM_CFG].join('\n'),
      { 'item.csv': ITEM_CSV },
    );
    const svc2 = new RecordRefIdsService(
      svc.cfgValue(), svc.graph(), 'item', '100', -1, 1, 100,
    );
    const result = svc2.retrieve() as RecordRefIdsResult;
    expect(result.resultCode).toBe('paramErr');
  });

  it('returns paramErr when outDepth < 0', async () => {
    const svc = await createService(
      [ITEM_CFG].join('\n'),
      { 'item.csv': ITEM_CSV },
    );
    const svc2 = new RecordRefIdsService(
      svc.cfgValue(), svc.graph(), 'item', '100', 0, -1, 100,
    );
    const result = svc2.retrieve() as RecordRefIdsResult;
    expect(result.resultCode).toBe('paramErr');
  });

  it('returns paramErr when maxRefIds <= 0', async () => {
    const svc = await createService(
      [ITEM_CFG].join('\n'),
      { 'item.csv': ITEM_CSV },
    );
    const svc2 = new RecordRefIdsService(
      svc.cfgValue(), svc.graph(), 'item', '100', 0, 1, 0,
    );
    const result = svc2.retrieve() as RecordRefIdsResult;
    expect(result.resultCode).toBe('paramErr');
  });

  it('returns tableNotFound when table does not exist', async () => {
    const svc = await createService(
      [ITEM_CFG].join('\n'),
      { 'item.csv': ITEM_CSV },
    );
    const svc2 = new RecordRefIdsService(
      svc.cfgValue(), svc.graph(), 'nonexistent', '1', 0, 1, 100,
    );
    const result = svc2.retrieve() as RecordRefIdsResult;
    expect(result.resultCode).toBe('tableNotFound');
  });

  it('returns idParseErr when id cannot be parsed', async () => {
    const svc = await createService(
      [ITEM_CFG].join('\n'),
      { 'item.csv': ITEM_CSV },
    );
    // item.id is int → 'abc' should fail to parse
    const svc2 = new RecordRefIdsService(
      svc.cfgValue(), svc.graph(), 'item', 'abc', 0, 1, 100,
    );
    const result = svc2.retrieve() as RecordRefIdsResult;
    expect(result.resultCode).toBe('idParseErr');
  });

  it('returns idNotFound when record does not exist', async () => {
    const svc = await createService(
      [ITEM_CFG].join('\n'),
      { 'item.csv': ITEM_CSV },
    );
    // item has ids 100,101,200 → 999 not found
    const svc2 = new RecordRefIdsService(
      svc.cfgValue(), svc.graph(), 'item', '999', 0, 1, 100,
    );
    const result = svc2.retrieve() as RecordRefIdsResult;
    expect(result.resultCode).toBe('idNotFound');
  });

  // -------------------------------------------------------------------------
  // inDepth=0 and outDepth=0: only self
  // -------------------------------------------------------------------------

  it('returns only self when both inDepth and outDepth are 0', async () => {
    const svc = await createService(
      [ITEM_CFG, WEAPON_CFG, USER_CFG].join('\n'),
      {
        'item.csv': ITEM_CSV,
        'weapon.csv': WEAPON_CSV,
        'user.csv': USER_CSV,
      },
    );
    const svc2 = new RecordRefIdsService(
      svc.cfgValue(), svc.graph(), 'user', '1', 0, 0, 100,
    );
    const result = svc2.retrieve() as RecordRefIdsResult;

    expect(result.resultCode).toBe('ok');
    expect(result.recordRefIds.length).toBe(1);
    expect(result.recordRefIds[0].table).toBe('user');
    expect(result.recordRefIds[0].id).toBe('1');
    expect(result.recordRefIds[0].depth).toBe(0);
  });
});
