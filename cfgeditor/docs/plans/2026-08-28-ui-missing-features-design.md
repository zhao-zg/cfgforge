---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '1f7e2066-584b-4e30-9b1a-c660c1194e8b'
  PropagateID: '1f7e2066-584b-4e30-9b1a-c660c1194e8b'
  ReservedCode1: '9425119f-9ce5-4dcd-a3fb-fa8953a3dbf7'
  ReservedCode2: '9425119f-9ce5-4dcd-a3fb-fa8953a3dbf7'
---

# cfgeditor UI 缺失功能修复设计

> 日期：2026-08-28
> 范围：审查报告 `docs/ui-missing-features-review.md` 中用户选定的 **核心 6 项 + P0-2 字段级编辑**（共 7 项）
> 流程：superpowers（Brainstorm → Plan → TDD → Review → Finish）

---

## 1. 范围与目标

依据 `cfgeditor/docs/ui-missing-features-review.md`，本轮修复以下 7 项：

| # | 缺失项 | 级别 | 说明 |
|---|---|---|---|
| 1 | 数据目录重载 | P0 | `reloadEditor()` 已有但无 UI 入口 |
| 2 | Schema 字段级编辑（增/删/改字段） | P0 | 需新增 editor-core 服务 + UI 两处入口 |
| 3 | Schema↔数据对齐 | P1 | **已内置到 Context 加载流程，降级移除** |
| 4 | 数字精确搜索 | P1 | **已隐式可用（search 自动区分），降级为验证** |
| 5 | 单表数据重载 | P1 | `DataUpdater.updateByReloadTable` 未桥接 |
| 6 | 未引用记录批量删除 | P2 | 当前仅可查看 |
| 7 | 文件自动监视 | P2 | `WatchAndPostRun` 未桥接 |

**明确不做**（YAGNI）：
- P1-6 i18n 翻译能力（发布流程能力，编辑器定位为结构+数据编辑器）
- P1-7 MCP 服务器管理（外部集成能力）
- P2-8 JSON 导出、P2-9 图片格式选择（极低优先级）

---

## 2. 用户决策记录

| 问题 | 决策 |
|---|---|
| P0-2 字段编辑 UI 入口 | **两处都加**：Table 视图节点右键菜单（添加/编辑/删除字段）+ 工具设置页完整表单 |
| P2-11 自动监视默认态 | **默认关闭，手动开启** |
| P2-10 批量删除交互 | **确认后全部删除**（弹 Popconfirm，不勾选） |

---

## 3. 实现方案

### 3.1 P0-1 数据目录重载（ConnectionSetting 加「重新加载」按钮）

**现状**：`apiClient.reloadEditor()` 已存在（apiClient.ts:93）；`ConnectionSetting.tsx` 只有「浏览」按钮。

**方案**：
- `ConnectionSetting.tsx` 的 dataDir Input 右侧加「重新加载」按钮（`ReloadOutlined`）。
- 点击调 `reloadEditor()` → `invalidateAllQueries()`（全量失效，schema/record/layout 一并刷新）。
- 失败用 `message.error` 提示（沿用现有 `App.useApp()` message）。
- 桌面端/Web 端通用。

**i18n**：`reload` / `reloadSuccess` / `reloadFail`（en/zh 各一段）。

### 3.2 P0-2 Schema 字段级编辑（新增 SchemaFieldService + 两处 UI）

**核心层（editor-core 新增 `SchemaFieldService.ts`）**：
- 仿照 `SchemaRelationService` 的 mutate 管道（读 config.cfg → parse → 定位 → 变更 → resolve 校验 → 写回），提供同步 + async 双变体：
  - `addField(editor, table, {name, type, comment})` → 追加字段
  - `updateField(editor, table, oldName, {name?, type?, comment?})` → 改名/改类型/改注释
  - `removeField(editor, table, fieldName)` → 删除字段（若为主键字段或 FK 引用则报错）
- 复用 `TableCreateService.buildFields` 的字段构造逻辑（抽公共 helper 或内联）。
- 通过 `CfgWriter.stringify(schema)` 写回 config.cfg，调用方（apiClient）负责 `editor.reload()`。
- 校验：字段名合法性（identifier）、重名、主键/外键引用保护。

**UI 入口 A：Table 视图节点右键菜单**
- `Table.tsx` 节点右键菜单（现有菜单项有 record/edit/relation）新增：添加字段、编辑字段、删除字段。
- 添加/编辑字段打开字段编辑弹窗（复用 CreateTableForm 的字段行组件或新建 `FieldEditModal`）。

**UI 入口 B：工具设置页**
- `ToolsSetting` 增加「字段管理」卡片：选表（当前表）→ 字段列表（antd Table）+ 添加/编辑/删除按钮。

**Tauri 注意**：右键菜单当前是 `FlowContextMenu` 体系，需查 `Table.tsx` 现有菜单构造。

### 3.3 P1-3 Schema↔数据对齐（已内置，降级）

**重大发现**：`Context.readSchemaAndData`（Context.ts:296-297 / 331-332）在**每次加载时已自动执行** `new CfgSchemaAlignToData(headRow).align(schema, data, alignErr)`，且 autoFix 时自动写回 config.cfg（Context.ts:305-311 / 340-347）。**对齐能力已内置到加载流程，审查报告 P1-3 为误报**——schema 与数据天然对齐，无需独立 UI 按钮。

**修正**：
- P1-3 从本轮范围移除（无需新增服务/UI）。
- 不补额外 UI（加载即对齐已透明，无需提示）。

### 3.4 P1-4 数字精确搜索

**现状**：`SearchService.search` 已自动区分数字/字符串（`Number.isInteger` 判断，value/src/SearchService.ts:41-53），数字输入自动走 `searchNumber`。**审查报告「数字搜索未桥接」为误报**——数字搜索能力已隐式可用。

**修正方案**（降级为增强）：
- 验证性确认：数字输入已能精确搜索（写测试确认 `search('1001')` 走数字精确匹配）。
- 可选增强：`SearchValue.tsx` 加「字符串/数字」Segmented 切换（字符串=子串，数字=精确），避免歧义。若验证通过且用户不需要显式开关，可**不做**（YAGNI）。

### 3.5 P1-5 单表数据重载

**现状**：`DataManager.updateByReloadTable(context, dTable)` 存在（packages/context/src/DataUpdater.ts:40），但没桥接。

**方案**：
- editor-core 新增 `SingleTableReloadService`（或并入现有服务）：输入 tableId，从 `context.cfgData().tables.get(tableId)` 拿 `dTable` → `DataManager.updateByReloadTable` → 新 CfgData 合并 → `editor.adoptNewCfgValue`（或 reload）。
- `Context` 需暴露 `cfgData()` 与 `contextCfg()`（已有）。
- UI：Tools 设置页每表一个「重载此表」按钮（或在字段管理卡片/表格右键）。与 P0-1 全量 reload 并存。

### 3.6 P2-10 未引用记录批量删除

**方案**：`recordUnref` 页面顶部加「删除全部未引用」按钮（`Popconfirm` 确认）→ 循环调 `deleteRecord(table, id)`（对 `recordRefResult.refs` 逐个）→ 完成后 `invalidateAllQueries()`。

**入口**：`RecordRef.tsx`（`isUnrefMode` 分支）或 `UnreferencedButton` 旁。倾向 `RecordRef.tsx`（页面内）。

**注意**：批量删除可能量大，逐条删除串行；或新增「批量删除」editor-core 服务（一次写库）更高效——设计上先做「遍历 deleteRecord」，若 reviewer 反对再改。

### 3.7 P2-11 文件自动监视（复用 WatchAndPostRun）

**方案**（复用现成组件，不造轮子）：
- `WatchAndPostRun`（packages/context/src/WatchAndPostRun.ts）已封装完整监视链路：`Watcher`（fs.watch 递归）→ `WaitWatcher`（变化后等待安静）→ `Context.createWithStructure`（重载）→ `PostRunCallback.onNewContextLoaded(newContext)`。
- editor-core 新增 `AutoReloadService`（轻封装）：
  - `start(editor, waitSeconds)` → 以 `editor.context()` 起 `WatchAndPostRun.startWatch(context, waitSeconds)`，注册 postRun 回调：新 Context → `editor.reloadFromContext(newContext)`（EditorService 需补一个接受外部 Context 的 reload 方法，或复用现有 reload 全量重读）。
  - `stop()` → `watchAndPostRun.stopWatch()`。
  - 注意：WatchAndPostRun 内部 `reloadData` 用 `cur.sourceStructure().reload()` 同步读盘——Tauri WebView 环境是异步 fs，需确认 WatchAndPostRun 的同步 reload 在 WebView 可用（`DirectoryStructure.reload()` 走 fs 抽象，WebView 下可能抛错）。若不可用，退化为「定时轮询 reloadEditor」（低配但可靠）。

**默认关闭**（用户已确认）。UI 入口：`ToolsSetting` 加「自动刷新 / Auto reload」Switch（onChange 启停 AutoReloadService）。

---

## 4. 关键代码位置清单

| 功能 | 后端（editor-core/context） | 前端 |
|---|---|---|
| 重载 | `EditorService.reload()` 已有 | `ConnectionSetting.tsx` |
| 字段编辑 | 新增 `SchemaFieldService.ts` | `Table.tsx` 右键菜单 + `ToolsSetting.tsx` |
| 对齐 | **已内置（Context 加载时自动 align），无新增** | 无 |
| 数字搜索 | **已隐式可用（search() 自动区分），验证即可** | `SearchValue.tsx`（可选增强） |
| 单表重载 | 新增 service（桥接 DataUpdater） | `ToolsSetting.tsx` |
| 批量删除 | 复用 `deleteRecord` | `RecordRef.tsx`（isUnrefMode） |
| 自动监视 | 新增 AutoReloadService（封装 WatchAndPostRun，WebView 不可用则轮询） | `ToolsSetting.tsx` 开关 |

---

## 6. 风险与注意

- **分层约束**：新增服务放 editor-core（依赖 schema/data/context/shared），前端只依赖 apiClient。
- **TDD**：每个服务先写测试（`packages/editor-core/src/**/*.test.ts`）再实现；UI 组件不加单测（约定）。
- **i18n**：新文案必须 en/zh 双段（`src/app/i18n.ts`）。
- **批量删除性能**：串行逐条删除可能慢（几十条 × 每次 reload）。**设计上先逐条**，如评审指出再改批量。
- **AutoReloadService 的 fs 同步读盘**：WatchAndPostRun 内部 `reloadData()` 用 `cur.sourceStructure().reload()` 同步读盘，Tauri WebView（异步 CfgFileSystem）下可能抛错——**须先验证**，不可用则退化为定时轮询 reloadEditor（低配但可靠）。
- **P0-2 字段删除保护**：主键字段、被 FK 引用的字段禁止删除，删除前须校验（含跨表 FK 引用）。

---

## 7. 实施顺序

1. P0-1 重载按钮（低难度，立即见效）
2. P0-2 字段级编辑（新增服务 + 两处 UI）
3. P1-4 数字搜索（验证型：写测试确认已可用，可选增强 Segmented）
4. P1-5 单表重载（新增桥接服务 + ToolsSetting 按钮）
5. P2-10 未引用批量删除（RecordRef 弹 Popconfirm）
6. P2-11 自动监视开关（默认关，先验证 WatchAndPostRun 在 WebView 可用性）

> 注：P1-3 Schema↔数据对齐已内置到 Context 加载流程（自动 align + autoFix 写回），**不占独立实施项**。

> AI生成