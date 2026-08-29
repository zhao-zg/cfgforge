---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'a45ecacb-181f-40ce-a1d0-77f3b64fdd4e'
  PropagateID: 'a45ecacb-181f-40ce-a1d0-77f3b64fdd4e'
  ReservedCode1: '69195619-e040-45cc-a71a-b1b794b03b52'
  ReservedCode2: '69195619-e040-45cc-a71a-b1b794b03b52'
---

# cfgeditor UI 全面审查修复设计

> 日期：2026-08-29
> 范围：superpowers Brainstorm 阶段识别的全部 UI 问题
> 流程：superpowers（Brainstorm → Plan → TDD → Review → Finish）

---

## 1. 问题清单

经逐文件审查代码确认，以下 12 个问题仍需修复（已排除近期提交修复的项）：

### A. 布局架构问题

| # | 文件 | 问题 | 严重度 |
|---|---|---|---|
| 1 | `SidePanelShell.tsx:10` | `HEADER_HEIGHT = 32` 与 HeaderBar 实际高度 40px（`HeaderBar.tsx:43`）不一致，文字面板顶部被遮 8px | 高 |
| 2 | `CfgEditorApp.tsx:287` | Splitter 左面板固定 `defaultSize="20%"`，Settings 面板太窄、Finder 面板太宽 | 中 |
| 3 | `Chat.tsx:43` | Chat header 高度 52px 与 HeaderBar 40px 不匹配，Splitter 内视觉不齐 | 低 |

### B. 代码 Bug

| # | 文件 | 问题 | 严重度 |
|---|---|---|---|
| 4 | `PathNotFound.tsx:9` | `<Alert title={...}/>` — antd Alert 的 `title` 渲染为 tooltip 不可见，应改 `message` | 高 |
| 5 | `AddJson.tsx:103` | `wrapperCol={{offset: 4, span: 20}}` 在 `layout="vertical"` 下产生多余左缩进 | 中 |

### C. 国际化缺失

| # | 文件 | 问题 | 严重度 |
|---|---|---|---|
| 6 | `PathNotFound.tsx:11` | 硬编码英文 `"Return to home page"` 未走 i18n | 中 |
| 7 | `Chat.tsx` | 12+ 处英文硬编码字符串（header 标题、Welcome 文案、placeholder、notification 消息、requestFallback/requestPlaceholder 等） | 高 |

### D. 视觉一致性

| # | 文件 | 问题 | 严重度 |
|---|---|---|---|
| 8 | `TableList.tsx:17` | 硬编码 `#597ef7`，应用 `var(--color-accent)` | 中 |
| 9 | `CustomAutoComplete.tsx:8` | 硬编码 `#597ef7`，应用 `var(--color-accent)` | 中 |
| 10 | `constants.ts:36` | `FORM_STYLE` 硬编码 `backgroundColor: "white"`，深色主题下不适配 | 中 |
| 11 | `style.css:135-137` | 孤儿样式 `.player { width: 320px; }` 无组件使用 | 低 |

### E. UX 可用性

| # | 文件 | 问题 | 严重度 |
|---|---|---|---|
| 12 | `HeaderBar.tsx:59-87` | alt+1~4 / alt+c/v / alt+s 等快捷键对用户不可发现，无快捷键提示 | 低 |

---

## 2. 修复方案

### 修复 1：SidePanelShell HEADER_HEIGHT 对齐（A1）

**现状**：`SidePanelShell.tsx` 硬编码 `HEADER_HEIGHT = 32`，但 `HeaderBar.tsx:43` 实际高度为 40px。

**方案**：
- 将 `HEADER_HEIGHT` 改为 40，与 `HeaderBar.tsx` 的 `height: 40` 对齐。
- 在两处加注释互相引用，保持同步约定。
- 提取为共享常量（可选，若 `SidePanelShell` 与 `HeaderBar` 在同一分层可共享常量文件；否则保持各自定义 + 注释引用）。

**测试**：无纯逻辑变更，不涉及单测。

### 修复 2：Splitter 左面板按面板类型调整初始宽度（A2）

**现状**：`CfgEditorApp.tsx:287` 固定 `defaultSize="20%"`。

**方案**：
- 根据 dragPanel 类型设置不同初始宽度：
  - `setting` → 30%（表单拥挤，需更宽）
  - `finder` → 20%（列表为主）
  - `add` → 25%（Chat 需中等宽度）
  - `errors` → 25%（错误列表需中等宽度）
  - 默认（recordRef / fixedPage）→ 50%（关系图需更宽）
- 用 `key` 属性让 Splitter 在面板切换时重置宽度（Splitter 的 `defaultSize` 只在初次 mount 生效）。
- 或改为 `size` 受控模式（复杂度更高，暂不必要）。

**测试**：无纯逻辑变更。

### 修复 3：Chat header 高度对齐（A3）

**现状**：`Chat.tsx:43` `height: 52`。

**方案**：改为 40px，与 HeaderBar 一致。

**测试**：无纯逻辑变更。

### 修复 4：PathNotFound Alert title → message（B4）

**现状**：`<Alert title={`${pathname} Not Found`}/>` — antd Alert `title` 渲染为 tooltip。

**方案**：
- `title` → `message`，使错误文本可见、可选。
- 添加 `type="warning"` 属性增强视觉。
- 文案走 i18n（见修复 6）。

**测试**：无纯逻辑变更。

### 修复 5：AddJson wrapperCol 去除多余缩进（B5）

**现状**：`AddJson.tsx:103` `<Form.Item wrapperCol={{offset: 4, span: 20}}>` 在 `layout="vertical"` 下产生不必要左缩进。

**方案**：
- 移除 `wrapperCol`，或改为 `wrapperCol={{offset: 0, span: 24}}`。
- 在 vertical 布局下，Form.Item 默认占满，不需要额外 offset。

**测试**：无纯逻辑变更。

### 修复 6：PathNotFound 国际化（C6）

**方案**：
- `i18n.ts` 新增 key：`pathNotFound`（en: `"{path} Not Found"` / zh: `"{path} 页面不存在"`）和 `returnHome`（en: `"Return to home page"` / zh: `"返回首页"`）。
- `PathNotFound.tsx` 使用 `t()` 调用。

**测试**：无纯逻辑变更。

### 修复 7：Chat 全面国际化（C7）

**方案**：
- `i18n.ts` 新增以下 key（en/zh 各一段）：

| key | en | zh |
|---|---|---|
| `chatTitle` | `AI Chat` | `AI 对话` |
| `chatWelcome` | `Welcome to AI Chat` | `欢迎使用 AI 对话` |
| `chatDesc` | `I can help you generate and edit configuration data` | `我可以帮你生成和编辑配置数据` |
| `chatPlaceholder` | `Ask me to generate configuration data...` | `输入指令生成配置数据...` |
| `chatNotConfigured` | `Please configure AI baseUrl and apiKey in Settings first` | `请先在设置中配置 AI baseUrl 和 apiKey` |
| `chatThinking` | `Thinking...` | `思考中...` |
| `chatCancelled` | `Request was cancelled` | `请求已取消` |
| `chatError` | `Error: {error}` | `错误：{error}` |
| `checkJsonErr` | `checkJson err: {error}` | `checkJson 错误：{error}` |
| `chatNoSession` | `No open editing session, AI result discarded` | `无打开的编辑会话，AI 结果已丢弃` |
| `chatSessionChanged` | `Editing session changed while generating, AI result discarded to avoid writing to the wrong record` | `生成期间编辑会话已变更，AI 结果已丢弃以避免写入错误记录` |
| `chatUnsavedEdits` | `Record has unsaved manual edits, AI result not applied (would overwrite them)` | `记录有未保存的手动编辑，AI 结果未应用（避免覆盖）` |
| `chatParseFail` | `parse jsonResult failed: {error}` | `解析 jsonResult 失败：{error}` |
| `chatCheckFailed` | `checkJson failed: {resultCode}` | `checkJson 失败：{resultCode}` |

- `Chat.tsx` 全部硬编码字符串替换为 `t()` 调用。
- `requestPlaceholder` 和 `requestFallback` 的返回值也走 i18n（这些在渲染时执行，可以安全调用 `t()`）。

**测试**：无纯逻辑变更（UI 组件不加单测）。

### 修复 8：TableList 硬编码色值 → token（D8）

**方案**：`TableList.tsx:17` `color: '#597ef7'` → `color: 'var(--color-accent)'`。

### 修复 9：CustomAutoComplete 硬编码色值 → token（D9）

**方案**：`CustomAutoComplete.tsx:8` `color: '#597ef7'` → `color: 'var(--color-accent)'`。

### 修复 10：FORM_STYLE 硬编码白色 → token（D10）

**方案**：`constants.ts:36` `backgroundColor: "white"` → `backgroundColor: 'var(--color-bg-panel)'`。

### 修复 11：删除孤儿样式 .player（D11）

**方案**：删除 `style.css:135-137` 的 `.player` 规则。
- 先全局搜索确认无组件引用（class name "player"）。

### 修复 12：快捷键提示（E12）

**现状**：alt+1~4（页面切换）、alt+c/v（前后退）、alt+s（提交）、alt+enter（全屏）均无 UI 提示。

**方案**（轻量）：
- 在 Setting 面板新增「快捷键」卡片，列出全部快捷键及说明。
- 利用已有 i18n key `keySetting: "Shortcuts" / "快捷键"`。
- 新增 i18n key 逐条列出快捷键说明。
- 不做浮动 tooltip 或 help 按钮弹出（YAGNI，Setting 卡片足够）。

**测试**：无纯逻辑变更。

---

## 3. 任务拆分与实施顺序

按「低风险 → 高风险」排序，每任务独立提交：

| 任务 | 修复项 | 文件 | 预计时长 |
|---|---|---|---|
| T1 | D11 删除 .player 孤儿样式 | `style.css` | 1min |
| T2 | D8/D9/D10 硬编码色值 → token | `TableList.tsx`, `CustomAutoComplete.tsx`, `constants.ts` | 3min |
| T3 | A1 SidePanelShell 高度对齐 | `SidePanelShell.tsx` | 2min |
| T4 | A3 Chat header 高度对齐 | `Chat.tsx` | 1min |
| T5 | B5 AddJson wrapperCol 去缩进 | `AddJson.tsx` | 1min |
| T6 | B4+C6 PathNotFound Alert 修复 + i18n | `PathNotFound.tsx`, `i18n.ts` | 5min |
| T7 | C7 Chat 全面国际化 | `Chat.tsx`, `i18n.ts` | 10min |
| T8 | A2 Splitter 按面板类型调宽度 | `CfgEditorApp.tsx` | 5min |
| T9 | E12 快捷键提示卡片 | `Setting.tsx` 或子组件, `i18n.ts` | 10min |

---

## 4. 验收标准

- [ ] `pnpm run lint` 通过（0 新增告警）
- [ ] `pnpm test:run` 通过（无新增失败）
- [ ] `pnpm tsc --noEmit` 通过（0 类型错误）
- [ ] SidePanelShell HEADER_HEIGHT = 40 对齐 HeaderBar
- [ ] PathNotFound Alert 使用 `message` 且文案走 i18n
- [ ] AddJson 提交按钮无多余左缩进
- [ ] Chat 全部用户可见文案走 i18n（en/zh 双段）
- [ ] 无硬编码 `#597ef7` 色值
- [ ] FORM_STYLE 不含硬编码 `"white"`
- [ ] style.css 无 `.player` 孤儿规则
- [ ] Splitter 左面板按面板类型有不同初始宽度
- [ ] Setting 面板含快捷键说明卡片

---

## 5. 风险

- **T8 Splitter key 重置**：用 `key` 强制重挂 Splitter 会导致面板内组件状态丢失（如 Finder 的搜索关键词）。需确认 Splitter 的 `defaultSize` 是否只在初次 mount 生效；若是，`key` 方案可接受（面板切换本身已会卸载/重挂组件）。
- **T7 Chat requestFallback/requestPlaceholder**：这些回调在渲染时执行，`t()` 在回调闭包内调用需确保 i18n 已初始化（项目在 `main.tsx` 顶部同步初始化 i18n，安全）。
- **T9 快捷键卡片**：需确认 Setting 面板现有 tab 结构，选择合适的插入位置。

> AI生成