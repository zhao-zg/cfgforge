---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '880f90b8-34d0-4925-8a1f-a7d24b2b7202'
  PropagateID: '880f90b8-34d0-4925-8a1f-a7d24b2b7202'
  ReservedCode1: '13e4c8e3-ac52-4cf4-a344-4b8201d5d250'
  ReservedCode2: '13e4c8e3-ac52-4cf4-a344-4b8201d5d250'
---

# TypeScript 全面重写 — 逐任务实现计划

> 日期：2026-08-24
> 关联设计：`docs/plans/2026-08-24-ts-rewrite-design.md`
> 执行方式：subagent-driven，每个任务 TDD

## 通用约定

- 每个任务：写测试 → 看失败 → 实现 → 看通过 → commit
- 测试 fixture 来源：`samples/test/`（CFG 语法测试）和 `example/config/`（真实配置）
- 包根目录：`packages/<name>/`
- 每个 package 初始化：`pnpm init`，`tsconfig.json`，`vitest.config.ts`
- pnpm workspace 根：`pnpm-workspace.yaml` 列出 `packages/*`

---

## Phase 0: Monorepo 初始化

### T0.1 创建 pnpm workspace 骨架
- 创建 `pnpm-workspace.yaml`（packages: ['packages/*']）
- 创建根 `tsconfig.base.json`（ESM, target ES2022, strict）
- 创建根 `package.json`（scripts: test/build/lint）
- commit

### T0.2 创建 packages/ 目录和 12 个包骨架
- 每个 package：`package.json` + `tsconfig.json` + `src/index.ts` + `src/__tests__/`
- commit

### T0.3 配置 ESLint 分层依赖强制规则
- 根 `.eslintrc.js` 配置 `no-restricted-imports`，按设计文档包依赖图
- 测试：写一个反向 import 看是否被拦
- commit

---

## Phase 1: packages/shared

### T1.1 FileNameUtil
- 测试：`getCodeName("英雄表.xlsx")` → `"hero"` 等 fixture
- 实现：从文件名提取 code 名（去后缀、去汉字部分、小写）
- commit

### T1.2 StringUtil
- 测试：`upper1("abc")` → `"Abc"`；`underscoreToPascalCase("a_b")` → `"AB"`
- 实现：upper1, lower1, underscoreToPascalCase, toScreamingSnakeCase, removeLineSep
- commit

### T1.3 ListParser
- 测试：`parseList('a,b,c', ',')` → `['a','b','c']`；带引号 `parseList('"a,b",c', ',')` → `['a,b','c']`
- 实现：四状态机解析分隔符列表
- commit

### T1.4 ArgParser
- 测试：`parseToIdAndMap('java,dir:src,encoding:UTF-8')` → `{id:'java', map:{dir:'src', encoding:'UTF-8'}}`
- 实现：逗号分隔、`:`/`=` 分割键值
- commit

### T1.5 UnicodeReader (BOM 检测)
- 测试：读 UTF-8 BOM 文件、UTF-16BE BOM 文件、无 BOM GBK 文件
- 实现：预读 4 字节检测 BOM，匹配则跳过并用对应编码
- commit

### T1.6 BomUtf8Writer
- 测试：写入后检查文件头 3 字节是 `EF BB BF`
- 实现：首次写入时先写 BOM
- commit

### T1.7 CSVUtil (用 csv-parse)
- 测试：读 `samples/test/` 下的 CSV 文件；`escapeCsv('a,b')` → `'"a,b"'`
- 实现：read (csv-parse + UnicodeReader), readAndNormalize (补齐列), write (RFC4180 转义), escapeCsv
- commit

### T1.8 Logger
- 测试：verboseLevel 控制；profile 记录耗时
- 实现：Printer 接口、verbose/verbose2/log/profile、setVerboseLevel
- commit

### T1.9 CachedFiles
- 测试：writeFile 两次相同内容不覆盖；deleteOtherFiles 删除未 keep 的
- 实现：filename Set、writeFile (增量)、keepMetaAndDeleteOtherFiles、finalExit
- commit

### T1.10 CachedIndentPrinter
- 测试：inc/dec 缩进控制；println1-7；close 后文件内容正确
- 实现：4 空格缩进、StringBuilder dst、close → CachedFiles.writeFile
- commit

### T1.11 PackParser
- 测试：`parsePack('a,(b,c),d')` → `['a','(b,c)','d']`；`parseFunction('name(params)')` → `['name','params']`
- 实现：六状态机、括号分组
- commit

### T1.12 MarkdownReader
- 测试：读带 frontmatter 的 md 和不带的
- 实现：YAML frontmatter 解析（--- 分隔）+ 正文
- commit

### T1.13 其他小工具 (LocaleUtil, FileUtil, DOMUtil, XorCipherOutputStream)
- 批量实现：LocaleUtil (i18n key-value)、FileUtil (moveDir/copyFile)、DOMUtil (用 fast-xml-parser)、XorCipher
- commit

---

## Phase 2: packages/schema

### T2.1 词法分析器 (Lexer)
- 测试：各 token 类型（关键字/符号/字面量/注释/标识符）的词法分析
- 实现：逐字符扫描，输出 Token 流（含 type + value + position）
- fixture：用 `samples/test/` 的 .cfg 文件
- commit

### T2.2 递归下降解析器 (Parser) — struct
- 测试：解析 `struct Award { itemId: int; count: int; }` → StructDecl AST
- 实现：parseStructDecl（含 leading comments、metadata、fields、foreign keys）
- commit

### T2.3 解析器 — interface + table + enum
- 测试：解析 interface（含 impls）、table（含 pk/entry/uk）、enum（带/不带赋值）
- 实现：parseInterfaceDecl, parseTableDecl, parseEnumDecl
- commit

### T2.4 解析器 — 字段类型系统
- 测试：`list<int>`, `map<str,int>`, `StructRef`, `-> ref`, `=> listref`
- 实现：parseType (TLIST/TMAP/TypeBasic), parseRef, parseKey
- commit

### T2.5 解析器 — metadata
- 测试：`(tag1, tag2=val, -tag3)` → Metadata
- 实现：parseMetadata（ident_with_opt_single_value + minus_ident）
- commit

### T2.6 CfgReader (文本→AST→CfgSchema)
- 测试：读 `example/config/config.cfg` → 验证 struct/table/interface 数量
- 实现：整合 lexer + parser，输出 CfgSchema（未 resolved）
- commit

### T2.7 CfgWriter (CfgSchema→文本) + 往返测试
- 测试：读 → 写 → 读 → 断言 AST 相等（注释不丢）
- 实现：writeStruct/writeTable/writeInterface/writeEnum，注释 leading/trailing/suffix 处理
- commit

### T2.8 类型系统模型 (FieldType + FieldFormat)
- 测试：Primitive.BOOL/INT/...；FList/FMap；Sep/Fix/Block/Auto/Pack
- 实现：FieldType sealed 体系、FieldFormat sealed 体系
- commit

### T2.9 Schema 模型 (StructSchema/TableSchema/InterfaceSchema/FieldSchema/ForeignKeySchema)
- 测试：构造各模型、copy() 深拷贝、fullName() 等
- 实现：按 Java 源码逐个移植
- commit

### T2.10 Metadata
- 测试：putTag/hasTag、putComment/getComment、putEntry/putFmt 等
- 实现：SequencedMap → TS Map，MetaValue 判别联合，保留字集合
- commit

### T2.11 CfgSchema 容器
- 测试：add items、findTable/findFieldable、resolve 两阶段
- 实现：items list + index maps、resolve 委托 resolver
- commit

### T2.12 CfgSchemaResolver — step0 (impl 关联 + 表名小写 + 命名冲突)
- 测试：interface 挂 impl；表名小写检查；命名空间冲突
- 实现：resolve step0 逻辑
- commit

### T2.13 CfgSchemaResolver — step1 (字段类型解析)
- 测试：StructRef 解析（local→global）；enum 引用自动转 STRING + 外键
- 实现：resolve step1 逻辑
- commit

### T2.14 CfgSchemaResolver — step2 (interface/table 校验)
- 测试：entry 字段校验；primary key 类型校验；unique key 类型校验
- 实现：resolve step2 逻辑
- commit

### T2.15 CfgSchemaResolver — step3 (外键解析)
- 测试：refTable 绑定；local/remote key 类型匹配
- 实现：resolve step3 逻辑
- commit

### T2.16 CfgSchemaResolver — step4+5 (fmt 约束 + 未引用警告)
- 测试：sep 字段必须全 primitive；未引用 struct 警告
- 实现：resolve step4+5
- commit

### T2.17 CfgSchemaResolver — 预计算 + 收尾
- 测试：Span/HasRef/HasBlock/HasMap/HasText 计算；setResolved
- 实现：预计算逻辑 + BlockFirstColOverlapChecker
- commit

### T2.18 CfgSchemaErrs (三级错误收集)
- 测试：addErr/addWarn/addWeakWarn；checkErrors 有 err 时抛异常
- 实现：三级列表 + checkErrors + 各 Err/Warn/WeakWarn record
- commit

### T2.19 CfgSchemaFilterByTag
- 测试：正 tag 过滤字段；负 tag 过滤；外键过滤两阶段
- 实现：按设计文档过滤逻辑
- commit

### T2.20 CfgSchemas (多文件并行读取 + 合并)
- 测试：读 `example/config/` 多个 .cfg 文件 → 合并为一个 CfgSchema
- 实现：parallel read (worker_threads) + merge items + merge fileEndComments
- commit

### T2.21 CfgSchemaAlignToData
- 测试：schema 与 data 对齐（字段增删检测）
- 实现：按 Java CfgSchemaAlignToData 逻辑（跨包到 data，但逻辑放 schema）
- commit

### T2.22 XmlReader (XML→schema)
- 测试：读 XML 配置 → CfgSchema
- 实现：用 fast-xml-parser 替代 Java DOM
- commit

### T2.23 CfgUtil (文件发现 + namespace 拆分)
- 测试：`findConfigFilesRecursively` 遍历目录；`separate` 按 namespace 拆分
- 实现：递归遍历 + namespace → 文件路径映射
- commit

### T2.24 端到端回归测试
- 用 `example/config/config.cfg` + `samples/test/` 全部 .cfg 文件
- 解析 → resolve → 断言无错误
- commit

---

## Phase 3: packages/data

### T3.1 ExcelReader (ExcelJS)
- 测试：读 `example/config/` 下的 .xlsx 文件 → DRawSheet
- 实现：ExcelJS Workbook 读取 → 逐 sheet → DRawSheet
- commit

### T3.2 CsvReader
- 测试：读 .csv 文件 → DRawSheet
- 实现：用 shared/CSVUtil → DRawSheet
- commit

### T3.3 JsonReader
- 测试：读 .json 文件 → DRawSheet（或直接 DTable）
- 实现：JSON.parse → DTable
- commit

### T3.4 HeadParser (表头解析)
- 测试：行模式表头、列模式表头
- 实现：按 Java HeadParser 逻辑
- commit

### T3.5 CellParser (单元格解析)
- 测试：trim 值、rowId、col、mode
- 实现：按 Java CellParser 逻辑
- commit

### T3.6 CfgDataReader (两阶段并发读取)
- 测试：读 `example/config/` → CfgData（含多表）
- 实现：阶段1（并发读文件→DRawSheet→合并DTable），阶段2（并发解析表头+单元格）
- commit

### T3.7 CfgData + DTable + DField + DCell 模型
- 测试：构造各模型、统计信息
- 实现：按 Java 源码移植
- commit

### T3.8 端到端回归测试
- 读 `example/config/` → 验证表数量、行数、列数与 Java 版一致
- commit

---

## Phase 4: packages/value

### T4.1 值类型树 (CfgValue sealed 体系)
- 测试：各值类型构造、判别联合 narrowing
- 实现：VBool/VInt/VLong/VFloat/VString/VText/VStruct/VInterface/VList/VMap
- commit

### T4.2 VTableParser (Excel/CSV 值解析)
- 测试：从 DTable + Schema → VTable（含主键/唯一键索引）
- 实现：按 Java VTableParser 逻辑（表级并发）
- commit

### T4.3 VTableJsonParser (JSON 值解析)
- 测试：从 JSON + Schema → VTable
- 实现：按 Java VTableJsonParser 逻辑
- commit

### T4.4 CfgValueParser (值解析编排)
- 测试：从 CfgData + CfgSchema → CfgValue（含多表）
- 实现：表级并发编排
- commit

### T4.5 RefValidator (外键校验)
- 测试：正确引用不报错；错误引用收集 Err
- 实现：跨表引用校验、收集不抛
- commit

### T4.6 CfgValueErrs (两级错误收集)
- 测试：addErr/addWarn；checkErrors
- 实现：按 Java CfgValueErrs 逻辑
- commit

### T4.7 SearchService (搜索)
- 测试：搜索关键词 → SearchResultItem[]
- 实现：遍历值树匹配
- commit

### T4.8 ValueToJson / ValueToCsv
- 测试：值 → JSON 字符串；值 → CSV 行
- 实现：递归序列化
- commit

### T4.9 TextValue (i18n 桥)
- 测试：直接替换模式
- 实现：按 Java TextValue 逻辑
- commit

### T4.10 其他 value 工具 (EntryRecordCollector, UnreferencedRecordCollector, ValueDefault)
- 批量实现
- commit

### T4.11 端到端回归测试
- 解析 `example/config/` → 值解析 → 外键校验 → 断言结果与 Java 版一致
- commit

---

## Phase 5: packages/i18n

### T5.1 LangTextFinder (直接替换模式)
- 测试：读翻译文件 → 按原文查找译文
- 实现：按 Java LangTextFinder 逻辑
- commit

### T5.2 LangSwitchable (可切换模式)
- 测试：保留全部语言、运行时切换
- 实现：按 Java LangSwitchable 逻辑
- commit

### T5.3 TextByIdFinder / TextByValueFinder (两种键策略)
- 测试：byId (主键+fieldChain) / byValue (原文)
- 实现：两种查找器
- commit

### T5.4 I18nUtils
- 实现：通用 i18n 工具函数
- commit

---

## Phase 6: packages/context

### T6.1 ContextCfg
- 测试：参数解析 (dataDir/headRow/encoding/i18n 等)
- 实现：配置参数 record
- commit

### T6.2 DirectoryStructure (目录扫描)
- 测试：扫描 `example/config/` → 文件列表
- 实现：递归遍历 + 文件分类
- commit

### T6.3 Context (核心协调者)
- 测试：构造 Context → schema+data 读完并对齐 → makeValue 缓存
- 实现：持有 cfgSchema/cfgData/缓存值，makeValue(tag, allowErr)
- commit

### T6.4 makeValue 缓存规则
- 测试：严格缓存可服务任何请求；宽松→严格必须重算
- 实现：tag 匹配 + allowErr 方向安全
- commit

### T6.5 WatchAndPostRun (文件监听 + postrun)
- 测试：文件变更 → 触发重载
- 实现：chokidar watch + postrun 钩子
- commit

### T6.6 端到端回归测试
- 构造 Context(`example/config/`) → makeValue → 断言值正确
- commit

---

## Phase 7: packages/write

### T7.1 TableFileLocator
- 测试：按表名定位数据文件（csv/xlsx/json）
- 实现：按 Java TableFileLocator 逻辑
- commit

### T7.2 VTableStorage (csv/excel 落盘)
- 测试：修改记录 → 写回 CSV/Excel 文件
- 实现：ExcelJS 写 xlsx、CSVUtil 写 csv
- commit

### T7.3 VTableJsonStorage (json 落盘)
- 测试：修改记录 → 写回 JSON 文件
- 实现：JSON.stringify + 写文件
- commit

### T7.4 AddOrUpdateService
- 测试：增/改记录 → 落盘 → 重建值
- 实现：按 Java AddOrUpdateService 逻辑
- commit

### T7.5 DeleteService
- 测试：删记录 → 落盘 → 重建值
- 实现：按 Java DeleteService 逻辑
- commit

### T7.6 ValueUpdater + RecordBlockMapper
- 测试：值更新 → 映射到文件行/列
- 实现：按 Java 逻辑
- commit

### T7.7 端到端回归测试
- 增/改/删记录 → 验证文件内容正确
- commit

---

## Phase 8: packages/gen (最大工作量，按语言分批)

### T8.1 Generator 基类 + Generators 注册表
- 测试：注册一个生成器 → generate(ctx) → 产出文件
- 实现：Generator 抽象类 + Generators.addProvider
- commit

### T8.2 JSON 生成器 (最简单)
- 测试：生成 JSON 数据文件
- 实现：ValueToJson → 写文件
- commit

### T8.3 TypeScript 代码生成器 (7 模板)
- 测试：生成 Config.ts + ConfigUtil.ts
- 实现：StructModel + 模板字符串渲染
- commit

### T8.4 C# 代码生成器 (7 模板)
- 测试：生成 .cs 文件
- 实现：StructModel/InterfaceModel/ModuleModel + 模板
- commit

### T8.5 Go 代码生成器 (7 模板)
- 测试：生成 .go 文件
- 实现：StructModel/InterfaceModel/CfgMgrModel + 模板
- commit

### T8.6 Java 代码生成器 (13 模板，最大)
- 测试：生成 Java sealed 类 + 数据 + 读取侧代码
- 实现：StructuralClassModel/InterfaceModel/EntryOrEnumModel + 13 模板
- commit

### T8.7 Lua 代码生成器
- 测试：生成 Lua 表
- 实现：Ctx/AContext/ValueShared + 模板
- commit

### T8.8 GDScript 代码生成器 (3 模板)
- 测试：生成 .gd 文件
- 实现：StructModel/InterfaceModel/ProcessorModel + 模板
- commit

### T8.9 Bytes 二进制生成器 (7 文件)
- 测试：生成 config.bytes → 逐字节 diff Java 版
- 实现：BytesGenerator/StringPool/LangTextPool/TableSerializer/CfgValueSerializer
- commit

### T8.10 i18n 生成器 (byId + byValue)
- 测试：生成翻译文件
- 实现：I18nByIdGenerator/I18nByValueGenerator
- commit

### T8.11 AI 辅助生成 (byai)
- 测试：生成 AI prompt
- 实现：ByAIGenerator/PromptGen/SchemaToTs，用 openai SDK
- commit

### T8.12 CachedFiles (过期文件清理)
- 测试：生成后清理未 keep 的文件
- 实现：复用 shared/CachedFiles
- commit

### T8.13 端到端回归测试
- 用 `example/config/` 生成各语言代码 → 与 Java 版 diff（允许格式差异）
- commit

---

## Phase 9: packages/editor-core

### T9.1 EditorService (核心服务)
- 测试：构造 EditorService(dataDir) → 加载 Context
- 实现：持有 Context 实例，按 dataDir 缓存
- commit

### T9.2 SchemaService (getSchemas)
- 测试：返回 RawSchema（与前端 schemaModel.ts 类型一致）
- 实现：从 Context 取 CfgSchema → 转为 RawSchema
- commit

### T9.3 RecordService (getRecord)
- 测试：取记录 → RecordResult（与前端 recordModel.ts 一致）
- 实现：从 VTable 取记录 + 构建 refs
- commit

### T9.4 RecordEditService (addOrUpdateRecord + deleteRecord)
- 测试：增改删 → RecordEditResult
- 实现：委托 write 包 + 重建值
- commit

### T9.5 RecordRefIdsService (getRecordRefIds)
- 测试：引用图查询 → RecordRefIdsResult
- 实现：RefSearcher 逻辑
- commit

### T9.6 SchemaWriteService (getSchemaText + writeSchemaText)
- 测试：读 schema 文本 / 写 schema 文本
- 实现：CfgWriter.stringify / CfgReader.parse + 写回
- commit

### T9.7 TableCreateService (createTable + createDataFile)
- 测试：建表 → CreateResult
- 实现：在 schema 中添加 table + 创建数据文件
- commit

### T9.8 CheckJsonService + PromptService
- 测试：校验 JSON / 生成 AI prompt
- 实现：按 Java 逻辑
- commit

### T9.9 NoteEditService (getNotes + updateNote)
- 测试：读/写备注
- 实现：备注存储（文件或 metadata）
- commit

### T9.10 SearchService (search)
- 测试：搜索 → SearchResult
- 实现：委托 value/SearchService
- commit

### T9.11 端到端回归测试
- 所有编辑器 API 函数 → 验证返回值与 Java HTTP API 一致
- commit

---

## Phase 10: packages/cli

### T10.1 Main (入口 + 插件注册)
- 测试：`npx cfggen -h` 打印帮助
- 实现：注册所有 generators/tools + 参数解析 + 构造 Context + 调度
- commit

### T10.2 ParameterParser
- 测试：`-datadir config -gen java,dir:src` → 参数 map
- 实现：边读边 remove + assureNoExtra
- commit

### T10.3 Help
- 测试：帮助文本正确
- 实现：动态生成帮助（从注册表参数信息）
- commit

### T10.4 端到端回归测试
- `npx cfggen -datadir example/config -gen java,dir:./test-output`
- `npx cfggen -datadir example/config -gen verify`
- commit

---

## Phase 11: packages/mcp

### T11.1 CfgMcpServer (MCP 服务端)
- 测试：启动 MCP 服务（stdio）→ AI 工具调用
- 实现：@modelcontextprotocol/sdk + 注册工具
- commit

### T11.2 SchemaTool / ReadRecordTool / WriteRecordTool / SearchTool
- 测试：各工具调用 → 正确返回
- 实现：委托 editor-core
- commit

---

## Phase 12: cfgeditor 改造

### T12.1 apiClient.ts 重写 (axios → Tauri invoke)
- 测试：每个函数调用 → Tauri command
- 实现：~20 个函数从 axios.get/post 改为 invoke()
- commit

### T12.2 Tauri command handler 注册
- 测试：invoke('get_schemas') → editor-core.getSchemas()
- 实现：在 Tauri JS 环境注册 command handler
- commit

### T12.3 ConnectionSetting.tsx 改造
- 测试：从输入 URL 改为目录选择器
- 实现：Tauri dialog open directory → 设置 dataDir
- commit

### T12.4 store/storage.ts 改造
- 测试：server 配置 → dataDir 配置
- 实现：存储键名改变
- commit

### T12.5 tauri.conf.json 改造
- 测试：bundle resources 为空
- 实现：去掉 cfggen.jar 和 jre/
- commit

### T12.6 端到端验证
- 启动 cfgeditor → 打开 example/config → 浏览/编辑/搜索/建表
- commit

---

## Phase 13: 清理

### T13.1 删除 app/ 目录
- 确认所有功能已迁移
- 删除 `app/` 整个目录
- commit

### T13.2 删除 cfggen.jar 和 JRE
- 删除 `cfgeditor/src-tauri/resources/cfggen.jar`
- 删除 `cfgeditor/src-tauri/resources/jre/`
- commit

### T13.3 更新文档
- 更新 PROJECT_OVERVIEW.md, CODE_ARCHITECTURE.md, DEVELOPER_GUIDE.md, CLAUDE.md
- 更新 README.md
- commit

### T13.4 更新 CI/CD
- 更新 .github/workflows/release.yml（去掉 Java/Tauri JAR 步骤，改为 pnpm build）
- commit

### T13.5 最终回归测试
- CLI: `npx cfggen -datadir example/config -gen java,bytes,verify`
- 编辑器: 全功能测试
- MCP: AI 工具调用测试
- commit

---

## 任务统计

| Phase | 任务数 | 优先级 | 预估工作量 |
|---|---|---|---|
| 0 | 3 | high | 小 |
| 1 | 13 | high | 中 |
| 2 | 24 | high | 大 |
| 3 | 8 | high | 中 |
| 4 | 11 | high | 大 |
| 5 | 4 | medium | 小 |
| 6 | 6 | high | 中 |
| 7 | 7 | high | 中 |
| 8 | 13 | high | 最大 |
| 9 | 11 | high | 大 |
| 10 | 4 | medium | 小 |
| 11 | 2 | medium | 小 |
| 12 | 6 | high | 中 |
| 13 | 5 | medium | 小 |
| **合计** | **117** | | |

> AI生成