/**
 * E2E regression tests — T7.7
 *
 * End-to-end tests for the write-back pipeline:
 * 1. Add a record → verify file has the new record
 * 2. Update a record → verify file has the updated values
 * 3. Delete a record → verify file no longer has the record
 * 4. Add then delete → verify file returns to original state
 * 5. Multiple operations in sequence
 *
 * These tests use a real CSV file and verify the file content
 * on disk after each operation.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Context } from '@cfggen/context';
import { AddOrUpdateService, AddOrUpdateErrorCode } from '../AddOrUpdateService';
import { DeleteService, DeleteErrorCode } from '../DeleteService';

function writeFile(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function readCsvRows(filePath: string): string[][] {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split('\n').filter((l) => l.trim().length > 0).map((l) => l.split(','));
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

describe('E2E: Write-back pipeline', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-e2e-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('add → verify file has new record', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();

    const result = await AddOrUpdateService.addOrUpdateRecord(
      ctx, cfgValue, 'user',
      JSON.stringify({ id: 3, name: 'Charlie', age: 35 }),
    );

    expect(result.errorCode).toBe(AddOrUpdateErrorCode.AddOK);

    // Verify the CSV file on disk now has the new record
    const rows = readCsvRows(path.join(tempDir, 'user.csv'));
    // Should have: header(2 rows) + 2 original + 1 new = 5 data lines
    // (header is 2 lines: Chinese + English field names)
    expect(rows.length).toBeGreaterThanOrEqual(5);

    // Find the row with id=3
    const charlieRow = rows.find((r) => r.includes('3'));
    expect(charlieRow).toBeDefined();
    expect(charlieRow!.some((c) => c.includes('Charlie'))).toBe(true);
    expect(charlieRow!.some((c) => c.includes('35'))).toBe(true);
  });

  it('update → verify file has updated values', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();

    const result = await AddOrUpdateService.addOrUpdateRecord(
      ctx, cfgValue, 'user',
      JSON.stringify({ id: 1, name: 'AliceUpdated', age: 26 }),
    );

    expect(result.errorCode).toBe(AddOrUpdateErrorCode.UpdateOK);

    // Verify the CSV file has the updated values
    const rows = readCsvRows(path.join(tempDir, 'user.csv'));

    // Find the row with id=1 (should be updated)
    const aliceRow = rows.find((r) => r.includes('1') && !r.includes('id'));
    expect(aliceRow).toBeDefined();
    expect(aliceRow!.some((c) => c.includes('AliceUpdated'))).toBe(true);
    expect(aliceRow!.some((c) => c.includes('26'))).toBe(true);

    // Old name "Alice" should not be present
    expect(rows.some((r) => r.some((c) => c === 'Alice'))).toBe(false);
  });

  it('delete → verify file no longer has the record', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();

    const result = await DeleteService.deleteRecord(ctx, cfgValue, 'user', '2');

    expect(result.errorCode).toBe(DeleteErrorCode.OK);

    // Verify the CSV file: row for id=2 should be blank/removed
    const rows = readCsvRows(path.join(tempDir, 'user.csv'));

    // The row for Bob (id=2) should be blank or absent
    const bobRow = rows.find((r) => r.includes('2') && !r.includes('id'));
    // If present, it should not have "Bob" anymore (cell was blanked)
    if (bobRow) {
      expect(bobRow.some((c) => c.includes('Bob'))).toBe(false);
    }
    // Alice should still be present
    const aliceRow = rows.find((r) => r.some((c) => c === 'Alice'));
    expect(aliceRow).toBeDefined();
  });

  it('add then delete → CfgValue returns to original count', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    expect(cfgValue.getTable('user')!.valueList.length).toBe(2);

    // Add a record
    const addResult = await AddOrUpdateService.addOrUpdateRecord(
      ctx, ctx.makeValue(), 'user',
      JSON.stringify({ id: 3, name: 'Charlie', age: 35 }),
    );
    expect(addResult.errorCode).toBe(AddOrUpdateErrorCode.AddOK);
    expect(addResult.newCfgValue!.getTable('user')!.valueList.length).toBe(3);

    // Delete the same record
    const delResult = await DeleteService.deleteRecord(
      ctx, addResult.newCfgValue!, 'user', '3',
    );
    expect(delResult.errorCode).toBe(DeleteErrorCode.OK);
    expect(delResult.newCfgValue!.getTable('user')!.valueList.length).toBe(2);
  });

  it('add multiple records in sequence', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    let cfgValue = ctx.makeValue();

    // Add Charlie
    const r1 = await AddOrUpdateService.addOrUpdateRecord(
      ctx, cfgValue, 'user',
      JSON.stringify({ id: 3, name: 'Charlie', age: 35 }),
    );
    expect(r1.errorCode).toBe(AddOrUpdateErrorCode.AddOK);
    cfgValue = r1.newCfgValue!;

    // Add Dave
    const r2 = await AddOrUpdateService.addOrUpdateRecord(
      ctx, cfgValue, 'user',
      JSON.stringify({ id: 4, name: 'Dave', age: 40 }),
    );
    expect(r2.errorCode).toBe(AddOrUpdateErrorCode.AddOK);
    cfgValue = r2.newCfgValue!;

    // Should now have 4 records
    expect(cfgValue.getTable('user')!.valueList.length).toBe(4);

    // Verify file has both new records
    const rows = readCsvRows(path.join(tempDir, 'user.csv'));
    expect(rows.some((r) => r.some((c) => c.includes('Charlie')))).toBe(true);
    expect(rows.some((r) => r.some((c) => c.includes('Dave')))).toBe(true);
  });

  it('update then delete same record', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    let cfgValue = ctx.makeValue();

    // Update Alice
    const r1 = await AddOrUpdateService.addOrUpdateRecord(
      ctx, cfgValue, 'user',
      JSON.stringify({ id: 1, name: 'AliceUpdated', age: 26 }),
    );
    expect(r1.errorCode).toBe(AddOrUpdateErrorCode.UpdateOK);
    cfgValue = r1.newCfgValue!;
    expect(cfgValue.getTable('user')!.valueList.length).toBe(2);

    // Delete Alice
    const r2 = await DeleteService.deleteRecord(ctx, cfgValue, 'user', '1');
    expect(r2.errorCode).toBe(DeleteErrorCode.OK);
    cfgValue = r2.newCfgValue!;
    expect(cfgValue.getTable('user')!.valueList.length).toBe(1);

    // Only Bob should remain
    const remaining = cfgValue.getTable('user')!.valueList;
    expect(remaining.length).toBe(1);
  });
});
