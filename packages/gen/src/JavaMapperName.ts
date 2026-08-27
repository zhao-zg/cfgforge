/**
 * JavaMapperName — javamapper 生成器的命名规则与"字段 → 读取表达式"纯函数。
 *
 * 负责（后续所有 javamapper 任务依赖，签名固定）：
 * - mapperNames: 表 schema 全名 → Raw 行类/Key 类/子表类/SQL 表名
 * - rowReadExpr: 顶层行字段从 JSONObject（SQL 结果集）读取的表达式（SQL 列类型语义：bool=tinyint 0/1）
 * - parseExpr:   POJO _parse 内字段解析表达式（JSON 值语义：嵌套 bool 是 true/false）
 * - mapperFieldType: Java 字段声明类型（恒 langSwitchText:false）
 */

import type { FieldType, Nameable } from '@cfgforge/schema';
import { Primitive, isStructRef, isFList, isFMap } from '@cfgforge/schema';
import { sqlTableName } from './SqlRender';
import { boxTypeOf, upperStartSegments, type TypeOpts } from './JavaTypeUtil';

// ---------------------------------------------------------------------------
// mapperNames
// ---------------------------------------------------------------------------

export interface MapperNames {
  rawClass: string; // RawTasks
  rowClass: string; // RawTask
  keyClass: string; // RawTaskKey（多主键才有意义）
  childClass: string; // Tasks
  sqlTable: string; // cfg_task
}

/**
 * 表名（可含命名空间，如 task.completeconditiontype）→ 命名集合。
 * 分段规则：按 `.`（命名空间）和 `_`（Python 工具的 table.split("_")）分段，
 * 各段首字母大写后拼接，再加 `s` 后缀：
 *   task → Tasks / RawTask / RawTaskKey
 *   task.completeconditiontype → TaskCompleteconditiontypes / RawTaskCompleteconditiontypes
 *   task_extra → TaskExtras / RawTaskExtra
 */
export function mapperNames(schemaFullName: string): MapperNames {
  const joined = upperStartSegments(schemaFullName); // Task / TaskCompleteconditiontype / TaskExtra
  const base = joined + 's'; // Tasks / TaskCompleteconditiontypes / TaskExtras
  return {
    rawClass: 'Raw' + base,
    rowClass: 'Raw' + joined,
    keyClass: 'Raw' + joined + 'Key',
    childClass: base,
    sqlTable: sqlTableName(schemaFullName, 'cfg_'),
  };
}

// ---------------------------------------------------------------------------
// rowReadExpr — SQL 列类型语义（bool = tinyint 0/1）
// ---------------------------------------------------------------------------

/**
 * 顶层行字段的 JSONObject 读取表达式。
 * SQL 列类型语义：bool 落库为 tinyint(1) 0/1，须用 getIntValue 判 0；
 * str/text/struct/interface/list/map 列均为 JSON 文本，用 getString。
 * （变量名 recored 沿用 Python 工具的历史拼写，保持生成代码一致。）
 */
export function rowReadExpr(fieldName: string, t: FieldType): string {
  switch (t) {
    case Primitive.BOOL:
      return `(recored.getIntValue("${fieldName}") != 0)`;
    case Primitive.INT:
      return `recored.getIntValue("${fieldName}")`;
    case Primitive.LONG:
      return `recored.getLongValue("${fieldName}")`;
    case Primitive.FLOAT:
      return `recored.getFloatValue("${fieldName}")`;
    default:
      // STRING / TEXT / StructRef / FList / FMap（SQL 列为 JSON 文本）
      return `recored.getString("${fieldName}")`;
  }
}

// ---------------------------------------------------------------------------
// parseExpr — POJO _parse 内 JSON 值语义
// ---------------------------------------------------------------------------

/**
 * POJO _parse 内部字段解析表达式（fastjson，o 为 JSONObject）。
 *
 * 范围（map/struct 元素容器不在内——模板层手写循环）：
 * - 基础标量：getBooleanValue/getIntValue/getLongValue/getFloatValue/getString
 * - 基础 list：JSON.parseArray(o.getString("f"), X.class)（元素为包装类）
 * - struct/interface 单引用：Xxx._parse(o.getJSONObject("f"))
 * - 基础 map 与 struct/interface 元素的 list/map：SQL 里 VMap 存的是
 *   [{"key":..,"value":..}] 数组，fastjson TypeReference 解不了，
 *   由模板层手写循环 —— parseExpr 对这些类型直接 throw，防止误用。
 */
export function parseExpr(fieldName: string, t: FieldType, opts: TypeOpts): string {
  if (isFMap(t)) {
    throw new Error(`parseExpr: FMap field "${fieldName}" is handled by template loop`);
  }
  if (isFList(t)) {
    const item = t.item;
    if (isStructRef(item)) {
      throw new Error(
        `parseExpr: struct-element list "${fieldName}" is handled by template loop`,
      );
    }
    // 基础 list：元素为包装类（Integer/Boolean/Long/Float/String）
    return `JSON.parseArray(o.getString("${fieldName}"), ${boxTypeOf(item, opts)}.class)`;
  }
  if (isStructRef(t)) {
    const cls = structClassOf(t.obj, opts);
    return `${cls}._parse(o.getJSONObject("${fieldName}"))`;
  }
  // Primitive
  switch (t) {
    case Primitive.BOOL:
      return `o.getBooleanValue("${fieldName}")`;
    case Primitive.INT:
      return `o.getIntValue("${fieldName}")`;
    case Primitive.LONG:
      return `o.getLongValue("${fieldName}")`;
    case Primitive.FLOAT:
      return `o.getFloatValue("${fieldName}")`;
    default: // STRING / TEXT
      return `o.getString("${fieldName}")`;
  }
}

// ---------------------------------------------------------------------------
// mapperFieldType
// ---------------------------------------------------------------------------

/**
 * Java 字段类型声明：typeOf + box + 恒定 langSwitchText:false
 * （javamapper 不做 i18n 文本切换，text 一律 String）。
 * 强制 resolveNameable 生效：struct/interface 引用解析为 bean 类名。
 */
export function mapperFieldType(t: FieldType, opts: TypeOpts): string {
  const effective: TypeOpts = { ...opts, langSwitchText: false };
  if (!effective.resolveNameable) {
    // 强制 structRef 走类名路径（仅类名，不带命名空间），
    // 与 parseExpr 的 `Xxx._parse(...)` 类名保持一致。
    effective.resolveNameable = (n) => upperStartSegments(n.lastName());
  }
  return boxTypeOf(t, effective);
}

// ---------------------------------------------------------------------------
// internal helpers
// ---------------------------------------------------------------------------

/**
 * struct/interface 引用映射为 Java 类名（仅类名，不带包名/命名空间），
 * 供 `Xxx._parse(...)` 表达式使用。
 * opts.resolveNameable 优先（javamapper 注入 bean 包名映射时可直接复用）。
 */
function structClassOf(nameable: Nameable | null, opts: TypeOpts): string {
  if (!nameable) throw new Error('structRef not resolved: obj is null');
  if (opts.resolveNameable) {
    const resolved = opts.resolveNameable(nameable);
    // resolveNameable 可能返回带包名的全名（如 com.example.bean.TestBean），取最后一段类名
    const idx = resolved.lastIndexOf('.');
    return idx === -1 ? resolved : resolved.substring(idx + 1);
  }
  return upperStartSegments(nameable.lastName());
}
