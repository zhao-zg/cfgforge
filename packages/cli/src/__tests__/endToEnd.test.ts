/**
 * T10.4 End-to-end regression tests for the CLI package.
 *
 * Tests the full CLI flow: registerAllProviders → run(args) → Context creation → generator execution.
 * Uses the real example/config directory and real generators.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { run, runWithCatch, registerAllProviders } from '../Main';
import { Generators } from '@cfgforge/gen';
import { Tools } from '../Tools';
import { Logger } from '@cfgforge/shared';

const EXAMPLE_CONFIG = path.resolve(__dirname, '../../../../example/config');

describe('CLI end-to-end regression tests', () => {
  beforeEach(() => {
    // Register all providers before each test
    registerAllProviders();
  });

  describe('run() with -h', () => {
    it('prints help and returns 0', async () => {
      const ret = await run(['-h']);
      expect(ret).toBe(0);
    });
  });

  describe('run() with no args', () => {
    it('returns 0 (no generators, no datadir)', async () => {
      const ret = await run([]);
      expect(ret).toBe(0);
    });
  });

  describe('run() with -gen java on example/config', () => {
    it('generates Java code from example/config', async () => {
      // Use a temp output directory
      const outputDir = path.resolve(__dirname, '../../../../.temp/cli-test-output/java');
      // Clean up any previous output
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
      fs.mkdirSync(outputDir, { recursive: true });

      const ret = await runWithCatch([
        '-datadir', EXAMPLE_CONFIG,
        '-gen', `java,dir:${outputDir}`,
      ]);

      expect(ret).toBe(0);

      // Verify some Java files were generated
      const files = listFilesRecursive(outputDir);
      expect(files.length).toBeGreaterThan(0);
      // Should have at least some .java files
      const javaFiles = files.filter((f) => f.endsWith('.java'));
      expect(javaFiles.length).toBeGreaterThan(0);

      // Cleanup
      fs.rmSync(outputDir, { recursive: true, force: true });
    }, 60000);
  });

  describe('run() with -gen json on example/config', () => {
    it('generates JSON data from example/config', async () => {
      const outputDir = path.resolve(__dirname, '../../../../.temp/cli-test-output/json');
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
      fs.mkdirSync(outputDir, { recursive: true });

      // JsonGenerator requires tables parameter (semicolon-separated table names)
      // and uses 'dst' (not 'dir') for output directory
      const ret = await runWithCatch([
        '-datadir', EXAMPLE_CONFIG,
        '-gen', `json,dst:${outputDir},tables:equip.ability;equip.jewelry;task.task2`,
      ]);

      expect(ret).toBe(0);

      const files = listFilesRecursive(outputDir);
      expect(files.length).toBeGreaterThan(0);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));
      expect(jsonFiles.length).toBeGreaterThan(0);

      // Cleanup
      fs.rmSync(outputDir, { recursive: true, force: true });
    }, 60000);
  });

  describe('run() with -gen bytes on example/config', () => {
    it('generates bytes binary data from example/config', async () => {
      const outputDir = path.resolve(__dirname, '../../../../.temp/cli-test-output/bytes');
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
      fs.mkdirSync(outputDir, { recursive: true });

      const ret = await runWithCatch([
        '-datadir', EXAMPLE_CONFIG,
        '-gen', `bytes,dir:${outputDir}`,
      ]);

      expect(ret).toBe(0);

      const files = listFilesRecursive(outputDir);
      // bytes generator produces .bytes files
      expect(files.length).toBeGreaterThan(0);

      // Cleanup
      fs.rmSync(outputDir, { recursive: true, force: true });
    }, 60000);
  });

  describe('run() with multiple generators', () => {
    it('runs java and json generators in sequence', async () => {
      const javaDir = path.resolve(__dirname, '../../../../.temp/cli-test-output/multi/java');
      const jsonDir = path.resolve(__dirname, '../../../../.temp/cli-test-output/multi/json');
      for (const dir of [javaDir, jsonDir]) {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
      }

      const ret = await runWithCatch([
        '-datadir', EXAMPLE_CONFIG,
        '-gen', `java,dir:${javaDir}`,
        '-gen', `json,dst:${jsonDir},tables:equip.ability;equip.jewelry;task.task2`,
      ]);

      expect(ret).toBe(0);

      const javaFiles = listFilesRecursive(javaDir).filter((f) => f.endsWith('.java'));
      const jsonFiles = listFilesRecursive(jsonDir).filter((f) => f.endsWith('.json'));
      expect(javaFiles.length).toBeGreaterThan(0);
      expect(jsonFiles.length).toBeGreaterThan(0);

      // Cleanup
      fs.rmSync(path.resolve(__dirname, '../../../../.temp/cli-test-output/multi'), { recursive: true, force: true });
    }, 60000);
  });

  describe('run() with -v verbose flag', () => {
    it('runs with verbose logging enabled', async () => {
      const outputDir = path.resolve(__dirname, '../../../../.temp/cli-test-output/verbose');
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
      fs.mkdirSync(outputDir, { recursive: true });

      const ret = await runWithCatch([
        '-v',
        '-datadir', EXAMPLE_CONFIG,
        '-gen', `json,dst:${outputDir},tables:equip.ability;equip.jewelry;task.task2`,
      ]);

      expect(ret).toBe(0);
      expect(Logger.verboseLevel()).toBe(1);

      // Cleanup
      fs.rmSync(outputDir, { recursive: true, force: true });
    }, 60000);
  });

  describe('run() with -encoding option', () => {
    it('accepts -encoding UTF-8', async () => {
      const outputDir = path.resolve(__dirname, '../../../../.temp/cli-test-output/encoding');
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
      fs.mkdirSync(outputDir, { recursive: true });

      const ret = await runWithCatch([
        '-datadir', EXAMPLE_CONFIG,
        '-encoding', 'UTF-8',
        '-gen', `json,dst:${outputDir},tables:equip.ability;equip.jewelry;task.task2`,
      ]);

      expect(ret).toBe(0);

      // Cleanup
      fs.rmSync(outputDir, { recursive: true, force: true });
    }, 60000);
  });

  describe('run() error cases', () => {
    it('returns 1 for missing -datadir with -gen', async () => {
      const ret = await runWithCatch(['-gen', 'java,dir:./output']);
      expect(ret).toBe(1);
    });

    it('returns 1 for unknown -gen name', async () => {
      const ret = await runWithCatch(['-datadir', EXAMPLE_CONFIG, '-gen', 'nosuchgen']);
      expect(ret).toBe(1);
    });

    it('returns 1 for unknown args', async () => {
      const ret = await runWithCatch(['-nosuchoption']);
      expect(ret).toBe(1);
    });
  });
});

/** Recursively list all files in a directory. */
function listFilesRecursive(dir: string): string[] {
  const result: string[] = [];
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFilesRecursive(fullPath));
    } else {
      result.push(fullPath);
    }
  }
  return result;
}
