/**
 * ValueUpdater async tests — updateByJsonFileAddOrUpdateAsync (T12.0d)
 *
 * Tests cover:
 * - updateByJsonFileAddOrUpdateAsync: async read JSON record, update primaryKeyMap
 * - Verifies same behavior as sync variant but via CfgFileSystem abstraction
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Context } from '@cfggen/context';
import { ValueUpdater } from '../ValueUpdater';
import { VInt, valueEquals, type Value } from '@cfggen/value';
import { setDefaultFileSystem, NodeFileSystem } from '@cfggen/shared';

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

describe('ValueUpdater async', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-valupd-async-'));
    setDefaultFileSystem(new NodeFileSystem());
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  describe('updateByJsonFileAddOrUpdateAsync', () => {
    it('adds a new JSON record and returns updated CfgValue', async () => {
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

      const result = await ValueUpdater.updateByJsonFileAddOrUpdateAsync(
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
        ValueUpdater.updateByJsonFileAddOrUpdateAsync(ctx, cfgValue, vTable, 'dummy.json'),
      ).rejects.toThrow('update only supports full value');
    });

    it('returns error string list (may be empty)', async () => {
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

      const result = await ValueUpdater.updateByJsonFileAddOrUpdateAsync(
        ctx, cfgValue, vTable, relativeJsonPath,
      );

      expect(result.errStrList).toBeDefined();
      expect(Array.isArray(result.errStrList)).toBe(true);
    });
  });
});
