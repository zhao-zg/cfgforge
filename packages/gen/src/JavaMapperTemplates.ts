/**
 * JavaMapperTemplates — javamapper 生成器的纯函数模板（输入输出均为字符串，不碰 IO）。
 *
 * Task 3 只含 POJO 部分：
 * - genPojoClass      struct bean / interface impl bean
 * - genInterfacePojo  interface bean（$type 静态工厂分发）
 *
 * 与 java generator（javaTemplates.ts）不共用模板层，但都只调公共层
 * （JavaMapperName/JavaTypeUtil）。
 *
 * 生成代码契约（JSON 契约来自 -gen sql 的 ValueToJson）：
 * - 字段 private final，构造器包私有，静态工厂 `_parse(JSONObject)` 是唯一公开入口：
 *   先逐字段解析到局部变量（局部变量名=字段名，参数即局部），最后 new 构造器。
 * - 仅 getter，无 setter（行对象不可变，配置是全局共享只读数据）。
 * - map 字段：SQL 里 VMap 存的是 [{"$type":"$entry","key":..,"value":..}] 数组，
 *   fastjson TypeReference 解不了 → 手写 LinkedHashMap 循环；value 为 struct/interface
 *   时对象在 $entry 的 "value" 字段下（`Xxx._parse(e.getJSONObject("value"))`）。
 *   list 元素为 struct/interface 时无 $entry 包装，直接 `Xxx._parse(e)`。
 * - key/value/元素的标量读取表达式由模板内联的 scalarReadExpr 生成
 *   （parseExpr 固定 `o.` 前缀，对不上循环变量 `e.`，且 map/struct 容器本就 throw）。
 * - bean 类互相引用一律 FQN（不 import）；顶层 import fastjson2：
 *   JSON（基础 list，按需）/JSONObject（_parse 签名恒引用，无条件输出）。
 * - $type 匹配用 schema fullName 精确相等（防同名 impl 嵌套歧义），常量在前的
 *   equals 保证 $type 缺失（null）不 NPE，不匹配抛 IllegalArgumentException。
 */

import type { FieldType } from '@cfgforge/schema';
import { Primitive } from '@cfgforge/schema';
import { upper1 } from '@cfgforge/shared';

import { mapperFieldType, parseExpr } from './JavaMapperName';
import type { TypeOpts } from './JavaTypeUtil';
import type { PojoFieldModel, PojoModel, InterfacePojoModel } from './JavaMapperModel';

// ---------------------------------------------------------------------------
// genPojoClass — struct bean / interface impl bean
// ---------------------------------------------------------------------------

export function genPojoClass(m: PojoModel, opts: TypeOpts): string {
  const o = requireResolveNameable(opts);

  const L: string[] = [];
  L.push(`package ${m.pkg};`);
  L.push('');

  // imports：JSONObject 无条件输出（_parse(JSONObject o) 签名恒引用，即使字段为空），
  // JSON 仅基础 list 用到时输出；bean 互相引用用 FQN，不 import
  const uses = analyzeFieldUsage(m.fields);
  L.push('import com.alibaba.fastjson2.JSONObject;');
  if (uses.json) L.push('import com.alibaba.fastjson2.JSON;');

  // class decl
  if (m.isInterfaceImpl) {
    L.push(`public class ${m.className} implements ${m.interfaceFqn} {`);
  } else {
    L.push(`public class ${m.className} {`);
  }
  L.push('');

  // type()：仅 hasEnumRef 的 interface 的 impl 生成（enumRefType 非空即视为需要）
  if (m.isInterfaceImpl && m.enumRefType !== null && m.enumRefConstName !== null) {
    L.push(`    @Override`);
    L.push(`    public ${m.enumRefType} type() {`);
    L.push(`        return ${m.enumRefType}.${m.enumRefConstName};`);
    L.push(`    }`);
    L.push('');
  }

  // field declarations
  for (const f of m.fields) {
    if (f.comment.length > 0) {
      L.push(`    /**`);
      for (const line of f.comment.split('\n')) {
        L.push(`     * ${line}`);
      }
      L.push(`     */`);
    }
    L.push(`    private final ${fieldDeclType(f, o)} ${f.name};`);
  }
  L.push('');

  // package-private constructor
  L.push(`    ${m.className}(${m.fields.map((f) => `${fieldDeclType(f, o)} ${f.name}`).join(', ')}) {`);
  for (const f of m.fields) {
    L.push(`        this.${f.name} = ${f.name};`);
  }
  L.push(`    }`);
  L.push('');

  // static factory _parse：先解析到局部变量，最后 new
  L.push(`    public static ${m.className} _parse(JSONObject o) {`);
  for (const f of m.fields) {
    genParseLocal(L, f, o);
  }
  L.push(`        return new ${m.className}(${m.fields.map((f) => f.name).join(', ')});`);
  L.push(`    }`);
  L.push('');

  // getters（仅 getter，无 setter）
  for (const f of m.fields) {
    L.push(`    public ${fieldDeclType(f, o)} get${upper1(f.name)}() {`);
    L.push(`        return ${f.name};`);
    L.push(`    }`);
    L.push('');
  }

  // toString："(" + f1 + "," + f2 + ... + ")"
  L.push(`    @Override`);
  L.push(`    public String toString() {`);
  if (m.fields.length === 0) {
    L.push(`        return "()";`);
  } else {
    L.push(`        return "(" + ${m.fields.map((f) => f.name).join(' + "," + ')} + ")";`);
  }
  L.push(`    }`);

  L.push(`}`);
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// genInterfacePojo — interface bean（$type 静态工厂分发）
// ---------------------------------------------------------------------------

export function genInterfacePojo(m: InterfacePojoModel, opts: TypeOpts): string {
  requireResolveNameable(opts);

  const L: string[] = [];
  L.push(`package ${m.pkg};`);
  L.push('');
  L.push(`import com.alibaba.fastjson2.JSONObject;`);
  L.push('');

  L.push(`public interface ${m.className} {`);
  L.push('');

  L.push(`    static ${m.className} _parse(JSONObject o) {`);
  L.push(`        String type = o.getString("$type");`);
  for (const impl of m.impls) {
    // $type 存 schema fullName，精确相等匹配（防 ConditionAnd 嵌套同名歧义）；
    // 常量在前的 equals：$type 缺失（null）走 throw 分支而非 NPE
    L.push(`        if ("${impl.fullName}".equals(type)) return ${implFqn(m.pkg, impl.className)}._parse(o);`);
  }
  L.push(`        throw new IllegalArgumentException("${m.className} unknown $type: " + type);`);
  L.push(`    }`);

  L.push(`}`);
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// internal helpers
// ---------------------------------------------------------------------------

/** resolveNameable 必须始终注入（Task 2 审查裁决：默认命名有两条不一致路径，不再兜底） */
function requireResolveNameable(opts: TypeOpts): TypeOpts {
  if (!opts.resolveNameable) {
    throw new Error('JavaMapperTemplates requires opts.resolveNameable to be injected');
  }
  return opts;
}

/** impl 的 bean FQN：与接口同包（bean/<接口命名空间>/） */
function implFqn(interfacePkg: string, implClassName: string): string {
  return `${interfacePkg}.${implClassName}`;
}

/**
 * 字段声明类型（原始类型不装箱：字段/getter/构造器用 int，容器元素才装箱）。
 * golden: `private final int testInt;` / `java.util.List<Integer>`。
 */
function fieldDeclType(f: PojoFieldModel, opts: TypeOpts): string {
  switch (f.fieldKind) {
    case 'scalar':
      return rawScalarType(f.type);
    case 'struct':
    case 'interface':
      return f.refClassName!;
    case 'list':
      return `java.util.List<${simpleElemType(f, opts)}>`;
    case 'map':
      return `java.util.Map<${scalarBoxType(f.keyType!, opts)}, ${simpleElemType(f, opts)}>`;
  }
}

/** 基础标量的原始类型（容器元素请走 mapperFieldType 装箱版本） */
function rawScalarType(t: FieldType): string {
  switch (t) {
    case Primitive.BOOL:
      return 'boolean';
    case Primitive.INT:
      return 'int';
    case Primitive.LONG:
      return 'long';
    case Primitive.FLOAT:
      return 'float';
    default: // STRING / TEXT
      return 'String';
  }
}

/** list 元素 / map value 的声明类型：struct/interface 用 refClassName，基础用 mapperFieldType */
function simpleElemType(f: PojoFieldModel, opts: TypeOpts): string {
  if (f.refClassName) return f.refClassName;
  return mapperFieldType(f.elemType ?? f.valueType!, opts);
}

/** map key：schema 约定必为基础标量 */
function scalarBoxType(t: FieldType, opts: TypeOpts): string {
  return mapperFieldType(t, opts);
}

/**
 * 模板内联的标量读取表达式（循环变量版 parseExpr 的同构逻辑）。
 * parseExpr 固定 `o.` 前缀 + 对 map/struct 容器 throw，`$entry` 循环里
 * 的 key/value 与 struct 元素读取只能在此生成（jsonVar 为 `o` 或 `e`）。
 */
function scalarReadExpr(jsonVar: string, fieldName: string, t: FieldType): string {
  switch (t) {
    case Primitive.BOOL:
      return `${jsonVar}.getBooleanValue("${fieldName}")`;
    case Primitive.INT:
      return `${jsonVar}.getIntValue("${fieldName}")`;
    case Primitive.LONG:
      return `${jsonVar}.getLongValue("${fieldName}")`;
    case Primitive.FLOAT:
      return `${jsonVar}.getFloatValue("${fieldName}")`;
    default: // STRING / TEXT
      return `${jsonVar}.getString("${fieldName}")`;
  }
}

/** 生成"局部变量 = 解析表达式"（或 $entry/struct 元素循环块），push 到 L */
function genParseLocal(L: string[], f: PojoFieldModel, opts: TypeOpts): void {
  const decl = fieldDeclType(f, opts);
  switch (f.fieldKind) {
    case 'scalar':
      // 基础标量走 parseExpr（`o.` 前缀正确）
      L.push(`        ${decl} ${f.name} = ${parseExpr(f.name, f.type, opts)};`);
      return;
    case 'struct':
    case 'interface':
      // struct/interface 单引用：`Xxx._parse(o.getJSONObject(...))` 用模型给的 FQN
      // （bean 互相引用不 import，parseExpr 的裸类名仅同包可用；golden 同接口分发用 FQN）
      L.push(`        ${decl} ${f.name} = ${f.refClassName}._parse(o.getJSONObject("${f.name}"));`);
      return;
    case 'list': {
      if (f.refClassName) {
        // struct/interface 元素 list：手写循环 + Xxx._parse(e)
        L.push(`        java.util.ArrayList<${f.refClassName}> ${f.name} = new java.util.ArrayList<>();`);
        L.push(`        for (JSONObject e : o.getJSONArray("${f.name}").toJavaList(JSONObject.class)) {`);
        L.push(`            ${f.name}.add(${f.refClassName}._parse(e));`);
        L.push(`        }`);
      } else {
        // 基础 list：JSON.parseArray
        L.push(`        ${decl} ${f.name} = ${parseExpr(f.name, f.type, opts)};`);
      }
      return;
    }
    case 'map': {
      // $entry 数组契约：手写循环（key/value 标量读取用内联 scalarReadExpr）
      L.push(`        java.util.LinkedHashMap<${scalarBoxType(f.keyType!, opts)}, ${simpleElemType(f, opts)}> ${f.name} = new java.util.LinkedHashMap<>();`);
      L.push(`        for (JSONObject e : o.getJSONArray("${f.name}").toJavaList(JSONObject.class)) {`);
      const keyExpr = scalarReadExpr('e', 'key', f.keyType!);
      const valueExpr = f.refClassName
        ? `${f.refClassName}._parse(e.getJSONObject("value"))` // value 为 struct/interface：对象在 $entry 的 "value" 字段下
        : scalarReadExpr('e', 'value', f.valueType!);
      L.push(`            ${f.name}.put(${keyExpr}, ${valueExpr});`);
      L.push(`        }`);
      return;
    }
  }
}

/** 统计字段解析用到的 fastjson2 符号（JSONObject 由 _parse 签名恒引用，模板无条件 import；此处只管 JSON 按需） */
function analyzeFieldUsage(fields: PojoFieldModel[]): { json: boolean } {
  const uses = { json: false };
  for (const f of fields) {
    if (f.fieldKind === 'list' && !f.refClassName) {
      uses.json = true; // 基础 list：JSON.parseArray
    }
  }
  return uses;
}
