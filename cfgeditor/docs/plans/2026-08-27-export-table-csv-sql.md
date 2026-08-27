---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '9ed26d3a-ec40-4d94-b9db-e3ade917f384'
  PropagateID: '9ed26d3a-ec40-4d94-b9db-e3ade917f384'
  ReservedCode1: '644f80d9-04c4-4b14-990a-2040fb2b14cd'
  ReservedCode2: '644f80d9-04c4-4b14-990a-2040fb2b14cd'
---

# 整表导出 CSV + SQL 实现计划

> **For implementer:** Use TDD throughout. Write failing test first. Watch it fail. Then implement.

> AI生成

**Goal:** 在 cfgeditor 的 ToolsSetting 面板新增两个按钮，一键将当前定位的表导出为 CSV 或 SQL 文件。

**Architecture:** 新建 `ExportService`（editor-core 层），从 `cfgValue.vTableMap` 取 VTable，遍历 `primaryKeyMap` 的每个 VStruct，用 `ValueToJson` 转为 JSON 对象，再按格式生成 CSV 或 SQL 字符串。cfgeditor 层通过 `apiClient.exportTable()` 调用，用 `file-saver` 的 `saveAs` 保存文件。

**Tech Stack:** TypeScript, vitest (jsdom), file-saver, @cfgforge/editor-core, @cfgforge/value, @cfgforge/schema

---

### Task 1: ExportService — camelToSnake 辅助函数

**Files:**
- Create: `packages/editor-core/src/ExportService.ts`
- Test: `packages/editor-core/src/__tests__/ExportService.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { ExportService } from '../ExportService';

describe('ExportService', () => {
  describe('camelToSnake', () => {
    it('converts HeroRecruitList to hero_recruit_list', () => {
      expect(ExportService.camelToSnake('HeroRecruitList')).toBe('hero_recruit_list');
    });

    it('converts A2024Christmas to a2024_christmas', () => {
      expect(ExportService.camelToSnake('A2024Christmas')).toBe('a2024_christmas');
    });

    it('converts AiNpcCityAttack to ai_npc_city_attack', () => {
      expect(ExportService.camelToSnake('AiNpcCityAttack')).toBe('ai_npc_city_attack');
    });

    it('converts simple lowercase name', () => {
      expect(ExportService.camelToSnake('item')).toBe('item');
    });

    it('handles consecutive uppercase', () => {
      expect(ExportService.camelToSnake('HTTPServer')).toBe('http_server');
    });
  });
});
```

**Step 2: Run test — confirm it fails**

Command: `cd packages/editor-core && npx vitest run src/__tests__/ExportService.test.ts`
Expected: FAIL — "Cannot find module '../ExportService'"

**Step 3: Write minimal implementation**

```typescript
/**
 * ExportService — export a table's records to CSV or SQL format.
 *
 * Provides static methods to generate CSV and SQL strings from a VTable.
 */

import type { CfgValue, VTable, VStruct } from '@cfgforge/value';
import { ValueToJson } from '@cfgforge/value';
import type { EditorService } from './EditorService';
import { isPrimitive, isStructRef, isFList, isFMap, type FieldType, type Primitive } from '@cfgforge/schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = 'csv' | 'sql';
export type ExportResultCode = 'ok' | 'tableNotFound';

export interface ExportResult {
  resultCode: ExportResultCode;
  table: string;
  content: string;
}

// ---------------------------------------------------------------------------
// ExportService
// ---------------------------------------------------------------------------

export class ExportService {
  /**
   * Convert CamelCase to snake_case.
   * Inserts underscore at:
   * - lowercase→uppercase boundary: heroR → hero_r
   * - uppercase→uppercase+lowercase boundary: HTTPServer → http_server (HTTP→Server)
   * - letter→digit boundary: A2024 → a_2024
   * - digit→letter boundary: 2024C → 2024_c
   */
  static camelToSnake(name: string): string {
    let result = '';
    for (let i = 0; i < name.length; i++) {
      const c = name[i];
      const prev = name[i - 1];
      if (i > 0 && prev !== undefined) {
        const isBoundary =
          (isLower(prev) && isUpper(c)) ||
          (isUpper(prev) && isUpper(c) && i + 1 < name.length && isLower(name[i + 1])) ||
          (isLetter(prev) && isDigit(c)) ||
          (isDigit(prev) && isLetter(c));
        if (isBoundary) {
          result += '_';
        }
      }
      result += c.toLowerCase();
    }
    return result;
  }

  static async export(editor: EditorService, table: string, format: ExportFormat): Promise<ExportResult> {
    // Implemented in later tasks
    throw new Error('Not implemented');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isUpper(c: string): boolean {
  return c >= 'A' && c <= 'Z';
}

function isLower(c: string): boolean {
  return c >= 'a' && c <= 'z';
}

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}

function isLetter(c: string): boolean {
  return isUpper(c) || isLower(c);
}
```

**Step 4: Run test — confirm it passes**

Command: `cd packages/editor-core && npx vitest run src/__tests__/ExportService.test.ts`
Expected: PASS

**Step 5: Commit**

`cd packages/editor-core && git add src/ExportService.ts src/__tests__/ExportService.test.ts && git commit -m "feat(editor-core): ExportService camelToSnake helper"`

---

### Task 2: ExportService — CSV 生成

**Files:**
- Modify: `packages/editor-core/src/ExportService.ts`
- Modify: `packages/editor-core/src/__tests__/ExportService.test.ts`

**Step 1: Write the failing test**

Append to the test file:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EditorService } from '../EditorService';
import { ExportResult } from '../ExportService';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const ITEM_CFG = `table item[id] (title='name') {
  id:int;
  name:str;
  damage:int;
}
`;

const ITEM_CSV = `ID,名称,伤害
id,name,damage
100,剑,10
101,盾,20
`;

function writeFile(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('ExportService CSV', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-export-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  async function createService(cfg: string, csvs: Record<string, string>): Promise<EditorService> {
    writeFile(tempDir, 'config.cfg', cfg);
    for (const [name, content] of Object.entries(csvs)) {
      writeFile(tempDir, name, content);
    }
    return EditorService.create(tempDir);
  }

  it('exports CSV with correct headers and data rows', async () => {
    const svc = await createService(ITEM_CFG, { 'item.csv': ITEM_CSV });
    const result = await ExportService.export(svc, 'item', 'csv');

    expect(result.resultCode).toBe('ok');
    expect(result.table).toBe('item');
    // BOM header
    expect(result.content.startsWith('\uFEFF')).toBe(true);
    // Header row: field names from schema
    const lines = result.content.slice(1).split('\r\n'); // remove BOM, split by CRLF
    expect(lines[0]).toBe('id,name,damage');
    // Data rows
    expect(lines[1]).toBe('100,剑,10');
    expect(lines[2]).toBe('101,盾,20');
  });

  it('exports CSV with JSON-serialized nested values', async () => {
    const NESTED_CFG = `table reward[id] {
  id:int;
  items:list,int;
}
`;
    const NESTED_CSV = `ID,物品
id,items
1,"100,200,300"
`;
    const svc = await createService(NESTED_CFG, { 'reward.csv': NESTED_CSV });
    const result = await ExportService.export(svc, 'reward', 'csv');

    expect(result.resultCode).toBe('ok');
    const lines = result.content.slice(1).split('\r\n');
    expect(lines[0]).toBe('id,items');
    // list value should be JSON-serialized
    const itemsValue = lines[1].split(',').slice(1).join(',');
    // The list [100,200,300] becomes "[100,200,300]" — may need quoting
    expect(itemsValue).toContain('100');
    expect(itemsValue).toContain('300');
  });

  it('escapes CSV special characters (comma, quote, newline)', async () => {
    const ESC_CFG = `table message[id] {
  id:int;
  text:str;
}
`;
    const ESC_CSV = `ID,文本
id,text
1,"Hello, ""World""\nNew line"
`;
    const svc = await createService(ESC_CFG, { 'message.csv': ESC_CSV });
    const result = await ExportService.export(svc, 'message', 'csv');

    expect(result.resultCode).toBe('ok');
    const content = result.content;
    // Values with comma/quote/newline should be quoted and quotes doubled
    expect(content).toContain('"Hello');
    expect(content).toContain('""World""');
  });

  it('returns tableNotFound for nonexistent table', async () => {
    const svc = await createService(ITEM_CFG, { 'item.csv': ITEM_CSV });
    const result = await ExportService.export(svc, 'nonexistent', 'csv');
    expect(result.resultCode).toBe('tableNotFound');
  });

  it('exports empty table with only header row', async () => {
    const EMPTY_CSV = `ID,名称,伤害
id,name,damage
`;
    const svc = await createService(ITEM_CFG, { 'item.csv': EMPTY_CSV });
    const result = await ExportService.export(svc, 'item', 'csv');

    expect(result.resultCode).toBe('ok');
    const lines = result.content.slice(1).split('\r\n');
    expect(lines[0]).toBe('id,name,damage');
    // Only header, no data rows (besides trailing empty)
    expect(lines.length).toBe(2); // header + empty trailing
  });
});
```

Also need to add imports at the top of the test file:
```typescript
import { beforeEach, afterEach } from 'vitest';
```

**Step 2: Run test — confirm it fails**

Command: `cd packages/editor-core && npx vitest run src/__tests__/ExportService.test.ts`
Expected: FAIL — "Not implemented" error from `export()`

**Step 3: Write minimal implementation**

Replace the `export` method in `ExportService.ts`:

```typescript
  static async export(editor: EditorService, table: string, format: ExportFormat): Promise<ExportResult> {
    const vTable = editor.cfgValue().getTable(table);
    if (vTable === undefined) {
      return { resultCode: 'tableNotFound', table, content: '' };
    }

    if (format === 'csv') {
      return { resultCode: 'ok', table, content: ExportService.exportCsv(editor.cfgValue(), vTable) };
    } else {
      return { resultCode: 'ok', table, content: ExportService.exportSql(editor.cfgValue(), vTable) };
    }
  }

  // -------------------------------------------------------------------------
  // CSV
  // -------------------------------------------------------------------------

  private static exportCsv(cfgValue: CfgValue, vTable: VTable): string {
    const fields = vTable.schema.fields();
    const fieldNames = fields.map(f => f.name);

    // Build records: iterate primaryKeyMap, convert each VStruct to JSON
    const records: Record<string, unknown>[] = [];
    for (const vStruct of vTable.primaryKeyMap.values()) {
      const toJson = new ValueToJson(cfgValue, new Map());
      toJson.setSaveDefault(true);
      const jsonObj = toJson.toJsonVStruct(vStruct);
      // Remove $type, $note, $fold, $refs, $embed_* keys — keep only data fields
      const dataObj: Record<string, unknown> = {};
      for (const fn of fieldNames) {
        dataObj[fn] = jsonObj[fn] ?? '';
      }
      records.push(dataObj);
    }

    // Build CSV string
    const lines: string[] = [];

    // Header row
    lines.push(fieldNames.map(ExportService.csvEscapeField).join(','));

    // Data rows
    for (const record of records) {
      const values = fieldNames.map(fn => ExportService.csvSerializeValue(record[fn]));
      lines.push(values.join(','));
    }

    return '\uFEFF' + lines.join('\r\n');
  }

  private static csvEscapeField(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  private static csvSerializeValue(value: unknown): string {
    let str: string;
    if (value === null || value === undefined) {
      str = '';
    } else if (typeof value === 'string') {
      str = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      str = String(value);
    } else {
      // Object or array → JSON
      str = JSON.stringify(value);
    }
    return ExportService.csvEscapeField(str);
  }

  // -------------------------------------------------------------------------
  // SQL (placeholder, implemented in Task 3)
  // -------------------------------------------------------------------------

  private static exportSql(_cfgValue: CfgValue, _vTable: VTable): string {
    throw new Error('SQL export not yet implemented');
  }
```

Also update the imports at the top of the file:
```typescript
import type { CfgValue, VTable, VStruct } from '@cfgforge/value';
import { ValueToJson } from '@cfgforge/value';
import type { EditorService } from './EditorService';
import type { FieldSchema } from '@cfgforge/schema';
```

Remove the unused imports of `isPrimitive`, `isStructRef`, etc. — those are for Task 3.

**Step 4: Run test — confirm it passes**

Command: `cd packages/editor-core && npx vitest run src/__tests__/ExportService.test.ts`
Expected: PASS (CSV tests pass, SQL tests not yet added)

**Step 5: Commit**

`cd packages/editor-core && git add src/ExportService.ts src/__tests__/ExportService.test.ts && git commit -m "feat(editor-core): ExportService CSV export"`

---

### Task 3: ExportService — SQL 生成

**Files:**
- Modify: `packages/editor-core/src/ExportService.ts`
- Modify: `packages/editor-core/src/__tests__/ExportService.test.ts`

**Step 1: Write the failing test**

Append to the test file:

```typescript
describe('ExportService SQL', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-export-sql-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  async function createService(cfg: string, csvs: Record<string, string>): Promise<EditorService> {
    writeFile(tempDir, 'config.cfg', cfg);
    for (const [name, content] of Object.entries(csvs)) {
      writeFile(tempDir, name, content);
    }
    return EditorService.create(tempDir);
  }

  it('exports SQL with CREATE TABLE and INSERT statements', async () => {
    const svc = await createService(ITEM_CFG, { 'item.csv': ITEM_CSV });
    const result = await ExportService.export(svc, 'item', 'sql');

    expect(result.resultCode).toBe('ok');
    expect(result.table).toBe('item');

    // Table name: cfg_item (camelToSnake)
    expect(result.content).toContain('CREATE TABLE IF NOT EXISTS "cfg_item"');
    // Field definitions with types
    expect(result.content).toContain('"id" INTEGER');
    expect(result.content).toContain('"name" TEXT');
    expect(result.content).toContain('"damage" INTEGER');
    // INSERT statements
    expect(result.content).toContain('INSERT INTO "cfg_item" VALUES');
    expect(result.content).toContain('100');
    expect(result.content).toContain("'剑'");
    expect(result.content).toContain('10');
    expect(result.content).toContain('101');
    expect(result.content).toContain("'盾'");
    expect(result.content).toContain('20');
  });

  it('uses correct SQL type for bool, float, list fields', async () => {
    const TYPE_CFG = `table mixed[id] {
  id:int;
  name:str;
  active:bool;
  rate:float;
  tags:list,str;
}
`;
    const TYPE_CSV = `ID,名称,激活,比率,标签
id,name,active,rate,tags
1,test,true,1.5,"a,b,c"
`;
    const svc = await createService(TYPE_CFG, { 'mixed.csv': TYPE_CSV });
    const result = await ExportService.export(svc, 'mixed', 'sql');

    expect(result.resultCode).toBe('ok');
    expect(result.content).toContain('"active" INTEGER');
    expect(result.content).toContain('"rate" REAL');
    expect(result.content).toContain('"tags" TEXT');
  });

  it('escapes single quotes in SQL string values', async () => {
    const ESC_CFG = `table message[id] {
  id:int;
  text:str;
}
`;
    const ESC_CSV = `ID,文本
id,text
1,It's a test
`;
    const svc = await createService(ESC_CFG, { 'message.csv': ESC_CSV });
    const result = await ExportService.export(svc, 'message', 'sql');

    expect(result.resultCode).toBe('ok');
    // Single quote should be escaped as ''
    expect(result.content).toContain("'It''s a test'");
  });

  it('exports empty table with only CREATE TABLE', async () => {
    const EMPTY_CSV = `ID,名称,伤害
id,name,damage
`;
    const svc = await createService(ITEM_CFG, { 'item.csv': EMPTY_CSV });
    const result = await ExportService.export(svc, 'item', 'sql');

    expect(result.resultCode).toBe('ok');
    expect(result.content).toContain('CREATE TABLE IF NOT EXISTS');
    expect(result.content).not.toContain('INSERT INTO');
  });

  it('uses correct table name for CamelCase tables', async () => {
    const CC_CFG = `table HeroRecruitList[id] {
  id:int;
  name:str;
}
`;
    const CC_CSV = `ID,名称
id,name
1,Hero
`;
    const svc = await createService(CC_CFG, { 'HeroRecruitList.csv': CC_CSV });
    const result = await ExportService.export(svc, 'HeroRecruitList', 'sql');

    expect(result.resultCode).toBe('ok');
    expect(result.content).toContain('"cfg_hero_recruit_list"');
  });
});
```

**Step 2: Run test — confirm it fails**

Command: `cd packages/editor-core && npx vitest run src/__tests__/ExportService.test.ts`
Expected: FAIL — "SQL export not yet implemented" error

**Step 3: Write minimal implementation**

Replace the `exportSql` placeholder and add SQL helper methods:

```typescript
  // -------------------------------------------------------------------------
  // SQL
  // -------------------------------------------------------------------------

  private static exportSql(cfgValue: CfgValue, vTable: VTable): string {
    const tableName = 'cfg_' + ExportService.camelToSnake(vTable.name());
    const fields = vTable.schema.fields();

    // Build records
    const records: Record<string, unknown>[] = [];
    for (const vStruct of vTable.primaryKeyMap.values()) {
      const toJson = new ValueToJson(cfgValue, new Map());
      toJson.setSaveDefault(true);
      const jsonObj = toJson.toJsonVStruct(vStruct);
      const dataObj: Record<string, unknown> = {};
      for (const f of fields) {
        dataObj[f.name] = jsonObj[f.name] ?? null;
      }
      records.push(dataObj);
    }

    const lines: string[] = [];

    // CREATE TABLE
    const colDefs = fields.map(f => `"${f.name}" ${ExportService.sqlType(f.type)}`);
    lines.push(`CREATE TABLE IF NOT EXISTS "${tableName}" (${colDefs.join(', ')});`);

    // INSERT statements
    for (const record of records) {
      const values = fields.map(f => ExportService.sqlSerializeValue(record[f.name]));
      lines.push(`INSERT INTO "${tableName}" VALUES (${values.join(', ')});`);
    }

    return lines.join('\n');
  }

  private static sqlType(type: FieldType): string {
    if (typeof type === 'string') {
      switch (type as Primitive) {
        case 'int':
        case 'long':
        case 'bool':
          return 'INTEGER';
        case 'float':
          return 'REAL';
        case 'str':
        case 'text':
          return 'TEXT';
        default:
          return 'TEXT';
      }
    }
    // FList, FMap, StructRef → TEXT (store JSON)
    return 'TEXT';
  }

  private static sqlSerializeValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (typeof value === 'boolean') {
      return value ? '1' : '0';
    }
    if (typeof value === 'string') {
      return "'" + value.replace(/'/g, "''") + "'";
    }
    // Object or array → JSON string
    const jsonStr = JSON.stringify(value);
    return "'" + jsonStr.replace(/'/g, "''") + "'";
  }
```

Also add back the full imports:
```typescript
import type { CfgValue, VTable, VStruct } from '@cfgforge/value';
import { ValueToJson } from '@cfgforge/value';
import type { EditorService } from './EditorService';
import type { FieldType, Primitive } from '@cfgforge/schema';
```

**Step 4: Run test — confirm it passes**

Command: `cd packages/editor-core && npx vitest run src/__tests__/ExportService.test.ts`
Expected: PASS

**Step 5: Commit**

`cd packages/editor-core && git add src/ExportService.ts src/__tests__/ExportService.test.ts && git commit -m "feat(editor-core): ExportService SQL export"`

---

### Task 4: editor-core index.ts — 导出 ExportService

**Files:**
- Modify: `packages/editor-core/src/index.ts`

**Step 1: Write the test (manual verification)**

No unit test needed — just verify the export is available.

**Step 2: Run — confirm it's not exported yet**

Command: `cd packages/editor-core && npx vitest run src/__tests__/ExportService.test.ts`
Expected: PASS (tests import directly from `../ExportService`, not from index)

**Step 3: Write minimal implementation**

Add to `packages/editor-core/src/index.ts`:

```typescript
export { ExportService } from './ExportService';
export type {
  ExportFormat,
  ExportResultCode,
  ExportResult,
} from './ExportService';
```

Add these lines after the SearchService export block at the end of the file.

**Step 4: Run — confirm it still passes**

Command: `cd packages/editor-core && npx vitest run src/__tests__/ExportService.test.ts`
Expected: PASS

**Step 5: Commit**

`cd packages/editor-core && git add src/index.ts && git commit -m "feat(editor-core): export ExportService from index"`

---

### Task 5: cfgeditor apiClient — 加 exportTable 函数

**Files:**
- Modify: `cfgeditor/src/api/apiClient.ts`

**Step 1: Write the test (no test — thin wrapper)**

This is a thin wrapper around `ExportService.export()`, following the existing `checkJson()` / `searchConfig()` pattern. No separate unit test needed.

**Step 2: Run — confirm it compiles**

Command: `cd cfgeditor && npx tsc --noEmit`
Expected: FAIL — `exportTable` not found when referenced

**Step 3: Write minimal implementation**

Add to the imports at the top of `apiClient.ts`:

```typescript
import {
    // ... existing imports ...
    ExportService,
} from '@cfgforge/editor-core';

import type {
    // ... existing imports ...
    ExportResult,
    ExportFormat,
} from '@cfgforge/editor-core';
```

Add a new section before the closing of the file:

```typescript
// ---------------------------------------------------------------------------
// Export API
// ---------------------------------------------------------------------------

export async function exportTable(
    tableId: string,
    format: ExportFormat,
    _signal?: AbortSignal,
): Promise<ExportResult> {
    return ExportService.export(getEditor(), tableId, format);
}
```

**Step 4: Run — confirm it compiles**

Command: `cd cfgeditor && npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

`cd cfgeditor && git add src/api/apiClient.ts && git commit -m "feat(cfgeditor): add exportTable API function"`

---

### Task 6: cfgeditor i18n — 加翻译 key

**Files:**
- Modify: `cfgeditor/src/app/i18n.ts`

**Step 1: No test needed (i18n keys)**

**Step 2: No run needed**

**Step 3: Write minimal implementation**

In the `en` translation block, after the `toPng` line, add:

```typescript
                    exportCsv: 'Export CSV',
                    exportSql: 'Export SQL',
                    exportSuccess: 'Exported {table} to {file}',
                    exportFail: 'Export failed: {error}',
```

In the `zh` translation block, after the `toPng` line (or after `deleteCurRecord`), add:

```typescript
                    exportCsv: '导出 CSV',
                    exportSql: '导出 SQL',
                    exportSuccess: '已导出 {table} 到 {file}',
                    exportFail: '导出失败: {error}',
```

**Step 4: No run needed (keys verified in Task 7)**

**Step 5: Commit**

`cd cfgeditor && git add src/app/i18n.ts && git commit -m "feat(cfgeditor): add i18n keys for export"`

---

### Task 7: cfgeditor ToolsSetting — 加导出按钮

**Files:**
- Modify: `cfgeditor/src/features/setting/ToolsSetting.tsx`

**Step 1: No separate unit test (UI component)**

This follows the existing `onToPng` pattern in the same file.

**Step 2: Run — confirm dev server starts**

Command: `cd cfgeditor && pnpm run dev`
Expected: Server starts, page loads

**Step 3: Write minimal implementation**

In `ToolsSetting.tsx`:

1. Add imports:
```typescript
import {exportTable} from "@/api/apiClient.ts";
import {ExportFormat} from "@cfgforge/editor-core";
```

2. Add export handler callback (after `onToPng`):
```typescript
    const onExport = useCallback(async (format: ExportFormat) => {
        if (!curTableId) {
            notification.error({title: t('selectTableHint'), duration: 3});
            return;
        }
        try {
            const result = await exportTable(curTableId, format);
            if (result.resultCode === 'ok') {
                const ext = format === 'csv' ? 'csv' : 'sql';
                const filename = `${curTableId}.${ext}`;
                const blob = new Blob([result.content], {type: 'text/plain;charset=utf-8'});
                saveAs(blob, filename);
                notification.info({
                    title: t('exportSuccess', {table: curTableId, file: filename}),
                    duration: 3,
                });
            } else {
                notification.error({title: t('exportFail', {error: result.resultCode}), duration: 4});
            }
        } catch (e) {
            notification.error({title: t('exportFail', {error: (e as Error).message}), duration: 4});
        }
    }, [curTableId, notification, t]);
```

3. Add buttons in the JSX (after the PNG export button section, before the Divider before delete record):
```tsx
        <Divider/>
        <Space>
            <Button onClick={() => onExport('csv')}>{t('exportCsv')}</Button>
            <Button onClick={() => onExport('sql')}>{t('exportSql')}</Button>
        </Space>
```

**Step 4: Run — confirm it compiles and dev server starts**

Command: `cd cfgeditor && pnpm run dev`
Expected: Server starts without errors

**Step 5: Commit**

`cd cfgeditor && git add src/features/setting/ToolsSetting.tsx && git commit -m "feat(cfgeditor): add CSV/SQL export buttons to ToolsSetting"`

---

### Task 8: 全量测试 + lint 验证

**Files:**
- No file changes

**Step 1: Run all editor-core tests**

Command: `cd packages/editor-core && npx vitest run`
Expected: All tests PASS (existing + new ExportService tests)

**Step 2: Run cfgeditor lint**

Command: `cd cfgeditor && pnpm run lint`
Expected: PASS — no new lint errors

**Step 3: Run cfgeditor tests**

Command: `cd cfgeditor && pnpm test:run`
Expected: PASS

**Step 4: Commit if any fixes were needed**

If lint or test failures required fixes:
`git add -A && git commit -m "fix: address lint/test issues in export feature"`

---

## 文件变更清单

| 操作 | 文件 | 说明 |
|---|---|---|
| Create | `packages/editor-core/src/ExportService.ts` | 导出服务核心逻辑 |
| Create | `packages/editor-core/src/__tests__/ExportService.test.ts` | 单元测试 |
| Modify | `packages/editor-core/src/index.ts` | 导出 ExportService + 类型 |
| Modify | `cfgeditor/src/api/apiClient.ts` | 加 `exportTable()` 函数 |
| Modify | `cfgeditor/src/app/i18n.ts` | 加翻译 key |
| Modify | `cfgeditor/src/features/setting/ToolsSetting.tsx` | 加导出按钮 |

> AI生成