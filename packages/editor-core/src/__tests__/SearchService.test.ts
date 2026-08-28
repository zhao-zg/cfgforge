/**
 * SearchService tests — T9.10
 *
 * SearchService searches all primitive values in a CfgValue tree:
 *   - search by string keyword (substring match on VString/VText)
 *   - search by number (exact match on VInt/VLong)
 *   - max items limit
 *   - empty query returns qNotSet
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EditorService } from '../EditorService';
import { SearchService } from '../SearchService';
import type { SearchResult } from '../SearchService';

function writeFile(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const CFG = `table item[id] (title='name') {
  id:int;
  name:str;
  desc:text;
}
`;

const CSV = `ID,名称,描述
id,name,desc
1,剑,一把锋利的剑
2,盾,坚固的盾牌
3,弓,远距离武器
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SearchService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-search-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  async function createService(): Promise<EditorService> {
    writeFile(tempDir, 'config.cfg', CFG);
    writeFile(tempDir, 'item.csv', CSV);
    return EditorService.create(tempDir);
  }

  // -------------------------------------------------------------------------
  // String search
  // -------------------------------------------------------------------------

  it('search by string keyword returns matching items', async () => {
    const svc = await createService();
    const result = SearchService.search(svc, '剑', 30);

    expect(result.resultCode).toBe('ok');
    expect(result.q).toBe('剑');
    // "剑" appears in name field ("剑") and desc field ("一把锋利的剑")
    expect(result.items.length).toBe(2);
    expect(result.items[0].table).toBe('item');
    expect(result.items[0].value).toContain('剑');
  });

  it('search by string returns multiple matches', async () => {
    const svc = await createService();
    const result = SearchService.search(svc, '的', 30);

    expect(result.resultCode).toBe('ok');
    expect(result.items.length).toBe(2);
    // Both 剑 and 盾 descriptions contain '的'
    const values = result.items.map(i => i.value);
    expect(values).toContain('一把锋利的剑');
    expect(values).toContain('坚固的盾牌');
  });

  // -------------------------------------------------------------------------
  // Number search
  // -------------------------------------------------------------------------

  it('search by number matches VInt values', async () => {
    const svc = await createService();
    const result = SearchService.search(svc, '1', 30);

    expect(result.resultCode).toBe('ok');
    expect(result.items.length).toBe(1);
    expect(result.items[0].table).toBe('item');
    expect(result.items[0].value).toBe('1');
    expect(result.items[0].fieldChain).toBe('id');
  });

  it('search by number finds no match for non-existent value', async () => {
    const svc = await createService();
    const result = SearchService.search(svc, '999', 30);

    expect(result.resultCode).toBe('ok');
    expect(result.items.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // max items limit
  // -------------------------------------------------------------------------

  it('search respects max items limit', async () => {
    const svc = await createService();
    // Search for a common character; with max=1, only 1 result
    const result = SearchService.search(svc, '的', 1);

    expect(result.resultCode).toBe('ok');
    expect(result.items.length).toBe(1);
  });

  it('search with max=0 returns all results', async () => {
    const svc = await createService();
    const result = SearchService.search(svc, '的', 0);

    expect(result.resultCode).toBe('ok');
    expect(result.items.length).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it('search with empty query returns qNotSet', async () => {
    const svc = await createService();
    const result = SearchService.search(svc, '', 30);

    expect(result.resultCode).toBe('qNotSet');
    expect(result.items.length).toBe(0);
  });

  it('search with whitespace-only query returns qNotSet', async () => {
    const svc = await createService();
    const result = SearchService.search(svc, '   ', 30);

    expect(result.resultCode).toBe('qNotSet');
    expect(result.items.length).toBe(0);
  });

  it('search returns SearchResultItem with table, pk, fieldChain, value', async () => {
    const svc = await createService();
    const result = SearchService.search(svc, '剑', 30);
    const item = result.items[0];

    expect(item).toHaveProperty('table');
    expect(item).toHaveProperty('pk');
    expect(item).toHaveProperty('fieldChain');
    expect(item).toHaveProperty('value');
    expect(typeof item.table).toBe('string');
    expect(typeof item.pk).toBe('string');
    expect(typeof item.fieldChain).toBe('string');
    expect(typeof item.value).toBe('string');
  });

  it('search by string matches in name field', async () => {
    const svc = await createService();
    const result = SearchService.search(svc, '盾', 30);

    expect(result.resultCode).toBe('ok');
    // Should find '盾' in name field and possibly in desc
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    const hasNameMatch = result.items.some(i => i.fieldChain === 'name');
    expect(hasNameMatch).toBe(true);
  });

  // -------------------------------------------------------------------------
  // P1-4: 数字输入走精确匹配（而非字符串子串）
  // -------------------------------------------------------------------------

  it('P1-4 search("1001") 走数字精确匹配，不匹配字符串子串', async () => {
    // fixture：id=1001 的记录 + name 字段包含 "1001" 子串（"x1001x"）
    const cfg = `table item[id] (title='name') {
  id:int;
  name:str;
}
`;
    const csv = `id,name
id,name
1001,x1001x
2,y
`;
    writeFile(tempDir, 'config.cfg', cfg);
    writeFile(tempDir, 'item.csv', csv);
    const svc = await EditorService.create(tempDir);

    const result = SearchService.search(svc, '1001', 30);
    expect(result.resultCode).toBe('ok');
    // 数字分支：只精确命中 int 字段 id=1001；name="x1001x" 不被子串匹配
    expect(result.items.length).toBe(1);
    expect(result.items[0].fieldChain).toBe('id');
    expect(result.items[0].value).toBe('1001');
  });
});
