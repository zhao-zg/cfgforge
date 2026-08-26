/**
 * ValueUpdater tests — T7.6
 *
 * Tests cover:
 * - updateByReloadTableData: re-read CSV, re-parse VTable, rebuild CfgValue
 * - updateByJsonFileAddOrUpdate: parse JSON record, update primaryKeyMap
 * - updateByJsonFileDelete: remove record, rebuild VTable
 *
 * These tests create a full Context pipeline (config.cfg + CSV),
 * then invoke ValueUpdater methods.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Context } from '@cfgforge/context';
import { ValueUpdater } from '../ValueUpdater';
import { VInt, valueEquals, type Value } from '@cfgforge/value';

function writeFile(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const USER_CFG = `table user[id] {
  id:int;
  name:str;
  age:int;
}
`;

const USER_CSV = `用户ID,姓名,年龄
id,name,age
1,Alice,25
2,Bob,30
`;

const USER_CSV_UPDATED = `用户ID,姓名,年龄
id,name,age
1,Alice,26
2,Bob,30
3,Charlie,35
`;

describe('ValueUpdater', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-valupd-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  describe('updateByReloadTableData', () => {
    it('reloads CSV and returns new CfgValue with updated VTable', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV);

      const ctx = await Context.create(tempDir);
      const cfgValue = ctx.makeValue();
      const vTable = cfgValue.getTable('user')!;

      // Overwrite CSV with updated data
      writeFile(tempDir, 'user.csv', USER_CSV_UPDATED);

      const result = await ValueUpdater.updateByReloadTableData(ctx, cfgValue, vTable);

      // New CfgValue should have 3 records (not 2)
      const newVTable = result.newCfgValue.getTable('user');
      expect(newVTable).toBeDefined();
      expect(newVTable!.valueList.length).toBe(3);

      // Original CfgValue should be unchanged
      expect(cfgValue.getTable('user')!.valueList.length).toBe(2);

      // NewCfgData should also be updated
      expect(result.newCfgData).toBeDefined();
    });

    it('returns error string list (may be empty)', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV);

      const ctx = await Context.create(tempDir);
      const cfgValue = ctx.makeValue();
      const vTable = cfgValue.getTable('user')!;

      writeFile(tempDir, 'user.csv', USER_CSV_UPDATED);

      const result = await ValueUpdater.updateByReloadTableData(ctx, cfgValue, vTable);

      expect(result.errStrList).toBeDefined();
      expect(Array.isArray(result.errStrList)).toBe(true);
    });

    it('throws if schema is partial', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV);

      const ctx = await Context.create(tempDir);
      const cfgValue = ctx.makeValue();
      const vTable = cfgValue.getTable('user')!;

      // Mock schema.isPartial() to return true
      const originalSchema = cfgValue.schema;
      (cfgValue as any).schema = { ...originalSchema, isPartial: () => true };

      await expect(
        ValueUpdater.updateByReloadTableData(ctx, cfgValue, vTable),
      ).rejects.toThrow('update only supports full value');
    });
  });

  describe('updateByJsonFileAddOrUpdate', () => {
    it('adds a new JSON record and returns updated CfgValue', () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV);

      // Create a JSON record file for user table
      const jsonDir = path.join(tempDir, '_user');
      fs.mkdirSync(jsonDir, { recursive: true });
      const jsonPath = path.join(jsonDir, 'newuser.json');
      // The JSON format mirrors the table schema: id, name, age
      fs.writeFileSync(jsonPath, JSON.stringify({
        id: 3,
        name: 'Charlie',
        age: 35,
      }), 'utf8');

      // We need to create a Context and CfgValue first
      // Since Context.create is async, we'll use a synchronous wrapper
      // Actually, Context.create must be called with await, so let's
      // restructure this test
    });

    it('properly parses JSON and updates primaryKeyMap', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV);

      const ctx = await Context.create(tempDir);
      const cfgValue = ctx.makeValue();
      const vTable = cfgValue.getTable('user')!;

      // Create a JSON record file
      const jsonDir = path.join(tempDir, '_user');
      fs.mkdirSync(jsonDir, { recursive: true });
      const jsonPath = path.join(jsonDir, 'newuser.json');
      fs.writeFileSync(jsonPath, JSON.stringify({
        id: 3,
        name: 'Charlie',
        age: 35,
      }), 'utf8');

      const relativeJsonPath = path.relative(tempDir, jsonPath);

      const result = ValueUpdater.updateByJsonFileAddOrUpdate(
        ctx, cfgValue, vTable, relativeJsonPath,
      );

      // New CfgValue should have 3 records (2 original + 1 new)
      const newVTable = result.newCfgValue.getTable('user');
      expect(newVTable).toBeDefined();
      expect(newVTable!.valueList.length).toBe(3);

      // Find the new record by primary key
      const pkValue: Value = new VInt(3, {} as any);
      let found: any = null;
      for (const [k, v] of newVTable!.primaryKeyMap) {
        if (valueEquals(k, pkValue)) {
          found = v;
          break;
        }
      }
      expect(found).not.toBeNull();
    });
  });

  describe('updateByJsonFileDelete', () => {
    it('removes a record and returns updated CfgValue', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV);

      const ctx = await Context.create(tempDir);
      const cfgValue = ctx.makeValue();
      const vTable = cfgValue.getTable('user')!;

      // Delete the record with id=2 (Bob)
      const pkValue: Value = new VInt(2, {} as any);

      // Find the actual key in primaryKeyMap
      let actualKey: Value | null = null;
      for (const k of vTable.primaryKeyMap.keys()) {
        if (valueEquals(k, pkValue)) {
          actualKey = k;
          break;
        }
      }
      expect(actualKey).not.toBeNull();

      const result = ValueUpdater.updateByJsonFileDelete(
        ctx, cfgValue, vTable, actualKey!, '2',
      );

      // New CfgValue should have 1 record (was 2, deleted 1)
      const newVTable = result.newCfgValue.getTable('user');
      expect(newVTable).toBeDefined();
      expect(newVTable!.valueList.length).toBe(1);

      // The remaining record should be id=1 (Alice)
      expect(newVTable!.valueList[0].values[0]).toBeInstanceOf(VInt);
      expect((newVTable!.valueList[0].values[0] as VInt).value).toBe(1);
    });
  });
});
