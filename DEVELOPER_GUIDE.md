---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '4e3d4893-51f9-48fd-8f7d-0d9988694484'
  PropagateID: '4e3d4893-51f9-48fd-8f7d-0d9988694484'
  ReservedCode1: '22b7b07d-cf69-4caa-a641-57573a74ca07'
  ReservedCode2: '22b7b07d-cf69-4caa-a641-57573a74ca07'
---

# cfggen 开发者入门指南

> 本文档面向新加入项目的开发者，帮助你从零搭建环境、理解关键概念、导航代码、完成常见开发任务。读完后你应该能：构建项目、修改 schema、生成代码、调试问题。

## 1. 环境搭建

### 1.1 必需工具

| 工具 | 版本要求 | 用途 | 验证 |
|---|---|---|---|
| Node.js | 20+ | cfggen 核心编译运行 | `node --version` |
| Git | 任意，需在 PATH | 版本控制 | `git --version` |
| pnpm | 9+ | monorepo 包管理 | `pnpm --version` |
| Rust | stable | Tauri 桌面应用打包（可选） | `rustc --version` |

### 1.2 克隆与初次构建

```bash
# 克隆仓库
git clone <repo-url> cfggen
cd cfggen

# 构建所有包
pnpm install
pnpm -r build

# 验证构建成功
npx cfggen -h
```

> **Windows 注意**：构建使用 `pnpm -r build`，跨平台兼容，无需特殊处理。

### 1.3 构建编辑器（可选）

```bash
cd cfgeditor

# 设置国内镜像（可选）
pnpm config set --global registry https://registry.npmmirror.com/

# 安装依赖
pnpm install

# 开发模式启动
pnpm run dev
# 浏览器打开 http://localhost:1420/
```

编辑器内置 editor-core 服务，无需独立后端。如需独立启动服务模式：

```bash
# 启动服务模式
npx cfggen -datadir ../example/config -gen server,watch=1
```

### 1.4 构建 Tauri 桌面应用（可选）

```bash
cd cfgeditor
pnpm tauri build
# 产出：cfgeditor/src-tauri/target/release/cfgeditor.exe
```

### 1.5 运行测试

```bash
# 全部测试
pnpm --filter "!@cfggen/schema" -r test   # 全部测试

# 前端测试
cd cfgeditor
pnpm test:run                             # 单次运行（CI 用）
pnpm test                                 # watch 模式
```

## 2. 关键概念

### 2.1 核心数据流：四层流水线

理解 cfggen 的关键在于理解这条数据流：

```
Schema → Data → Value → Generate
（类型）  （原始数据）（类型化值）（代码输出）
```

| 层 | 做什么 | 关键类 | 文件位置 |
|---|---|---|---|
| **Schema** | 定义有哪些表、字段、外键。独立于数据存在 | `CfgSchema`, `CfgSchemaResolver` | `packages/schema/` |
| **Data** | 从 Excel/CSV/JSON 读出原始单元格。只搬运不解释 | `CfgDataReader`, `CfgData`, `DTable` | `packages/data/` |
| **Value** | 把原始单元格和类型系统组合，产出类型化值。外键校验在此 | `CfgValueParser`, `RefValidator`, `VTable` | `packages/value/` |
| **Generate** | 消费值，用模板渲染各语言代码 | `Generator`, `CsCodeGenerator`... | `packages/gen/` |

`Context`（`packages/context/`）是协调者：它持有 schema、data 和缓存值，所有生成器从 Context 取数据。

### 2.2 CFG Schema 语法

cfggen 使用自定义 DSL（`.cfg` 文件）定义配置结构：

```
// struct — 复合结构
struct Award {
    itemId: int  -> item [id];    // 外键：引用 item 表的 id 唯一键
    count:  int;
}

// interface — 多态接口
interface Condition {
    struct CheckItem { itemId: int -> item [id]; count: int; }
    struct CheckLevel { level: int; }
}

// table — 数据表
table task {
    id: int;           // 主键（第一个 int 字段）
    name: str;
    awards: list<Award>;   // 嵌套列表
    -client               // tag：客户端标记
}

// enum — 枚举（语法糖，实际脱糖为 table）
enum buffclass {
    buff
    debuff
}
```

**外键两种写法**：
- `->` 单值引用：`itemId: int -> item [id]`（指一个）
- `=>` 多值引用：`awardIds: list<int> => award [id]`（指一串）

### 2.3 插件注册机制

所有生成器和工具通过注册表扩展：

```java
// Main.registerAllProviders() 中注册
Generators.addProvider("java", JavaCodeGenerator::new);
Tools.addProvider("xmltocfg", XmlToCfgTool::new);
```

命令行使用：
```bash
npx cfggen -datadir <dir> -gen <name>[,key=value...]
npx cfggen -datadir <dir> -tool <name>[,key=value...]
```

### 2.4 分层依赖规则

**cfggen (TypeScript monorepo)** 层次（eslint 强制）：

```
gen(含 gen*/write/editorserver/mcpserver/tool)
  → ctx → value → data → schema → util
```

**cfgeditor (前端)** 层次（oxlint 强制）：

```
app/features → flow/res → store/services → domain → api
```

反向 import 会被测试/lint 直接拦下。

### 2.5 模板引擎

代码生成用模板引擎（`packages/gen/templates/`）：

- **构建期** `pnpm -r build` 预编译模板，运行时零编译
- **开发期** `npx cfggen` 改模板立即见效
- **改模板后必须重新 `pnpm -r build`** 才能让预编译生效

## 3. 代码导航地图

### 3.1 cfggen (TypeScript) 代码地图

```
packages/
│
├── gen/                    ← 命令行入口
│   ├── Main.java           ← main()，注册所有插件，解析参数
│   ├── Generator.java      ← 生成器基类（abstract generate(Context)）
│   ├── Generators.java     ← 生成器注册表
│   ├── Tools.java          ← 工具注册表
│   └── ParameterParser.java ← 参数解析（双实现：解析+文档）
│
├── ctx/                    ← 协调中心
│   ├── Context.java        ← 持有 schema/data/value 缓存
│   ├── ContextCfg.java     ← 配置参数 record
│   └── DirectoryStructure.java ← 数据目录扫描
│
├── schema/                 ← 类型系统（37 文件）
│   ├── CfgSchema.java      ← schema 容器（init→resolved 两阶段）
│   ├── CfgSchemaResolver.java ← resolve 全流程
│   ├── StructSchema.java   ← struct 定义
│   ├── TableSchema.java    ← table 定义（主键/entry/唯一键）
│   ├── InterfaceSchema.java ← interface 多态
│   ├── FieldSchema.java    ← 字段定义
│   ├── ForeignKeySchema.java ← 外键定义
│   ├── CfgSchemaAlignToData.java ← schema 对齐到数据（在 data 包但逻辑属 schema）
│   ├── CfgSchemaFilterByTag.java ← 按 tag 过滤 schema
│   ├── CfgSchemaErrs.java  ← schema 错误收集（三级）
│   └── cfg/                ← CFG 文法（9 文件）
│       ├── Cfg.g4          ← ANTLR 文法定义
│       ├── CfgReader.java  ← 文本→schema（只管格式，不管语义）
│       └── CfgWriter.java  ← schema→文本（注释不丢）
│
├── data/                   ← 数据读取（19 文件）
│   ├── CfgDataReader.java  ← 读取编排（两阶段并发）
│   ├── CfgData.java        ← 数据模型（Map<String, DTable>）
│   ├── DTable.java         ← 逻辑表（表头+行+原始sheet）
│   ├── DCell.java          ← 单元格（trim 后的值+行号+列号）
│   ├── ReadByFastExcel.java ← FastExcel 读取（默认）
│   ├── ReadByPoi.java      ← POI 读取（备选）
│   ├── ReadCsv.java        ← CSV/TSV 读取
│   ├── HeadParser.java     ← 表头解析
│   └── CellParser.java     ← 单元格解析
│
├── value/                  ← 值模型（30 文件）
│   ├── CfgValue.java       ← sealed 类型树根
│   ├── CfgValueParser.java ← 值解析编排（表级并发）
│   ├── VTable.java         ← 表值（预建主键/唯一键索引）
│   ├── VStruct.java        ← struct 值
│   ├── VInterface.java     ← interface 值（多态在值层）
│   ├── VText.java          ← 文本值（original+translated）
│   ├── RefValidator.java   ← 外键校验
│   ├── CfgValueErrs.java   ← 值错误收集（两级）
│   └── TextValue.java      ← i18n 直接替换桥
│
├── genjava/                ← Java 代码生成（22 文件）
├── gencs/                  ← C# 代码生成（6 文件）
├── gents/                  ← TypeScript 代码生成（2 文件）
├── gengo/                  ← Go 代码生成（5 文件）
├── genlua/                 ← Lua 代码生成（13 文件）
├── gengd/                  ← GDScript 代码生成（5 文件）
├── genjson/                ← JSON 生成（1 文件）
├── genbytes/               ← 二进制格式（7 文件）
│   ├── BytesGenerator.java ← 生成编排
│   ├── StringPool.java     ← 字符串去重池
│   ├── LangTextPool.java   ← 多语言文本池
│   └── CfgValueSerializer.java ← 值序列化
│
├── write/                  ← 写回管道（16 文件）
│   ├── AddOrUpdateService.java ← 增/改记录
│   ├── DeleteService.java  ← 删记录
│   ├── VTableStorage.java  ← csv/excel 落盘
│   └── VTableJsonStorage.java ← json 落盘
│
├── editorserver/           ← REST API（8 文件）
│   └── EditorServer.java   ← HTTP 服务（虚拟线程池）
│
├── mcpserver/              ← MCP AI 服务（5 文件）
│   └── CfgMcpServer.java   ← MCP 服务端
│
├── tool/                   ← 校验/检索工具（9 文件）
│   ├── ValueVerifyTool.java ← -gen verify
│   └── ValueInspectTool.java ← -gen search
│
├── i18n/                   ← 国际化基础设施（7 文件）
├── geni18n/                ← 国际化文件生成（9 文件）
├── genbyai/                ← AI 辅助生成（8 文件）
└── util/                   ← 工具类（18 文件）
    ├── JteEngine.java      ← 模板引擎
    ├── CachedFiles.java    ← 缓存输出/清理
    └── Logger.java         ← 日志/profile
```

### 3.2 cfgeditor (前端) 代码地图

```
cfgeditor/src/
│
├── api/                    ← HTTP 层（最底层）
│   ├── apiClient.ts        ← fetch 封装
│   ├── recordModel.ts      ← /record API
│   ├── schemaModel.ts      ← /schemas API
│   ├── searchModel.ts      ← /search API
│   └── noteModel.ts        ← /notes API
│
├── domain/                 ← 纯逻辑（无副作用）
│   ├── schema.ts           ← Schema 类型系统封装
│   ├── entityModel.ts      ← Entity 联合类型（视图模型）
│   ├── embedding.ts        ← 字段折叠/内嵌
│   ├── undoStack.ts        ← Undo/Redo 栈
│   ├── json.ts             ← 存储类型定义
│   └── storageJson.ts     ← 自动生成（勿手改）
│
├── store/                  ← 状态机制
│   ├── store.ts            ← 全局状态
│   ├── storage.ts          ← 持久化
│   └── resso.ts            ← vendored Resso
│
├── services/               ← 服务层
│   ├── editingSession.ts   ← 编辑会话（核心）
│   ├── queryKeys.ts        ← React Query keys
│   ├── queryClient.ts      ← React Query 配置
│   └── clipboard.ts        ← 剪贴板
│
├── flow/                   ← 图与编辑
│   ├── FlowGraph.tsx       ← React Flow 画布
│   ├── EntityCard.tsx      ← 实体卡片
│   └── layout/             ← ELK 布局引擎
│
├── res/                    ← 资源工具
│   └── resUtils.ts         ← 视频/音频/图片预览
│
├── features/               ← 业务页面
│   ├── record/             ← 记录编辑
│   ├── table/              ← 表浏览
│   ├── finder/             ← 查找器
│   ├── add/                ← 新增（含 AI Chat）
│   └── setting/            ← 设置
│
└── app/                    ← 入口与壳
    ├── AppLoader.tsx       ← 应用加载
    ├── CfgEditorApp.tsx    ← 主应用
    └── i18n.ts             ← 国际化（en/zh）
```

### 3.3 深入阅读路线

| 想了解 | 从哪开始读 |
|---|---|
| cfggen 整体架构 | `docs/01-architecture-overview.md` |
| CFG schema 语法 | `docs/src/content/docs/core/schema.mdx` |
| Schema 解析器内部 | `docs/02-schema-and-cfg.md` |
| 数据读取 | `docs/03-data-reading.md` |
| 值模型和外键 | `docs/04-value-model.md` |
| 代码生成和扩展 | `docs/05-codegen-and-extension.md` |
| 二进制格式 | `docs/06-bytes-format.md` |
| 写回管道 | `docs/07-write-back-and-servers.md` |
| 错误和校验 | `docs/08-errors-and-validation.md` |
| 国际化 | `docs/09-i18n.md` |
| 开发调试流程 | `docs/10-dev-workflow.md` |
| cfgeditor 源码 | `cfgeditor/docs/README.md` |

## 4. 常见开发任务

### 4.1 修改 Schema 并重新生成

```bash
# 1. 修改 .cfg 文件（如 example/config/config.cfg）
# 2. 重新生成代码
cd example/java
genjava.bat         # Windows
# 或
npx cfggen -datadir ../config -gen java,dir:.

# 3. 验证
run.bat
```

### 4.2 添加新的生成语言

1. 新建 `gen<lang>` 包，写 `XxxCodeGenerator extends Generator`
2. 构造函数里声明参数：`dir = parameter.get("dir", ".")`
3. 实现 `generate(ctx)`：`ctx.makeValue(tag)` → 建 Model → `JteEngine.render("lang/Xxx.jte", model, ps)`
4. 模板放 `packages/gen/templates/lang/`
5. 在 `Main.registerAllProviders` 加一行 `Generators.addProvider("lang", XxxCodeGenerator::new)`
6. 重新 `pnpm -r build`

> 参考 `gencs/CsCodeGenerator.java` 作为代表性实现。

### 4.3 修改代码生成模板

```bash
# 模板位置
packages/gen/templates/

# 开发期动态编译（改完立即见效）
npx cfggen -datadir ../example/config -gen cs,dir:../example/cs

# 发布前必须重新构建
pnpm -r build
```

### 4.4 修改前端编辑器

```bash
cd cfgeditor

# 启动服务模式
npx cfggen -datadir ../example/config -gen server,watch=1

# 启动前端开发服务器
pnpm run dev
# 改代码后浏览器自动刷新

# 检查分层依赖
pnpm run lint
```

### 4.5 运行示例项目

```bash
# 一键运行全部示例
cd example
gen_run.bat

# 单独运行某个语言
cd example/java
genjava.bat && run.bat
```

### 4.6 启动 MCP 服务（给 AI 用）

```bash
# 启动 MCP 服务（端口 3457）
npx cfggen -datadir example/config -gen mcpserver

# AI 工具可调用：SchemaTool, ReadRecordTool, WriteRecordTool, SearchTool
```

## 5. 调试技巧

### 5.1 性能 Profile

```bash
# 打印每步耗时和内存
npx cfggen -datadir config -gen java -p

# 更稳定的内存数（先 gc）
npx cfggen -datadir config -gen java -pp

# 详细统计
npx cfggen -datadir config -gen java -v    # verbose
npx cfggen -datadir config -gen java -vv   # very verbose
```

> 关键原则：看 `-p` 的工作秒/分配量，不要看墙上时间（server 场景噪声 ±50%）。

### 5.2 错误排查

```bash
# 校验配置引用完整性
npx cfggen -datadir config -gen verify

# 搜索配置
npx cfggen -datadir config -gen search

# 关闭警告
npx cfggen -datadir config -gen java -nowarn

# 显示弱警告
npx cfggen -datadir config -gen java -weakwarn
```

错误分三级：
- **Err**：致命，阻塞生成
- **Warn**：默认显示（`-nowarn` 关闭），如"struct 没被引用"
- **WeakWarn**：默认关闭（`-weakwarn` 开），如"tag 过滤丢了外键"

### 5.3 调试 Schema 对齐

如果 `config.cfg` 被自动改写（字段增删），这是正常行为：

```
Context 构造时比较 schema 与 alignedSchema：
  → 不一致 + autoFix 开启 → 写回 config.cfg → reload → 重跑
  → 仍不一致 → 报错抛出
```

### 5.4 调试编辑器 API

```bash
# 启动服务模式
npx cfggen -datadir example/config -gen server,watch=1

# 直接调用 API
curl http://localhost:3456/schemas
curl "http://localhost:3456/record?table=task&id=1"
curl "http://localhost:3456/search?q=武器"
```

### 5.5 常见 Gotcha

| 问题 | 原因 | 解决 |
|---|---|---|
| 模板不生效 | 改模板后没重新构建 | `pnpm -r build` |
| GDScript 属性看起来像无限递归 | Godot 4.x 标准语法 | 不要改，引擎自动处理 |
| ts 生成器不清理旧文件 | 刻意行为（dstDir 是用户项目根） | 不要照搬 cs/lua 的清理 |
| Node.js 兼容性警告 | 某些依赖用了实验性 API | 已配置，看到正常 |
| 同名 json 跨目录冲突 | 如 `_skill_buff` 和 `skill/_buff` | 不能同时存在 |
| pnpm 版本不匹配 | monorepo 需要 pnpm 9+ | 用 `npm i -g pnpm@9` 升级 |
| `storageJson.ts` 不能手改 | quicktype 自动生成 | 改 `json.ts` 后跑 `genJsonParser.bat` |

## 6. 项目约定

### 6.1 命名规范

| 类型 | 命名模式 | 示例 |
|---|---|---|
| 生成器 | `XxxCodeGenerator` | `JavaCodeGenerator` |
| 工具 | `XxxTool` | `XmlToCfgTool` |
| 工具类 | `XxxUtil` | `FileNameUtil` |
| 序列化器 | `XxxSerializer` / `XxxDeserializer` | `CfgValueSerializer` |

### 6.2 文档约定

- 各子目录的 `CLAUDE.md` 是 AI 速查硬事实
- 各子目录的 `README.md` 是构建和使用说明
- `docs/` 是开发者向源码设计文档
- `cfgeditor/docs/` 是前端源码设计文档
- `docs/src/content/docs/` 是用户向文档

### 6.3 示例数据

| 目录 | 用途 |
|---|---|
| `example/config/` | 多语言代码生成测试配置 |
| `example/java/` ... `example/gd/` | 各语言生成结果 |
| `samples/buff/` | 技能系统（星际 ABE 架构） |
| `samples/trigger/` | 触发器系统 |
| `samples/video/` | 剧情对话系统 |
| `samples/test/` | CFG 语法特性测试 |

## 7. 版本与变更

项目遵循 [语义化版本](https://semver.org/lang/zh-CN/) 和 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 标准。

当前版本：v1.4.0（2026-07-20），主要变更见 `CHANGELOG.md`。

关键里程碑：
- v1.0.0 (2023-10)：CFG 解析器、多语言生成、编辑器服务、外键校验
- v1.1.0 (2025-04)：MCP 服务器、AI 聊天、AI 翻译、可视化节点
- v1.3.0 (2026-02)：GenVerifier、Claude Code 插件、未引用记录查看
- v1.4.0 (2026-07)：GDScript、并发化优化、undo/redo、Schema 级 Enum

> AI生成