---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '0a3e20be-4ce3-4383-8e38-e285bd41a9a3'
  PropagateID: '0a3e20be-4ce3-4383-8e38-e285bd41a9a3'
  ReservedCode1: '632f1322-2400-4420-9f24-8227242d8c8c'
  ReservedCode2: '632f1322-2400-4420-9f24-8227242d8c8c'
---

# TypeScript 全面重写设计文档

> 日期：2026-08-24
> 状态：已批准
> 决策者：用户

## 1. 目标

移除 Java 后端（`app/` 目录，271 个 Java 文件 + 39 个 JTE 模板），用 TypeScript 全面重写全部逻辑。编辑器通过 Tauri FS API 直接操作本地目录，零 Java 依赖。

## 2. 技术选型

| 决策点 | 选择 | 理由 |
|---|---|---|
| 架构方案 | pnpm Monorepo | 清晰分层，CLI 和编辑器共享 core，独立测试 |
| Excel 读写 | ExcelJS | 纯 JS，读写 xlsx，社区活跃 |
| CSV 读写 | csv-parse | 轻量纯 TS |
| CFG 语法解析 | 手写递归下降解析器 | CFG 语法不复杂，无依赖，易于调试 |
| 代码模板 | TS 模板字符串 | 零依赖，完全控制格式 |
| MCP 服务 | @modelcontextprotocol/sdk (TS) | 官方 SDK |
| AI 辅助 | openai SDK (TS) | 项目已依赖 |
| XML 解析 | fast-xml-parser | 替代 Java DOMUtil |
| 文件监听 | chokidar | 替代 Java WatchService |
| 并发 | worker_threads | 替代 Java invokeAll |
| 测试 | Vitest (已有) + TDD 强制 | 与前端统一 |

## 3. Monorepo 结构

```
cfggen/
├── pnpm-workspace.yaml
├── packages/
│   ├── schema/          # CFG 语法解析 + 类型系统 (替代 schema/ 48 文件)
│   ├── data/             # Excel/CSV/JSON 读取 (替代 data/ 19 文件)
│   ├── value/            # 值模型 + 外键校验 (替代 value/ 30 文件)
│   ├── context/          # Context 协调 + 缓存 (替代 ctx/ 6 文件)
│   ├── gen/              # 多语言代码生成 (替代 gen*/ 68 文件 + 39 JTE)
│   ├── i18n/             # 国际化基础设施 (替代 i18n/ 7 文件)
│   ├── write/            # 写回管道 (替代 write/ 16 文件)
│   ├── editor-core/      # 编辑器服务 (替代 editorserver/ 10 文件，直接函数调用)
│   ├── mcp/              # MCP 服务 (替代 mcpserver/ 5 文件)
│   ├── cli/              # 命令行入口 (替代 gen/Main.java 13 文件)
│   └── shared/           # 共享工具 (替代 util/ 18 文件)
├── cfgeditor/            # 前端编辑器 (api层改为 Tauri IPC)
├── example/              # 测试数据 (保留)
├── samples/              # 示例配置 (保留)
└── docs/                 # 文档 (更新)
```

### 包依赖图 (单向，ESLint 强制)

```
cli / editor-core / mcp  →  context  →  value  →  data  →  schema  →  shared
                                              ↘          ↗
                                               i18n
gen  →  context
write  →  context
```

## 4. 各包设计

### 4.1 packages/schema

替代 Java `schema/` (48 文件) + `schema/cfg/` (10 文件)。

#### 手写 CFG 解析器

```
src/
├── parser/
│   ├── lexer.ts          # 词法分析器 (替代 CfgLexer.java)
│   ├── parser.ts          # 递归下降解析器 (替代 CfgParser.java)
│   ├── CfgReader.ts       # 文本→AST (替代 CfgReader.java)
│   ├── CfgWriter.ts       # AST→文本 (替代 CfgWriter.java，注释往返不丢)
│   └── CommentUtil.ts     # 注释处理
├── model/
│   ├── CfgSchema.ts       # schema 容器 (init→resolved 两阶段)
│   ├── CfgSchemaResolver.ts  # resolve 全流程 (6步 + 预计算 + 收尾)
│   ├── StructSchema.ts
│   ├── TableSchema.ts
│   ├── InterfaceSchema.ts
│   ├── FieldSchema.ts
│   ├── ForeignKeySchema.ts
│   ├── KeySchema.ts
│   ├── Metadata.ts
│   ├── CfgSchemaErrs.ts  # 错误收集 (Err/Warn/WeakWarn 三级)
│   ├── CfgSchemaFilterByTag.ts
│   └── CfgSchemaAlignToData.ts
├── xml/
│   └── XmlReader.ts       # XML→schema (用 fast-xml-parser)
└── index.ts
```

词法 Token (从 .g4 提取)：
- 关键字：struct, interface, table, enum, list, map
- 基础类型：bool, int, long, float, str, text
- 符号：->, =>, =, (, ), [, ], {, }, ., ,, :, +, -
- 注释：// ... (行注释，保留到 AST 中用于往返不丢)
- 字面量：整数、浮点、十六进制、字符串、布尔

AST 结构：
```typescript
interface SchemaAst {
  structs: StructDecl[];
  interfaces: InterfaceDecl[];
  tables: TableDecl[];
  enums: EnumDecl[];
}
```

resolve 流程 (完全移植 Java 逻辑)：
| 步骤 | 做什么 |
|---|---|
| step0 | impl 挂到 interface；表名小写；命名空间冲突检查；建索引 |
| step1 | 解析字段类型 StructRef |
| step2 | 校验 interface/table |
| step3 | 解析外键 |
| step4 | fmt 约束 |
| step5 | 未引用 struct/interface 警告 |
| 预计算 | 无错时算 Span/HasRef/HasBlock/HasMap/HasText |
| 收尾 | 全程无错才 setResolved() |

测试策略 (TDD)：
- 词法测试：各种 token 边界
- 解析测试：用 samples/test/ 的 CFG 文件做 fixture
- 往返测试：读 → 写 → 读 → 断言 AST 相等 (注释不丢)
- resolve 测试：各种错误场景

### 4.2 packages/data

替代 Java `data/` (19 文件)。

```
src/
├── CfgDataReader.ts       # 读取编排 (两阶段，worker_threads 并发)
├── CfgData.ts              # 数据模型 (Map<string, DTable> + 统计)
├── DTable.ts               # 逻辑表
├── DField.ts              # 表头一列
├── DCell.ts                # 单元格
├── DRawSheet.ts            # 原始 sheet/csv
├── readers/
│   ├── ExcelReader.ts      # ExcelJS 读取 (替代 ReadByFastExcel + ReadByPoi)
│   ├── CsvReader.ts        # csv-parse 读取
│   └── JsonReader.ts       # JSON 读取
├── HeadParser.ts           # 表头解析 (行/列模式)
├── CellParser.ts           # 单元格解析
└── index.ts
```

关键决策：
- ExcelJS 同时提供读和写能力，统一替代 FastExcel + POI
- CSV 用 csv-parse (轻量纯 TS)
- 并发用 worker_threads 替代 Java invokeAll

### 4.3 packages/value

替代 Java `value/` (30 文件)。

```
src/
├── CfgValue.ts              # 判别联合类型树
├── CfgValueParser.ts        # 值解析编排
├── VTable.ts                 # 表值 (预建主键/唯一键索引 O(1))
├── VTableParser.ts           # Excel/CSV 值解析
├── VTableJsonParser.ts       # JSON 值解析
├── VStruct.ts / VInterface.ts / VList.ts / VMap.ts
├── VBool.ts / VInt.ts / VLong.ts / VFloat.ts / VString.ts / VText.ts
├── RefValidator.ts           # 外键校验 (跨表，收集不抛)
├── CfgValueErrs.ts           # 值错误收集 (Err/Warn 两级)
├── SearchService.ts          # 搜索服务
├── ValueToJson.ts / ValueToCsv.ts  # 值→JSON/CSV 转换
├── TextValue.ts              # i18n 直接替换桥
└── index.ts
```

TS sealed 类型用判别联合实现：
```typescript
type Value = SimpleValue | ContainerValue;
type SimpleValue = CompositeValue | PrimitiveValue;
type CompositeValue = VStruct | VInterface | VList | VMap;
type PrimitiveValue = VBool | VInt | VLong | VFloat | StringValue;
type StringValue = VString | VText;
```

### 4.4 packages/context

替代 Java `ctx/` (6 文件)。

```
src/
├── Context.ts              # 核心协调者：持有 cfgSchema/cfgData/缓存值
├── ContextCfg.ts           # 配置参数 (dataDir/headRow/encoding/i18n等)
├── DirectoryStructure.ts    # 数据目录扫描
├── WatchAndPostRun.ts      # 文件监听 + postrun 钩子 (chokidar)
├── CfgFileInfo.ts          # 文件信息
├── ValueEnv.ts             # 值解析环境参数
└── index.ts
```

makeValue 缓存规则完全移植：tag 匹配 + allowErr 方向安全。

### 4.5 packages/gen

替代 Java 10 个 gen* 包 (~68 文件) + 39 个 JTE 模板。最大工作量。

```
src/
├── Generator.ts              # 生成器基类
├── Generators.ts              # 生成器注册表
├── generators/
│   ├── java/                  # Java 代码生成 (13 模板 → TS 模板函数)
│   ├── cs/                    # C# 代码生成 (7 模板)
│   ├── ts/                    # TypeScript 代码生成 (7 模板)
│   ├── go/                    # Go 代码生成 (7 模板)
│   ├── lua/                   # Lua 代码生成
│   ├── gd/                    # GDScript 代码生成 (3 模板)
│   ├── json/                  # JSON 数据生成
│   ├── bytes/                 # 二进制格式生成 (7 文件)
│   ├── byai/                  # AI 辅助生成 (8 文件，用 openai SDK)
│   └── i18n/                  # 国际化文件生成 (9 文件)
├── templates/                # TS 模板字符串 (替代 jte/ 目录)
│   ├── java/ cs/ ts/ go/ lua/ gd/
│   └── shared/               # 共享模板片段
├── models/                   # 各语言 Model 类
├── CachedFiles.ts            # 缓存输出 + 过期文件清理
└── index.ts
```

模板渲染策略 (JTE → TS 模板字符串函数)：
```typescript
export function renderStruct(model: StructModel, indent = 0): string {
  return `${spaces(indent)}public class ${model.name} {
${model.fields.map(f => renderField(f, indent + 1)).join('\n')}
${spaces(indent)}}`;
}
```

二进制格式 (genbytes) 完全用 TS Buffer/DataView 实现，小端序，格式不变：
1. Schema (int=0 无 schema；>0 后跟字节)
2. StringPool (int count + length-prefixed UTF-8)
3. LangTextPool (int langCount + 每语言 TextPool)
4. 表数据 (int tableCount + 逐表 name+length+bytes)

注册表：
```typescript
Generators.addProvider('java', JavaCodeGenerator);
Generators.addProvider('cs', CsCodeGenerator);
// ... 同 Java 16 个注册项
```

### 4.6 packages/i18n

替代 Java `i18n/` (7 文件)。

两种模式 (互斥)：直接替换 (-i18nfile) / 可切换 (-langswitchdir)。
两种键策略：byId (主键 + fieldChain) / byValue (原文本身)。

### 4.7 packages/write

替代 Java `write/` (16 文件)。

```
src/
├── AddOrUpdateService.ts       # 增/改记录 → 落盘 → 重建值
├── DeleteService.ts            # 删记录
├── ValueUpdater.ts             # 值更新器
├── ValueToSepStr.ts            # 值→分隔字符串
├── TableFileLocator.ts         # 表文件定位
├── TableFile.ts                # 表文件接口
├── storages/
│   ├── VTableStorage.ts        # csv/excel 落盘 (ExcelJS 写)
│   ├── VTableJsonStorage.ts    # json 落盘
│   ├── CsvTableFile.ts         # CSV 表文件
│   └── ExcelTableFile.ts       # Excel 表文件
├── RecordBlock.ts              # 记录块
├── RecordBlockMapper.ts       # 记录块映射
└── index.ts
```

### 4.8 packages/editor-core

替代 Java `editorserver/` (10 文件)。**最关键的架构变化**：HTTP REST → 直接函数调用。

```
src/
├── EditorService.ts            # 核心服务
├── SchemaService.ts            # schema 概览
├── RecordService.ts            # 取记录
├── RecordEditService.ts       # 增/改记录
├── RecordRefIdsService.ts     # 引用图
├── SchemaWriteService.ts      # schema 文本读写
├── TableCreateService.ts      # 建表
├── CheckJsonService.ts        # 校验 JSON
├── PromptService.ts           # AI prompt
├── NoteEditService.ts         # 备注
├── SearchService.ts           # 搜索
└── index.ts
```

API 映射表 (HTTP → 函数调用)：
| 原 REST API | 新函数签名 |
|---|---|
| GET /schemas | getSchemas(dataDir): Promise<RawSchema> |
| GET /record?table=&id=&depth= | getRecord(dataDir, table, id, depth): Promise<RecordResult> |
| POST /recordAddOrUpdate?table= | addOrUpdateRecord(dataDir, table, json): Promise<RecordEditResult> |
| POST /recordDelete?table=&id= | deleteRecord(dataDir, table, id): Promise<RecordEditResult> |
| GET /recordRefIds?table=&id=&in=&out= | getRecordRefIds(dataDir, table, id, inDepth, outDepth, maxIds): Promise<RecordRefIdsResult> |
| GET /search?q=&max= | search(dataDir, q, max): Promise<SearchResult> |
| GET /schemaText | getSchemaText(dataDir): Promise<SchemaTextResult> |
| POST /schemaWrite | writeSchemaText(dataDir, cfgText): Promise<SchemaWriteResult> |
| POST /createTable | createTable(dataDir, request): Promise<CreateResult> |
| POST /checkJson?table= | checkJson(dataDir, table, raw): Promise<CheckJsonResult> |
| GET /prompt?table= | getPrompt(dataDir, table): Promise<PromptResult> |
| GET /notes | getNotes(dataDir): Promise<Notes> |
| POST /noteUpdate?key= | updateNote(dataDir, key, note): Promise<NoteEditResult> |

关键决策：
- 函数签名保持与 HTTP API 的参数/返回值一致，前端类型定义不变
- dataDir 替代了原来 HTTP 请求隐含的 server 端目录
- Context 实例按 dataDir 缓存，避免重复读取

### 4.9 packages/mcp

替代 Java `mcpserver/` (5 文件)。

```
src/
├── CfgMcpServer.ts             # MCP 服务端 (@modelcontextprotocol/sdk, stdio)
├── SchemaTool.ts               # 查表结构
├── ReadRecordTool.ts           # 读记录
├── WriteRecordTool.ts          # 增/改/删记录
├── SearchTool.ts               # 搜索
└── index.ts
```

### 4.10 packages/cli

替代 Java `gen/Main.java` + `gen/` (13 文件)。

```
src/
├── Main.ts                      # main() 入口，注册插件，解析参数
├── ParameterParser.ts           # 参数解析 (边读边 remove + assureNoExtra)
├── Help.ts                      # -h 帮助
└── index.ts                     # CLI 入口 (#!/usr/bin/env node)
```

CLI 用法不变：
```bash
npx cfggen -datadir example/config -gen java,dir:.
npx cfggen -datadir config -gen verify
npx cfggen -datadir config -gen bytes
```

### 4.11 packages/shared

替代 Java `util/` (18 文件)。

```
src/
├── TemplateEngine.ts            # 模板引擎 (简化为 TS 模板函数)
├── CachedFiles.ts               # 缓存输出/清理
├── CachedIndentPrinter.ts      # 缓存打印机
├── CachedFileOutputStream.ts   # 缓存文件输出流
├── Logger.ts                    # 日志 + 性能 profile
├── FileNameUtil.ts              # 文件命名
├── UnicodeReader.ts             # BOM 自动识别
├── CSVUtil.ts                   # CSV 工具
├── LocaleUtil.ts                # 语言代码工具
├── ListParser.ts                # 列表解析
├── StringUtil.ts                # 字符串工具
├── BomUtf8Writer.ts             # BOM UTF-8 写入
└── index.ts
```

## 5. 前端改造

### 5.1 cfgeditor/src/api/ 层改造

核心变化：apiClient.ts 从 axios HTTP 调用改为 Tauri IPC command 调用。

```typescript
// 改造前 (HTTP):
const { data } = await httpClient(server).get<RawSchema>('/schemas', { signal });
return data;

// 改造后 (Tauri IPC):
import { invoke } from '@tauri-apps/api/core';
export async function fetchSchema(dataDir: string, signal: AbortSignal): Promise<RawSchema> {
    return invoke<RawSchema>('get_schemas', { dataDir });
}
```

改造清单：
| 文件 | 行数 | 改造内容 |
|---|---|---|
| apiClient.ts (179行) | 全部重写 | axios → invoke，~20 个函数签名改为 Tauri command |
| recordModel.ts (102行) | 不变 | 类型定义保留 |
| schemaModel.ts (93行) | 不变 | 类型定义保留 |
| noteModel.ts (25行) | 不变 | 类型定义保留 |
| chatModel.ts (19行) | 不变 | 类型定义保留 |
| searchModel.ts (15行) | 不变 | 类型定义保留 |

关键决策：
- recordModel.ts 等 5 个类型文件完全不变——数据契约保持一致，编辑器上层代码零改动
- apiClient.ts 函数签名尽量保持一致 (参数名/返回值类型)，只把 server: string 换成 dataDir: string
- 不再需要 server 配置——前端设置面板改为选择本地目录 (Tauri dialog)

### 5.2 Tauri 通信架构

```
前端组件 → apiClient.ts (invoke) → Tauri IPC → editor-core (TS，运行在 Tauri JS 环境)
    → @tauri-apps/plugin-fs (读写文件) → 本地目录
```

### 5.3 设置面板改造

| 原设置 | 新设置 |
|---|---|
| ConnectionSetting.tsx (输入 server URL) | 改为目录选择器 (Tauri dialog open directory) |
| AiSetting.tsx | 不变 |
| BasicSetting.tsx | 去掉 server 相关配置 |
| TauriSetting.tsx | 不变 |

### 5.4 tauri.conf.json 改造

```json
{
  "bundle": {
    "resources": []  // 去掉 cfggen.jar 和 jre/
  }
}
```

桌面应用体积从 ~80MB 降到 ~15MB。

### 5.5 Docker 部署方案

- 桌面应用 (Tauri exe)：自带全部逻辑，零依赖
- Docker 部署：前端 + Node.js 运行时 (node server.js 用 Express 提供 SSR + editor-core 函数调用)

### 5.6 分层依赖规则更新

oxlint 规则更新——api/ 层从"只能 import 外部库"变为"可以 import @cfggen/editor-core"：

```json
{
  "files": ["src/api/**"],
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": ["@/domain/**", "@/store/**", "@/flow/**",
                    "@/features/**", "@/res/**", "@/services/**"]
    }]
  }
}
```

去掉对 @cfggen/editor-core 的限制 (不在 patterns 中)，其余不变。

## 6. 实施策略

### 6.1 迁移顺序 (自底向上，每步可测)

```
Phase 1:  packages/shared     (工具函数，无依赖)
Phase 2:  packages/schema     (CFG解析+类型系统，依赖 shared)
Phase 3:  packages/data       (Excel/CSV/JSON读取，依赖 schema+shared)
Phase 4:  packages/value      (值模型+外键校验，依赖 data+schema+shared)
Phase 5:  packages/i18n        (国际化，依赖 schema+shared)
Phase 6:  packages/context    (协调者，依赖以上所有)
Phase 7:  packages/write      (写回管道，依赖 context+data+shared)
Phase 8:  packages/gen         (代码生成，依赖 context，最大工作量)
Phase 9:  packages/editor-core (编辑器服务，依赖 context+write+value)
Phase 10: packages/cli        (命令行入口，依赖以上所有)
Phase 11: packages/mcp        (MCP服务，依赖 editor-core)
Phase 12: cfgeditor 改造      (api层改 Tauri IPC)
Phase 13: 清理               (删除 app/ Java代码、cfggen.jar、JRE)
```

### 6.2 TDD 强制策略

每个 Phase 的每个模块：
1. 先写测试 (用 samples/ 和 example/ 的真实配置做 fixture)
2. 看测试失败
3. 实现代码
4. 看测试通过
5. commit

测试覆盖率目标：每个包 >= 80% (Vitest + c8)

### 6.3 回归验证策略

每个 Phase 完成后，用 example/config 的真实数据做端到端验证：
- Phase 2 完成：解析 example/config/config.cfg → 验证 AST 与 Java 版输出一致
- Phase 4 完成：读取 Excel → 解析值 → 验证外键校验结果与 Java 版一致
- Phase 8 完成：生成代码 → 与 Java 版生成的代码 diff (允许格式差异，逻辑等价)
- Phase 9 完成：编辑器 API → 所有前端操作 (浏览/编辑/搜索/建表) 功能验证

### 6.4 分支策略

```
master (保留当前 Java 代码，可继续维护)
└── refactor/ts-rewrite (新分支，渐进式迁移)
    └── 每个 Phase 完成后合并到 ts-rewrite
```

不删除 Java 代码直到 Phase 13 (全部验证通过后才删除 app/)。

### 6.5 依赖包版本

| 包 | 版本 |
|---|---|
| TypeScript | 7.x (项目已有) |
| ExcelJS | ^4.4.0 |
| csv-parse | ^5.6.0 |
| @modelcontextprotocol/sdk | ^1.0.0 |
| openai | ^6.45.0 (项目已有) |
| vitest | ^4.1.10 (项目已有) |
| fast-xml-parser | ^4.5.0 |
| chokidar | ^4.0.0 |

### 6.6 保留不变的部分

| 组件 | 原因 |
|---|---|
| example/ | 测试数据，作为 TS 版的 fixture |
| samples/ | 实际游戏配置示例 |
| docs/ 用户文档 | 架构变化但用户使用方式不变 |
| cfgdev/ | Claude Code 插件和 VSCode 扩展独立于实现语言 |
| cfgeditor 前端 (除 api 层) | 8 层架构、React Flow、Ant Design 等不变 |
| .github/workflows/ | CI/CD 需更新但结构保留 |

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| ExcelJS 与 FastExcel/POI 读取结果不一致 | Phase 3 完成后用 example/config 逐表 diff |
| 手写解析器遗漏 CFG 语法边界 | 用 samples/test/ 全覆盖 + 往返测试 |
| 二进制格式字节级不一致 | Phase 8 逐字节 diff config.bytes |
| Tauri IPC 通信延迟 vs HTTP | 实测对比，IPC 通常更快 (无网络栈) |
| TS 代码生成输出与 Java 版差异 | 允许格式差异，编译/运行等价即可 |
| 大表性能 (worker_threads vs Java 线程池) | 性能基准测试，必要时优化 |

> AI生成