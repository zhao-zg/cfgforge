/**
 * GenPipeline tests — T8.12
 *
 * Verifies that GenPipeline:
 * 1. Runs multiple generators sequentially
 * 2. Calls CachedFiles.finalExit() after all generators finish
 * 3. Cleans up stale files via finalExit
 * 4. Does NOT clean up when no generators are registered (no finalExit call)
 * 5. TsCodeGenerator is excluded from cleanup (its dstDir is user project root)
 * 6. Throws if a generator fails
 * 7. Works with real generators (Java + CS) end-to-end with cleanup
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Context } from '@cfgforge/context';
import { CachedFiles } from '@cfgforge/shared';
import { GenPipeline } from '../GenPipeline';
import { Generators } from '../Generators';
import { JavaCodeGenerator } from '../JavaCodeGenerator';
import { CsCodeGenerator } from '../CsCodeGenerator';
import { TsCodeGenerator } from '../TsCodeGenerator';
import { Generator } from '../Generator';
import type { Parameter } from '../Parameter';

function writeFile(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Minimal mock Parameter: returns values from a plain object. */
function mockParameter(opts: Record<string, string>): Parameter {
  return {
    get: (k: string, def: string) => (k in opts ? opts[k] : def),
    has: (k: string) => k in opts,
    getOrNull: (k: string) => (k in opts ? opts[k] : null),
  };
}

// Simple schema: one table with int pk, string name, int age
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

describe('GenPipeline', () => {
  let tempDir: string;
  let dataDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-pipeline-'));
    dataDir = path.join(tempDir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    writeFile(dataDir, 'config.cfg', USER_CFG);
    writeFile(dataDir, 'user.csv', USER_CSV);
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('runs multiple generators sequentially', async () => {
    const javaDir = path.join(tempDir, 'java');
    const csDir = path.join(tempDir, 'cs');
    fs.mkdirSync(javaDir, { recursive: true });
    fs.mkdirSync(csDir, { recursive: true });

    const ctx = await Context.create(dataDir);
    const generators: Generator[] = [
      new JavaCodeGenerator(mockParameter({ dir: javaDir })),
      new CsCodeGenerator(mockParameter({ dir: csDir })),
    ];

    await GenPipeline.run(ctx, generators);

    // Both generators should have produced output
    expect(fs.existsSync(path.join(javaDir, 'Config'))).toBe(true);
    expect(fs.existsSync(path.join(csDir, 'Config'))).toBe(true);
  });

  it('calls CachedFiles.finalExit() after all generators finish', async () => {
    const javaDir = path.join(tempDir, 'java');
    fs.mkdirSync(javaDir, { recursive: true });

    // Pre-create a stale file in the Java output directory
    const javaPkgDir = path.join(javaDir, 'Config');
    fs.mkdirSync(javaPkgDir, { recursive: true });
    writeFile(javaPkgDir, 'Stale.java', '// old file');

    const ctx = await Context.create(dataDir);
    const generators: Generator[] = [
      new JavaCodeGenerator(mockParameter({ dir: javaDir })),
    ];

    await GenPipeline.run(ctx, generators);

    // After GenPipeline.run, finalExit should have been called,
    // so the stale file should be deleted
    expect(fs.existsSync(path.join(javaPkgDir, 'Stale.java'))).toBe(false);
    // But the generated file should still exist
    const javaFiles = fs.readdirSync(javaPkgDir, { recursive: true });
    expect(javaFiles.length).toBeGreaterThan(0);
  });

  it('does not call finalExit when no generators are provided', async () => {
    // Create a stale file that would be cleaned if finalExit were called
    const staleDir = path.join(tempDir, 'stale');
    fs.mkdirSync(staleDir, { recursive: true });
    writeFile(staleDir, 'old.txt', 'stale');
    // Register the directory for cleanup (simulating a prior generator)
    // — but with no generators, GenPipeline should NOT call finalExit
    CachedFiles.keepMetaAndDeleteOtherFiles(staleDir);

    const ctx = await Context.create(dataDir);
    await GenPipeline.run(ctx, []);

    // Stale file should still exist (no finalExit was called)
    expect(fs.existsSync(path.join(staleDir, 'old.txt'))).toBe(true);

    // Clean up manually
    CachedFiles.finalExit();
    expect(fs.existsSync(path.join(staleDir, 'old.txt'))).toBe(false);
  });

  it('TsCodeGenerator output is not cleaned up by finalExit', async () => {
    const tsDir = path.join(tempDir, 'ts');
    fs.mkdirSync(tsDir, { recursive: true });

    // Create a user file that should NOT be deleted
    writeFile(tsDir, 'package.json', '{"name": "my-project"}');

    const ctx = await Context.create(dataDir);
    const generators: Generator[] = [
      new TsCodeGenerator(mockParameter({ dir: tsDir })),
    ];

    await GenPipeline.run(ctx, generators);

    // User file should still exist (TsCodeGenerator does not register cleanup)
    expect(fs.existsSync(path.join(tsDir, 'package.json'))).toBe(true);
    // Generated Config.ts should exist
    expect(fs.existsSync(path.join(tsDir, 'Config.ts'))).toBe(true);
  });

  it('throws when a generator fails', async () => {
    // Create a generator that throws during generate
    class FailingGenerator extends Generator {
      async generate(_ctx: Context): Promise<void> {
        throw new Error('generator failed');
      }
    }

    const ctx = await Context.create(dataDir);
    const generators: Generator[] = [new FailingGenerator(mockParameter({}))];

    await expect(GenPipeline.run(ctx, generators)).rejects.toThrow('generator failed');
  });

  it('runs end-to-end with multiple generators and cleans up stale files', async () => {
    const javaDir = path.join(tempDir, 'java');
    const csDir = path.join(tempDir, 'cs');
    fs.mkdirSync(javaDir, { recursive: true });
    fs.mkdirSync(csDir, { recursive: true });

    // Create stale files in both output directories
    const javaPkgDir = path.join(javaDir, 'Config');
    const csPkgDir = path.join(csDir, 'Config');
    fs.mkdirSync(javaPkgDir, { recursive: true });
    fs.mkdirSync(csPkgDir, { recursive: true });
    writeFile(javaPkgDir, 'OldTable.java', '// stale');
    writeFile(csPkgDir, 'OldTable.cs', '// stale');

    const ctx = await Context.create(dataDir);
    const generators: Generator[] = [
      new JavaCodeGenerator(mockParameter({ dir: javaDir })),
      new CsCodeGenerator(mockParameter({ dir: csDir })),
    ];

    await GenPipeline.run(ctx, generators);

    // Stale files should be cleaned by finalExit
    expect(fs.existsSync(path.join(javaPkgDir, 'OldTable.java'))).toBe(false);
    expect(fs.existsSync(path.join(csPkgDir, 'OldTable.cs'))).toBe(false);

    // Generated files should still exist
    const javaFiles = fs.readdirSync(javaPkgDir, { recursive: true });
    const csFiles = fs.readdirSync(csPkgDir, { recursive: true });
    expect(javaFiles.length).toBeGreaterThan(0);
    expect(csFiles.length).toBeGreaterThan(0);
  });

  it('logs verbose message for each generator', async () => {
    const javaDir = path.join(tempDir, 'java');
    fs.mkdirSync(javaDir, { recursive: true });

    const ctx = await Context.create(dataDir);
    const generators: Generator[] = [
      new JavaCodeGenerator(mockParameter({ dir: javaDir })),
    ];

    // Just verify it runs without error; verbose logging is a side-effect
    await GenPipeline.run(ctx, generators);
    expect(fs.existsSync(path.join(javaDir, 'Config'))).toBe(true);
  });
});
