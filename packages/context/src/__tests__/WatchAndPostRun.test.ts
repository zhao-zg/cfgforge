/**
 * WatchAndPostRun tests — T6.5
 *
 * Tests the full watch→reload→callback pipeline.
 * Uses real temp directories with actual file writes.
 * All waits are async (await sleep) to keep the event loop alive.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WatchAndPostRun, type PostRunCallback } from '../WatchAndPostRun';
import { Context } from '../Context';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return true;
    await sleep(50);
  }
  return cond();
}

describe('WatchAndPostRun', () => {
  let tempDir: string;
  let activeWpr: WatchAndPostRun | null = null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-wpr-'));
    activeWpr = null;
  });

  afterEach(async () => {
    if (activeWpr) {
      activeWpr.stopWatch();
      activeWpr = null;
    }
    // Small delay to let any pending timers complete
    await sleep(200);
    rmSync(tempDir);
  });

  function setupBasicConfig(): void {
    fs.writeFileSync(
      path.join(tempDir, 'config.cfg'),
      'table user[id] {\n  id:int;\n  name:str;\n}\n',
    );
    fs.writeFileSync(
      path.join(tempDir, 'user.csv'),
      '用户ID,姓名\nid,name\n1,Alice\n',
    );
  }

  it('startWatch sets started state', async () => {
    setupBasicConfig();
    const ctx = await Context.create(tempDir);
    const wpr = new WatchAndPostRun();

    wpr.startWatch(ctx, 1);
    expect(wpr.isStarted).toBe(true);
    expect(wpr.context).toBe(ctx);

    wpr.stopWatch();
    expect(wpr.isStarted).toBe(false);
  });

  it('multiple startWatch calls are idempotent', async () => {
    setupBasicConfig();
    const ctx = await Context.create(tempDir);
    const wpr = new WatchAndPostRun();

    wpr.startWatch(ctx, 1);
    wpr.startWatch(ctx, 1);

    expect(wpr.isStarted).toBe(true);

    wpr.stopWatch();
  });

  it('startWatch with negative waitSeconds is ignored', async () => {
    setupBasicConfig();
    const ctx = await Context.create(tempDir);
    const wpr = new WatchAndPostRun();

    wpr.startWatch(ctx, -1);
    expect(wpr.isStarted).toBe(false);
  });

  it('reload triggers callback on file change', async () => {
    setupBasicConfig();
    const ctx = await Context.create(tempDir);
    const wpr = new WatchAndPostRun();
    activeWpr = wpr;

    let callbackCount = 0;
    const callback: PostRunCallback = {
      onNewContextLoaded: () => {
        callbackCount++;
      },
    };
    wpr.registerPostRunCallback(callback);

    wpr.startWatch(ctx, 1);
    await sleep(100);

    // Modify a CSV file
    fs.writeFileSync(
      path.join(tempDir, 'user.csv'),
      '用户ID,姓名\nid,name\n1,Alice\n2,Bob\n',
    );

    // Wait for reload + callback (1s quiet + context creation + buffer)
    const result = await waitForCondition(() => callbackCount > 0, 8000);
    expect(result).toBe(true);
    expect(callbackCount).toBe(1);
    expect(wpr.context).toBeDefined();
    expect(wpr.context).not.toBe(ctx);

    wpr.stopWatch();
  }, 10000);

  it('registerPostRunCallback adds to list', async () => {
    setupBasicConfig();
    const ctx = await Context.create(tempDir);
    const wpr = new WatchAndPostRun();
    activeWpr = wpr;

    let count1 = 0;
    let count2 = 0;
    wpr.registerPostRunCallback({ onNewContextLoaded: () => count1++ });
    wpr.registerPostRunCallback({ onNewContextLoaded: () => count2++ });

    wpr.startWatch(ctx, 1);
    await sleep(100);

    fs.writeFileSync(
      path.join(tempDir, 'user.csv'),
      '用户ID,姓名\nid,name\n1,Alice\n2,Bob\n',
    );

    const result = await waitForCondition(() => count1 > 0, 8000);
    expect(result).toBe(true);
    expect(count1).toBe(1);
    expect(count2).toBe(1);

    wpr.stopWatch();
  }, 10000);

  it('stopWatch is idempotent', async () => {
    setupBasicConfig();
    const ctx = await Context.create(tempDir);
    const wpr = new WatchAndPostRun();

    wpr.startWatch(ctx, 1);
    wpr.stopWatch();
    wpr.stopWatch();

    expect(wpr.isStarted).toBe(false);
  });
});

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
