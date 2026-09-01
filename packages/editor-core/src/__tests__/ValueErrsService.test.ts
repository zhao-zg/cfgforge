/**
 * ValueErrsService tests
 *
 * collectValueErrs re-parses the editor's configuration and returns
 * all VErr/VWarn as ValueErrInfo[] with table/recordId/field/source info.
 *
 * Also tests toValueErrInfo pure function with mock VErr objects.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EditorService } from '../EditorService';
import { ValueErrsService, toValueErrInfo, type ValueErrInfo } from '../ValueErrsService';
import { CfgValueErrs, internalError, type VErr, type VWarn, type Msg } from '@cfgforge/value';
import { DCell, DCellList, DRowId, DFile } from '@cfgforge/data';

function writeFile(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Pure function tests: toValueErrInfo
// ---------------------------------------------------------------------------

describe('toValueErrInfo', () => {
  it('InternalError — no source, table empty, level=err', () => {
    const err = internalError('something went wrong') as VErr;
    const info = toValueErrInfo(err);
    expect(info.errType).toBe('InternalError');
    expect(info.level).toBe('err');
    expect(info.table).toBe('');
    expect(info.recordId).toBeUndefined();
    expect(info.msg).toContain('InternalError');
  });

  it('VErr with DCell source — sourceKind=cell, sourceDesc has A1 coords', () => {
    const dRowId = new DRowId('item.csv', '', 4);
    const cell = new DCell('abc', dRowId, 2, 0);
    // Use a VErr that has `source` field — construct mock
    const mockErr = {
      _tag: 'NotMatchFieldType',
      source: cell,
      nameable: 'item',
      field: 'id',
      expectedType: 'INT',
      msg: () => 'NotMatchFieldType(item, id, INT)',
    } as unknown as VErr;

    const info = toValueErrInfo(mockErr);
    expect(info.sourceKind).toBe('cell');
    expect(info.sourceDesc).toBe('item.csv!C5');
    expect(info.table).toBe('item');
    expect(info.field).toBe('id');
  });

  it('VErr with DFile source — sourceKind=file, sourceDesc has path', () => {
    const dfile = new DFile('data/item/Reward.json', 'Reward', ['amount']);
    const mockErr = {
      _tag: 'JsonParseException',
      source: dfile,
      err: 'unexpected token',
      msg: () => 'JsonParseException(data/item/Reward.json, unexpected token)',
    } as unknown as VErr;

    const info = toValueErrInfo(mockErr);
    expect(info.sourceKind).toBe('file');
    expect(info.sourceDesc).toBe('data/item/Reward.json.amount');
    expect(info.table).toBe('Reward');
  });

  it('ForeignValueNotFound — table from recordId prefix, field from foreignKey', () => {
    const mockErr = {
      _tag: 'ForeignValueNotFound',
      value: null,
      recordId: 'item-1',
      foreignTable: 'reward',
      foreignKey: 'rewardId',
      msg: () => 'ForeignValueNotFound(reward, rewardId)',
    } as unknown as VErr;

    const info = toValueErrInfo(mockErr);
    expect(info.table).toBe('item');
    expect(info.recordId).toBe('item-1');
    expect(info.field).toBe('rewardId');
  });

  it('RefNotNullableButCellEmpty — table from recordId prefix', () => {
    const mockErr = {
      _tag: 'RefNotNullableButCellEmpty',
      recordId: 'item-1',
      foreignKey: 'rewardId',
      msg: () => 'RefNotNullableButCellEmpty(item, rewardId)',
    } as unknown as VErr;

    const info = toValueErrInfo(mockErr);
    expect(info.table).toBe('item');
    expect(info.recordId).toBe('item-1');
  });

  it('PrimaryOrUniqueKeyDuplicated — table from table field, recordId from table-pk', () => {
    const mockErr = {
      _tag: 'PrimaryOrUniqueKeyDuplicated',
      value: {packStr: () => '1', source: null},
      table: 'item',
      keys: ['1'],
      msg: () => 'PrimaryOrUniqueKeyDuplicated(item, [1])',
    } as unknown as VErr;

    const info = toValueErrInfo(mockErr);
    expect(info.table).toBe('item');
    expect(info.recordId).toBe('item-1');
    expect(info.level).toBe('err');
  });

  it('VWarn (JsonHasExtraFields) — level=warn', () => {
    const dfile = new DFile('data/item/Item.json', 'Item', []);
    const mockWarn = {
      _tag: 'JsonHasExtraFields',
      source: dfile,
      type: 'Item',
      extraFields: new Set(['extra']),
      msg: () => 'JsonHasExtraFields(data/item/Item.json, Item, [extra])',
    } as unknown as VWarn;

    const info = toValueErrInfo(mockWarn);
    expect(info.level).toBe('warn');
    expect(info.table).toBe('Item');
  });

  it('VErr with DCellList source — takes first cell', () => {
    const dRowId = new DRowId('data.csv', '', 0);
    const cell1 = new DCell('val1', dRowId, 0, 0);
    const cellList = new DCellList([cell1]);
    const mockErr = {
      _tag: 'ParsePackErr',
      source: cellList,
      nameable: 'item',
      err: 'bad pack',
      msg: () => 'ParsePackErr(item, bad pack)',
    } as unknown as VErr;

    const info = toValueErrInfo(mockErr);
    expect(info.sourceKind).toBe('cell');
    expect(info.sourceDesc).toBe('data.csv!A1');
  });
});

// ---------------------------------------------------------------------------
// Integration tests: ValueErrsService.collectValueErrs
// ---------------------------------------------------------------------------

describe('ValueErrsService.collectValueErrs', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-valerrs-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('valid data — returns empty array', async () => {
    writeFile(tempDir, 'config.cfg', `table item[id] (title='name') {\n  id:int;\n  name:str;\n}\n`);
    writeFile(tempDir, 'item.csv', `ID,名称\nid,name\n1,剑\n2,盾\n`);
    const editor = await EditorService.create(tempDir);

    const errs = await ValueErrsService.collectValueErrs(editor);
    expect(errs).toEqual([]);
  });

  it('duplicate primary key — produces PrimaryOrUniqueKeyDuplicated', async () => {
    writeFile(tempDir, 'config.cfg', `table item[id] (title='name') {\n  id:int;\n  name:str;\n}\n`);
    writeFile(tempDir, 'item.csv', `ID,名称\nid,name\n1,剑\n1,盾\n`);
    const editor = await EditorService.create(tempDir);

    const errs = await ValueErrsService.collectValueErrs(editor);
    expect(errs.length).toBeGreaterThan(0);

    const dupErr = errs.find(e => e.errType === 'PrimaryOrUniqueKeyDuplicated');
    expect(dupErr).toBeDefined();
    expect(dupErr!.table).toBe('item');
    expect(dupErr!.level).toBe('err');
  });

  it('type mismatch — produces NotMatchFieldType', async () => {
    writeFile(tempDir, 'config.cfg', `table item[id] (title='name') {\n  id:int;\n  name:str;\n}\n`);
    writeFile(tempDir, 'item.csv', `ID,名称\nid,name\nabc,剑\n`);
    const editor = await EditorService.create(tempDir);

    const errs = await ValueErrsService.collectValueErrs(editor);
    const typeErr = errs.find(e => e.errType === 'NotMatchFieldType');
    expect(typeErr).toBeDefined();
    expect(typeErr!.field).toBe('id');
    expect(typeErr!.sourceKind).toBe('cell');
    expect(typeErr!.sourceDesc).toContain('item.csv');
  });

  it('foreign key not found — produces ForeignValueNotFound with recordId', async () => {
    writeFile(tempDir, 'config.cfg',
      `table item[id] (title='name') {\n  id:int;\n  name:str;\n  rewardId:int -> reward;\n}\n` +
      `table reward[id] (title='name') {\n  id:int;\n  name:str;\n}\n`);
    writeFile(tempDir, 'item.csv', `ID,名称,奖励\nid,name,rewardId\n1,剑,999\n`);
    writeFile(tempDir, 'reward.csv', `ID,名称\nid,name\n1,金币\n`);
    const editor = await EditorService.create(tempDir);

    const errs = await ValueErrsService.collectValueErrs(editor);
    const fkErr = errs.find(e => e.errType === 'ForeignValueNotFound');
    expect(fkErr).toBeDefined();
    expect(fkErr!.table).toBe('item');
    expect(fkErr!.recordId).toBe('item-1');
    expect(fkErr!.level).toBe('err');
  });

  it('all returned items have required fields', async () => {
    writeFile(tempDir, 'config.cfg', `table item[id] (title='name') {\n  id:int;\n  name:str;\n}\n`);
    writeFile(tempDir, 'item.csv', `ID,名称\nid,name\nabc,剑\n`);
    const editor = await EditorService.create(tempDir);

    const errs = await ValueErrsService.collectValueErrs(editor);
    expect(errs.length).toBeGreaterThan(0);

    for (const e of errs) {
      expect(typeof e.errType).toBe('string');
      expect(typeof e.msg).toBe('string');
      expect(typeof e.table).toBe('string');
      expect(['err', 'warn']).toContain(e.level);
      expect(['cell', 'file']).toContain(e.sourceKind);
    }
  });
});
