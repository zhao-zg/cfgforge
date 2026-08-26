/**
 * RecordService tests — T9.3
 *
 * RecordService provides data for the cfgeditor record relationship UI:
 *   - requestRecord: JSON object of a single record + its refs
 *   - requestRefs: expanded ref-out graph (optionally including ref-in)
 *   - requestUnreferenced: unreferenced records in a table
 *
 * Tests cover:
 * - requestRecord: returns JSON object + refs (depth=1)
 * - requestRefs: expands ref-out graph to given depth
 * - requestRefs with in=true: includes ref-in records (depth=-1)
 * - requestUnreferenced: finds unreferenced records
 * - error codes: tableNotSet, idNotSet, tableNotFound, idParseErr, idNotFound, paramErr
 * - BriefRecord structure: table, id, title, descriptions, value, refs, depth
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EditorService } from '../EditorService';
import { RecordService } from '../RecordService';
import type {
  RecordResult,
  RecordRefsResult,
  UnreferencedRecordsResult,
  BriefRecord,
} from '../RecordService';

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
// item has no incoming from anything except user, so it's referenced.
// weapon is not referenced by anyone → unreferenced.
// ---------------------------------------------------------------------------

const ITEM_CFG = `table item[id] (title='name', entry='name') {
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

const WEAPON_CFG = `table weapon[id] (title='name', description='name,damage') {
  id:int;
  name:str;
  damage:int;
}
`;

const WEAPON_CSV = `ID,名称,伤害
id,name,damage
1,木剑,10
2,铁剑,20
`;

const USER_CFG = `table user[id] (title='name', description='name,age') {
  id:int;
  name:str;
  age:int;
  ref:int -> item;
  weaponref:int -> weapon;
}
`;

const USER_CSV = `用户ID,姓名,年龄,引用,武器引用
id,name,age,ref,weaponref
1,Alice,25,100,1
2,Bob,30,101,0
3,Charlie,35,200,0
`;

// ---------------------------------------------------------------------------
// Fixture: enum table with title (for getBriefTitle enum prefix test)
// ---------------------------------------------------------------------------

const ENUM_CFG = `table shapetype[type] (enum='type') {
  type:str;
  comment:text;
}

table shape[id] (enum='type', title='name') {
  id:int;
  type:str;
  name:str;
}
`;

const SHAPETYPE_CSV = `类型,注释
type,comment
Circle,圆
Square,方
`;

const SHAPE_CSV = `ID,类型,名称
id,type,name
1,Circle,小圆
2,Square,大方
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RecordService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-record-'));
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
  // requestRecord
  // -------------------------------------------------------------------------

  it('requestRecord returns JSON object and refs at depth 1', async () => {
    const svc = await createService(
      [ITEM_CFG, WEAPON_CFG, USER_CFG].join('\n'),
      {
        'item.csv': ITEM_CSV,
        'weapon.csv': WEAPON_CSV,
        'user.csv': USER_CSV,
      },
    );
    const rs = new RecordService(
      svc.cfgValue(), svc.graph(), 'user', '1', 1, false, 100, 'requestRecord',
    );
    const result = rs.retrieve() as RecordResult;

    expect(result.resultCode).toBe('ok');
    expect(result.table).toBe('user');
    expect(result.id).toBe('1');
    expect(result.maxObjs).toBe(100);
    expect(result.object).not.toBeNull();
    expect(result.object!['$type']).toBe('user');
    expect(result.object!['id']).toBe(1);
    expect(result.object!['name']).toBe('Alice');
    expect(result.object!['age']).toBe(25);
    expect(result.object!['ref']).toBe(100);
    expect(result.object!['weaponref']).toBe(1);
    // $refs should be present since user has FK refs
    expect(result.object!['$refs']).toBeDefined();
    expect(Array.isArray(result.object!['$refs'])).toBe(true);

    // refs: should include item(100) and weapon(1) at depth 1
    expect(result.refs).not.toBeNull();
    expect(result.refs!.length).toBe(2);
    const itemRef = result.refs!.find((r) => r.table === 'item');
    expect(itemRef).toBeDefined();
    expect(itemRef!.id).toBe('100');
    expect(itemRef!.depth).toBe(1);
    expect(itemRef!.title).toBe('剑');
    const weaponRef = result.refs!.find((r) => r.table === 'weapon');
    expect(weaponRef).toBeDefined();
    expect(weaponRef!.id).toBe('1');
    expect(weaponRef!.title).toBe('木剑');
  });

  it('requestRecord does not include self in refs', async () => {
    const svc = await createService(
      [ITEM_CFG, WEAPON_CFG, USER_CFG].join('\n'),
      {
        'item.csv': ITEM_CSV,
        'weapon.csv': WEAPON_CSV,
        'user.csv': USER_CSV,
      },
    );
    const rs = new RecordService(
      svc.cfgValue(), svc.graph(), 'user', '1', 1, false, 100, 'requestRecord',
    );
    const result = rs.retrieve() as RecordResult;

    // Self (user:1) should NOT be in refs
    const selfRef = result.refs!.find((r) => r.table === 'user' && r.id === '1');
    expect(selfRef).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // requestRefs
  // -------------------------------------------------------------------------

  it('requestRefs expands ref-out graph including self at depth 0', async () => {
    const svc = await createService(
      [ITEM_CFG, WEAPON_CFG, USER_CFG].join('\n'),
      {
        'item.csv': ITEM_CSV,
        'weapon.csv': WEAPON_CSV,
        'user.csv': USER_CSV,
      },
    );
    const rs = new RecordService(
      svc.cfgValue(), svc.graph(), 'user', '1', 1, false, 100, 'requestRefs',
    );
    const result = rs.retrieve() as RecordRefsResult;

    expect(result.resultCode).toBe('ok');
    expect(result.table).toBe('user');
    expect(result.id).toBe('1');
    expect(result.depth).toBe(1);
    expect(result.in).toBe(false);

    // Should include self at depth 0, and refs at depth 1
    expect(result.refs).not.toBeNull();
    const selfRef = result.refs!.find((r) => r.table === 'user' && r.id === '1');
    expect(selfRef).toBeDefined();
    expect(selfRef!.depth).toBe(0);

    const itemRef = result.refs!.find((r) => r.table === 'item');
    expect(itemRef).toBeDefined();
    expect(itemRef!.depth).toBe(1);
  });

  it('requestRefs with depth 0 returns only self', async () => {
    const svc = await createService(
      [ITEM_CFG, WEAPON_CFG, USER_CFG].join('\n'),
      {
        'item.csv': ITEM_CSV,
        'weapon.csv': WEAPON_CSV,
        'user.csv': USER_CSV,
      },
    );
    const rs = new RecordService(
      svc.cfgValue(), svc.graph(), 'user', '1', 0, false, 100, 'requestRefs',
    );
    const result = rs.retrieve() as RecordRefsResult;

    expect(result.refs!.length).toBe(1);
    expect(result.refs![0].table).toBe('user');
    expect(result.refs![0].id).toBe('1');
    expect(result.refs![0].depth).toBe(0);
  });

  it('requestRefs with in=true includes ref-in records at depth -1', async () => {
    const svc = await createService(
      [ITEM_CFG, WEAPON_CFG, USER_CFG].join('\n'),
      {
        'item.csv': ITEM_CSV,
        'weapon.csv': WEAPON_CSV,
        'user.csv': USER_CSV,
      },
    );
    // item(100) is referenced by user(1). Request refs for item:100 with in=true.
    const rs = new RecordService(
      svc.cfgValue(), svc.graph(), 'item', '100', 1, true, 100, 'requestRefs',
    );
    const result = rs.retrieve() as RecordRefsResult;

    expect(result.resultCode).toBe('ok');
    expect(result.in).toBe(true);

    // Self at depth 0
    const selfRef = result.refs!.find((r) => r.table === 'item' && r.id === '100');
    expect(selfRef).toBeDefined();
    expect(selfRef!.depth).toBe(0);

    // Ref-in: user(1) references item(100) → depth -1
    const refInUser = result.refs!.find((r) => r.table === 'user' && r.id === '1');
    expect(refInUser).toBeDefined();
    expect(refInUser!.depth).toBe(-1);
  });

  // -------------------------------------------------------------------------
  // requestUnreferenced
  // -------------------------------------------------------------------------

  it('requestUnreferenced finds unreferenced records', async () => {
    const svc = await createService(
      [ITEM_CFG, WEAPON_CFG, USER_CFG].join('\n'),
      {
        'item.csv': ITEM_CSV,
        'weapon.csv': WEAPON_CSV,
        'user.csv': USER_CSV,
      },
    );
    // weapon table: weapon(1) is referenced by user(1), weapon(2) is NOT referenced
    const rs = new RecordService(
      svc.cfgValue(), svc.graph(), 'weapon', null, 0, false, 100, 'requestUnreferenced',
    );
    const result = rs.retrieve() as UnreferencedRecordsResult;

    expect(result.resultCode).toBe('ok');
    expect(result.table).toBe('weapon');
    expect(result.refs).not.toBeNull();
    // weapon(1) is referenced by user(1) → not unreferenced
    // weapon(2) is not referenced → unreferenced
    const ids = result.refs!.map((r) => r.id);
    expect(ids).not.toContain('1');
    expect(ids).toContain('2');
  });

  it('requestUnreferenced with all referenced returns empty list', async () => {
    const svc = await createService(
      [ITEM_CFG, WEAPON_CFG, USER_CFG].join('\n'),
      {
        'item.csv': ITEM_CSV,
        'weapon.csv': WEAPON_CSV,
        'user.csv': USER_CSV,
      },
    );
    // item table: item(100) ref by user(1), item(101) ref by user(2), item(200) ref by user(3)
    // All items are referenced → no unreferenced
    const rs = new RecordService(
      svc.cfgValue(), svc.graph(), 'item', null, 0, false, 100, 'requestUnreferenced',
    );
    const result = rs.retrieve() as UnreferencedRecordsResult;

    expect(result.resultCode).toBe('ok');
    expect(result.refs!.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Error codes
  // -------------------------------------------------------------------------

  it('returns tableNotSet when table is null', async () => {
    const svc = await createService(
      [ITEM_CFG].join('\n'),
      { 'item.csv': ITEM_CSV },
    );
    const rs = new RecordService(
      svc.cfgValue(), svc.graph(), null, '100', 1, false, 100, 'requestRecord',
    );
    const result = rs.retrieve() as RecordResult;
    expect(result.resultCode).toBe('tableNotSet');
    expect(result.object).toBeNull();
    expect(result.refs).toBeNull();
  });

  it('returns idNotSet when id is null for requestRecord', async () => {
    const svc = await createService(
      [ITEM_CFG].join('\n'),
      { 'item.csv': ITEM_CSV },
    );
    const rs = new RecordService(
      svc.cfgValue(), svc.graph(), 'item', null, 1, false, 100, 'requestRecord',
    );
    const result = rs.retrieve() as RecordResult;
    expect(result.resultCode).toBe('idNotSet');
  });

  it('returns tableNotFound when table does not exist', async () => {
    const svc = await createService(
      [ITEM_CFG].join('\n'),
      { 'item.csv': ITEM_CSV },
    );
    const rs = new RecordService(
      svc.cfgValue(), svc.graph(), 'nonexistent', '1', 1, false, 100, 'requestRecord',
    );
    const result = rs.retrieve() as RecordResult;
    expect(result.resultCode).toBe('tableNotFound');
  });

  it('returns idParseErr when id cannot be parsed', async () => {
    const svc = await createService(
      [ITEM_CFG].join('\n'),
      { 'item.csv': ITEM_CSV },
    );
    // item.id is int → 'abc' should fail to parse
    const rs = new RecordService(
      svc.cfgValue(), svc.graph(), 'item', 'abc', 1, false, 100, 'requestRecord',
    );
    const result = rs.retrieve() as RecordResult;
    expect(result.resultCode).toBe('idParseErr');
  });

  it('returns idNotFound when record does not exist', async () => {
    const svc = await createService(
      [ITEM_CFG].join('\n'),
      { 'item.csv': ITEM_CSV },
    );
    // item has ids 100,101,200 → 999 not found
    const rs = new RecordService(
      svc.cfgValue(), svc.graph(), 'item', '999', 1, false, 100, 'requestRecord',
    );
    const result = rs.retrieve() as RecordResult;
    expect(result.resultCode).toBe('idNotFound');
  });

  it('returns paramErr when depth < 0', async () => {
    const svc = await createService(
      [ITEM_CFG].join('\n'),
      { 'item.csv': ITEM_CSV },
    );
    const rs = new RecordService(
      svc.cfgValue(), svc.graph(), 'item', '100', -1, false, 100, 'requestRecord',
    );
    const result = rs.retrieve() as RecordResult;
    expect(result.resultCode).toBe('paramErr');
  });

  it('returns paramErr when maxObjs <= 0', async () => {
    const svc = await createService(
      [ITEM_CFG].join('\n'),
      { 'item.csv': ITEM_CSV },
    );
    const rs = new RecordService(
      svc.cfgValue(), svc.graph(), 'item', '100', 1, false, 0, 'requestRecord',
    );
    const result = rs.retrieve() as RecordResult;
    expect(result.resultCode).toBe('paramErr');
  });

  // -------------------------------------------------------------------------
  // BriefRecord structure
  // -------------------------------------------------------------------------

  it('BriefRecord has descriptions from meta description', async () => {
    const svc = await createService(
      [ITEM_CFG, WEAPON_CFG, USER_CFG].join('\n'),
      {
        'item.csv': ITEM_CSV,
        'weapon.csv': WEAPON_CSV,
        'user.csv': USER_CSV,
      },
    );
    const rs = new RecordService(
      svc.cfgValue(), svc.graph(), 'user', '1', 1, false, 100, 'requestRefs',
    );
    const result = rs.retrieve() as RecordRefsResult;

    const selfRef = result.refs!.find((r) => r.table === 'user' && r.id === '1');
    expect(selfRef!.descriptions).toBeDefined();
    expect(selfRef!.descriptions!.length).toBe(2);
    const nameDesc = selfRef!.descriptions!.find((d) => d.field === 'name');
    expect(nameDesc).toBeDefined();
    expect(nameDesc!.value).toBe('Alice');
    const ageDesc = selfRef!.descriptions!.find((d) => d.field === 'age');
    expect(ageDesc).toBeDefined();
    expect(ageDesc!.value).toBe('25');
  });

  it('BriefRecord has packStr value', async () => {
    const svc = await createService(
      [ITEM_CFG, WEAPON_CFG, USER_CFG].join('\n'),
      {
        'item.csv': ITEM_CSV,
        'weapon.csv': WEAPON_CSV,
        'user.csv': USER_CSV,
      },
    );
    const rs = new RecordService(
      svc.cfgValue(), svc.graph(), 'user', '1', 1, false, 100, 'requestRefs',
    );
    const result = rs.retrieve() as RecordRefsResult;

    const selfRef = result.refs!.find((r) => r.table === 'user' && r.id === '1');
    // packStr for VStruct returns the table/schema name in the TS port
    expect(selfRef!.value).toBe('user');
  });

  it('BriefRecord has field refs', async () => {
    const svc = await createService(
      [ITEM_CFG, WEAPON_CFG, USER_CFG].join('\n'),
      {
        'item.csv': ITEM_CSV,
        'weapon.csv': WEAPON_CSV,
        'user.csv': USER_CSV,
      },
    );
    const rs = new RecordService(
      svc.cfgValue(), svc.graph(), 'user', '1', 1, false, 100, 'requestRefs',
    );
    const result = rs.retrieve() as RecordRefsResult;

    const selfRef = result.refs!.find((r) => r.table === 'user' && r.id === '1');
    expect(selfRef!.$refs.length).toBe(2);
    const itemFieldRef = selfRef!.$refs.find((r) => r.toTable === 'item');
    expect(itemFieldRef).toBeDefined();
    expect(itemFieldRef!.toId).toBe('100');
    expect(itemFieldRef!.firstField).toBe('ref');
    const weaponFieldRef = selfRef!.$refs.find((r) => r.toTable === 'weapon');
    expect(weaponFieldRef).toBeDefined();
    expect(weaponFieldRef!.toId).toBe('1');
    expect(weaponFieldRef!.firstField).toBe('weaponref');
  });

  // -------------------------------------------------------------------------
  // getBriefTitle with enum prefix
  // -------------------------------------------------------------------------

  it('getBriefTitle prefixes enum value for enum table with non-enum PK', async () => {
    const svc = await createService(
      [ENUM_CFG].join('\n'),
      {
        'shapetype.csv': SHAPETYPE_CSV,
        'shape.csv': SHAPE_CSV,
      },
    );
    const rs = new RecordService(
      svc.cfgValue(), svc.graph(), 'shape', '1', 1, false, 100, 'requestRefs',
    );
    const result = rs.retrieve() as RecordRefsResult;

    // shape table: enum='type', pk=id (int). Enum field is 'type'.
    // Record 1: type=Circle, name=小圆 → title should be "Circle: 小圆"
    const selfRef = result.refs!.find((r) => r.table === 'shape' && r.id === '1');
    expect(selfRef).toBeDefined();
    expect(selfRef!.title).toBe('Circle: 小圆');
  });

  // -------------------------------------------------------------------------
  // maxObjs limit
  // -------------------------------------------------------------------------

  it('maxObjs limits the number of refs returned', async () => {
    const svc = await createService(
      [ITEM_CFG, WEAPON_CFG, USER_CFG].join('\n'),
      {
        'item.csv': ITEM_CSV,
        'weapon.csv': WEAPON_CSV,
        'user.csv': USER_CSV,
      },
    );
    // maxObjs=1: only 1 ref can be expanded
    const rs = new RecordService(
      svc.cfgValue(), svc.graph(), 'user', '1', 1, false, 1, 'requestRefs',
    );
    const result = rs.retrieve() as RecordRefsResult;

    // Self at depth 0, plus up to maxObjs(1) ref → total 2
    // But maxObjs limits result.size > maxObjs → at most 1 ref
    // Self is depth 0, so result has self + 0 or 1 ref
    expect(result.refs!.length).toBeLessThanOrEqual(2);
  });
});
