# javamapper Generator 设计

日期：2026-08-27
状态：已与用户逐项确认

## 1. 背景与目标

现有游戏服使用 Python 工具（`autoCfgFile.py`）从 MySQL `d4_statics` 库的元数据生成 Java mapper 类：raw 单例类（`tableMap` + `getByKey` + `init()` 加载 + PBData 表信息推送）和可选的 cfg 子类（`prepareData()` 手写钩子）。

目标：在 cfggen 中新增 `javamapper` generator，替代该 Python 工具。字段信息从 `.cfg` schema 获得（不连 MySQL）；类型转换、命名等与现有 cfggen `java` generator **共用同一份代码**（公共方法类），并修复 Python 工具的已知瑕疵、补充其做不到的能力。

非目标：
- 不生成 CREATE TABLE DDL（SQL 导出已有，需要时另做）。
- 不改动现有 `java` generator 的输出。
- 不实现 PBData/CfgVersions/DataStoreCompat 等服务器运行时类（只生成引用它们的代码）。

## 2. 命令行

```
npx cfgforge -datadir example/config -gen javamapper,dir:output,pkg:com.jedi.gameServer.mapper,child:task;equip
```

| 参数 | 默认 | 说明 |
|---|---|---|
| `dir` | `mapper` | 输出根目录，生成 `dir/pkg/raw/` 与 `dir/pkg/cfg/` 两个子包 |
| `pkg` | `com.jedi.gameServer.mapper` | 基础包名 |
| `child` | （空） | 需要生成 cfg 子类的表名列表，**分号分隔**（逗号会被 ParameterParser 切分 k=v 对，不能用；实现时验证，若解析器支持转义逗号可改逗号） |
| `encoding` | `UTF-8` | 预留，与其他 generator 一致 |
| `tag` | （无） | 由 `-gen` 语法继承（`GeneratorWithTag`），`(noserver)` 等按 tag 过滤字段 |

`child` 中出现 schema 不存在的表名 → 报错停止（Python 静默忽略，容易拼错无感知）。

## 3. 输出产物

### 3.1 raw 类（每表一个：`raw/RawTasks.java`）

结构对齐 Python 工具，含以下修复与增强：

- 行内部类 `RawTask`：字段 + `RawTask(JSONObject recored)` 构造器 + getter/setter。
  - setter 参数名小写开头（Python 生成 `setTaskid(int Taskid)`，不规范）。
  - 字段注释生成 javadoc。
  - `toString()`：`"(" + field1 + "," + field2 + ... + ")"` 格式，同 cfggen 行对象。
- 单主键：`public <type> key()` 直接返回主键字段。
- 多主键：内部类 `RawTaskKey`，`hashCode`/`equals` 复用公共 `hashCodes()`/`equalsExpr()`（`Objects.hash` 风格；Python 版 equals 有重复死代码，不复制）。
- 单例：静态 Holder 惯用法（线程安全；Python 版非线程安全）。
- `public Map<Object, RawTask> tableMap`（`new HashMap<>()` 钻石操作符）。
- `init()`：`DataStoreCompat.queryStaticList("select * from \`cfg_<snake>\`")` → 构造行对象填 tableMap → PBData 列定义/记录推送（照抄 Python 逻辑，基于 JDBC 原始 JSONObject：Integer→value_int，Float→value_float，其余→value_string）→ `CfgVersions.getInstance().AddCfgPBInfo(...)`。
- `getByKey(...)`：单主键直接 get；多主键构造 Key 查询。
- **枚举表增强**（`(enum='...')` 的表）：`init()` 额外构建 name→行 map，生成 `getByName(String)`。枚举字段本身即主键时跳过（与 getByKey 重复）。
- **枚举/Entry 常量**（数据在生成期已知，烘焙进代码）：`enumNameToIntegerValueMap` 非空时生成 `public static final int KILL_MONSTER = 1;`；无整数值的枚举生成 `public static final String XXX = "xxx";`；EEntry（`(entry='...')`）表按 entry 字段值生成常量。常量名复用 `enumFieldName()`。
  - **新鲜度风险**：常量是生成期快照，DB 数据后续单独变更会漂移。缓解：`init()` 末尾校验常量集合与 DB 行一致性，不一致 Logger.error（不抛异常，避免阻断启动）。
- **uniqueKey 查询**：schema 声明的每个 uniqueKey 生成 `xxxMap` + `getByXxx(...)`（命名复用 `uniqueKeyMapName`）。
- **外键 Ref getter**：主键 FK 与 uniqueKey FK 都生成 `getXxxRef()`，内部调目标 raw 类 `getByKey`/`getByXxx`。仅当被引用表也在本批次生成 raw 类时生成，否则跳过 + Logger.info。nullable FK 照常生成（查不到返回 null，语义一致）。

### 3.2 struct/interface POJO（强类型，同 cfggen 风格）

- 表字段可达的每个 struct 生成 POJO 类：字段 + getter/setter + 静态 `_parse(JSONObject)` 逐字段解析（对应 cfggen 的 `_create(ConfigInput)`，数据源换成 JSON）。
- interface：POJO 接口 + 每个 impl 一个类（`_parse` 各自实现）+ 静态工厂 `Xxx._parse(JSONObject)` 读 `"$type"` 字符串 switch 分发（对应 cfggen 的 tag 分发；`$type` 是 SQL 导出时 `ValueToJson` 写入 JSON 的判别字段）。
- 基础类型 list/map 用 fastjson2 `JSON.parseArray(s, X.class)` / `JSON.parseObject(s, new TypeReference<...>(){})`；元素为 struct/interface 的容器在 `_parse` 内逐元素递归。不依赖 fastjson 字段反射，行为可控。
- `text` 类型多语言模式下仍生成 `String`（例外：mapper 无 `Text` 运行时类），构造器 `getString`。
- POJO 输出路径：`dir/pkg/bean/<schema 命名空间>/`（如 `pkg/bean/Position.java`、`pkg/bean/task/TestDefaultBean.java`、`pkg/bean/task/completecondition/Completecondition.java`）。用独立的 `bean` 子包，避免与 `raw`/`cfg` 保留目录及表命名空间冲突；bean 目录由 `CachedFiles` 自动清理过期文件（纯生成物，无手写内容）。

### 3.3 cfg 子类（仅 `child` 指定的表：`cfg/Tasks.java`）

- `extends RawTasks`，静态 Holder 单例、`init()` override 调 super、空 `prepareData()` 手写钩子。
- **文件存在即跳过，只新建缺失的**（Python 每次 `"w"` 重写会丢手写代码；其 rmtree 注释也表明 child 目录是用户领地）。跳过时打日志。

### 3.4 汇总类 `raw/CfgMapperInit.java`

`public static void initAll()` 依次调用所有表 init；child 表若生成子类则调子类 init（走 override）。放 raw 包（全自动产物，每次重生成；cfg/ 目录永不覆盖永不清理，不破坏手写原则）。

`public static java.util.List<String> verifyRefs()`：initAll 之后调用，遍历所有表所有行的非空外键，Ref 返回 null 则收集错误明细（表名、行 key、字段、目标表），返回错误列表（空列表 = 校验通过）。对齐 cfggen `LoadValueErrs` 的加载期校验。

## 4. 类型转换（公共代码，见第 6 节）

| schema 类型 | Java 字段（`type()`/`boxType()`） | 构造器读取 |
|---|---|---|
| `int`/`long`/`float` | `int`/`long`/`float` | `getIntValue`/`getLongValue`/`getFloatValue` |
| `bool` | `boolean` | `getIntValue(...) != 0`（MySQL 存 0/1） |
| `str` | `String` | `getString` |
| `text` | `String`（即使多语言也不生成 Text 类） | `getString` |
| `list<T>`/`map<K,V>`（基础类型） | `List<T>`/`Map<K,V>`（boxType） | fastjson2 parseArray / TypeReference |
| struct 引用 | POJO 类 | `Xxx._parse(jsonObject)` |
| interface 引用 | POJO 接口 | 工厂 `$type` 分发 |

列名直接用 schema 字段名（camelCase），与 ExportService 建列方式一致。SQL 表名 `cfg_` + `camelToSnake(tableName)`。

## 5. 命名（对齐 Python 工具 + 复用 cfggen 函数）

- raw 主类：`Raw` + 表名分段首字母大写 + `s`（`task` → `RawTasks`）
- 行类：不带 s（`RawTask`）；Key 类：`RawTaskKey`
- cfg 子类：表名分段大写 + `s`（`Tasks`）
- 枚举常量名、Pascal 分段：复用 `enumFieldName()`/`pascalName()`
- 命名空间表：类名与 SQL 表名推导必须与 ExportService 完全一致（`camelToSnake` 单一来源）；实现时验证 `Nameable.name()` 返回简单名还是全名

## 6. 公共代码重构（用户明确要求：与现有 cfggen 共用一份代码）

1. **`camelToSnake` 提升到 `@cfgforge/shared`**（StringUtils），`editor-core/ExportService` 改为引用。SQL 表名推导单一来源。
2. **`JavaName.ts` 纯函数拆出**：
   - `JavaTypeUtil.ts`：`type`/`boxType`（参数化 langSwitch 与 codeTopPkg 选项）、`enumFieldName`、`pascalName`、`keyClassName`、`uniqueKeyMapName` 等命名/类型函数。
   - `JavaMethodStr.ts`：`formalParams`/`actualParams`/`hashCodes`/`equalsExpr` 等方法签名片段函数。
   - `JavaName.ts` re-export 全部——现有 java generator 与全部现有测试**零改动**，两个 generator 跑同一份转换代码。
3. 模板层不共用（`javaTemplates.ts` 与 `JavaMapperTemplates.ts` 输出风格本质不同），但都只调公共层。

## 7. 文件结构

```
packages/gen/src/
  JavaTypeUtil.ts          # 公共：类型/命名
  JavaMethodStr.ts         # 公共：方法片段
  JavaName.ts              # re-export + 现有静态状态封装（现有用法不变）
  JavaMapperGenerator.ts   # Generator 主类
  JavaMapperTemplates.ts   # 纯函数模板：genRawClass/genChildClass/genInitAll/genPojo
  __tests__/JavaMapperGenerator.test.ts
packages/cli/src/Main.ts   # +1 行 addProvider('javamapper', ...)
packages/shared/src/StringUtils.ts（或并入现有文件）  # camelToSnake
```

## 8. 错误处理

- `child` 表名不存在 → 报错停止。
- 表无主键 → 防御性跳过 + Logger.warn（schema 理论必有）。
- FK 目标表未生成 raw 类 → 跳过 Ref getter + Logger.info。
- POJO 降级场景（如无法解析的嵌套）不存在：全部类型有明确策略（见第 4 节）。

## 9. 测试

- 模板函数单测：单主键/多主键/枚举表/uniqueKey/FK/各类型字段/list/map/struct/interface POJO/$type 分发/child 类/initAll 的输出快照。
- 公共层重构回归：现有 `java` generator 测试全部保持通过（零改动验证）。
- 集成：跑 `example/config`，断言关键文件存在、package 声明正确、括号配对（轻量语法检查，不引 javac）。
- 文档同步：README 生成器列表、DEVELOPER_GUIDE、CLI help 文本加 `javamapper`。

## 10. 实现顺序（供 writing-plans 展开）

1. 公共层拆分 + camelToSnake 提升（先行，独立可回归）。
2. JavaMapperName/类型读取映射 + 模板函数 + 单测。
3. Generator 主类 + CLI 注册 + 集成测试。
4. 文档/帮助文本同步。
