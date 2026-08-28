---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '9de9afb5-27d3-4f2f-b2f8-37a6cf81b0bb'
  PropagateID: '9de9afb5-27d3-4f2f-b2f8-37a6cf81b0bb'
  ReservedCode1: '6744bdb9-a8a1-425a-b981-896fdb93a187'
  ReservedCode2: '6744bdb9-a8a1-425a-b981-896fdb93a187'
---

# cfgeditor UI 设计系统整改设计 (V2)

> AI生成

## 目标

为 cfgeditor 建立一套 **Soft Nordic 暖调专业工具风** 的统一设计系统：暖调浅色为默认主题、微暖调深色为切换主题、低饱和莫兰迪色板、彩色 header + 中性 body 的节点结构、松弛留白、精致字体选配。

## 设计令牌

### 浅色（Soft Nordic）— 默认主题

| token | 值 | 用途 |
|---|---|---|
| `--color-bg` | `#F7F4EE` | 画布/主背景（暖米白） |
| `--color-bg-panel` | `#FFFFFF` | 侧栏/面板 |
| `--color-bg-elevated` | `#FBF9F4` | 卡片/悬浮 |
| `--color-bg-hover` | `#F0EBE0` | hover 背景 |
| `--color-border` | `#E2DCD0` | 边框/分割 |
| `--color-border-light` | `#EEE9DE` | 轻边框 |
| `--color-text` | `#3D3935` | 主文字 |
| `--color-text-dim` | `#8B8479` | 次要文字 |
| `--color-text-bright` | `#2A2722` | 高亮文字 |
| `--color-accent` | `#7B9E89` | 主强调（莫兰迪绿） |
| `--color-node` | `#6B8E7F` | 主节点 header |
| `--color-node-ref` | `#7B8EA3` | 引用节点 header |
| `--color-node-ref2` | `#8A7B9E` | 二级引用 header |
| `--color-node-refin` | `#A3876B` | 反向引用 header |
| `--color-edge` | `#C5BCAA` | 连线 |

### 深色（Refined Dark）— 切换主题

| token | 值 | 用途 |
|---|---|---|
| `--color-bg` | `#1C1B1A` | 画布/主背景（暖深灰） |
| `--color-bg-panel` | `#252423` | 侧栏/面板 |
| `--color-bg-elevated` | `#2D2B2A` | 卡片/悬浮 |
| `--color-bg-hover` | `#363330` | hover 背景 |
| `--color-border` | `#3A3835` | 边框/分割 |
| `--color-text` | `#D0CCC8` | 主文字 |
| `--color-text-dim` | `#8A847E` | 次要文字 |
| `--color-text-bright` | `#E8E4DF` | 高亮文字 |
| `--color-accent` | `#7DBA9E` | 主强调 |
| `--color-node` | `#5B8A72` | 主节点 header |
| `--color-node-ref` | `#6B88A3` | 引用节点 header |
| `--color-node-ref2` | `#8A7B9E` | 二级引用 header |
| `--color-node-refin` | `#A3876B` | 反向引用 header |
| `--color-edge` | `#4A4641` | 连线 |

### 字体

```
--font-ui: "Inter", "Noto Sans SC", -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif
--font-mono: "JetBrains Mono", "SF Mono", Consolas, "Courier New", monospace
```

### 圆角/间距/阴影

```
--radius-sm: 4px / --radius-md: 6px / --radius-lg: 10px
--shadow-sm: 0 1px 2px rgba(60,55,50,0.04)
--shadow-md: 0 2px 8px rgba(60,55,50,0.06), 0 1px 2px rgba(60,55,50,0.04)
--shadow-node: 0 1px 3px rgba(60,55,50,0.08), 0 1px 2px rgba(60,55,50,0.04)
```

## 整改清单

### A. 全局主题（`main.tsx` / 新增 `tokens.css` / `style.css`）
1. 新增 `src/styles/tokens.css`：CSS 变量明暗两套 + `[data-theme]` 切换
2. `main.tsx` defaultTheme 扩展：colorPrimary / colorBgLayout / colorBgContainer / colorText / borderRadius
3. `style.css` 补充：字体栈、滚动条、焦点环、hover 状态反馈

### B. 顶栏（`HeaderBar.tsx`）
1. 高度 32→40px，背景 panel 色 + 底部 border
2. 图标按钮 30×30、hover 背景、active 缩放
3. 空态引导卡片（图标+标题+描述+主按钮）

### C. 设置面板（`Setting.tsx` + 子组件）
1. 卡片化分组（Layout/Color/Other），替代裸 Divider
2. 表单控件 label 12px、Select 统一宽、Switch/Radio 对齐
3. 卡片 hover 阴影增强

### D. 画布节点（`FlowNode.tsx` / `colors.ts` / `sharedStyles.tsx`）
1. `colors.ts` NODE_SHOW_DEFAULTS 换低饱和莫兰迪色板
2. 节点结构改为彩色 header + 中性 body
3. 圆角 6px、轻阴影、1px border
4. 折叠态 outline 用 token 色
5. 右键菜单边框换 accent token
6. sharedStyles 图标按钮加 hover/active

### E. 明暗切换
1. store 新增 `themeMode: 'light' | 'dark'`（默认 'light'，持久化）
2. ThemeProvider 根据 mode 设置 `document.documentElement.dataset.theme` + antd token
3. Setting → 主题 tab 增加明暗切换

### F. 窗口尺寸（`tauri.conf.json`）
1. 默认 1024×768 → 1280×800

## 验收
- [x] 浅色/深色切换正常
- [x] 节点彩色 header + 中性 body 结构生效
- [x] 色板为低饱和莫兰迪，折叠态不再粉
- [x] 设置面板卡片化分组（C 项 1 卡片化 + C 项 2 label 12px/Select 统一宽/Switch/Radio 对齐 + C 项 3 hover 阴影，均已落地）
- [x] 空态引导卡片
- [x] `pnpm lint` 通过（19 个预存 React Compiler 警告，均在 Record.tsx/SchemaTextEditor.tsx/ResPopover.tsx，非本次引入；C 项改动 0 新增）+ `pnpm test:run` 通过（686 个）+ `tsc --noEmit` 通过

> AI生成