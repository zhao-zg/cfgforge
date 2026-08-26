/**
 * Generators registry tests — T8.1
 *
 * Ported from Java Generators behavior (configgen.gen.Generators).
 *
 * Differences from Java:
 * - `create` returns null for unknown id (same as Java)
 * - `addProvider` accepts a factory `(parameter) => Generator`
 * - `getAllProviders` returns a read-only view
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { Context } from '@cfgforge/context';
import { Generators } from '../Generators';
import { Generator } from '../Generator';
import { GeneratorWithTag } from '../GeneratorWithTag';
import type { Parameter } from '../Parameter';

// ---------------------------------------------------------------------------
// Helper: a minimal generator that writes a marker file into dstDir
// ---------------------------------------------------------------------------

class MarkerGenerator extends Generator {
  private readonly dstDir: string;

  constructor(parameter: Parameter, dstDir: string) {
    super(parameter);
    this.dstDir = dstDir;
  }

  async generate(_ctx: Context): Promise<void> {
    const { writeFileSync, mkdirSync } = await import('fs');
    mkdirSync(this.dstDir, { recursive: true });
    writeFileSync(path.join(this.dstDir, 'marker.txt'), 'ok', 'utf8');
  }
}

// A tag-aware marker generator
class TaggedMarkerGenerator extends GeneratorWithTag {
  private readonly dstDir: string;

  constructor(parameter: Parameter, dstDir: string) {
    super(parameter);
    this.dstDir = dstDir;
  }

  async generate(_ctx: Context): Promise<void> {
    const { writeFileSync, mkdirSync } = await import('fs');
    mkdirSync(this.dstDir, { recursive: true });
    writeFileSync(path.join(this.dstDir, 'tag.txt'), this.tag ?? 'none', 'utf8');
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Generators', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-gen-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('registers a provider and creates it via create()', () => {
    Generators.addProvider('marker', (parameter) => new MarkerGenerator(parameter, tempDir));
    const gen = Generators.create('marker');
    expect(gen).not.toBeNull();
    expect(gen).toBeInstanceOf(Generator);
  });

  it('create() passes parameters to the provider', async () => {
    Generators.addProvider('marker2', (parameter) => {
      // ArgParser splits on ':' before '=', so Windows drive paths (e.g. C:\...)
      // cannot be passed as parameter values — use a relative dst instead.
      expect(parameter.get('dst', '')).toBe('out');
      return new MarkerGenerator(parameter, tempDir);
    });
    const gen = Generators.create('marker2,dst=out');
    await gen!.generate({} as Context);
    expect(fs.existsSync(path.join(tempDir, 'marker.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, 'marker.txt'), 'utf8')).toBe('ok');
  });

  it('returns null for unknown generator id', () => {
    expect(Generators.create('nosuchgen')).toBeNull();
  });

  it('GeneratorWithTag reads own tag parameter', async () => {
    Generators.addProvider('tagged', (parameter) => new TaggedMarkerGenerator(parameter, tempDir));
    const gen = Generators.create('tagged,own=myTag');
    await gen.generate({} as never);
    expect(fs.readFileSync(path.join(tempDir, 'tag.txt'), 'utf8')).toBe('myTag');
  });

  it('GeneratorWithTag defaults tag to null', async () => {
    Generators.addProvider('tagged2', (parameter) => new TaggedMarkerGenerator(parameter, tempDir));
    const gen = Generators.create('tagged2');
    await gen.generate({} as never);
    expect(fs.readFileSync(path.join(tempDir, 'tag.txt'), 'utf8')).toBe('none');
  });

  it('getAllProviders returns a read-only snapshot', () => {
    const before = Generators.getAllProviders().size;
    Generators.addProvider('snapshot-test', () => new MarkerGenerator(new Map() as never, tempDir));
    const view = Generators.getAllProviders();
    expect(view.size).toBe(before + 1);
    expect(view.has('snapshot-test')).toBe(true);
    // Mutating the returned snapshot must not affect the registry
    (view as Map<string, unknown>).delete('snapshot-test');
    expect(Generators.getAllProviders().has('snapshot-test')).toBe(true);
  });

  it('create() rejects unsupported extra parameters', () => {
    Generators.addProvider('strict-test', (parameter) => {
      const dst = parameter.get('dst', '.');
      return new MarkerGenerator(parameter, path.join(tempDir, dst));
    });
    expect(() => Generators.create('strict-test,unknownParam=1')).toThrow(/unsupported parameter/);
  });
});