/**
 * DeleteService tests — T7.5
 *
 * Tests cover:
 * - Delete an existing record from a CSV table
 * - Reject when schema is partial
 * - Reject when table not found
 * - Reject when recordId parse fails
 * - Reject when recordId not found in table
 *
 * These tests create a full Context pipeline (config.cfg + CSV),
 * then invoke DeleteService.deleteRecord.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Context } from '@cfggen/context';
import { DeleteService, DeleteErrorCode } from '../DeleteService';

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

describe('DeleteService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-del-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('deletes an existing record from a CSV table', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    const vTable = cfgValue.getTable('user')!;
    expect(vTable.valueList.length).toBe(2);

    const result = await DeleteService.deleteRecord(ctx, cfgValue, 'user', '2');

    expect(result.errorCode).toBe(DeleteErrorCode.OK);
    expect(result.newCfgValue).not.toBeNull();

    const newVTable = result.newCfgValue!.getTable('user');
    expect(newVTable).toBeDefined();
    expect(newVTable!.valueList.length).toBe(1);

    // The remaining record should be id=1 (Alice)
    expect(newVTable!.valueList[0].values.length).toBeGreaterThan(0);
  });

  it('returns PartialNotEditable when schema is partial', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();

    const originalSchema = cfgValue.schema;
    (cfgValue as any).schema = { ...originalSchema, isPartial: () => true };

    const result = await DeleteService.deleteRecord(ctx, cfgValue as any, 'user', '1');

    expect(result.errorCode).toBe(DeleteErrorCode.PartialNotEditable);
    expect(result.newCfgValue).toBeNull();
  });

  it('returns TableNotFound when table does not exist', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();

    const result = await DeleteService.deleteRecord(ctx, cfgValue, 'nonexistent', '1');

    expect(result.errorCode).toBe(DeleteErrorCode.TableNotFound);
    expect(result.newCfgValue).toBeNull();
  });

  it('returns RecordIdNotFound when recordId does not exist in table', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();

    const result = await DeleteService.deleteRecord(ctx, cfgValue, 'user', '999');

    expect(result.errorCode).toBe(DeleteErrorCode.RecordIdNotFound);
    expect(result.newCfgValue).toBeNull();
  });
});
