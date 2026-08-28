---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'c517cb0e-54e9-411f-8083-2235cfb1b980'
  PropagateID: 'c517cb0e-54e9-411f-8083-2235cfb1b980'
  ReservedCode1: '4c0d42b5-d628-4b67-9709-d6a605d18ec3'
  ReservedCode2: '4c0d42b5-d628-4b67-9709-d6a605d18ec3'
---

# cfgeditor 关系（外键）图形化编辑 — 实施计划

> 日期：2026-08-28
> 设计文档：`docs/plans/2026-08-28-relation-editing-design.md`
> 执行模式：TDD（先写失败测试 → 实现 → 通过 → 提交）

---

## 阶段 1：后端 SchemaRelationService + 测试

### 任务 1.1：新增 `SchemaRelationService.ts`

文件：`packages/editor-core/src/SchemaRelationService.ts`

**类型定义**（对齐 `TableCreateService` 风格，同步 + async 双变体）：

```ts
export interface FKAddRequest {
  table: string;        // 目标表（小写）
  fkName?: string;      // 可选，缺省自动生成 字段_目标表
  keys: string[];       // 本地键（字段名）
  refTable: string;     // 被引用表
  refKeys?: string[];   // 可选：引用目标表的唯一键；缺省引用主键
  nullable?: boolean;   // 可空（仅 RefPrimary/RefUniq）
}

export interface FKListResult {
  ok: boolean;
  errors: string[];
  fks: ForeignKeySchema[];  // 或序列化 SForeignKey[]
}

export interface FKMutateResult {
  ok: boolean;
  errors: string[];
}
```

**方法**：

```ts
class SchemaRelationService {
  // 读 config.cfg → CfgReader.parse → 定位 table/struct → 返回其 foreignKeys
  static listFks(editor: EditorService, table: string): FKListResult
  static async listFksAsync(editor, table): Promise<FKListResult>

  // 加外键：读 cfg → 定位 → addForeignKey → resolve 校验 → CfgWriter 写回
  static addForeignKey(editor, req: FKAddRequest): FKMutateResult
  static async addForeignKeyAsync(editor, req): Promise<FKMutateResult>

  // 改外键：按 fkName 找到旧 FK → 删除 → 按新请求加 → 写回
  static updateForeignKey(editor, table, fkName, req: FKAddRequest): FKMutateResult
  static async updateForeignKeyAsync(editor, table, fkName, req): Promise<FKMutateResult>

  // 删外键：按 fkName 移除 → 写回
  static removeForeignKey(editor, table, fkName): FKMutateResult
  static async removeForeignKeyAsync(editor, table, fkName): Promise<FKMutateResult>
}
```

**核心写回链路**（每个 mutate 方法）：

```
1. 读 config.cfg（fs 或 CfgFileSystem）
2. CfgReader.parse(existingText)
3. 定位目标 Nameable（TableSchema 或 StructSchema）
4. 构造 ForeignKeySchema（用 @cfgforge/schema 的 RefPrimary/RefUniq/RefList/KeySchema/Metadata_of）
5. add / remove / replace
6. schema.resolve() + errs.checkErrors('relationEdit')
7. CfgWriter.stringify(schema) → 写回 config.cfg
8. （async 版调用方负责 editor.reload()，与 TableCreateService 一致）
```

**关键构造代码**：

```ts
// RefPrimary（引用主键，不写 refKeys）
new RefPrimary(nullable)

// RefUniq（引用唯一键，写 refKeys）
new RefUniq(new KeySchema(refKeys), nullable)

// RefList（list 引用）
new RefList(new KeySchema(refKeys))

// FK 构造
new ForeignKeySchema(fkName, new KeySchema(keys), refTable, refKey, Metadata_of())
```

**自动 FK 名生成**（当 fkName 缺省）：`${keys[0]}_${refTable}`，若冲突追加 `_2`、`_3`…

### 任务 1.2：单元测试 `SchemaRelationService.test.ts`

文件：`packages/editor-core/src/__tests__/SchemaRelationService.test.ts`
模式对齐 `TableCreateService.test.ts`（临时目录 + fixture config.cfg + EditorService.create）。

**测试用例**：

| # | 用例 | 断言 |
|---|------|------|
| 1 | 引用主键（不写 refKeys） | cfg 含 `field:type ->refTable`；result.ok |
| 2 | 引用唯一键（写 refKeys） | cfg 含 `->refTable[ukName]`；result.ok |
| 3 | 复合键外键 | cfg 含 `->fkName:[a,b] ->refTable` |
| 4 | 可空外键 | cfg 含 `(nullable)` |
| 5 | 独立 FK 名（与字段不同名） | cfg 含 `->fkName:...` 独立行 |
| 6 | FK 名冲突 | result.ok=false；error 含冲突信息；config.cfg 未变 |
| 7 | 目标表不存在 | result.ok=false；config 未变 |
| 8 | refKeys 不是唯一键 | result.ok=false（RefTableKeyNotUniq） |
| 9 | updateForeignKey 改名 | 旧名消失，新名存在 |
| 10 | removeForeignKey | FK 从 cfg 消失 |
| 11 | listFks | 返回正确 FK 列表 |
| 12 | async 变体 | 与同步结果一致 |

**fixture**：

```ts
const CFG = `table item[id] (title='name') {
  id:int;
  name:str;
}
table weapon[id] {
  id:int;
  name:str;
  damage:int;
}
`;
```

### 任务 1.3：导出

`packages/editor-core/src/index.ts` 追加：

```ts
export { SchemaRelationService } from './SchemaRelationService.js';
export type {
  FKAddRequest, FKListResult, FKMutateResult,
} from './SchemaRelationService.js';
```

**验证**：`pnpm --filter @cfgforge/editor-core test:run`（或仓库 test 命令）跑通全部测试。

---

## 阶段 2：前端 apiClient + 类型 + 缓存失效

### 任务 2.1：apiClient 新增 FK API

`cfgeditor/src/api/apiClient.ts`：

```ts
import { SchemaRelationService, FKAddRequest, ... } from '@cfgforge/editor-core';

export async function fetchTableFks(table: string): Promise<SForeignKey[]> {
  const editor = getEditor();
  const res = SchemaRelationService.listFks(editor, table);
  if (!res.ok) throw new Error(res.errors.join('; '));
  return res.fks;
}

export async function addForeignKey(req: FKAddRequest): Promise<SchemaWriteResult> {
  const editor = getEditor();
  const result = await SchemaRelationService.addForeignKeyAsync(editor, req);
  if (result.ok) await editor.reload();
  return result;
}

export async function updateForeignKey(table: string, fkName: string, req: FKAddRequest): Promise<SchemaWriteResult> {
  const editor = getEditor();
  const result = await SchemaRelationService.updateForeignKeyAsync(editor, table, fkName, req);
  if (result.ok) await editor.reload();
  return result;
}

export async function removeForeignKey(table: string, fkName: string): Promise<SchemaWriteResult> {
  const editor = getEditor();
  const result = await SchemaRelationService.removeForeignKeyAsync(editor, table, fkName);
  if (result.ok) await editor.reload();
  return result;
}
```

**缓存失效**：schema 变更后需让相关 queryKey 失效。参考现有 `writeSchemaText` 的 reload 路径（editor.reload 后 schema 变更会由 React Query 的 queryKey 变化自然触发）。确认 `fetchSchema` 的缓存 key 在 reload 后失效（查 `queryKeys.ts`）。

### 任务 2.2：FK 编辑纯逻辑 `fkDraft.ts`

`cfgeditor/src/domain/fkDraft.ts`（纯函数，可 vitest 测试）：

```ts
export interface FkDraft {
  fkName?: string;
  keys: string[];
  refTable: string;
  refKeys?: string[];
  nullable: boolean;
}

// 从 SForeignKey 反填 draft
export function fkToDraft(fk: SForeignKey): FkDraft

// 校验 draft（字段存在/目标表存在/refKeys 合法）
export function validateFkDraft(draft: FkDraft, table: STable, schema: Schema): string[]

// 自动生成 fkName：keys[0]_refTable
export function autoFkName(keys: string[], refTable: string, existingFks: SForeignKey[]): string
```

**测试** `cfgeditor/src/domain/fkDraft.test.ts`：纯逻辑（draft 反填、校验、自动命名）。

### 任务 2.3：apiClient 测试补丁

`cfgeditor/src/api/apiClient.test.ts` 补 FK 相关 API 的纯逻辑测试（喂 fixture）。

---

## 阶段 3：关系编辑弹窗 + 节点右键菜单（核心 UI）

### 任务 3.1：`RelationEditModal.tsx`

文件：`cfgeditor/src/features/table/RelationEditModal.tsx`（或 `features/relation/`）

antd Modal + Form 结构：

```
┌─ 编辑关系：<table> ─────────────────┐
│ [外键列表]                           │
│ ┌──────┬────┬────────┬─────┬─────┐  │
│ │ FK名 │ 键 │ 目标表 │类型 │操作 │  │
│ ├──────┼────┼────────┼─────┼─────┤  │
│ │  ... │    │        │     │ 编辑删│  │
│ └──────┴────┴────────┴─────┴─────┘  │
│ [+ 新增外键]                         │
│ ┌ 新增/编辑表单 ─────────────────┐   │
│ │ fkName(可选) keys(multi)       │   │
│ │ refTable(下拉 schema 表)       │   │
│ │ refKeys(可选，选择唯一键)       │   │
│ │ nullable(Checkbox)             │   │
│ │ [保存] [取消]                  │   │
│ └───────────────────────────────┘   │
└─────────────────────────────────────┘
```

- props：`{ table: STable, schema: Schema, open, onClose }`
- 保存调用 `apiClient.addForeignKey/updateForeignKey/removeForeignKey`
- 成功后 `queryClient.invalidateQueries({queryKey: queryKeys.schema()})` 刷新 schema
- 失败展示错误信息（antd message/Alert）

### 任务 3.2：节点右键菜单接入

- `Table.tsx` / `TableRef.tsx` 的 `nodeMenuFunc` 增加一项：
  ```
  { label: t('editRelations'), key: 'editRelations', handler: () => openRelationEditModal(sItem) }
  ```
- 新增 `RelationEditModal` 的打开状态管理（放 `Table.tsx` 内 useState，传给菜单 handler）

### 任务 3.3：i18n 文案

`cfgeditor/src/app/i18n.ts`：
- en：`editRelations: 'Edit relations'`, `fkName`, `fkKeys`, `fkRefTable`, `fkNullable` 等
- zh：`editRelations: '编辑关系'` 等

### 任务 3.4：验证

- `pnpm --filter cfgeditor lint`
- `pnpm --filter cfgeditor test:run`
- 手动 dev 验证：右键节点 → 编辑关系 → 增删改外键 → 保存 → 图刷新

---

## 阶段 4：TableRef 视图内编辑入口

- `TableRef.tsx` 节点菜单已加"编辑关系"（阶段 3 已覆盖）
- 追加：TableRef 展开引用节点时，双击外键字段连接点 → 打开该 FK 的编辑表单（复用 RelationEditModal 的编辑态）
- 验证：手动 dev 测

---

## 阶段 5：流图拖拽连线

### 任务 5.1：连线到外键请求的映射纯函数

`cfgeditor/src/domain/edgeToFk.ts`（纯函数，可测）：

```ts
// source handle → keys；target handle → refTable
export function edgeToFkRequest(sourceHandle, sourceNode, targetNode, schema): FKAddRequest | null
```

校验：
- 不能自引用（source table === target table）
- target 必须是 table（非 struct/interface）
- source handle 为字段 → keys=[handle]，为 HANDLE_OUT → keys=主键
- 防重：目标已有相同 FK

### 任务 5.2：FlowGraph 开启连线交互

- `FlowGraph.tsx`：
  - 编辑态（table/tableRef 视图）`edgesConnectable` 开启
  - `onConnect={onConnect}` 回调
  - `onEdgesDelete` 或连线右键菜单 → 删除关系
- 仅 `type === 'table' | 'tableRef'` 时启用，避免浏览/记录视图误触发

### 任务 5.3：测试

- `edgeToFk.test.ts`：连线映射 + 校验
- 手动 dev 测：拖拽建连线 → 保存 → config.cfg 出现 FK；右键删连线 → FK 消失

---

## 验证清单（全部阶段完成后）

- [ ] `pnpm --filter @cfgforge/editor-core test:run` 全绿
- [ ] `pnpm --filter cfgeditor test:run` 全绿
- [ ] `pnpm --filter cfgeditor lint` 无错误
- [ ] `pnpm --filter cfgeditor build` 无错误（或 `pnpm tauri build`）
- [ ] 手动验证：三种交互均能增删改外键，config.cfg 持久化，图/表刷新

---

## 提交策略

- 每完成一个任务（测试绿）即 commit
- 提交信息遵循仓库惯例（`fix:` / `feat:` 前缀）
- 完成后由用户确认是否 merge / push / PR

> AI生成