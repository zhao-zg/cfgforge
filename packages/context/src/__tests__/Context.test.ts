/**
 * Context tests — T6.3
 *
 * Tests ported from Java ContextTest.java (10 tests).
 *
 * Key differences from Java:
 * - Context construction is async (ExcelJS pre-read), use `await Context.create(dir)`
 * - `makeValue(tag)` → `makeValueWithTag(tag)`
 * - `makeValue(tag, allowErr)` → `makeValueWithTagAndAllowErr(tag, allowErr)`
 * - `assertSame` → `toBe` (reference equality)
 * - `assertNotSame` → `not.toBe`
 * - Java `primaryKeyMap.get(key)` uses Value.equals(); JS Map uses ===, so we
 *   iterate with `valueEquals` for FK lookup verification
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Context } from '../Context';
import { ContextCfg } from '../ContextCfg';
import type { CfgValue, VTable, VStruct, Value } from '@cfgforge/value';
import { valueEquals } from '@cfgforge/value';
import { HeadRows } from '@cfgforge/data';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Write a file with UTF-8 content into a directory. */
function writeFile(dir: string, filename: string, content: string): string {
  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, content, 'utf8');
  return fullPath;
}

/** Look up a VStruct in primaryKeyMap by value equality (JS Map uses ===, not .equals()). */
function findByValue(map: Map<Value, VStruct>, target: Value): VStruct | undefined {
  for (const [k, v] of map) {
    if (valueEquals(k, target)) return v;
  }
  return undefined;
}

/** Recursive rm. */
function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

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

const USER_CSV_3ROWS = `用户ID,姓名,年龄
id,name,age
1,Alice,25
2,Bob,30
3,Charlie,35
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Context', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-ctx-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  // -- T1: Valid config directory produces CfgValue --

  describe('basic value generation', () => {
    it('should create CfgValue from valid config directory', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV_3ROWS);

      const ctx = await Context.create(tempDir);
      const cfgValue = ctx.makeValue();

      expect(cfgValue).toBeDefined();
      expect(ctx.cfgSchema()).toBeDefined();
      expect(ctx.cfgData()).toBeDefined();

      const userTable = cfgValue.getTable('user');
      expect(userTable).toBeDefined();
      expect(userTable!.valueList.length).toBe(3);
    });

    it('should handle empty directory gracefully', async () => {
      // Empty dir — no config.cfg, no CSV
      const ctx = await Context.create(tempDir);

      expect(ctx).toBeDefined();
      expect(ctx.cfgSchema()).toBeDefined();
      expect(ctx.cfgData()).toBeDefined();
      expect(ctx.cfgData().tables.size).toBe(0);
    });
  });

  // -- T2: Caching behavior --

  describe('tag-based caching', () => {
    it('should cache CfgValue for same tag', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV);

      const ctx = await Context.create(tempDir);

      const tag = 'test-tag';
      const first = ctx.makeValueWithTag(tag);
      const second = ctx.makeValueWithTag(tag);

      // Same object instance (cache hit)
      expect(second).toBe(first);
    });

    it('should generate different CfgValue for different tags', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV);

      const ctx = await Context.create(tempDir);

      const v1 = ctx.makeValueWithTag('tag1');
      const v2 = ctx.makeValueWithTag('tag2');

      // Different object instances (cache miss)
      expect(v2).not.toBe(v1);
    });

    it('should treat null tag as no filtering', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV);

      const ctx = await Context.create(tempDir);

      const nullTagValue = ctx.makeValueWithTag(null);
      const noTagValue = ctx.makeValue();

      expect(nullTagValue).toBeDefined();
      expect(noTagValue).toBeDefined();

      // Both should return the same row count (no tag filtering)
      const nullCount = nullTagValue.getTable('user')!.valueList.length;
      const noTagCount = noTagValue.getTable('user')!.valueList.length;
      expect(nullCount).toBe(noTagCount);
    });

    it('should throw for empty tag string', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV);

      const ctx = await Context.create(tempDir);

      expect(() => ctx.makeValueWithTag('')).toThrow('tag不能为空');
    });
  });

  // -- T3: allowErr semantics --

  describe('allowErr semantics', () => {
    it('should allow errors in makeValue when requested', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);

      // Intentionally invalid age value
      const invalidCsv = `用户ID,姓名,年龄
id,name,age
1,Alice,invalid_age
2,Bob,30
`;
      writeFile(tempDir, 'user.csv', invalidCsv);

      const ctx = await Context.create(tempDir);

      // With allowErr=true, value should be generated despite the error
      const cfgValue = ctx.makeValueWithTagAndAllowErr(null, true);
      expect(cfgValue).toBeDefined();
    });

    it('should key cache by allowErr direction', async () => {
      // Simplified schema (no age field to avoid actual errors)
      const cfgStr = `table user[id] {
  id:int;
  name:str;
}
`;
      const csvData = `用户ID,姓名
id,name
1,Alice
`;
      writeFile(tempDir, 'config.cfg', cfgStr);
      writeFile(tempDir, 'user.csv', csvData);

      const ctx = await Context.create(tempDir);

      const tag = 'editor';

      // lenient → strict: must miss (different objects) — bug regression gate
      const lenient = ctx.makeValueWithTagAndAllowErr(tag, true);
      const strict = ctx.makeValueWithTagAndAllowErr(tag, false);
      expect(strict).not.toBe(lenient);

      // strict → strict: cache hit (same object)
      const strict2 = ctx.makeValueWithTagAndAllowErr(tag, false);
      expect(strict2).toBe(strict);

      // strict → lenient: also cache hit (strict value is error-free, can serve lenient)
      const lenient2 = ctx.makeValueWithTagAndAllowErr(tag, true);
      expect(lenient2).toBe(strict);
    });
  });

  // -- T4: i18n and config accessors --

  describe('i18n and config accessors', () => {
    it('should return null for nullableLangTextFinder when not configured', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV);

      const ctx = await Context.create(tempDir);

      expect(ctx.nullableLangTextFinder()).toBeNull();
      expect(ctx.nullableLangSwitch()).toBeNull();
    });

    it('should provide access to context configuration', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV);

      const ctx = await Context.create(tempDir);

      const cfg = ctx.contextCfg();
      expect(cfg).toBeDefined();
      expect(cfg.dataDir).toBe(tempDir);
      expect(cfg.headRow).toBe(HeadRows.A2_Default);
      expect(cfg.csvOrTsvDefaultEncoding).toBe('UTF-8');
    });
  });

  // -- T5: Complex schema with foreign key references --

  describe('complex schema with references', () => {
    it('should handle foreign key references correctly', async () => {
      const cfgStr = `table department[id] {
  id:int;
  name:str;
}

table employee[id] {
  id:int;
  name:str;
  department_id:int ->department;
}
`;

      const deptCsv = `部门ID,部门名称
id,name
1,Engineering
2,Marketing
`;

      const empCsv = `员工ID,姓名,部门ID
id,name,department_id
1,Alice,1
2,Bob,2
3,Charlie,1
`;

      writeFile(tempDir, 'config.cfg', cfgStr);
      writeFile(tempDir, 'department.csv', deptCsv);
      writeFile(tempDir, 'employee.csv', empCsv);

      const ctx = await Context.create(tempDir);
      const cfgValue = ctx.makeValue();

      expect(cfgValue).toBeDefined();

      const deptTable = cfgValue.getTable('department');
      const empTable = cfgValue.getTable('employee');

      expect(deptTable).toBeDefined();
      expect(empTable).toBeDefined();
      expect(deptTable!.valueList.length).toBe(2);
      expect(empTable!.valueList.length).toBe(3);

      // Verify FK integrity: every employee's department_id exists in department table
      for (const emp of empTable!.valueList) {
        const deptIdValue = emp.values[2]; // department_id is field index 2
        const dept = findByValue(deptTable!.primaryKeyMap, deptIdValue);
        expect(dept).toBeDefined();
      }
    });
  });

  // -- T6: ContextCfg custom configuration --

  describe('custom ContextCfg', () => {
    it('should work with custom headRow and encoding', async () => {
      // Use 3-row header (A3) and GBK encoding
      const cfgStr = `table user[id] {
  id:int;
  name:str;
}
`;
      // 3-row header: Chinese name, English name, type
      const csvData = `用户ID,姓名
id,name
int,str
1,Alice
`;
      writeFile(tempDir, 'config.cfg', cfgStr);
      writeFile(tempDir, 'user.csv', csvData);

      const customCfg = new ContextCfg(
        tempDir,
        null,
        HeadRows.A3,
        'UTF-8',
        null,
        null,
        null,
        false,
      );

      const ctx = await Context.createWithCfg(customCfg);
      const cfgValue = ctx.makeValue();

      expect(cfgValue).toBeDefined();
      const userTable = cfgValue.getTable('user');
      expect(userTable).toBeDefined();
      expect(userTable!.valueList.length).toBe(1);
    });
  });

  // -- T6.4: makeValue cache rule detailed verification --

  describe('makeValue cache rules (T6.4)', () => {
    /*
     * Cache hit condition: tag matches AND allowErr direction is safe.
     *   - strict (allowErr=false) value can serve any request (strict or lenient)
     *   - lenient (allowErr=true) value can only serve lenient requests
     *   - lenient → strict must miss (bug regression gate)
     *   - strict → lenient is a hit (strict value is guaranteed error-free)
     */

    it('null tag strict → null tag strict: cache hit', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV);

      const ctx = await Context.create(tempDir);

      const v1 = ctx.makeValueWithTagAndAllowErr(null, false);
      const v2 = ctx.makeValueWithTagAndAllowErr(null, false);
      expect(v2).toBe(v1);
    });

    it('null tag strict → null tag lenient: cache hit', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV);

      const ctx = await Context.create(tempDir);

      const strict = ctx.makeValueWithTagAndAllowErr(null, false);
      const lenient = ctx.makeValueWithTagAndAllowErr(null, true);
      expect(lenient).toBe(strict);
    });

    it('null tag lenient → null tag strict: cache miss', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV);

      const ctx = await Context.create(tempDir);

      const lenient = ctx.makeValueWithTagAndAllowErr(null, true);
      const strict = ctx.makeValueWithTagAndAllowErr(null, false);
      expect(strict).not.toBe(lenient);
    });

    it('tag switch invalidates cache regardless of allowErr', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV);

      const ctx = await Context.create(tempDir);

      // tag1 strict → tag2 strict: different tag = miss
      const v1 = ctx.makeValueWithTagAndAllowErr('tag1', false);
      const v2 = ctx.makeValueWithTagAndAllowErr('tag2', false);
      expect(v2).not.toBe(v1);

      // tag2 strict → tag2 lenient: same tag, strict→lenient = hit
      const v3 = ctx.makeValueWithTagAndAllowErr('tag2', true);
      expect(v3).toBe(v2);
    });

    it('updateDataAndValue resets cache', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV);

      const ctx = await Context.create(tempDir);

      const v1 = ctx.makeValueWithTag('editor');
      // After updateDataAndValue, cache is cleared (tag reset to null, allowErr=false)
      ctx.updateDataAndValue(ctx.cfgData(), v1);
      const v2 = ctx.makeValueWithTag('editor');
      // tag was null in cache, now requesting 'editor' → miss → new object
      expect(v2).not.toBe(v1);
    });
  });
});
