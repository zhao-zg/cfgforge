---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '44475028-3434-4fc3-bf73-d52b728caf68'
  PropagateID: '44475028-3434-4fc3-bf73-d52b728caf68'
  ReservedCode1: '2e9b1e84-cf4e-498e-903f-9cca380df333'
  ReservedCode2: '2e9b1e84-cf4e-498e-903f-9cca380df333'
---

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目结构

这是一个策划配表系统，包含对象数据库浏览器、编辑器和程序访问代码生成器。

- **`packages/`** - TypeScript monorepo，核心配置生成器 (cfgforge) 的全部实现
  - `shared/` - 通用工具（文件 I/O、CSV、字符串、加密等）
  - `data/` - 数据读取（Excel/CSV/JSON → 统一数据模型）
  - `value/` - 配置值模型（多态、嵌套、外键引用）
  - `context/` - 上下文管理（目录结构、文件监视、数据更新）
  - `write/` - 数据写回（CSV/Excel/JSON 存储）
  - `gen/` - 代码生成器（Java/C#/Lua/Go/TypeScript/Bytes/JSON/I18n/AI）
  - `i18n/` - 国际化工具
  - `schema/` - ANTLR schema 解析（独立包，需特殊构建步骤）
  - `editor-core/` - 编辑器后端服务（Record/Schema/Search/Note 等 Service）
  - `cli/` - 命令行入口（`npx cfgforge`）
  - `mcp/` - MCP Server（AI 工具调用接口）
- **`cfgeditor/`** - 可视化配置编辑器，React 19 + TypeScript + Vite + Tauri 桌面应用
  - 直接 import `editor-core` 包，无需 Java 后端
  - 文件 I/O 通过 `@tauri-apps/plugin-fs`
- **`cfgdev/`** - 开发工具集，包含 Claude Code 插件和 VSCode 扩展
  - `schema-gen-plugin/` - Claude Code 插件，根据自然语言生成 .cfg schema
  - `vscode-cfg-extension/` - VSCode 扩展，提供 .cfg 文件语法高亮和跳转
- **`example/`** - 多语言代码生成测试示例
- **`samples/`** - 实际游戏系统配置示例（技能、触发器、剧情对话等）
- **`docs/`** - 项目文档

### 相关文档
- 各子目录的 `CLAUDE.md` 包含详细的架构和开发指南
- 各子目录的 `README.md` 包含构建和使用说明

## 开发命令

```bash
# 安装依赖
pnpm install

# 运行全部测试
pnpm --filter "!@cfgforge/schema" -r test

# 构建所有包
pnpm -r run build

# CLI 运行
npx cfgforge -datadir example/config -gen java,bytes,verify

# cfgeditor 开发
cd cfgeditor && pnpm run dev

# cfgeditor 测试
cd cfgeditor && npx vitest run
```

## Windows 环境命令行注意事项

本项目在 Windows 环境下开发，使用 PowerShell 或 Git Bash 均可。

### 常用命令

```bash
# 运行 Go 代码生成测试
npx cfgforge -datadir example/config -gen go,dir:.,encoding:UTF-8 -gen bytes

# 构建编辑器桌面应用（需 Rust）
cd cfgeditor && pnpm tauri build
```

> AI生成