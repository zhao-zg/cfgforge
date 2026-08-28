---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '8b61c445-752f-48af-8d88-e85a18f151bc'
  PropagateID: '8b61c445-752f-48af-8d88-e85a18f151bc'
  ReservedCode1: 'e0bbd88f-e0f4-41d1-9751-612e4114a812'
  ReservedCode2: 'e0bbd88f-e0f4-41d1-9751-612e4114a812'
---

# cfgeditor UI 缺失功能修复 —— 实施计划

> 日期：2026-08-28
> 依赖：设计文档 `docs/plans/2026-08-28-ui-missing-features-design.md`、审查报告 `docs/ui-missing-features-review.md`
> 流程：superpowers（逐项 TDD：先失败测试 → 实现 → 通过 → 提交）

## 0. 验证命令与提交约定

- **纯逻辑测试**：`pnpm vitest run --project packages`（editor-core 等核心包，`packages/editor-core/src/**/*.test.ts`）
- **全量检查**：`pnpm run lint`（oxlint，0 错误）+ `tsc --noEmit`（0 错误）+ 全量 vitest
- **提交粒度**：每个功能项一个 commit；`fix(cfgeditor):` / `feat(cfgeditor):` + 中文
- **分层约束**：新服务放 `packages/editor-core/src/`（依赖 schema/data/context/shared）；前端只依赖 `@/api/apiClient.ts`。反向 import 被 oxlint 拦。
- **i18n**：新文案同时补 `src/app/i18n.ts` en/zh 两段。
- **测试约定**：纯逻辑、不 mock、不碰 UI/网络/Tauri IPC；`*.test.ts` 被 `.ignore` 排除（Glob 定位后 Read）。

---

## 任务 1：P0-1 数据目录重载按钮（低难度）

### 目标
`ConnectionSetting.tsx` 数据目录 Input 右侧加「重新加载」按钮，点击重载整个编辑器。

### 实施步骤
1. **无核心层改动**（`reloadEditor()` 已存在，apiClient.ts:93）。
2. 前端 `ConnectionSetting.tsx`：
   - 引入 `reloadEditor`（`@/api/apiClient.ts`）、`invalidateAllQueries`（`@/services/queryClient.ts`）、`ReloadOutlined` icon。
   - 加 `reloading` state 与 `handleReload`（`await reloadEditor()` → `invalidateAllQueries()` → `message.success`；失败 `message.error` + finally 复位）。
   - `Space.Compact` 内 Input 与「浏览」按钮之间插入「重新加载」按钮。
3. i18n：`reload` / `reloadSuccess` / `reloadFail`（en/zh）。

### 验证
- `pnpm run lint` + `tsc --noEmit` 0 错误；功能型 UI 不加单测（约定），桌面端手动点击验证。

---

## 任务 2：P0-2 Schema 字段级编辑（高优先级，核心工作量）

### 目标
新增 editor-core `SchemaFieldService`（add/update/remove 字段，仿 SchemaRelationService 的 mutate 管道），并提供两处 UI 入口：Table 视图节点右键菜单 + 工具设置页字段管理表单。

### 2.1 核心层：`packages/editor-core/src/SchemaFieldService.ts`

**TDD 先行**（`packages/editor-core/src/SchemaFieldService.test.ts`，喂 fixture 断言）：
- `addField(editor, table, {name, type, comment})`：追加字段；字段名 identifier 校验、重名报错；写回 config.cfg。
- `updateField(editor, table, oldName, {name?, type?, comment?})`：改名/改类型/改注释；重名（排除自身）报错；字段不存在报错。
- `removeField(editor, table, fieldName)`：字段不存在报错；**主键字段报错**；**本表 FK 引用字段报错**；**被其他表 FK 引用（跨表）报错**；成功删除。
- 同步 + async 双变体（复用 SchemaRelationService 的 readAndParse / mutate 管道模式）。

**实现要点**：
- 复用 `TableCreateService.buildFields` 的字段构造逻辑（`IDENTIFIER_PATTERN`、`parseFieldType`、`Metadata_of`/`CommentData`）——抽公共 helper 或直接内联（若抽 helper，需同步改 TableCreateService 引用）。
- 字段数组操作：`structural.fields()` 返回内部数组引用，直接 push / 替换下标 / splice 即可（Table 与 Struct 通用，`Structural` 接口均暴露 `fields()`）。
- 主键保护：`structural instanceof TableSchema` 时检查 `structural.primaryKey.fields()`。
- FK 保护：遍历 `schema.items()` 所有结构体的 `foreignKeys()`，收集「本地键」与「引用键」两个集合，字段名命中任一即拒绝删除。
- 写回：`CfgWriter.stringify(schema)` → 同步 `fs.writeFileSync` / 异步 `getDefaultFileSystem().writeFile`；调用方（apiClient）负责 `editor.reload()`。

### 2.2 apiClient 桥接

`apiClient.ts` 新增：
- `addField(table, req)` / `updateField(table, oldName, req)` / `removeField(table, fieldName)` —— 调 `SchemaFieldService.*Async`，成功后 `await editor.reload()`（与 addForeignKey 模式一致）。
- `listFields(table)`（可选，若 UI 需要：返回 `{name, type, comment}[]`，透传 SchemaService 序列化）。

### 2.3 UI 入口 A：Table 视图节点右键菜单

`src/features/table/Table.tsx` 的 `nodeMenuFunc` 追加菜单项：
- 「添加字段」（当前节点是 curTable 时显示）→ 打开 `FieldEditModal`（新建）。
- 「编辑字段」（选中节点的实体字段，仅 curTable）→ 打开 `FieldEditModal`（预填字段）。
- 「删除字段」（仅 curTable 的字段）→ Popconfirm 确认后调 `removeField` → `invalidateAllQueries()`。
- 新建 `src/features/table/FieldEditModal.tsx`：字段名/类型（Select 支持 bool/int/long/float/string/text + 自定义 struct ref）/注释，复用 CreateTableForm 字段行风格。
- 注意：Table 视图节点是「表实体」，字段级菜单需确认 `UserData` 里是否携带字段信息——若实体节点不携带字段，则右键菜单项改为「管理字段」打开字段管理弹窗（含字段列表）。**实现时先确认 TableEntityCreator/UserData 是否暴露字段；若无则走「管理字段」入口（两处 UI 合并设计）。**

### 2.4 UI 入口 B：工具设置页字段管理卡片

`ToolsSetting.tsx` 新增「字段管理」SettingCard（仅 `schema.isEditable` 时显示）：
- 显示当前表 `curTable` 字段列表（antd Table：字段名/类型/注释/操作列）。
- 操作列：编辑（打开 FieldEditModal）、删除（Popconfirm）。
- 顶部「添加字段」按钮。
- 依赖字段列表查询：`listFields(curTableId)`（React Query，queryKey 并入 queryKeys）。

### 2.5 i18n

`fieldAdd`/`fieldEdit`/`fieldDelete`/`fieldName`/`fieldType`/`fieldComment`/`fieldNameRequired`/`fieldNameExists`/`fieldIsPrimaryKey`/`fieldReferenced` 等（en/zh）。

### 验证
- 核心服务：`pnpm vitest run --project packages`（新测试全绿）
- 前端：lint + tsc 0 错误；桌面端手动验证两处入口。

---

## 任务 3：P1-4 数字搜索验证（验证型，低难度）

### 目标
确认 `SearchService.search` 数字输入自动走精确匹配（已隐式可用），补测试固化。

### 实施步骤
1. 检查 `packages/value/src/SearchService.ts` 现有测试是否覆盖「数字输入走 searchNumber」分支；若无，补 `SearchService.test.ts` 用例：`search(editor, '1001', max)` → 命中 pk=1001 的记录（精确），而非字符串子串。
2. **可选增强（不做，YAGNI）**：SearchValue.tsx 加字符串/数字 Segmented。设计文档已降级——仅验证。

### 验证
- 新测试通过即算完成；无需前端改动。

---

## 任务 4：P1-5 单表数据重载

### 目标
新增 editor-core 服务桥接 `DataUpdater.updateByReloadTable`，UI 入口放 ToolsSetting。

### 实施步骤
1. **TDD**：`packages/editor-core/src/SingleTableReloadService.test.ts`：
   - 输入 tableId，读取 `context.cfgData().tables.get(tableId)` → 调 `updateByReloadTable` → 返回新 CfgData；断言表格数据已刷新（fixture 里改 csv 文件后触发）。
   - 表不存在/表名错误 → 报错。
2. `packages/editor-core/src/SingleTableReloadService.ts`：
   - `reloadTable(editor, tableId)`：从 `editor.context().cfgData()` 拿 `dTable` → `DataManager.updateByReloadTable` → 新 CfgData → 更新到 editor（`editor.adoptNewCfgValue` 或 `editor.reload()` 全量，实现时按 EditorService 现有 API 选择）。
   - 校验 `tableId` 存在。
3. apiClient 桥接：`reloadTable(tableId)` → 成功调 `editor.reload()` 或注入新值。
4. UI：`ToolsSetting.tsx` 数据导出卡片内（或字段管理卡片）加「重载此表」按钮（`ReloadOutlined`），onClick 调 `reloadTable(curTableId)` → `invalidateAllQueries()`。

### 验证
- 核心测试全绿；前端 lint + tsc；手动验证单表重载。

---

## 任务 5：P2-10 未引用记录批量删除

### 目标
`RecordRef.tsx` 的 unref 模式页顶加「删除全部未引用」按钮（Popconfirm 确认，确认后全部删除，不勾选）。

### 实施步骤
1. **前端实现**（无核心层测试，纯 UI 编排）：
   - `RecordRefWithResult` 的 `isUnrefMode` 分支渲染顶部按钮区（`Space` 包 Popconfirm + Button danger）。
   - `onConfirm`：串行 `for...of` 循环 `deleteRecord(refId.table, refId.id)`（`recordRefResult.refs`），收集失败计数 → 完成后 `invalidateAllQueries()` → 通知成功/失败条数。
   - 需 `isUnrefMode` 时 `RecordRefWithResult` 上方有可挂载按钮的容器（确认 `RecordRefWithResult` 返回 null 的现状，需在 QueryGate 内补一个可见的工具栏/面板，或包一个 `div` 浮层）。
2. i18n：`deleteAllUnref`/`deleteAllUnrefConfirm`/`deleteAllUnrefDone`（en/zh）。

### 验证
- lint + tsc；桌面端切到 recordUnref 页手动验证删除与刷新。

---

## 任务 6：P2-11 文件自动监视

### 目标
新增 `AutoReloadService`（封装 `WatchAndPostRun`），ToolsSetting 加「自动刷新」Switch（默认关，手动开启）。

### 实施步骤
1. **前置验证（实现前必做）**：
   - 确认 `WatchAndPostRun` 内部 `cur.sourceStructure().reload()` 在 Tauri WebView（异步 CfgFileSystem）下是否可用。`DirectoryStructure.reload()` 若同步读盘 → 在 Tauri 下可能抛错/返回不一致。**验证方式：在 Tauri 桌面端开启开关实测**；不可用则退化为「定时轮询 reloadEditor」（低配但可靠）。
2. **TDD**（editor-core 内）：
   - `AutoReloadService.test.ts`：start 后（fixture 目录）文件变化 → 回调收到新 Context；stop 后不再回调。**若 fs.watch 在测试环境不稳，该测试标记 skip 或仅验证轮询分支**（实现时决定，遵循现有测试约定）。
3. `packages/editor-core/src/AutoReloadService.ts`：
   - `start(editor, waitSeconds)`：`new WatchAndRun(...)` → `startWatch(editor.context(), waitSeconds)`，注册 `PostRunCallback` → 新 Context 注入 editor（`editor.reload()` 全量即可）。
   - `stop()`：`stopWatch()`。
   - 轮询退化分支：`setInterval(() => editor.reload(), N)`（N=2s），`stop` 清定时器。
4. `apiClient.ts`：`startAutoReload()` / `stopAutoReload()`（包装 service，暴露 `isAutoReloadRunning` 可选）。
5. UI：`ToolsSetting.tsx` 「其他工具」卡片加 `Switch`「自动刷新 / Auto reload」（默认关）。onChange 启停；组件卸载时 stop。

### 验证
- 桌面端手动：开启 → 外部改 csv → 界面自动刷新；关闭 → 不再刷新。核心测试（若可测）全绿。

---

## 任务 7：Code Review + Finish Branch

1. **自审清单**（对照设计文档第 6 节风险）：
   - 分层：新服务无反向 import；前端无越层 import。
   - TDD：每个新服务有测试；UI 不加单测。
   - i18n：全部新文案 en/zh 双段。
   - 空提交/遗留文件：genexe-debug.bat / Cargo.toml / cfgeditor-ui-review.md 保持不提交。
2. **运行全量验证**：`pnpm run lint` → `tsc --noEmit` → `pnpm vitest run --project packages` 全绿。
3. 逐项提交（每项一个 commit，中文 message）。
4. 汇总向用户汇报：每项完成情况 + 验证结果。

---

## 里程碑核对表

- [ ] 任务 1：重载按钮（ConnectionSetting）
- [ ] 任务 2：SchemaFieldService + 两处 UI（Table 右键 / ToolsSetting）
- [ ] 任务 3：数字搜索验证测试
- [ ] 任务 4：SingleTableReloadService + ToolsSetting 按钮
- [ ] 任务 5：未引用批量删除（RecordRef）
- [ ] 任务 6：AutoReloadService + Switch（默认关）
- [ ] 任务 7：全量验证 + 逐项提交

> AI生成