/**
 * WaitWatcher tests — T6.5
 *
 * Tests the debouncing logic: wait for quiet period, then trigger listener.
 * All waits are async (await sleep) to keep the event loop alive.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Watcher } from '../Watcher';
import { WaitWatcher } from '../WaitWatcher';

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

describe('WaitWatcher', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-wait-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('triggers listener after quiet period', async () => {
    fs.writeFileSync(path.join(tempDir, 'config.cfg'), 'table a[id] {\n  id:int;\n}\n');

    const watcher = new Watcher(tempDir, null);
    watcher.start();
    await sleep(100);

    let triggered = false;
    const waitWatcher = new WaitWatcher(
      watcher,
      () => { triggered = true; },
      300,
      50,
    );
    waitWatcher.start();
    await sleep(50);

    fs.writeFileSync(path.join(tempDir, 'a.csv'), 'id\n1\n');

    const result = await waitForCondition(() => triggered, 2000);
    expect(result).toBe(true);

    waitWatcher.stop();
    watcher.stop();
  });

  it('does not trigger when no events occur', async () => {
    fs.writeFileSync(path.join(tempDir, 'config.cfg'), 'table a[id] {\n  id:int;\n}\n');

    const watcher = new Watcher(tempDir, null);
    watcher.start();
    await sleep(100);

    let triggered = false;
    const waitWatcher = new WaitWatcher(
      watcher,
      () => { triggered = true; },
      300,
      50,
    );
    waitWatcher.start();

    // Wait beyond the quiet period without any file changes
    await sleep(600);
    expect(triggered).toBe(false);

    waitWatcher.stop();
    watcher.stop();
  });

  it('debounces rapid changes (only triggers once)', async () => {
    fs.writeFileSync(path.join(tempDir, 'config.cfg'), 'table a[id] {\n  id:int;\n}\n');

    const watcher = new Watcher(tempDir, null);
    watcher.start();
    await sleep(100);

    let triggerCount = 0;
    const waitWatcher = new WaitWatcher(
      watcher,
      () => { triggerCount++; },
      300,
      50,
    );
    waitWatcher.start();
    await sleep(50);

    // Write multiple files rapidly
    fs.writeFileSync(path.join(tempDir, 'a.csv'), 'id\n1\n');
    await sleep(50);
    fs.writeFileSync(path.join(tempDir, 'b.csv'), 'id\n2\n');
    await sleep(50);
    fs.writeFileSync(path.join(tempDir, 'c.csv'), 'id\n3\n');

    // Wait for listener to fire (300ms quiet after last event + buffer)
    await waitForCondition(() => triggerCount > 0, 2000);

    // Wait a bit more to ensure no second trigger
    await sleep(500);

    // Should have triggered exactly once (all rapid events debounced)
    expect(triggerCount).toBe(1);

    waitWatcher.stop();
    watcher.stop();
  });

  it('throws for non-positive waitMillis', () => {
    const watcher = new Watcher(tempDir, null);
    expect(() => new WaitWatcher(watcher, () => {}, 0)).toThrow();
    expect(() => new WaitWatcher(watcher, () => {}, -1)).toThrow();
  });

  it('throws for non-positive sleepMillis', () => {
    const watcher = new Watcher(tempDir, null);
    expect(() => new WaitWatcher(watcher, () => {}, 300, 0)).toThrow();
  });

  it('throws if already started', () => {
    const watcher = new Watcher(tempDir, null);
    watcher.start();

    const waitWatcher = new WaitWatcher(watcher, () => {}, 300, 50);
    waitWatcher.start();

    expect(() => waitWatcher.start()).toThrow('already started');

    waitWatcher.stop();
    watcher.stop();
  });

  it('stop() is idempotent (no error on double stop)', () => {
    const watcher = new Watcher(tempDir, null);
    watcher.start();

    const waitWatcher = new WaitWatcher(watcher, () => {}, 300, 50);
    waitWatcher.start();
    waitWatcher.stop();
    waitWatcher.stop();

    watcher.stop();
  });
});

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
