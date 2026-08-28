---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'eb38ff97-9efa-4e89-b70a-0dc139438795'
  PropagateID: 'eb38ff97-9efa-4e89-b70a-0dc139438795'
  ReservedCode1: '581d5ef6-026c-4a0e-9c39-ba3f7ad94a1b'
  ReservedCode2: '581d5ef6-026c-4a0e-9c39-ba3f7ad94a1b'
---

# cfgeditor UI 不可操作功能审查报告

> 审查日期：2026-08-28
> 审查范围：`@cfgforge/*` 核心包能力 vs `cfgeditor/src` UI 暴露
> 方法：核心包导出符号全量清点 → 逐项核对 apiClient.ts → 逐项核对 UI 组件调用 → 标记"有 API 无 UI"与"有能力无 API"

---

## 审查结论总览

| 级别 | 数量 | 说明 |
|---|---|---|
| P0 严重缺失 | 2 | 核心 editor-core 服务有 async 实现但 UI 完全无入口 |
| P1 功能缺口 | 5 | 核心包有完整能力但 apiClient 未桥接、UI 无入口 |
| P2 增强建议 | 4 | 能力存在但 UI 仅有部分子功能 |

**排除项**：gen 包 13 种代码生成器（java/cs/go/lua/gd/bytes/json/sql/i18n/i18nbyid/byai/javamapper/tsschema）属 CLI 产物，不属编辑器 UI 职责范围，不纳入缺失。

---

## P0 — 严重缺失（editor-core 有服务，UI 无入口）

### 1. 数据目录重载（reloadEditor）

| 维度 | 详情 |
|---|---|
| 核心能力 | `EditorService.reload()` — 重读 schema+数据目录，重建 CfgValue 缓存 |
| apiClient | `reloadEditor()` 已定义（apiClient.ts:89），**但无任何 UI 组件调用** |
| 缺失场景 | 外部修改了 config.cfg 或数据文件后，用户无法在 UI 内刷新数据目录。当前只能关闭重开数据目录（ConnectionSetting 的 Browse 重新选一遍） |
| 影响 | 中等：用户在编辑器外修改文件（如手动编辑 CSV、外部工具改 .cfg）后看不到最新数据 |
| 建议 | 在工具设置页或顶栏加「重新加载 / Reload」按钮，调 `reloadEditor()` + `invalidateAllQueries()` |

### 2. Schema 字段级修改（增/删/改字段、删表/结构体/枚举）

| 维度 | 详情 |
|---|---|
| 核心能力 | `TableCreateService` 只支持**新建**表/结构体/枚举，**不含字段增删改名、不含删除 schema 项**。但用户可通过 SchemaTextEditor 手动编辑 config.cfg 全文实现 |
| 当前 UI | `CreateTableForm`（新建表）+ `SchemaTextEditor`（全文编辑 config.cfg） |
| 缺失场景 | 无「字段级可视化增删改名」表单操作。用户想加一个字段、改字段类型、删一个字段，只能打开 SchemaTextEditor 手动编辑全文文本（易出错） |
| 影响 | 中等：结构化字段操作退化为纯文本编辑，丧失编辑器核心价值（可视化结构编辑） |
| 建议 | 在 Table 视图的节点右键菜单加「添加字段 / 编辑字段 / 删除字段」入口，复用 CreateTableForm 的字段行组件，调用 SchemaWriteService 写回 |

> **注意**：这不算严格"能力已有无 UI"——editor-core 层本身也没有 `addField/removeField` 服务，需要同时补后端服务+前端 UI。但 SchemaTextEditor 已通过全文编辑间接提供了能力，只是操作方式不友好。

---

## P1 — 功能缺口（核心包有完整能力，apiClient 未桥接）

### 3. Schema↔数据对齐（CfgSchemaAlignToData）

| 维度 | 详情 |
|---|---|
| 核心能力 | `@cfgforge/data` 的 `CfgSchemaAlignToData` — 按数据表头自动增删字段、识别 `a1,a2,a3→aList` 列表/映射模式、同步注释 |
| apiClient | **未桥接** |
| UI | 无入口 |
| 缺失场景 | 用户在 Excel/CSV 中加了一列数据，无法一键将 schema 与数据对齐（需手动在 SchemaTextEditor 加字段定义） |
| 影响 | 中等偏高：配置开发中"数据先行"场景常见 |
| 建议 | 在工具设置页加「Schema 对齐数据 / Align schema to data」按钮，调用 `CfgSchemaAlignToData` |

### 4. 数字搜索（searchNumber）

| 维度 | 详情 |
|---|---|
| 核心能力 | `@cfgforge/value` 的 `SearchService.searchNumber` / `searchNumberInTable` — 全库数字精确匹配 |
| apiClient | **未桥接**（apiClient 只调了 `SearchService.search`，即字符串子串搜索） |
| UI | 搜索面板（`SearchValue.tsx`）只有字符串搜索 |
| 缺失场景 | 用户想精确搜索数字值（如 `id=1001`），字符串子串搜索会匹配到 `10010`、`11001` 等误报 |
| 影响 | 低中等：精确数字搜索是常见需求 |
| 建议 | 搜索面板加「字符串/数字」模式切换，数字模式调 `searchNumber` |

### 5. 单表数据重载（DataUpdater.updateByReloadTable）

| 维度 | 详情 |
|---|---|
| 核心能力 | `@cfgforge/context` 的 `DataUpdater.updateByReloadTable` — 重读单个表文件、重解析、合并回 CfgData（不影响其他表缓存） |
| apiClient | **未桥接**（只有全量 `reloadEditor`） |
| UI | 无入口 |
| 缺失场景 | 外部修改了某个表的 CSV/Excel，用户只想刷新这一个表，不想全量重载 |
| 影响 | 低：全量重载可用但慢，单表重载是优化 |
| 建议 | P0 的全量 reload 已能覆盖，单表重载作为后续优化 |

### 6. i18n 翻译能力（LangTextFinder / LangSwitchable / TodoFile）

| 维度 | 详情 |
|---|---|
| 核心能力 | `@cfgforge/i18n` 全包 — 按原文查译文（TextByValueFinder）、按 id 查译文（TextByIdFinder）、语言切换（LangSwitchable）、待翻译清单（TodoFile） |
| apiClient | **未桥接** |
| UI | 无入口 |
| 缺失场景 | 编辑器无法查看/编辑多语言译文，无法生成待翻译清单 |
| 影响 | 低：i18n 属于发布流程能力，编辑器定位为结构+数据编辑器，不强求 |
| 建议 | 可在工具设置页加「导出翻译表」入口（调用 `I18nByValueGenerator` / `I18nByIdGenerator`），但优先级低 |

### 7. MCP 服务器（@cfgforge/mcp）

| 维度 | 详情 |
|---|---|
| 核心能力 | `@cfgforge/mcp` 提供完整 MCP Server（9 个工具：list_module/table、read_schema/record、add_or_update/delete_record、search_string/number） |
| apiClient | **未桥接**（editor-core 未 re-export mcp 包） |
| UI | 无入口 |
| 缺失场景 | 用户无法从编辑器内启动/管理 MCP 服务器（供外部 AI 工具调用配置数据） |
| 影响 | 低：MCP 是外部集成能力，编辑器 UI 不强求管理入口 |
| 建议 | 可在工具设置页加「启动 MCP 服务」按钮（`startStdio`），但优先级低 |

---

## P2 — 增强建议（UI 有部分子功能，但未全覆盖）

### 8. 导出格式受限

| 维度 | 详情 |
|---|---|
| 核心能力 | `ExportService` 支持 `csv` 和 `sql` 两种格式 |
| UI | ToolsSetting 有「导出 CSV」「导出 SQL」「导出全部 SQL」三个按钮 |
| 缺失 | 无 JSON 导出（`ValueToJson` 可用但未暴露到 ExportService） |
| 建议 | 低优先级，CSV+SQL 已覆盖主要场景 |

### 9. 图片导出无格式选择

| 维度 | 详情 |
|---|---|
| 当前 UI | ToolsSetting 有缩放倍数 + 保存 PNG 按钮 |
| 缺失 | 无 SVG/JPEG 格式选择 |
| 建议 | 极低优先级 |

### 10. 未引用记录仅可查看不可批量操作

| 维度 | 详情 |
|---|---|
| 核心能力 | `UnreferencedRecordCollector` 可列出全部未引用记录 |
| UI | HeaderBar 有「未引用 N」按钮跳转列表页 |
| 缺失 | 无「批量删除未引用记录」入口 |
| 建议 | 中等优先级：未引用记录批量清理是数据治理常见需求 |

### 11. 文件监视（Watcher / WatchAndPostRun）

| 维度 | 详情 |
|---|---|
| 核心能力 | `@cfgforge/context` 的 `Watcher`（fs.watch 递归监听）+ `WatchAndPostRun`（变化后自动重载+回调） |
| apiClient | **未桥接** |
| UI | 无入口 |
| 缺失场景 | 外部修改数据文件后自动刷新编辑器视图 |
| 影响 | 低：手动 reload 已可用，自动监视是增强 |
| 建议 | 低优先级，可在设置页加「自动刷新 / Auto reload」开关 |

---

## 已确认有 UI 入口的能力（排除项）

以下能力经核实**已有 UI 入口**，不列入缺失：

| 能力 | UI 入口 | 组件 |
|---|---|---|
| FK 增删改查 | 表/表关系页右键菜单「编辑关系」 | `RelationEditModal.tsx` |
| 新建表/结构体/枚举 | 顶栏「新建表」按钮 | `CreateTableForm.tsx` |
| Schema 全文编辑 | 顶栏「CFG 编辑器」按钮 | `SchemaTextEditor.tsx` |
| 记录增删改 | 编辑模式表单 + 工具页删除 | `Record.tsx` / `ToolsSetting.tsx` |
| JSON 校验 | AI Chat 自动校验 + JSON 导入校验 | `Chat.tsx` / `AddJson.tsx` |
| AI Prompt 生成 | Chat 面板自动加载 | `Chat.tsx` |
| 字符串搜索 | Finder 面板搜索框 | `SearchValue.tsx` |
| CSV/SQL 导出 | 工具设置页 | `ToolsSetting.tsx` |
| PNG 图片导出 | 工具设置页 | `ToolsSetting.tsx` |
| 备注增删改 | 节点备注按钮 | `NodeNote.tsx` / `NoteShowOrEdit.tsx` |
| 数据目录连接 | 设置页 Browse 按钮 | `ConnectionSetting.tsx` |
| 资源分析/重载 | 设置页资源 Tab | `TauriSetting.tsx` |
| 主题编辑 | 设置页主题 Tab | `ThemeSetting.tsx` |
| 固定页面管理 | 设置页页面 Tab | `FixPages.tsx` |
| 撤销/重做 | 编辑模式快捷键 | `Record.tsx` |
| 导航历史 | 顶栏前进/后退按钮 | `HeaderBar.tsx` |
| 未引用记录查看 | 顶栏未引用按钮 | `UnreferencedButton.tsx` |
| 关联数据查找 | Finder 面板 RefIdList | `RefIdList.tsx` |
| 访问/修改历史 | Finder 面板 | `LastAccessed.tsx` / `LastModified.tsx` |

---

## 总结与优先级排序

| 优先级 | 缺失项 | 实现难度 | 建议 |
|---|---|---|---|
| **P0** | 数据目录重载按钮 | 低（apiClient 已有，加按钮即可） | 立即修复 |
| **P0** | Schema 字段级增删改 | 高（需补后端服务+前端 UI） | 中期规划 |
| **P1** | Schema 对齐数据 | 中（核心已有，需桥接） | 中期 |
| **P1** | 数字搜索 | 低（核心已有，加切换即可） | 短期 |
| **P1** | 单表数据重载 | 中 | 后续优化 |
| **P1** | i18n 翻译能力 | 中 | 低优先级 |
| **P1** | MCP 服务器管理 | 中 | 低优先级 |
| **P2** | 未引用记录批量删除 | 低 | 短期增强 |
| **P2** | 文件自动监视 | 中 | 后续优化 |
| **P2** | JSON 导出 | 低 | 低优先级 |

> AI生成