---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '6e449eea-bd05-475e-8b98-9f3976045270'
  PropagateID: '6e449eea-bd05-475e-8b98-9f3976045270'
  ReservedCode1: 'e92df2bd-5eda-4394-ba9a-24492f990c93'
  ReservedCode2: 'e92df2bd-5eda-4394-ba9a-24492f990c93'
---

# 更新日志

本项目采用 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 标准，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。


### [Unreleased]

### [v0.2.0] - 2026-08-30

UI 全面审查修复与启动性能优化。

#### Fixed
- **UI 全面审查修复**：修复侧栏与节点标题爆框（`PathNotFound` 布局）、删除 `TauriSetting` 重复的 `Form.Item`、`Chat/AddJson/ShortcutSetting` 视觉一致性、`notification` 硬编码英文国际化（4 处改为 i18n）。
- **vitest 超时**：editor-core 改为动态 `import()` 懒加载后，首次初始化需加载约 1.6MB 依赖树，超过 vitest 默认 `hookTimeout` 10s，在 `vitest.config.ts` 增加 `hookTimeout: 30_000`。
- **测试与实现不一致**：`AppLoader.test.ts` 仍描述旧的串行等待逻辑，同步更新 `shouldEnableEditorInit` 签名、Phase 3 断言与三阶段依赖链描述。

#### Changed
- **启动性能优化**：`vite.config.ts` `manualChunks` 拆分 `antd-vendor` / `react-vendor`；新建 `editorCoreLoader.ts` 将 `apiClient.ts` 中 16 个运行时类静态导入改为动态 `import()`；`AppLoader` 瀑布流并行化（`readStoreStateOnce` 完成后同步设 `dataDir`，资源扫描与建库并行）；`HeaderBar` valueErrs 校验延迟到 schema 加载后（`enabled: !!schema`）。
- 首屏加载量从约 3.26MB 降至约 413KB（gzip 131KB），减少约 87%。

### [v1.6.0] - 2026-08-27

Tauri WebView 异步架构支持与 Docker 镜像发布。

#### Added
- **Docker 镜像支持**：新增 `Dockerfile`（多阶段构建：Node 构建前端 → Nginx 提供静态文件）和 `docker.yml` GitHub Actions 工作流，push tag 自动发布到 GHCR（`ghcr.io/zhao-zg/cfgforge`）。
- **Tauri 异步路径**：`Context` 新增异步初始化路径（`createWithStructure` async + `initAsync` + `readSchemaAndDataAsync` + `makeValueWithTagAndAllowErrAsync`），通过 `CfgFileSystem` 抽象层支持 Tauri WebView 环境；`isSyncSupported` 自动选择同步/异步路径，CLI/测试环境行为不变。
- **TauriFileSystem**：实现 `CfgFileSystem` 接口的 Tauri WebView 适配层，通过 `@tauri-apps/plugin-fs` 实现文件 I/O。
- **DirectoryStructure.createAsync**：异步扫描目录结构，支持 Tauri 环境。
- **CachedFiles.writeFileAsync / deleteAsync**：异步文件写入和删除，走 `CfgFileSystem` 抽象。
- **CsvReader.readCsvAsync**：异步 CSV 读取，支持 Tauri 环境。
- **CfgSchemas.writeToDirAsync**：异步 schema 写入，autoFix 在 Tauri 环境可用。
- **EditorService**：`initFromContext` 改为异步（`makeValueWithTagAndAllowErrAsync`），`resolveDataDir` 使用 `CfgFileSystem.resolvePath` 替代 Node `path.resolve`。
- **AppLoader**：新增 `editorInitQuery`（React Query），在 `resInfoQuery` 完成后初始化 EditorService，避免 CfgEditorApp 在 editor 为 null 时调 fetchSchema 报错。
- **ExportService**：CSV + SQL 导出功能，ToolsSetting 新增导出按钮。
- **PathUtil**：跨平台路径工具模块（`join`/`dirname`/`basename`/`normalize`），不依赖 Node `path` 模块。
- **Logger console printer**：Tauri 环境下用 `console.log` 替代 `process.stdout.write`，避免 `ReferenceError: process is not defined`。
- **scan-xlsx-to-cfg 脚本**：自动扫描目录下所有 xlsx 文件生成 `config.cfg`。
- **测试覆盖**：新增 `TauriFileSystem.test.ts`、`MockTauriFileSystem.test.ts`、`ContextAsync.test.ts`、`ExcelReaderTauri.test.ts`、`CfgValueParserAsync.test.ts`、`PathUtil.test.ts` 等测试文件。

#### Changed
- `HeadParser`：`SplitDataHeaderNotEqual` 从 error 降级为 warning（`addErr` → `addWarn`），避免多 sheet 表头差异阻止加载；warn 对象添加 `_tag` 和 `msg()` 满足 `CfgSchemaErrs` 接口。
- `CfgDataReader` / `CfgSchemaErrsLike` 接口：新增 `addWarn` 方法。
- `CfgFileSystem` 接口：新增 `isSyncSupported` 属性、`resolvePath` 方法和 `writeFileAsync` 方法。
- `vite.config.ts`：新增 `path-browserify` 和 `buffer@6` polyfill alias，解决 Tauri WebView 环境 Node 模块缺失问题。
- `main.tsx`：Buffer polyfill、TauriFileSystem 注入、Logger console printer 设置。

#### Fixed
- 修复 Tauri WebView 环境 `process is not defined`：Logger 默认 printer 使用 `process.stdout.write`，在浏览器环境不存在。
- 修复 `getTableNameIndex`：Sheet1 用文件名做表名、Sheet2+ 跳过（原逻辑对非默认 sheet 名使用 `dirname/sheetName`，导致跨文件表名冲突）。
- 修复 `HeadParser` 的 `e.msg is not a function`：warn 对象缺少 `Msg` 接口必需的 `_tag` 和 `msg()` 方法。

新增 Schema 文本编辑器与发布脚本，修复 bat 脚本解析 bug。

#### Added
- Java 生成器新增 `beautifulName` 参数：开启后由 snake_case schema 名派生的标识符统一美化——类名/getter/all 函数名转 PascalCase（`factory_animation_type` -> `FactoryAnimationType`），enum/entry 常量转 SCREAMING_SNAKE_CASE（`ResetDuration`、`Reset_Duration` 都得到 `RESET_DURATION`）；生成器自带的后缀 `_Entry`/`_Detail` 原样保留以区隔包装类/详情类（`equip_config` 的 entry 类为 `EquipConfig_Entry`）；默认关闭保持原 `upper1`/`toUpperCase` 行为。
- SchemaTextEditor 组件：支持 CFG 文本编辑，后端新增 schema 文本读取与写入端点（`EditorServer`/`SchemaWriteService`/`TableCreateService`）。
- `release.bat`：交互式 tag-and-push 发布脚本，触发 GitHub Actions release 工作流。

#### Fixed
- 修复 `release.bat` 中 if 块 echo 行尾多余点号导致 cmd 解析错误的问题。
- 修复 `release.bat` 中 master 同步检查 `for /f` 多 token 解析 bug，简化判断逻辑。

### [v1.4.0] - 2026-07-20

速度优化与编辑器 undo/redo。

#### Added
- 编辑器 undo/redo：撤销/重做按钮与快捷键，值类编辑合并提交，结构操作保持视口稳定（EFitView.KeepStable）
- 大小写不敏感的 impl 去重检测：impl 之间、impl 与 interface 同名（忽略大小写）时报冲突
- GDScript（Godot）代码生成
- Schema 级别 Enum 类型支持，零代码生成器改动
- C# 适配 .NET 9.0 与 Unity，使用 FrozenDictionary
- gen_run.bat：一次性运行全部 example
- Chat 面板显示当前模型名；table 切换时 url 附带上次选中记录 id

#### Changed
- 多语言代码生成并发化，生成耗时显著下降：
  - Java：struct/table 循环并发，~2.8x（0.51→0.18s）
  - C#：render 循环并发，~2.3x（0.23→0.10s）
  - Go / GD：仿 Java/C# 并发化
  - Lua：表生成并发，~1.4x（0.88→0.63s）
- JTE 模板预编译 + schema 并行解析，整体生成耗时 -36%
- i18n 各语言 xlsx 并行读取
- 内存分配优化：hashCode 去 varargs、keyMap 容量预分配，总分配 -15%
- 统一 bytes 序列化格式，多语言共享同一结构与小端字节序
- 编辑器大表/大图渲染优化：schema select 稳定化、列表虚拟滚动、代码分割、elk 布局移入 Web Worker
- cfgforge 无参启动改为打印帮助（原为启动 GUI）

#### Fixed
- cfgforge：Context 缓存竞态与 allowErr 缓存污染
- DirectoryStructure.findTableToJsonFiles：同名表跨目录（如 _skill_buff / skill/_buff）编辑后落盘位置变更，导致下次启动失败

### [v1.3.0] - 2026-02-05

#### Added
- GenVerifier：检查每个 table 中未被引用的 record
- ValueRefInCollector：支持 RefUniq 和 RefList 引用类型
- Metadata `root` 标记：标记根节点表，在未引用检测时忽略
- GuiLauncher：可视化配置生成参数的图形界面
- Claude Code 插件：`/gen-schema` 命令，通过自然语言生成 schema
- 未引用记录查看功能：在配置编辑器中查看未被引用的记录
- CFG 语法增强：支持在 struct、table、interface、field 之前添加行注释

#### Changed
- Java 代码生成：新增 `configgenDir` 参数，自动复制核心 Java 源文件到指定目录
- 字段内嵌显示：简化复杂嵌套结构的展示
- 国际化：补充所有实现 `Msg` 接口的错误/警告类的国际化消息
- API 重构：将 RESTful API 和相关模型移至 `api` 目录
- Store 重构：将 historyModel 移至 `store` 目录

#### Fixed
- C# enumref 生成错误
- Chat 相关功能问题
- 实体表单编辑时的值传递问题
- 未保存记录的检测问题

#### Removed
- BuildSetting 类和 `-usepoi` 参数

### [v1.1.0] - 2025-04-03

#### Added
- MCP 服务器：为 AI 生成配置提供支持
- AI 聊天辅助配置功能：在编辑器中集成 AI 对话
- AI 翻译功能：TodoTranslator 工具
- 结构化数据返回：MCP 服务器返回结构化 schema
- 表结构 schema 读取 API
- 可视化节点配置：可配置节点颜色和可视化设置
- 节点折叠/内嵌显示：简化复杂结构的展示

#### Changed
- 编辑器 UI 结构重构
- GUI locale 处理优化
- RESTful API 和相关模型重构
- 字段内嵌显示逻辑优化
- 节点渲染性能提升

#### Fixed
- 多项编辑器显示和交互问题
- 未保存记录的提示问题

### [v1.0.0] - 2023-10-20

#### Added
- CFG 配置文件解析器：支持 struct、interface、table、list、map 等数据结构
- 多数据源支持：Excel、CSV、JSON
- 多语言代码生成：
  - Java：支持 sealed 类、完整的类型安全访问
  - C#：.NET 平台配置代码
  - TypeScript：前端和 Node.js 的类型化配置
  - Go：Go 语言的结构体生成
  - Lua：Lua 表格式，注重内存大小
- JSON 数据生成器
- 外键引用完整性检查：单向外键（->）和多向外键（=>）
- 编辑器服务器：提供 RESTful API 支持配置编辑器
- 命令行界面：灵活的参数配置
- 数据验证：Schema 验证和数据对齐
- 数据统计：配置数据的使用情况分析
- 并发读取：使用工作窃取线程池优化数据读取性能
- 模板引擎：集成 JTE 模板引擎，支持热加载

#### Changed
- 优化缓存机制
- 支持多级外键引用
- 支持配置过滤和标签

> AI生成