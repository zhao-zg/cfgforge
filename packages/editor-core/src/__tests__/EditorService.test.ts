/**
 * EditorService tests — T9.1
 *
 * EditorService is the core service: it holds a Context instance
 * (cached by dataDir) and provides access to the current CfgValue.
 *
 * Tests cover:
 * - Constructing EditorService(dataDir) loads the Context
 * - Cached by dataDir: two EditorService instances with same dataDir share Context
 * - Different dataDir → different Context
 * - makeValue returns a CfgValue
 * - After edit operations, reload()/updateContext rebuilds from the new Context
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EditorService } from '../EditorService';
import { Context } from '@cfggen/context';

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

describe('EditorService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-editor-'));
    writeFile(tempDir, 'config.cfg', USER_CFG);
    writeFile(tempDir, 'user.csv', USER_CSV);
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('loads Context on construction', async () => {
    const svc = await EditorService.create(tempDir);
    const ctx = svc.context();
    expect(ctx).toBeInstanceOf(Context);
    expect(svc.rootDir()).toBe(tempDir);
  });

  it('caches Context by dataDir', async () => {
    const svc1 = await EditorService.create(tempDir);
    const svc2 = await EditorService.create(tempDir);
    expect(svc1.context()).toBe(svc2.context());

    // Different dataDir → different context
    const tempDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-editor2-'));
    try {
      writeFile(tempDir2, 'config.cfg', USER_CFG);
      writeFile(tempDir2, 'user.csv', USER_CSV);
      const svc3 = await EditorService.create(tempDir2);
      expect(svc1.context()).not.toBe(svc3.context());
    } finally {
      rmSync(tempDir2);
    }
  });

  it('makeValue returns a CfgValue with tables', async () => {
    const svc = await EditorService.create(tempDir);
    const cfgValue = svc.cfgValue();
    expect(cfgValue.getTable('user')).toBeDefined();
  });

  it('updates Context after edit (reload)', async () => {
    const svc = await EditorService.create(tempDir);
    const before = svc.cfgValue();
    const vTable = before.getTable('user')!;
    expect(vTable.valueList.length).toBe(2);

    // Simulate an edit: modify CSV on disk, then reload
    writeFile(tempDir, 'user.csv',
      `用户ID,姓名,年龄
id,name,age
1,Alice,25
2,Bob,30
3,Charlie,35
`);
    await svc.reload();
    const after = svc.cfgValue();
    expect(after).not.toBe(before);
    expect(after.getTable('user')!.valueList.length).toBe(3);
  });

  it('rejects invalid dataDir', async () => {
    await expect(EditorService.create(path.join(tempDir, 'nonexistent'))).rejects.toThrow();
  });
});