/**
 * Watcher tests — T6.5
 *
 * Tests file change detection using Node's fs.watch.
 * Uses real temp directories with actual file writes.
 * All waits are async (await sleep) to keep the event loop alive.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Watcher } from '../Watcher';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForEvent(watcher: Watcher, timeoutMs: number): Promise<number> {
  const startVersion = watcher.getEventVersion();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (watcher.getEventVersion() > startVersion) {
      return watcher.getEventVersion();
    }
    await sleep(50);
  }
  return watcher.getEventVersion();
}

describe('Watcher', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-watch-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('detects CSV file modification', async () => {
    const cfgFile = path.join(tempDir, 'config.cfg');
    fs.writeFileSync(cfgFile, 'table user[id] {\n  id:int;\n  name:str;\n}\n');

    const watcher = new Watcher(tempDir, null);
    watcher.start();
    await sleep(100); // let watcher settle

    fs.writeFileSync(path.join(tempDir, 'user.csv'), 'id,name\n1,Alice\n');

    const version = await waitForEvent(watcher, 2000);
    expect(version).toBeGreaterThan(0);
    expect(watcher.getLastEventMillis()).toBeGreaterThan(0);

    watcher.stop();
  });

  it('detects CFG file modification', async () => {
    fs.writeFileSync(path.join(tempDir, 'config.cfg'), 'table a[id] {\n  id:int;\n}\n');

    const watcher = new Watcher(tempDir, null);
    watcher.start();
    await sleep(100);

    fs.writeFileSync(path.join(tempDir, 'config.cfg'), 'table a[id] {\n  id:int;\n  name:str;\n}\n');

    const version = await waitForEvent(watcher, 2000);
    expect(version).toBeGreaterThan(0);

    watcher.stop();
  });

  it('detects JSON file in _table directory', async () => {
    fs.writeFileSync(path.join(tempDir, 'config.cfg'), 'table task[id] {\n  id:int;\n}\n');

    const jsonDir = path.join(tempDir, '_task');
    fs.mkdirSync(jsonDir);

    const watcher = new Watcher(tempDir, null);
    watcher.start();
    await sleep(100);

    fs.writeFileSync(path.join(jsonDir, '1.json'), '{"id": 1}');

    const version = await waitForEvent(watcher, 2000);
    expect(version).toBeGreaterThan(0);

    watcher.stop();
  });

  it('ignores non-config files', async () => {
    const watcher = new Watcher(tempDir, null);
    watcher.start();
    await sleep(100);

    const initialVersion = watcher.getEventVersion();

    fs.writeFileSync(path.join(tempDir, 'readme.txt'), 'hello');

    const version = await waitForEvent(watcher, 500);
    expect(version).toBe(initialVersion);

    watcher.stop();
  });

  it('stop() prevents further events', async () => {
    fs.writeFileSync(path.join(tempDir, 'config.cfg'), 'table a[id] {\n  id:int;\n}\n');

    const watcher = new Watcher(tempDir, null);
    watcher.start();
    await sleep(100);
    watcher.stop();

    const versionBefore = watcher.getEventVersion();
    fs.writeFileSync(path.join(tempDir, 'user.csv'), 'id,name\n1,Alice\n');

    const versionAfter = await waitForEvent(watcher, 500);
    expect(versionAfter).toBe(versionBefore);
  });
});

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
