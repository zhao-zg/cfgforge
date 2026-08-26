/**
 * End-to-end regression tests — T6.6
 *
 * Constructs a Context from example/config/ and verifies the full pipeline:
 *   Context.create(dir) → schema read → data read → align → makeValue()
 *
 * This is the context-layer E2E test that ties together all packages:
 *   schema → data → value → i18n → context
 *
 * Uses the same example/config/ directory as the Java IntegrationTest.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { Context } from '../Context';
import type { CfgValue, VTable } from '@cfgforge/value';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const EXAMPLE_CONFIG_DIR = path.join(REPO_ROOT, 'example', 'config');

describe('E2E: Context with example/config/ (T6.6)', () => {
  // Skip if example/config/ doesn't exist (e.g. in CI without test data)
  const hasExampleConfig = fs.existsSync(
    path.join(EXAMPLE_CONFIG_DIR, 'config.cfg'),
  );

  (hasExampleConfig ? describe : describe.skip)(
    'full pipeline via Context',
    () => {
      it('creates Context and generates CfgValue without errors', async () => {
        const ctx = await Context.create(EXAMPLE_CONFIG_DIR);

        expect(ctx.cfgSchema()).toBeDefined();
        expect(ctx.cfgData()).toBeDefined();
        expect(ctx.rootDir()).toBe(EXAMPLE_CONFIG_DIR);

        const cfgValue = ctx.makeValue();
        expect(cfgValue).toBeDefined();

        // Should have a reasonable number of tables
        const tableCount = Array.from(cfgValue.tables()).length;
        expect(tableCount).toBeGreaterThan(0);
      });

      it('CfgValue has tables with data', async () => {
        const ctx = await Context.create(EXAMPLE_CONFIG_DIR);
        const cfgValue = ctx.makeValue();

        let totalRecords = 0;
        for (const vTable of cfgValue.sortedTables()) {
          totalRecords += vTable.valueList.length;
        }
        expect(totalRecords).toBeGreaterThan(0);
      });

      it('primaryKeyMap is populated for all tables with data', async () => {
        const ctx = await Context.create(EXAMPLE_CONFIG_DIR);
        const cfgValue = ctx.makeValue();

        for (const vTable of cfgValue.sortedTables()) {
          if (vTable.valueList.length > 0) {
            // Primary key map size should equal valueList size
            expect(vTable.primaryKeyMap.size).toBe(vTable.valueList.length);
          }
        }
      });

      it('makeValueWithTag produces filtered value', async () => {
        const ctx = await Context.create(EXAMPLE_CONFIG_DIR);

        const noTagValue = ctx.makeValue();
        const taggedValue = ctx.makeValueWithTag('genjava');

        expect(noTagValue).toBeDefined();
        expect(taggedValue).toBeDefined();

        // Tagged value should be a different object (cache miss: different tag)
        expect(taggedValue).not.toBe(noTagValue);
      });

      it('makeValue cache returns same object for same tag', async () => {
        const ctx = await Context.create(EXAMPLE_CONFIG_DIR);

        const v1 = ctx.makeValue();
        const v2 = ctx.makeValue();

        // Same tag (null) → cache hit (same object)
        expect(v2).toBe(v1);
      });

      it('makeValueWithTagAndAllowErr produces value with allowErr', async () => {
        const ctx = await Context.create(EXAMPLE_CONFIG_DIR);

        // With allowErr=true, value generation should succeed even if there
        // are minor warnings
        const cfgValue = ctx.makeValueWithTagAndAllowErr(null, true);
        expect(cfgValue).toBeDefined();
      });

      it('contextCfg returns correct data directory', async () => {
        const ctx = await Context.create(EXAMPLE_CONFIG_DIR);

        const cfg = ctx.contextCfg();
        expect(cfg.dataDir).toBe(EXAMPLE_CONFIG_DIR);
        // Default headRow should be A2_Default (2 rows)
        expect(cfg.headRow.rowCount()).toBe(2);
      });

      it('nullableLangTextFinder returns null when no i18n configured', async () => {
        const ctx = await Context.create(EXAMPLE_CONFIG_DIR);

        expect(ctx.nullableLangTextFinder()).toBeNull();
        expect(ctx.nullableLangSwitch()).toBeNull();
      });

      it('sourceStructure has discovered files', async () => {
        const ctx = await Context.create(EXAMPLE_CONFIG_DIR);

        const ss = ctx.sourceStructure();
        expect(ss.getCfgFiles().length).toBeGreaterThan(0);
        expect(ss.getExcelFiles().length).toBeGreaterThanOrEqual(0);
      });
    },
  );
});
