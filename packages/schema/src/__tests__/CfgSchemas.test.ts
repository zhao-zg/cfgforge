/**
 * CfgSchemas tests — T2.20: multi-file read + merge.
 *
 * Tests that reading multiple .cfg files produces a single merged CfgSchema
 * with all items and fileEndComments from all files.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CfgSchemas, CfgFileInfo } from '../CfgSchemas';
import { CfgSchema } from '../CfgSchema';
import { TableSchema } from '../TableSchema';
import { InterfaceSchema } from '../InterfaceSchema';

// ---------------------------------------------------------------------------
// Helper: read fixture file from repo root
// ---------------------------------------------------------------------------

function readFixture(relativePath: string): string {
  const root = process.cwd();
  return readFileSync(join(root, relativePath), 'utf-8');
}

describe('CfgSchemas', () => {

  // =========================================================================
  // 1. readFromDir: merge multiple CFG files into one CfgSchema
  // =========================================================================
  it('readFromDir merges items from multiple files', () => {
    const cfgStr1 = `
      table tab1[id] {
          id:int;
          v:int;
      }
    `;
    const cfgStr2 = `
      table tab2[id] {
          id:int;
          name:str;
      }
    `;

    const files: CfgFileInfo[] = [
      { path: 'fake1.cfg', relativePath: 'fake1.cfg', pkgNameDot: '', lastModified: 0, content: cfgStr1 },
      { path: 'fake2.cfg', relativePath: 'fake2.cfg', pkgNameDot: '', lastModified: 0, content: cfgStr2 },
    ];

    const schema = CfgSchemas.readFromDir(files);
    schema.buildIndexMaps();
    expect(schema.items().length).toBe(2);

    const tab1 = schema.findTable('tab1');
    const tab2 = schema.findTable('tab2');
    expect(tab1).toBeDefined();
    expect(tab2).toBeDefined();
    expect(tab1!.fields().length).toBe(2);
    expect(tab2!.fields().length).toBe(2);
  });

  // =========================================================================
  // 2. readFromDir: merge items with namespace prefix
  // =========================================================================
  it('readFromDir merges items with namespace prefix', () => {
    const cfgStr1 = `
      table equip_tab[id] {
          id:int;
          atk:int;
      }
    `;
    const cfgStr2 = `
      table task_tab[id] {
          id:int;
          name:str;
      }
    `;

    const files: CfgFileInfo[] = [
      { path: 'equip.cfg', relativePath: 'equip.cfg', pkgNameDot: 'equip.', lastModified: 0, content: cfgStr1 },
      { path: 'task.cfg', relativePath: 'task.cfg', pkgNameDot: 'task.', lastModified: 0, content: cfgStr2 },
    ];

    const schema = CfgSchemas.readFromDir(files);
    schema.buildIndexMaps();
    expect(schema.items().length).toBe(2);

    // Items should have namespaced names
    const tab1 = schema.findTable('equip.equip_tab');
    const tab2 = schema.findTable('task.task_tab');
    expect(tab1).toBeDefined();
    expect(tab2).toBeDefined();
  });

  // =========================================================================
  // 3. readFromDir: merge file end comments
  // =========================================================================
  it('readFromDir merges fileEndComments', () => {
    const cfgStr1 = `
      table tab1[id] {
          id:int;
      }
      // file1 end comment
    `;
    const cfgStr2 = `
      table tab2[id] {
          id:int;
      }
      // file2 end comment
    `;

    const files: CfgFileInfo[] = [
      { path: 'f1.cfg', relativePath: 'f1.cfg', pkgNameDot: '', lastModified: 0, content: cfgStr1 },
      { path: 'f2.cfg', relativePath: 'f2.cfg', pkgNameDot: 'ns.', lastModified: 0, content: cfgStr2 },
    ];

    const schema = CfgSchemas.readFromDir(files);
    expect(schema.items().length).toBe(2);
    expect(schema.getFileEndComment('')).toContain('file1 end comment');
    expect(schema.getFileEndComment('ns.')).toContain('file2 end comment');
  });

  // =========================================================================
  // 4. readFromDir: empty input → empty schema
  // =========================================================================
  it('readFromDir with empty input returns empty schema', () => {
    const schema = CfgSchemas.readFromDir([]);
    expect(schema.items().length).toBe(0);
  });

  // =========================================================================
  // 5. readFromDir: single file works same as CfgReader.parse
  // =========================================================================
  it('readFromDir single file equivalent to parse', () => {
    const cfgStr = `
      table tab1[id] {
          id:int;
          v:int;
      }
    `;

    const files: CfgFileInfo[] = [
      { path: 'single.cfg', relativePath: 'single.cfg', pkgNameDot: '', lastModified: 0, content: cfgStr },
    ];

    const schema = CfgSchemas.readFromDir(files);
    schema.buildIndexMaps();
    expect(schema.items().length).toBe(1);
    const tab1 = schema.findTable('tab1');
    expect(tab1).toBeDefined();
    expect(tab1!.fields().length).toBe(2);
  });

  // =========================================================================
  // 6. readFromDir: resolve merged schema works
  // =========================================================================
  it('readFromDir merged schema can be resolved', () => {
    const cfgStr1 = `
      table tab1[id] {
          id:int;
          v:int ->tab2;
      }
    `;
    const cfgStr2 = `
      table tab2[id] {
          id:int;
          name:str;
      }
    `;

    const files: CfgFileInfo[] = [
      { path: 'f1.cfg', relativePath: 'f1.cfg', pkgNameDot: '', lastModified: 0, content: cfgStr1 },
      { path: 'f2.cfg', relativePath: 'f2.cfg', pkgNameDot: '', lastModified: 0, content: cfgStr2 },
    ];

    const schema = CfgSchemas.readFromDir(files);
    const errs = schema.resolve();
    expect(errs.errs.length).toBe(0);
  });

  // =========================================================================
  // 7. readFromDir: read example/config/config.cfg fixture
  // =========================================================================
  it('readFromDir reads example/config/config.cfg', () => {
    const cfgStr = readFixture('example/config/config.cfg');
    const files: CfgFileInfo[] = [
      { path: 'config.cfg', relativePath: 'config.cfg', pkgNameDot: '', lastModified: 0, content: cfgStr },
    ];

    const schema = CfgSchemas.readFromDir(files);
    expect(schema.items().length).toBeGreaterThan(0);
  });

  // =========================================================================
  // 8. readFromDir: read multiple example config files
  // =========================================================================
  it('readFromDir reads multiple example config files', () => {
    const fixtures = [
      'example/config/equip/equip.cfg',
      'example/config/task/task.cfg',
      'example/config/other/other.cfg',
    ];

    const files: CfgFileInfo[] = fixtures.map((f, i) => ({
      path: f,
      relativePath: f,
      pkgNameDot: '',
      lastModified: 0,
      content: readFixture(f),
    }));

    const schema = CfgSchemas.readFromDir(files);
    expect(schema.items().length).toBeGreaterThan(2);
  });

});
