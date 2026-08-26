/**
 * AddOrUpdateService tests — T7.4
 *
 * Tests cover:
 * - Add a new record to a CSV table (non-JSON table)
 * - Update an existing record in a CSV table
 * - Reject when schema is partial
 * - Reject when table not found
 * - Reject when JSON parse fails
 *
 * These tests create a full Context pipeline (config.cfg + CSV),
 * then invoke AddOrUpdateService.addOrUpdateRecord.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Context } from '@cfgforge/context';
import { AddOrUpdateService, AddOrUpdateErrorCode } from '../AddOrUpdateService';

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

describe('AddOrUpdateService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-addupd-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('adds a new record to a CSV table', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    const vTable = cfgValue.getTable('user')!;
    expect(vTable.valueList.length).toBe(2);

    const result = await AddOrUpdateService.addOrUpdateRecord(
      ctx, cfgValue, 'user',
      JSON.stringify({ id: 3, name: 'Charlie', age: 35 }),
    );

    expect(result.errorCode).toBe(AddOrUpdateErrorCode.AddOK);
    expect(result.recordId).toBe('3');
    expect(result.newCfgValue).not.toBeNull();

    const newVTable = result.newCfgValue!.getTable('user');
    expect(newVTable).toBeDefined();
    expect(newVTable!.valueList.length).toBe(3);
  });

  it('updates an existing record in a CSV table', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();

    const result = await AddOrUpdateService.addOrUpdateRecord(
      ctx, cfgValue, 'user',
      JSON.stringify({ id: 1, name: 'AliceUpdated', age: 26 }),
    );

    expect(result.errorCode).toBe(AddOrUpdateErrorCode.UpdateOK);
    expect(result.recordId).toBe('1');
    expect(result.newCfgValue).not.toBeNull();

    // Should still have 2 records (updated, not added)
    const newVTable = result.newCfgValue!.getTable('user');
    expect(newVTable!.valueList.length).toBe(2);
  });

  it('returns PartialNotEditable when schema is partial', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();

    // Mock schema.isPartial() to return true
    const originalSchema = cfgValue.schema;
    (cfgValue as any).schema = { ...originalSchema, isPartial: () => true };

    const result = await AddOrUpdateService.addOrUpdateRecord(
      ctx, cfgValue as any, 'user',
      JSON.stringify({ id: 3, name: 'Charlie', age: 35 }),
    );

    expect(result.errorCode).toBe(AddOrUpdateErrorCode.PartialNotEditable);
    expect(result.newCfgValue).toBeNull();
  });

  it('returns TableNotFound when table does not exist', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();

    const result = await AddOrUpdateService.addOrUpdateRecord(
      ctx, cfgValue, 'nonexistent',
      JSON.stringify({ id: 1, name: 'Test', age: 1 }),
    );

    expect(result.errorCode).toBe(AddOrUpdateErrorCode.TableNotFound);
    expect(result.newCfgValue).toBeNull();
  });

  it('returns RecordParseError when JSON is invalid', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();

    // Invalid JSON string (not parseable)
    const result = await AddOrUpdateService.addOrUpdateRecord(
      ctx, cfgValue, 'user',
      '{ this is not valid json }',
    );

    expect(result.errorCode).toBe(AddOrUpdateErrorCode.RecordParseError);
    expect(result.newCfgValue).toBeNull();
    expect(result.errorMessages.length).toBeGreaterThan(0);
  });
});
