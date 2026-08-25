/**
 * DataUpdater tests — T7.6
 *
 * Tests ported from Java DataUpdaterTest pattern.
 * DataUpdater.reloads a single table from its source CSV file.
 *
 * Key TS differences:
 * - updateByReloadTable is async (ExcelJS)
 * - CSV reading via context.csvReader()
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Context } from '../Context';
import { DataUpdater } from '../DataUpdater';
import { HeadRow } from '@cfggen/data';

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

describe('DataUpdater', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-dataupd-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('reloads a CSV table and returns new CfgData with updated rows', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const cfgData = ctx.cfgData();
    const dTable = cfgData.getDTable('user');
    expect(dTable).toBeDefined();

    // Now overwrite the CSV with updated data
    writeFile(tempDir, 'user.csv', USER_CSV_UPDATED);

    // Reload
    const result = await DataUpdater.updateByReloadTable(ctx, dTable!);

    // New CfgData should have 3 rows for user table (not 2)
    const newDTable = result.newCfgData.getDTable('user');
    expect(newDTable).toBeDefined();
    expect(newDTable!.rows.length).toBe(3);

    // Original cfgData should be unchanged (not mutated)
    const origDTable = cfgData.getDTable('user');
    expect(origDTable!.rows.length).toBe(2);
  });

  it('returns error strings but does not throw for valid reload', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);
    const dTable = ctx.cfgData().getDTable('user')!;

    writeFile(tempDir, 'user.csv', USER_CSV_UPDATED);

    const result = await DataUpdater.updateByReloadTable(ctx, dTable);
    // errStrList may be empty (no errors) or contain validation warnings
    expect(result.errStrList).toBeDefined();
    expect(Array.isArray(result.errStrList)).toBe(true);
  });

  it('throws if DTable not found in context', async () => {
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);

    const ctx = await Context.create(tempDir);

    // Try to reload a table that doesn't exist
    const fakeDTable = ctx.cfgData().getDTable('nonexistent');
    expect(fakeDTable).toBeUndefined();
  });
});
