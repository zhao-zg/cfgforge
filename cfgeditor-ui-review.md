---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '85da3896-2d09-4977-b911-1f454449227f'
  PropagateID: '85da3896-2d09-4977-b911-1f454449227f'
  ReservedCode1: '916a9f5d-ea2b-4e69-898b-da45afc67565'
  ReservedCode2: '916a9f5d-ea2b-4e69-898b-da45afc67565'
---

# cfgeditor UI 操作便利性审查报告

> 审查日期：2026-08-28
> 审查方式：通过 WebView2 CDP 直连桌面版 `cfgeditor-d.exe`，逐页面/逐面板实机操作验证
> 审查数据：D4 真实配置库（29 模块、120 表、174 条 FK）

---

## 一、审查范围

| 页面路由 | 用途 | 审查状态 |
|----------|------|----------|
| `/table/:table` | 表结构视图（schema 节点） | 已审查 |
| `/tableRef/:table` | 表引用关系图（19 个引用表节点） | 已审查 |
| `/record/:table/:id` | 单条记录详情（Flow 节点 + 字段） | 已审查 |
| `/recordRef/:table/:id` | 记录引用关系图 | 已审查 |
| `/recordUnref/:table` | 未引用记录列表（30 个记录节点） | 已审查 |
| `/edit/record/:table/:id` | 编辑模式 | 已审查 |
| 左侧面板：导航 | 关联数据/访问历史/修改历史/搜索 | 已审查 |
| 左侧面板：关系 | 表间引用关系 | 已审查（同 tableRef） |
| 左侧面板：添加数据 | AI 生成 + JSON 导入 | 已审查 |
| 左侧面板：设置 | 7 类配置项 | 已审查 |

---

## 二、问题清单

### 严重（影响核心功能）

#### S1.「添加数据」面板 ErrorBoundary 崩溃
- **现象**：切换到「添加数据」面板，无论选「AI 生成」还是「JSON 导入」，面板内容均为 ErrorBoundary 错误页，显示 `yd.existsSync is not a function`
- **根因**：Tauri 环境下的文件系统抽象（`TauriFileSystem`）未实现 `existsSync` 方法，导致添加数据功能完全不可用
- **影响范围**：用户无法通过 UI 新增数据记录
- **建议**：在 `TauriFileSystem` 中补全 `existsSync` 实现，或修改 Add 面板逻辑使其调用异步 `exists` 而非同步 `existsSync`

#### S2. 编辑模式（`/edit/record/...`）无实际编辑入口
- **现象**：导航到 `/edit/record/activity.activitybattlepasslevel/61` 后，页面展示与普通 record 页面几乎一致：19 个表名节点（非字段节点）、0 个表单项、仅 1 个空 textarea
- **问题**：
  - 编辑路由未触发实际的编辑会话（EditSession）
  - 点未切换为可编辑形态（应显示输入框而非只读文本）
  - 无保存/取消/撤销/重做按钮
- **建议**：检查 Record.tsx 中 `isEditMode` 的路由前缀解析逻辑，确保 `/edit/` 前缀正确激活编辑态

---

### 中等（影响操作效率）

#### M1. 顶部导航按钮 Tooltip 中英文混乱
- **现象**：
  | 按钮 | 图标 | Tooltip | 问题 |
  |------|------|---------|------|
  | 历史后退 | left | `alt+c` | 使用快捷键名而非功能描述，新用户不理解 |
  | 历史前进 | right | `alt+v` | 同上 |
  | 锁定 | unlock | `锁定` | 正常 |
  | 新建表 | file-add | `新建表` | 正常（需 hover 才显示，Ant Design Tooltip） |
  | CFG编辑器 | file-text | `CFG编辑器` | 正常（同上） |
  | 未引用 | - | `未被引用的记录` | 正常 |
  | 添加备注 | book | `新建表` | **错误！** Tooltip 显示「新建表」而非「添加备注」 |
- **影响**：用户无法通过 Tooltip 理解按钮功能
- **建议**：
  1. `alt+c`/`alt+v` 改为 `后退 (Alt+C)` / `前进 (Alt+V)`
  2. 修复 book 图标按钮的 Tooltip——在 record 页面显示「添加备注」、在 recordUnref 页面显示正确的功能描述

#### M2. 搜索框 placeholder 未国际化
- **现象**：搜索输入框 placeholder 为硬编码英文 `search value`，而搜索按钮文字为中文 `搜 索`
- **影响**：中英文混排，视觉不一致
- **建议**：将 `placeholder='search value'` 改为 `placeholder={t('searchPlaceholder')}`，i18n 中增加对应翻译（如 `搜索值`）

#### M3. 搜索空结果「No data」无文字说明
- **现象**：执行搜索后若无结果，显示 Ant Design 默认的 `No data` 空状态图标，无任何文字描述（emptyText 为空字符串）
- **影响**：用户不知道是搜索完毕无结果，还是搜索尚未执行
- **建议**：设置 Ant Design `ConfigProvider` 的 `locale.Empty.description` 为 `暂无数据`，或在 SearchValue 组件中自定义空状态文字

#### M4. 「关联数据」面板展开后内容为空
- **现象**：在 record 页面展开「关联数据」面板，Collapse 项标记为 `active=true` 但 `children=0`，内容区完全空白
- **根因**（代码分析）：`RefIdList` 的 `useQuery` 有 `enabled` 门控条件 `thisTable.length > 0 && thisId.length > 0`。当条件满足时应发请求，但实际渲染为空。可能原因：
  - QueryGate 组件在 `isLoading=false` 且 `data=undefined` 时渲染 `Result title="record result empty"`，但该 `Result` 组件可能被 CSS 隐藏或未正确渲染
  - 或 `thisId` 未正确从 URL 参数中提取
- **建议**：调试 RefIdList 的 query 状态，确认 `enabled` 是否为 true、`data` 是否有值

#### M5. 节点操作入口单一（仅 book 图标按钮）
- **现象**：recordUnref 页面的 30 个记录节点，每个节点仅有 1 个操作按钮（book 图标），无编辑、删除、复制等操作入口
- **影响**：用户无法直接在节点上编辑或删除记录，需要通过其他路径操作
- **建议**：在节点 header 增加更多操作按钮（编辑、删除、复制 ID 等），或支持双击节点进入编辑

---

### 轻微（影响体验细节）

#### L1. 顶部选择器无 placeholder
- **现象**：顶部表名和记录 ID 下拉选择器（`ant-select`）的 placeholder 为空字符串
- **影响**：首次使用时用户不知道这些选择器的用途
- **建议**：添加 placeholder 如 `选择表` / `选择记录`

#### L2. 设置面板内容过长无分段折叠
- **现象**：设置面板有 7 个分类（显示/行为/数据目录/资源/主题/页面/工具），但全部展开在一个可滚动区域内，scrollHeight 远大于可视区域
- **影响**：用户需要大量滚动才能找到需要的设置项
- **建议**：将 7 个分类改为可独立折叠的 Collapse 面板，默认只展开当前关注的一类

#### L3. recordRef 与 tableRef 页面内容完全一致
- **现象**：`/recordRef/activity.activitybattlepasslevel/61` 和 `/tableRef/activity.activitybattlepasslevel` 显示的节点和面板完全相同（都是 19 个表名节点）
- **影响**：recordRef 应展示记录级别的引用关系（哪些记录引用了当前记录），而非表级别的关系图
- **建议**：检查 RecordRefRoute 组件是否正确解析了 `:id` 参数并加载记录级引用数据

#### L4. 未引用记录节点命名不友好
- **现象**：recordUnref 页面的节点标题为 `activitybattlepasslevel_int32`、`activitybattlepasslevel_1` 等，使用下划线连接表名和记录 ID
- **影响**：不够直观，用户需要理解下划线分隔规则
- **建议**：节点标题改为 `表名 #ID` 格式，或显示记录的主要字段值

#### L5. 主画布空间利用率低
- **现象**：record 页面仅 1 个节点居中显示，画布约 90% 为空白；table 页面 2 个节点同样大量空白
- **影响**：空间浪费，尤其在小屏幕上更明显
- **建议**：自动调整节点位置和画布缩放比例，或缩小默认画布区域给左侧面板更多空间

#### L6. 两个输入框 placeholder 为空
- **现象**：顶部工具栏区域有 2 个 text 类型输入框，placeholder 均为空字符串
- **影响**：用户不知道这些输入框的用途
- **建议**：添加适当的 placeholder 或 label

---

## 三、问题汇总统计

| 严重等级 | 数量 | 关键项 |
|----------|------|--------|
| 严重 | 2 | 添加数据面板崩溃、编辑模式无效 |
| 中等 | 5 | Tooltip 中英文混乱、搜索 placeholder 未国际化、空结果无说明、关联数据面板空白、节点操作单一 |
| 轻微 | 6 | 选择器无 placeholder、设置面板过长、recordRef=tableRef、节点命名不友好、画布空旷、输入框无 placeholder |
| **合计** | **13** | |

---

## 四、优先修复建议

1. **立即修复**：S1 添加数据面板 `existsSync` 崩溃 → 恢复核心数据录入功能
2. **立即修复**：S2 编辑模式不生效 → 恢复核心编辑功能
3. **尽快修复**：M1 Tooltip 混乱 + M2 搜索 placeholder → 提升基础可用性
4. **尽快修复**：M3 空结果无说明 + M4 关联数据空白 → 避免用户误判系统状态
5. **逐步改进**：L1-L6 体验细节优化

> AI生成