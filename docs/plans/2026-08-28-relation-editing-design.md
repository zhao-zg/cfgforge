---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'f60f310b-e7f2-44ec-99e6-6a7bc746a4ee'
  PropagateID: 'f60f310b-e7f2-44ec-99e6-6a7bc746a4ee'
  ReservedCode1: '0ef8f3b4-1c2b-4927-a1f2-1787328c16a8'
  ReservedCode2: '0ef8f3b4-1c2b-4927-a1f2-1787328c16a8'
---

# cfgeditor 关系（外键）图形化编辑设计文档

> 日期：2026-08-28
> 状态：**待审批**
> 方案：三层交互统一底层（节点右键菜单 → TableRef 视图内编辑 → 流图拖拽连线），分阶段交付

---

## 1. 背景与问题

### 1.1 当前痛点

cfgeditor 目前能可视化查看表间关系（外键连线），但**无法图形化编辑关系**。外键（FK）定义在 `config.cfg` 中，目前只能通过顶栏"Schema 文本编辑器"手工改 CFG 文本，或直接编辑文件。

调研确认（详见历史会话总结）：

| 痛点 | 根因 | 影响 |
|------|------|------|
| 无图形化编辑关系 | 后端无外键增删改 API；前端无编辑 UI | 改关系必须手写 config.cfg 文本 |
| 连线只读展示 | `sourceEdges` 由 `schema.foreignKeys` 单向推导；`FlowGraph` 未开 `onConnect`、禁删边 | 无法在图上增删关系 |
| 建表表单不含外键 | `TableCreateRequest` 只含 fields/primaryKey/enumValues，无 `foreignKeys` | 建表时无法声明关系，需事后手改 |

### 1.2 目标

为 cfgeditor 增加**图形化的关系（外键）编辑能力**，三种交互形态共用同一底层：

1. **节点右键菜单增删外键** —— 在流图节点右键菜单加入"编辑关系"，以表单方式增删改外键（核心、地基）
2. **TableRef 视图内编辑** —— 在引用关系展开视图中直接编辑外键（复用同一套表单）
3. **流图拖拽连线** —— 从字段连接点拖拽到目标表创建关系，选择连线/右键删除关系（最直观）

三种交互均**写回 `config.cfg` 持久化**（复用 `CfgWriter.stringify` 全量重建，与 `TableCreateService` 一致）。

---

## 2. 总体方案

### 2.1 分层设计

```
前端 (cfgeditor)
  ├── 交互层：节点右键菜单 / TableRef 面板 / 流图 onConnect+拖拽
  ├── 状态层：关系编辑弹窗表单（增/删/改外键）
  └── API 层：apiClient 新增 fetchTableFks / addForeignKey / removeForeignKey
后端 (packages/editor-core)
  └── SchemaRelationService.ts  ← 新增
        ├── listFks(table)         — 读表当前外键
        ├── addForeignKey(...)     — 结构化加外键
        ├── updateForeignKey(...)  — 改外键（改键/改目标表/改可空）
        └── removeForeignKey(...)  — 删外键
        └── 全部走：读 config.cfg → CfgReader.parse → 改 schema → resolve 校验 → CfgWriter.stringify → 写回 → editor.reload()
```

### 2.2 后端核心服务 `SchemaRelationService`

位于 `packages/editor-core/src/SchemaRelationService.ts`，模式对齐 `TableCreateService`（读 cfg → 改 schema → 校验 → 全量写回）。

```ts
export interface FKAddRequest {
  table: string;        // 目标表（小写）
  fkName?: string;      // 可选，缺省自动生成 字段_目标表
  keys: string[];       // 本地键（字段名），单键或复合键
  refTable: string;     // 被引用表
  refKeys?: string[];   // 可选：引用目标表的键；缺省引用主键（RefPrimary）
  nullable?: boolean;   // 可空（仅 RefPrimary/RefUniq）
}
```

写回流程（核心约束）：
1. 读 `config.cfg` → `CfgReader.parse`
2. 定位目标 `TableSchema`，用 `addForeignKey(fk)`（表）+ 或 struct 用 `StructSchema.addForeignKey`
3. 校验：
   - FK 名在表内唯一（`InnerNameConflict` 检查）
   - 不引用主键时目标键必须存在且为唯一键（`RefTableKeyNotUniq`）
   - 引用主键不写 `[remoteKey]`（走 `RefPrimary`，`findUniqueKey` 只查显式唯一键）
4. `schema.resolve()` + `errs.checkErrors()` 语义校验
5. `CfgWriter.stringify(schema)` 写回 `config.cfg`
6. `editor.reload()` 刷新上下文

> ⚠️ **CFG 写回格式注意事项**（遵循 `cfgforge-config-management` skill）：
> - 字段名与 FK 名一致时，FK 内联到字段行（`field:type ->refTable`）；不同名时独立 `->fkName:...` 行
> - 可空标记用 `(nullable)` 圆括号，放分号前
> - 注释顺序 `; //注释`（分号在前）
> - FK 声明必须放在表体内部 `}` 之前

### 2.3 前端 API 层（apiClient）

`cfgeditor/src/api/apiClient.ts` 新增：

```ts
export async function fetchTableFks(table: string): Promise<SForeignKey[]>
export async function addForeignKey(req: FKAddRequest): Promise<SchemaWriteResult>
export async function updateForeignKey(table, oldFkName, req: FKAddRequest): Promise<SchemaWriteResult>
export async function removeForeignKey(table, fkName): Promise<SchemaWriteResult>
```

成功后统一 `editor.reload()` + 使 schema/布局缓存失效（`invalidateLayoutCache`）。

---

## 3. 阶段 1：节点右键菜单增删外键（地基）

### 3.1 后端新增 API

- 新增 `SchemaRelationService`（`packages/editor-core/src/SchemaRelationService.ts`）
- `listFks` / `addForeignKey` / `updateForeignKey` / `removeForeignKey`
- 单元测试：`packages/editor-core/src/__tests__/SchemaRelationService.test.ts`
  - 新增外键成功写回
  - 复合键外键
  - 引用主键 vs 引用唯一键
  - 可空外键（`(nullable)`）
  - 错误场景：FK 名冲突 / ref 键不唯一 / 目标表不存在

### 3.2 前端 UI

- 表结构/TableRef 节点右键菜单新增 **"编辑关系"** 项（`features/table/TableRef.tsx`、`features/table/Table.tsx` 的 `nodeMenuFunc`）
- 新增关系编辑弹窗组件 `features/relation/RelationEditModal.tsx`（antd Modal + Form）：
  - 列出当前表外键列表（表格：FK名 / 键 / 目标表 / 类型 / 可空 / 操作）
  - "新增外键" 表单：fkName(可选)、keys(多选)、refTable(下拉，从 schema 选表)、refKeys(可选)、nullable(勾选)
  - 每个 FK 支持编辑（复用新增表单回填）/ 删除（confirm）
  - 保存后调 addForeignKey/updateForeignKey/removeForeignKey → 成功后失效缓存刷新图
- 国际化：`src/app/i18n.ts` 补充 en/zh 文案

### 3.3 测试

- `apiClient.test.ts` 补新 API 的纯逻辑测试（喂 fixture 断言解析/写回）
- 关系编辑表单的纯逻辑（外键名生成、请求构造）拆出纯函数到 `domain/` 便于 vitest 测试

---

## 4. 阶段 2：TableRef 视图内编辑

在 `TableRef.tsx`（引用关系展开图）中：
- 节点右键菜单同样加入"编辑关系"（复用阶段 1 的 `RelationEditModal`）
- TableRef 展开的引用节点上，外键对应字段的 handle 增加可点选，点击弹出该外键的编辑小面板（或直接复用右键菜单入口）

> 本阶段成本低（复用阶段 1 全部逻辑），仅新增一个入口映射。

---

## 5. 阶段 3：流图拖拽连线

### 5.1 后端

- 无需新增 API（复用阶段 1 的 add/remove）

### 5.2 前端

- `FlowGraph.tsx` 开启连线交互：
  - 表视图/TableRef 视图（`type === 'table' | 'tableRef'`）时 `edgesConnectable={true}`，开启 `onConnect`
  - 未编辑连线不可随意触发——用拖拽创建连线只允许在 **table/tableRef 编辑态**
- 连线创建：`onConnect` → 解析 source(字段handle)/target(表) → 调用 `addForeignKey`
- 连线删除：右键连线 → "删除关系" → confirm → `removeForeignKey`
- 连线校验：
  - 不能自引用（target != 本表）
  - target 必须是 table（非 struct/interface）
  - source handle 必须是该表的字段（或整表 HANDLE_OUT → 用主键）
  - 重复关系防重

### 5.3 测试

- 连线到外键请求的映射纯函数（source handle → keys/refTable/refKeys）
- 校验规则纯函数

---

## 6. 文件清单

### 新增

| 文件 | 说明 |
|------|------|
| `packages/editor-core/src/SchemaRelationService.ts` | 外键增删改查服务 |
| `packages/editor-core/src/__tests__/SchemaRelationService.test.ts` | 后端测试 |
| `cfgeditor/src/features/table/RelationEditModal.tsx` | 关系编辑弹窗 |
| `cfgeditor/src/domain/fkDraft.ts` | 外键编辑纯逻辑（请求构造/校验，可测） |

### 修改

| 文件 | 说明 |
|------|------|
| `packages/editor-core/src/index.ts` | 导出 SchemaRelationService 及类型 |
| `cfgeditor/src/api/apiClient.ts` | 新增 FK 相关 API |
| `cfgeditor/src/features/table/Table.tsx` | 节点菜单加"编辑关系" |
| `cfgeditor/src/features/table/TableRef.tsx` | 节点菜单加"编辑关系"+ TableRef 内编辑入口 |
| `cfgeditor/src/flow/FlowGraph.tsx` | 拖拽连线（阶段 3） |
| `cfgeditor/src/app/i18n.ts` | en/zh 文案 |

---

## 7. 风险与对策

| 风险 | 对策 |
|------|------|
| `CfgWriter.stringify` 全量重建可能丢注释/排版 | 与现有 `TableCreateService` 行为一致，已接受；若发现注释丢失严重，可后续优化为局部 diff 写回 |
| 外键语法陷阱（nullable 位置/注释顺序/FK 名冲突） | 严格遵循 cfgforge skill 语法规则，后端 resolve 兜底校验 |
| 拖拽连线误操作 | 阶段 3 加防重/自引用/目标校验 + confirm 确认 |
| schema 写回后布局/查询缓存陈旧 | 写回成功后统一 `editor.reload()` + invalidate 相关 queryKey |

---

## 8. 交付物

1. 后端 `SchemaRelationService` + 测试
2. 前端三种交互入口 + 关系编辑表单
3. 三种交互均写回 config.cfg 并持久化
4. 单元测试覆盖纯逻辑 + 后端写回

---

## 9. 待用户确认

- [x] 关系编辑写回 config.cfg
- [x] 三种交互全部实现，分阶段推进
- [ ] 最终设计确认

> AI生成