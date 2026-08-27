# javamapper Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `-gen javamapper` 生成器，从 `.cfg` schema 生成 MySQL mapper 风格 Java 代码（raw 单例类 + 强类型 POJO + cfg 子类 + initAll/verifyRefs），替代现有 Python 工具 `autoCfgFile.py`。

**Architecture:** 独立 Generator（`GeneratorWithTag` 子类），注册进 `Generators`。类型/命名与现有 java generator 共用一份代码：`JavaName.ts` 的纯函数拆到 `JavaTypeUtil.ts`/`JavaMethodStr.ts` 并 re-export（现有调用零改动）。SQL 表名/类型复用 `gen/SqlRender.ts`。模板函数纯字符串输入输出（`JavaMapperTemplates.ts`），不碰 IO。POJO 的 `_parse(JSONObject)` 严格按 `-gen sql` 写库的 JSON 契约生成（struct 带 `$type` fullName；map 是 `[{key,value}]` 数组）。

**Tech Stack:** TypeScript (ESM), vitest 4, pnpm monorepo。运行时依赖 fastjson2/JLogger/PBData 等只出现在生成代码里，TS 侧零新增依赖。

**Spec:** `docs/superpowers/specs/2026-08-27-javamapper-generator-design.md`（含全部已确认决策：无 setter、强类型 POJO、枚举常量、verifyRefs、静态 get/all、toString、child 存在即跳过等）

## Global Constraints

- 现有 `java` generator 输出与测试**零改动**（Task 1 重构后 `pnpm --filter "!@cfgforge/schema" -r test` 全绿才算完成）。
- 测试命令（Git Bash, Windows）：`cd G:/project/github/cfggen && G:/soft/nodeJs/npx.cmd vitest run --project packages <file>`；全量：`G:/soft/nodeJs/npx.cmd vitest run --project packages`。仓库没有全局 pnpm，构建用 `cd packages/<pkg> && G:/soft/nodeJs/npx.cmd tsc`。
- 生成代码里服务器依赖的 import（写死，来自 Python 工具现状）：`com.alibaba.fastjson2.JSONObject`、`com.jedi.serverEngine.datastore.DataStoreCompat`、`com.jedi.serverEngine.Logs.JLogger`、`com.jedi.serverEngine.message.PBData`。基础包名默认 `com.jedi.gameServer.mapper`。
- POJO JSON 契约（来源 `packages/value/src/ValueToJson.ts`，不可偏离）：struct→object 含 `"$type"`(fullName) + 按字段名；map→数组 `[{"key":..,"value":..}]`；SQL 列 bool 是 tinyint(1)（顶层行字段用 `getIntValue()!=0`），JSON 嵌套内 bool 是 true/false（POJO 解析用 `getBooleanValue`）；text 存 original 字符串。
- 命名规则（对齐 Python 工具）：raw 主类 `Raw`+表名各段首字母大写+`s`；行类去 s；Key 类加 `Key` 后缀；cfg 子类=表名各段首字母大写+`s`。分段用**完整表名（含命名空间点分）**按 `.` 和 `_` 分段。
- SQL 表名：`sqlTableName(schema.name(), 'cfg_')`（SqlRender.ts:94，含命名空间处理）。
- 每个 task 结束必须 commit。

## File Structure（全部新文件在 packages/gen/src/ 下）

| 文件 | 职责 |
|---|---|
| `JavaTypeUtil.ts` | 公共：`typeOf/boxTypeOf`（参数化 langSwitch）、`enumFieldNameOf/pascalNameOf` 等命名函数（从 JavaName.ts 拆出） |
| `JavaMethodStr.ts` | 公共：`formalParams/actualParams/hashCodes/equalsExpr` 等方法片段（从 JavaName.ts 拆出） |
| `JavaMapperName.ts` | mapper 专属命名：raw/行/Key/子类类名推导、`jsonReadExpr`（字段类型→JSONObject 读取表达式）、`parseExpr`（JSON→POJO 解析表达式） |
| `JavaMapperModel.ts` | 模板输入模型：`RawTableModel/PojoModel/MapperGenContext` |
| `JavaMapperTemplates.ts` | 纯函数模板：`genRawClass/genPojoClass/genInterfacePojo/genChildClass/genInitAll` |
| `JavaMapperGenerator.ts` | Generator 主类：参数、schema 遍历、可达 POJO 收集、写文件、child 跳过逻辑 |
| `__tests__/JavaMapper*.test.ts` | 单测 + 集成 |
| 修改：`JavaName.ts`（函数移走后 re-export）、`index.ts`（导出）、`packages/cli/src/Main.ts`（注册） |

---

### Task 1: 拆公共层 JavaTypeUtil/JavaMethodStr（现有测试零改动验证）

**Files:**
- Create: `packages/gen/src/JavaTypeUtil.ts`
- Create: `packages/gen/src/JavaMethodStr.ts`
- Modify: `packages/gen/src/JavaName.ts`
- Test: 现有 `packages/gen/src/__tests__/JavaCodeGenerator.test.ts`（不改）

**Interfaces:**
- Consumes: `JavaName.ts` 现有导出
- Produces: `JavaTypeUtil.ts` 导出 `typeOf(t, opts)/boxTypeOf(t, opts)`（opts: `{langSwitchText: boolean}`）、`enumFieldNameOf(name, beautiful)`、`pascalNameOf(part, beautiful)`；`JavaMethodStr.ts` 导出与 JavaName 现名相同的 `formalParams/actualParams/actualParamsKey/actualParamsKeyRaw/keyDisplayExpr/hashCodes/equalsExpr/equal`；`JavaName.ts` re-export 全部（`export { ... } from './JavaTypeUtil'`），并保留原静态状态 setter（`setCodeTopPkg` 等）在 JavaName.ts

说明：`typeOf/boxTypeOf` 是**新增参数化版本**；`JavaName.ts` 里现有的 `type()/boxType()` 保留原实现（内部转发到参数化版本，用模块静态状态），签名不变。

- [ ] **Step 1: 跑现有 java 测试取基线**

```bash
cd G:/project/github/cfggen && G:/soft/nodeJs/npx.cmd vitest run --project packages packages/gen/src/__tests__/JavaCodeGenerator.test.ts
```
Expected: 全部 PASS。记下用例数。

- [ ] **Step 2: 创建 `JavaTypeUtil.ts`**

把 `JavaName.ts` 中以下纯函数**移动**（剪切）到新文件，改为显式传参（不再读模块级静态变量）：

```typescript
/**
 * JavaTypeUtil — 类型/命名的纯函数工具（从 JavaName.ts 拆出，参数化无静态状态）。
 * JavaName.ts re-export 这些函数并保留原签名；javamapper 直接用参数化版本。
 */
import type { FieldType } from '@cfgforge/schema';
import { Primitive, isStructRef, type FMap as FMapType, type StructRef } from '@cfgforge/schema';
import type { Nameable } from '@cfgforge/schema';
import { upper1, underscoreToPascalCase, toScreamingSnakeCase } from '@cfgforge/shared';

export interface TypeOpts {
  /** text 类型生成 `${pkg}.Text` 还是 `String`；JavaName 传模块状态，javamapper 恒 false */
  langSwitchText: boolean;
  /** langSwitchText=true 时的顶层包名 */
  codeTopPkg?: string;
}

export function typeOf(t: FieldType, opts: TypeOpts): string {
  return _type(t, false, opts);
}

export function boxTypeOf(t: FieldType, opts: TypeOpts): string {
  return _type(t, true, opts);
}

function _type(t: FieldType, box: boolean, opts: TypeOpts): string {
  if (t === Primitive.BOOL) return box ? 'Boolean' : 'boolean';
  if (t === Primitive.INT) return box ? 'Integer' : 'int';
  if (t === Primitive.LONG) return box ? 'Long' : 'long';
  if (t === Primitive.FLOAT) return box ? 'Float' : 'float';
  if (t === Primitive.STRING) return 'String';
  if (t === Primitive.TEXT) return opts.langSwitchText ? (opts.codeTopPkg ?? '') + '.Text' : 'String';
  if (isStructRef(t)) return structFullName((t as StructRef).obj!, opts);
  if (isFListT(t)) return 'java.util.List<' + _type((t as any).item, true, opts) + '>';
  if (isFMapT(t)) return 'java.util.Map<' + _type((t as any).key, true, opts) + ', ' + _type((t as any).value, true, opts) + '>';
  throw new Error('unknown FieldType: ' + t);
}
```

`isFListT/isFMapT` 从 `@cfgforge/schema` import `isFList/isFMap` 后 `const isFListT = isFList; const isFMapT = isFMap;`（或直接用原名）。`structFullName(nameable, opts)` 本任务先实现为**简单版**：按 nameable 的命名空间拼接（后面 Task 4 会给 javamapper 换成 bean 包名映射，通过 opts 传入回调 `resolveStruct?: (n: Nameable) => string`，默认走 JavaName 逻辑）：

```typescript
export interface TypeOpts {
  langSwitchText: boolean;
  codeTopPkg?: string;
  /** 自定义 struct/interface 引用的全名解析（javamapper 用 bean 包） */
  resolveNameable?: (n: Nameable) => string;
}
```

同时移动 `enumFieldNameOf(enumName, beautiful)` / `pascalNameOf(part, beautiful)` / `upperStartSegments(name)`（见 Task 3 依赖说明）。

- [ ] **Step 3: 创建 `JavaMethodStr.ts`**

把 `JavaName.ts` 的 `formalParams/actualParams/actualParamsKey/actualParamsKeyRaw/keyDisplayExpr/hashCodes/equalsExpr/equal` **移动**过来，签名不变（它们已是纯函数；`formalParams` 内部对 `type()` 的调用改为 `typeOf(t, {langSwitchText: getIsLangSwitchStatic()})`——由 JavaName 传入的包装函数保持行为）。实现：`JavaMethodStr.ts` 接受可选 `opts: TypeOpts` 参数，默认 `{langSwitchText:false}`；`JavaName.ts` re-export 时包一层传当前静态状态。

- [ ] **Step 4: `JavaName.ts` re-export，删掉移走的实现**

```typescript
export {
  typeOf, boxTypeOf, enumFieldNameOf, pascalNameOf, upperStartSegments,
  type TypeOpts,
} from './JavaTypeUtil';
export {
  formalParams, actualParams, actualParamsKey, actualParamsKeyRaw,
  keyDisplayExpr, hashCodes, equalsExpr, equal,
} from './JavaMethodStr';
```

`JavaName.ts` 内部模板代码用到的（`javaTemplates.ts` import 的）`type/boxType/enumFieldName/pascalName/...` 保持原名继续从 `JavaName.ts` 导出（内部实现改为调 `typeOf(t, {langSwitchText: _isLangSwitch, codeTopPkg: _codeTopPkg})` 转发）。

- [ ] **Step 5: 跑全量测试验证零回归**

```bash
cd G:/project/github/cfggen && G:/soft/nodeJs/npx.cmd vitest run --project packages
```
Expected: 全 PASS（含 E2ERegression、GenPipeline 等）。

- [ ] **Step 6: Commit**

```bash
cd G:/project/github/cfggen && git add packages/gen/src/JavaTypeUtil.ts packages/gen/src/JavaMethodStr.ts packages/gen/src/JavaName.ts && git commit -m "refactor(gen): extract JavaTypeUtil/JavaMethodStr pure functions from JavaName"
```

---

### Task 2: JavaMapperName —— 命名与读取表达式（纯函数 + 单测）

**Files:**
- Create: `packages/gen/src/JavaMapperName.ts`
- Create: `packages/gen/src/__tests__/JavaMapperName.test.ts`

**Interfaces:**
- Consumes: `upperStartSegments`（Task 1 产出）、`sqlTableName`（`gen/SqlRender.ts`，已存在）
- Produces（后续所有任务依赖，签名固定）:

```typescript
export interface MapperNames {
  rawClass: string;      // RawTasks
  rowClass: string;      // RawTask
  keyClass: string;      // RawTaskKey（多主键才有意义）
  childClass: string;    // Tasks
  sqlTable: string;      // cfg_task
}
export function mapperNames(schemaFullName: string): MapperNames;
/** 表名(可含命名空间 task.completeconditiontype) → RawTaskCompleteconditiontypes 等 */

/** 顶层行字段的 JSONObject 读取表达式（SQL 列类型语义：bool=tinyint 0/1） */
export function rowReadExpr(fieldName: string, t: FieldType): string;
// int → `recored.getIntValue("taskid")`
// bool → `(recored.getIntValue("flags") != 0)`
// long/float → getLongValue/getFloatValue；str/text/struct/interface/list/map → getString("x")

/** POJO _parse 内部字段解析表达式（JSON 值语义：嵌套 bool 是 true/false） */
export function parseExpr(fieldName: string, t: FieldType, opts: TypeOpts): string;
// 基础 list → `JSON.parseArray(o.getString("list"), Integer.class)`（元素为包装类）
// 基础 map → `JSON.parseObject(o.getString("m"), new TypeReference<LinkedHashMap<Integer, String>>() {})`
// struct → `TestDefaultBean._parse(o.getJSONObject("f"))`
// interface → `Completecondition._parse(o.getJSONObject("f"))`
// struct/interface 元素的 list/map → 手写循环（在模板层，parseExpr 只返回元素表达式）
// bool → `o.getBooleanValue("b")`；int → `o.getIntValue("i")`；str → `o.getString("s")`

/** Java 字段类型声明：复用 boxTypeOf + resolveNameable(bean 包名) */
export function mapperFieldType(t: FieldType, opts: TypeOpts): string;
```

- [ ] **Step 1: 写失败测试**

`__tests__/JavaMapperName.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { mapperNames, rowReadExpr } from '../JavaMapperName';
import { Primitive } from '@cfgforge/schema';

describe('mapperNames', () => {
  it('simple table', () => {
    const n = mapperNames('task');
    expect(n).toEqual({ rawClass: 'RawTasks', rowClass: 'RawTask', keyClass: 'RawTaskKey', childClass: 'Tasks', sqlTable: 'cfg_task' });
  });
  it('namespaced table', () => {
    const n = mapperNames('task.completeconditiontype');
    expect(n.rawClass).toBe('RawTaskCompleteconditiontypes');
    expect(n.childClass).toBe('TaskCompleteconditiontypes');
    expect(n.sqlTable).toBe('cfg_task_completeconditiontype');
  });
  it('underscore table name', () => {
    const n = mapperNames('task_extra');
    expect(n.rawClass).toBe('RawTaskExtras');
  });
});

describe('rowReadExpr', () => {
  it('int', () => expect(rowReadExpr('taskid', Primitive.INT)).toBe('recored.getIntValue("taskid")'));
  it('bool from tinyint', () => expect(rowReadExpr('ok', Primitive.BOOL)).toBe('(recored.getIntValue("ok") != 0)'));
  it('str', () => expect(rowReadExpr('name', Primitive.STRING)).toBe('recored.getString("name")'));
  it('complex via string', () => {
    expect(rowReadExpr('bean', { kind: 'sref', name: 'TestDefaultBean' } as any)).toBe('recored.getString("bean")');
  });
});
```

（`sqlTable` 断言依赖 `sqlTableName` 行为：`task.completeconditiontype` → `cfg_task_completeconditiontype`。先跑 `sqlTableName` 确认；若实际输出不同，以 `SqlRender` 实际行为为准修断言——生成器与 SQL 必须一致。）

- [ ] **Step 2: 跑测试确认失败**

```bash
cd G:/project/github/cfggen && G:/soft/nodeJs/npx.cmd vitest run --project packages packages/gen/src/__tests__/JavaMapperName.test.ts
```
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 JavaMapperName.ts**

```typescript
import type { FieldType, Nameable } from '@cfgforge/schema';
import { Primitive, isStructRef, isFList, isFMap } from '@cfgforge/schema';
import { sqlTableName } from './SqlRender';
import { boxTypeOf, type TypeOpts } from './JavaTypeUtil';

export interface MapperNames { rawClass: string; rowClass: string; keyClass: string; childClass: string; sqlTable: string; }

export function mapperNames(schemaFullName: string): MapperNames {
  // 分段：按 '.'（命名空间）和 '_'（Python 工具的 table.split("_")）都分段，各段 upper1 后拼接
  const segs = schemaFullName.split(/[._]/).map((s) => s.charAt(0).toUpperCase() + s.slice(1));
  const joined = segs.join('');
  const base = joined + 's'; // Tasks / TaskCompleteconditiontypes / TaskExtras
  return {
    rawClass: 'Raw' + base,
    rowClass: 'Raw' + joined,
    keyClass: 'Raw' + joined + 'Key',
    childClass: base,
    sqlTable: sqlTableName(schemaFullName, 'cfg_'),
  };
}
// rowReadExpr / parseExpr / mapperFieldType 按 Interfaces 契约实现；
// parseExpr 对基础 list: `JSON.parseArray(o.getString("f"), ${boxTypeOf(item, opts)}.class)`
// 基础 map: `JSON.parseObject(o.getString("f"), new TypeReference<java.util.LinkedHashMap<${k}, ${v}>>() {})`
```

- [ ] **Step 4: 跑测试通过**（同 Step 2 命令，Expected: PASS）

- [ ] **Step 5: Commit**

```bash
git add packages/gen/src/JavaMapperName.ts packages/gen/src/__tests__/JavaMapperName.test.ts
git commit -m "feat(gen): javamapper naming and read expressions"
```

---

### Task 3: POJO 模板 genPojoClass/genInterfacePojo + 模型

**Files:**
- Create: `packages/gen/src/JavaMapperModel.ts`
- Create: `packages/gen/src/JavaMapperTemplates.ts`（本任务只加 POJO 部分）
- Create: `packages/gen/src/__tests__/JavaMapperPojo.test.ts`

**Interfaces:**
- Consumes: `mapperFieldType/parseExpr`（Task 2）
- Produces:

```typescript
// JavaMapperModel.ts
export interface PojoFieldModel { name: string; type: FieldType; comment: string; }
export interface PojoModel {
  pkg: string;              // com.jedi.gameServer.mapper.bean[.ns]
  className: string;        // TestDefaultBean
  fields: PojoFieldModel[];
  isInterfaceImpl: boolean; // false=独立 struct；true=interface impl
  interfaceFqn: string | null;   // impl 时的接口全名
  enumRefType: string | null;    // interface enumRef 的枚举表 raw 类全名（type() 方法用）
  enumRefFieldName: string | null;
  namespacePath: string;    // 相对 bean 包的子包路径 'task' / ''
}
export interface InterfacePojoModel {
  pkg: string; className: string;         // Completecondition
  impls: { className: string; fullName: string; namespacePath: string }[]; // fullName=schema fullName，$type 匹配用
  enumRefTableFqn: string | null;         // 枚举表 raw 类（type() 返回类型）
  hasEnumRef: boolean;
}
// JavaMapperTemplates.ts
export function genPojoClass(m: PojoModel, opts: TypeOpts): string;
export function genInterfacePojo(m: InterfacePojoModel, opts: TypeOpts): string;
```

生成代码形态（golden，构造器解析按 JSON 契约）：

```java
package com.jedi.gameServer.mapper.bean.task;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.alibaba.fastjson2.TypeReference;

public class TestDefaultBean {
    private final int testInt;
    private final boolean testBool;
    private final String testString;
    private final com.jedi.gameServer.mapper.bean.Position testSubBean;
    private final java.util.List<Integer> testList;
    private final java.util.Map<Integer, String> testMap;

    TestDefaultBean(int testInt, boolean testBool, String testString,
                    com.jedi.gameServer.mapper.bean.Position testSubBean,
                    java.util.List<Integer> testList, java.util.Map<Integer, String> testMap) {
        this.testInt = testInt; /* ... */
    }

    public static TestDefaultBean _parse(JSONObject o) {
        return new TestDefaultBean(
            o.getIntValue("testInt"),
            o.getBooleanValue("testBool"),
            o.getString("testString"),
            Position._parse(o.getJSONObject("testSubBean")),
            JSON.parseArray(o.getString("testList"), Integer.class),
            JSON.parseObject(o.getString("testMap"), new TypeReference<java.util.LinkedHashMap<Integer, String>>() {}));
        );
    }

    public int getTestInt() { return testInt; }
    /* ... 仅 getter，无 setter ... */

    @Override
    public String toString() { return "(" + testInt + "," + testBool + "," + testString + "," + testSubBean + "," + testList + "," + testMap + ")"; }
}
```

interface（含 enumRef 时）：

```java
public interface Completecondition {
    static Completecondition _parse(JSONObject o) {
        String type = o.getString("$type");
        if (type.endsWith(".KillMonster")) return com.jedi.gameServer.mapper.bean.task.completecondition.KillMonster._parse(o);
        if (type.endsWith(".TalkNpc")) return com.jedi.gameServer.mapper.bean.task.completecondition.TalkNpc._parse(o);
        throw new IllegalArgumentException("Completecondition unknown $type: " + type);
    }
}
// impl（有 enumRef 的 interface 才生成 type()）：
public class KillMonster implements Completecondition {
    /* fields/ctor/_parse/getters 同上 */
    @Override
    public com.jedi.gameServer.mapper.raw.RawTaskCompleteconditiontypes type() {
        return com.jedi.gameServer.mapper.raw.RawTaskCompleteconditiontypes.KILL_MONSTER;
    }
}
```

`endsWith(".Name")` 匹配：`$type` 存的是 schema fullName（如 `task.completecondition.KillMonster`），bean 包路径与 schema 命名空间一致时前缀相同，但用 endsWith 更稳（防包名差异）。若同名 impl 出现在多个 interface 下导致歧义（`ConditionAnd` 嵌套同名），生成时用完整 fullName 精确匹配替代 endsWith——模板按 fullName 精确相等生成，endsWith 仅作 fallback 注释说明。

**map 字段注意**：JSON 契约里 VMap 是 `[{"$type":"$entry","key":k,"value":v}]` 数组，fastjson `TypeReference<Map>` 无法直接解析该格式！所以**基础 map 不能用 parseObject**，必须手写循环：

```java
// map 字段解析（在 _parse 内）：
{
    java.util.LinkedHashMap<Integer, String> m = new java.util.LinkedHashMap<>();
    for (JSONObject e : o.getJSONArray("testMap").toJavaList(JSONObject.class)) {
        m.put(e.getIntValue("key"), e.getString("value"));
    }
    testMap = m;
}
```

→ 构造器改用静态工厂 `private static TestDefaultBean _parse(...)` 内局部变量 + 构造调用（字段 final 可在工厂里先算好再传构造器；模板统一生成"工厂先解析全部字段到局部变量，最后 new"的形式）。**同理修正 Task 2 的 `parseExpr`**：map 不再返回 TypeReference 表达式，改由模板层生成上述循环块（`parseExpr` 仅负责基础标量与基础 list）。list 元素为 struct/interface 时也手写循环。

- [ ] **Step 1: 写失败测试**（golden 字符串断言，覆盖：纯基础字段 struct、含 list/map/struct 引用 struct、interface + 2 个 impl 含 type()、$entry map 格式循环）

测试直接构造 `PojoModel`（手写字面量，不依赖 schema 解析），断言输出含关键行：

```typescript
import { describe, it, expect } from 'vitest';
import { genPojoClass, genInterfacePojo } from '../JavaMapperTemplates';
import { Primitive } from '@cfgforge/schema';

const OPTS = { langSwitchText: false };

it('struct pojo: scalars + list', () => {
  const out = genPojoClass({
    pkg: 'com.jedi.gameServer.mapper.bean.task', className: 'TestDefaultBean',
    namespacePath: 'task', isInterfaceImpl: false, interfaceFqn: null,
    enumRefType: null, enumRefFieldName: null,
    fields: [
      { name: 'testInt', type: Primitive.INT, comment: '' },
      { name: 'testList', type: { kind: 'list', item: Primitive.INT } as any, comment: '' },
    ],
  }, OPTS);
  expect(out).toContain('package com.jedi.gameServer.mapper.bean.task;');
  expect(out).toContain('private final int testInt;');
  expect(out).toContain('JSON.parseArray(o.getString("testList"), Integer.class)');
  expect(out).toContain('public int getTestInt()');
  expect(out).not.toContain('setTestInt');
});

it('struct pojo: $entry map loop', () => {
  const out = genPojoClass({ /* ... testMap: {kind:'map',key:INT,value:STRING} ... */ } as any, OPTS);
  expect(out).toContain('for (JSONObject e : o.getJSONArray("testMap").toJavaList(JSONObject.class))');
  expect(out).toContain('m.put(e.getIntValue("key"), e.getString("value"))');
});

it('interface pojo: $type dispatch + type()', () => { /* 断言 _parse 的 if(endsWith) 分支、KILL_MONSTER 常量引用 */ });
```

（`FieldType` 的判别写法以 `@cfgforge/schema` 实际类型为准——`isFList(t)` 等谓词判断，不在测试里手写 kind 字面量；先读 `packages/schema/src/FieldType.ts` 确认构造方式。）

- [ ] **Step 2: 跑测试确认失败** → FAIL
- [ ] **Step 3: 实现 `JavaMapperModel.ts` + `JavaMapperTemplates.ts` 的 POJO 部分**（按上述 golden；import 仅在用到 JSON/JSONObject/TypeReference 时生成）
- [ ] **Step 4: 跑测试通过** → PASS
- [ ] **Step 5: Commit**

```bash
git add packages/gen/src/JavaMapperModel.ts packages/gen/src/JavaMapperTemplates.ts packages/gen/src/__tests__/JavaMapperPojo.test.ts
git commit -m "feat(gen): javamapper POJO templates with $type dispatch and $entry map loops"
```

---

### Task 4: raw 类模板 genRawClass（单/多主键、枚举、uniqueKey、FK ref、init/PBData）

**Files:**
- Modify: `packages/gen/src/JavaMapperModel.ts`（加 RawTableModel）
- Modify: `packages/gen/src/JavaMapperTemplates.ts`（加 genRawClass）
- Create: `packages/gen/src/__tests__/JavaMapperRaw.test.ts`

**Interfaces:**
- Consumes: Task 2/3 全部产出；`hashCodes/equalsExpr`（Task 1）
- Produces:

```typescript
export interface RawFieldModel { name: string; type: FieldType; comment: string; }
export interface RawTableModel {
  names: MapperNames;              // Task 2
  pkg: string;                     // ...mapper.raw
  beanPkg: string;                 // ...mapper.bean（POJO 引用前缀）
  fields: RawFieldModel[];         // schema 字段序（含主键字段）
  pkFields: RawFieldModel[];       // 主键字段（1..n）
  uniqueKeys: { fields: string[]; mapField: string; getBy: string }[]; // getBy=getByRank 之类
  fks: { fieldName: string; refRawClass: string; refMethod: string; nullable: boolean; args: string[] }[];
  // refMethod: 'getByKey' | uniqueKey 的 getByXxx；args: 传参表达式列表（字段名）
  isEnumTable: boolean;            // entry 是 EEnum
  enumField: string | null;        // 枚举名字段名
  enumConstants: { name: string; value: number }[] | null;   // enumNameToIntegerValueMap 烘焙
  enumStrConstants: { name: string; value: string }[] | null; // 无整数值时（name→name）
}
export function genRawClass(m: RawTableModel, opts: TypeOpts): string;
```

生成代码 golden（关键片段，完整形态对齐 Python 工具结构）：

```java
package com.jedi.gameServer.mapper.raw;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import com.alibaba.fastjson2.JSONObject;
import com.jedi.gameServer.mapper.cfg.CfgVersions;
import com.jedi.serverEngine.datastore.DataStoreCompat;
import com.jedi.serverEngine.Logs.JLogger;
import com.jedi.serverEngine.message.PBData;

public class RawTasks {
    public static class RawTask {
        private final int taskid;
        private final java.util.List<java.lang.String> name;   // text → String
        private final com.jedi.gameServer.mapper.bean.task.completecondition.Completecondition completecondition;
        // toString: "(" + taskid + "," + name + ... + ")"
        RawTask(JSONObject recored) {
            this.taskid = recored.getIntValue("taskid");
            this.name = com.alibaba.fastjson2.JSON.parseArray(recored.getString("name"), String.class);
            this.completecondition = Completecondition._parse(recored.getJSONObject("completecondition"));
        }
        public int key() { return taskid; }
        public int getTaskid() { return taskid; }
        /* javadoc 注释 + getter，无 setter */
        @Override public String toString() { ... }
    }

    // 多主键时（另一张表）：
    public static class RawTaskKey {
        private final int lootid; private final int itemid;
        RawTaskKey(int lootid, int itemid) { ... }
        @Override public int hashCode() { return java.util.Objects.hash(lootid, itemid); }
        @Override public boolean equals(Object other) {
            if (!(other instanceof RawTaskKey)) return false;
            RawTaskKey o = (RawTaskKey) other;
            return lootid == o.lootid && itemid == o.itemid;
        }
    }

    public Map<Object, RawTask> tableMap;
    private static class Holder { static final RawTasks INSTANCE = new RawTasks(); }
    public static RawTasks getInstance() { return Holder.INSTANCE; }

    // 枚举常量（isEnumTable 且有数据）：
    public static final int KILL_MONSTER = 1;
    // getByName（枚举名字段非主键时）：
    private Map<String, RawTask> nameMap;
    public RawTask getByName(String name) { return nameMap.get(name); }

    // uniqueKey 索引：
    private Map<Object, RawTask> rankMap;   // mapField=uniqueKeyMapName 产物
    public RawTask getByRank(int rank) { return rankMap.get(rank); }

    public void init() {
        PBData.table_info.Builder infoBuilder = PBData.table_info.newBuilder();
        try {
            List<JSONObject> recoreds = DataStoreCompat.queryStaticList("select * from `cfg_task`");
            tableMap = new HashMap<>();
            for (JSONObject recored : recoreds) {           // Python 用 stream，for 循环等价更清晰
                RawTask newOne = new RawTask(recored);
                tableMap.put(newOne.key(), newOne);
                // 枚举表: nameMap.put(recored.getString("name"), newOne);
                // uniqueKey: rankMap.put(newOne.getRank(), newOne);
                // 枚举一致性校验（有常量时）：
                //   if (tableMap.size() != EXPECTED) JLogger.error("cfg_task enum drift: rows=" + tableMap.size() + " expected=" + EXPECTED);
                if (infoBuilder.getColoumsCount() == 0) {
                    for (Map.Entry<String, Object> entry : recored.entrySet()) {
                        PBData.coloum_value_type valueType = PBData.coloum_value_type.value_string;
                        if (entry.getValue() instanceof Integer) valueType = PBData.coloum_value_type.value_int;
                        else if (entry.getValue() instanceof Float) valueType = PBData.coloum_value_type.value_float;
                        infoBuilder.addColoums(PBData.coloum_define.newBuilder().setName(entry.getKey()).setType(valueType));
                    }
                }
                PBData.one_record.Builder recordBuilder = PBData.one_record.newBuilder();
                for (int i = 0; i < infoBuilder.getColoumsCount(); i++) {
                    String name = infoBuilder.getColoums(i).getName();
                    recordBuilder.addRecords(recored.getString(name));
                }
                infoBuilder.addRecords(recordBuilder);
            }
        } catch (Exception e) {
            JLogger.error(e.getMessage(), e);
        }
        CfgVersions.getInstance().AddCfgPBInfo("cfg_task", infoBuilder);
    }

    public RawTask getByKey(int taskid) { return tableMap.get(taskid); }
    // 多主键: public RawTask getByKey(int lootid, int itemid) { return tableMap.get(new RawTaskKey(lootid, itemid)); }

    public static RawTask get(int taskid) { return getInstance().getByKey(taskid); }
    public static java.util.Collection<RawTask> all() { return getInstance().tableMap.values(); }

    // FK ref getter（仅当目标表也在生成集合中，Generator 层过滤）：
    public com.jedi.gameServer.mapper.raw.RawTaskextraexps getTaskextraexpRef() {
        return RawTaskextraexps.getInstance().getByKey(taskid);
    }
}
```

注意：
- 枚举一致性校验只生成 `EXPECTED = N` 行数比对（简单可靠：行数变了必然漂移），不做逐常量比对。
- `rowClass` 是 `RawTask`，嵌套在 `RawTasks` 里用 `public static class`（Python 是非 static 内部类，static 更正确——不持有外部引用）。
- text 字段类型：`java.util.List<java.lang.String>`（text 在 list 里时 item 是 String）。

- [ ] **Step 1: 写失败测试**：三个 fixture（单主键+枚举常量+FK ref、多主键 Key 类、uniqueKey + getByName），golden 断言关键行（`tableMap.put(newOne.key(), newOne);`、`Objects.hash(lootid, itemid)`、`public static final int KILL_MONSTER = 1;`、`getTaskextraexpRef`、`AddCfgPBInfo("cfg_task"`、无 `set`）
- [ ] **Step 2: 确认 FAIL**
- [ ] **Step 3: 实现 genRawClass**（模板长，按 golden 分小函数拼：`genRowClass/genKeyClass/genInit/genQueries`）
- [ ] **Step 4: PASS**
- [ ] **Step 5: Commit** `feat(gen): javamapper raw class template`

---

### Task 5: 子类模板 + initAll/verifyRefs + Generator 主类 + 注册 + 集成测试

**Files:**
- Modify: `packages/gen/src/JavaMapperTemplates.ts`（genChildClass/genInitAll）
- Create: `packages/gen/src/JavaMapperGenerator.ts`
- Modify: `packages/gen/src/index.ts`（export）
- Modify: `packages/cli/src/Main.ts`（注册）
- Create: `packages/gen/src/__tests__/JavaMapperGenerator.test.ts`

**Interfaces:**
- Consumes: Task 1-4 全部；`Context.makeValueWithTag/cfgData()`、`CachedFiles.writeFile/keepMetaAndDeleteOtherFiles`
- Produces:

```typescript
// JavaMapperTemplates.ts
export interface ChildModel { pkg: string; className: string; rawClassFqn: string; }
export function genChildClass(m: ChildModel): string;
export interface InitAllModel {
  pkg: string;
  rows: { rawFqn: string; initFqn: string }[];  // initFqn=child 存在时用 child
  verifyTargets: { rawFqn: string; rowFqn: string; fields: { field: string; refGetter: string; nullable: boolean; keyExpr: string }[] }[];
}
export function genInitAll(m: InitAllModel): string;

// JavaMapperGenerator.ts
export class JavaMapperGenerator extends GeneratorWithTag {
  constructor(parameter: Parameter);
  async generate(ctx: Context): Promise<void>;
}
```

`verifyRefs` 生成形态：

```java
public static java.util.List<String> verifyRefs() {
    java.util.List<String> errs = new java.util.ArrayList<>();
    for (com.jedi.gameServer.mapper.raw.RawTasks.RawTask row : RawTasks.getInstance().tableMap.values()) {
        if (row.getNexttask() != 0 && row.getNexttaskRef() == null) {   // 非空 FK 且引用缺失
            errs.add("cfg_task key=" + row.key() + " field=nexttask -> cfg_task missing");
        }
        // nullable FK 不校验（null 合法）
    }
    /* 每表一块 */
    return errs;
}
```

（`!= 0` 判空模板按字段类型：int/long/float `!= 0`；bool 直接跳过校验（无 FK bool）；str `!= null && !isEmpty()`。）

Generator 主流程：

```typescript
async generate(ctx: Context): Promise<void> {
  const cfgValue = ctx.makeValueWithTag(this.tag);
  this.dstDir = path.join(this.dir, this.pkg.replace('.', '/'));
  // 1. child 表名校验：不存在的名字 throw Error（含全部合法名提示）
  // 2. 收集：cfgValue.sortedTables() → 每表 RawTableModel；可达 POJO = 从表字段递归收集 struct/interface（用 WorkSet 防重、防环——struct 字段引用 struct）
  // 3. 写 bean/：全部 POJO（CachedFiles）
  // 4. 写 raw/：genRawClass × N + CfgMapperInit.java
  //    - FK ref：目标表在生成集合中才加进 fks；否则 Logger.log 跳过
  //    - enumConstants：vTable.enumNameToIntegerValueMap（表有数据时非 null）
  // 5. 写 cfg/：child 表且文件不存在 → genChildClass；存在 → Logger.log 跳过
  // 6. CachedFiles.keepMetaAndDeleteOtherFiles(rawDir); keepMetaAndDeleteOtherFiles(beanDir);
  //    （cfgDir 不清理！）
}
```

参数（constructor 读取）：`dir`(默认 `mapper`)、`pkg`(默认 `com.jedi.gameServer.mapper`)、`child`(默认 `''`，**分号分隔**)、`encoding`(默认 `UTF-8`，本版本仅校验值合法不使用)。`child` 校验用 `cfgValue.getTable(name)`。

- [ ] **Step 1: 写失败集成测试**（fixture 仿 SqlGenerator.test.ts：临时目录 + config.cfg + csv）：

```typescript
// fixture 覆盖：task[id]{...->task2 FK}、lootitem[lootid,itemid] 多主键、
// enum 表 completeconditiontype[enum]、含 struct 字段表、child:task
const gen = new JavaMapperGenerator(mockParameter({ dir: outDir, child: 'task' }));
await gen.generate(await makeContext());
// 断言文件存在: raw/RawTasks.java raw/RawLootitems.java raw/CfgMapperInit.java
//              bean/TestDefaultBean.java bean/task/Completecondition.java cfg/Tasks.java
// 断言 cfg/Tasks.java 内容（prepareData 钩子）
// 二次运行：预写手写内容到 cfg/Tasks.java → 再 generate → 内容不变（跳过）
// child 不存在表名 → reject
```

- [ ] **Step 2: FAIL** → **Step 3: 实现全部**（模板 + Generator + `index.ts` export + Main.ts 加 `Generators.addProvider('javamapper', (p) => new JavaMapperGenerator(p));`）
- [ ] **Step 4: `vitest run --project packages` 全量 PASS**（现有测试零回归）
- [ ] **Step 5: 手工验证 example**：

```bash
cd G:/project/github/cfggen && G:/soft/nodeJs/npx.cmd vitest run --project packages packages/cli/src/__tests__/  # 或直接跑 CLI（见下）
node packages/cli/dist/Main.js -datadir example/config -gen javamapper,dir:G:/tmp/jm -p ... # 若 dist 可跑；否则照 JavaCodeGenerator 调试方式用 vitest 临时用例跑 example/config，抽查 RawTasks.java/Jewelrysuit.java 可读性
```

- [ ] **Step 6: Commit** `feat(gen): javamapper generator with child classes and CfgMapperInit`

---

### Task 6: 文档同步（README/DEVELOPER_GUIDE/Help）

**Files:**
- Modify: `README.md`（生成器列表加 `javamapper` 行，参数表）
- Modify: `DEVELOPER_GUIDE.md`（gen 包文件清单加新文件一句话说明）
- Test: 无新测试；验证 `Help.ts` 输出自动包含（ParameterInfoCollector 自动收集，无需改 Help.ts——确认即可）

**Interfaces:** 无代码接口。

- [ ] **Step 1: README 生成器表加行**：

```markdown
| `javamapper` | Java mapper 类（MySQL 运行时加载，`DataStoreCompat`+PBData 推送，强类型 POJO，替代 Python autoCfgFile.py） | `dir`=mapper, `pkg`=com.jedi.gameServer.mapper, `child`=（分号分隔表名，生成 prepareData 钩子子类，已存在则跳过） |
```

（以 README 现有表格格式为准，先看现有 `java`/`sql` 行的写法照抄格式。）

- [ ] **Step 2: DEVELOPER_GUIDE.md gen 包清单加 4 个文件一句话说明**
- [ ] **Step 3: 确认 help 输出**：跑 `G:/soft/nodeJs/npx.cmd vitest run --project packages packages/cli/src/__tests__`（若 CLI help 有快照测试）；无则跳过
- [ ] **Step 4: Commit** `docs: javamapper generator`

---

## Self-Review 结论（已执行）

- **Spec 覆盖**：§2 参数/child 校验→T5；§3.1 raw 类全部特性→T4；§3.2 POJO/$type/$entry→T3（map 循环方案已按 JSON 契约修正）；§3.3 child 跳过→T5；§3.4 initAll/verifyRefs→T5；§4 类型→T1/T2；§5 命名→T2；§6 公共层→T1（camelToSnake 条目已在 spec 修正为复用 SqlRender，T2 直接 import）；§8 错误处理→T5；§9 测试→各任务。无缺口。
- **类型一致性**：`parseExpr` 在 T2 定义与 T3 使用处已对齐（map/list-of-struct 由模板层处理，T3 注意同步收窄 T2 的 parseExpr 注释——已在 T3 正文说明修正）。
- **占位符**：golden 代码均给出；`/* ... */` 仅表示"其余字段同构"，模板实现按同构规则展开，非缺失规格。
