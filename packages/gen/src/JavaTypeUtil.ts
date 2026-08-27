/**
 * JavaTypeUtil — 类型/命名的纯函数工具（从 JavaName.ts 拆出，参数化、无静态状态）。
 *
 * JavaName.ts re-export 这些函数并保留原签名（用模块静态状态转发）；
 * javamapper 等新 generator 直接用参数化版本，显式传 TypeOpts。
 */

import type { FieldType, Nameable } from '@cfgforge/schema';
import { Primitive, isStructRef, isFList, isFMap } from '@cfgforge/schema';
import { upper1, underscoreToPascalCase, toScreamingSnakeCase } from '@cfgforge/shared';

/** typeOf/boxTypeOf 的选项（全部显式传参，不读模块静态状态） */
export interface TypeOpts {
  /** text 类型生成 `${pkg}.Text` 还是 `String`；JavaName 传模块状态，javamapper 恒 false */
  langSwitchText: boolean;
  /** langSwitchText=true 时的顶层包名 */
  codeTopPkg?: string;
  /** 自定义 struct/interface 引用的全名解析（javamapper 用 bean 包）；缺省按命名空间简单拼接 */
  resolveNameable?: (n: Nameable) => string;
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
  if (isStructRef(t)) return structFullName(t.obj!, opts);
  if (isFList(t)) return 'java.util.List<' + _type(t.item, true, opts) + '>';
  if (isFMap(t))
    return 'java.util.Map<' + _type(t.key, true, opts) + ', ' + _type(t.value, true, opts) + '>';
  throw new Error('unknown FieldType: ' + t);
}

/**
 * struct/interface 引用的全名解析。
 * 本版本为简单实现：按 nameable 的命名空间拼接（类名按 beautiful=false 的 PascalCase）。
 * JavaName 通过 opts.resolveNameable 注入 NameableName 完整逻辑保持原行为；
 * javamapper（后续任务）注入 bean 包名映射。
 */
export function structFullName(nameable: Nameable, opts: TypeOpts): string {
  if (opts.resolveNameable) return opts.resolveNameable(nameable);
  const ns = nameable.namespace();
  const cls = pascalNameOf(nameable.lastName(), false);
  return ns ? ns + '.' + cls : cls;
}

/** enum/entry 常量字段名（参数化版；JavaName.enumFieldName 用模块静态状态转发） */
export function enumFieldNameOf(enumName: string, beautiful: boolean): string {
  return beautiful ? toScreamingSnakeCase(enumName) : enumName.toUpperCase();
}

/** PascalCase 单段名（参数化版；JavaName.pascalName 用模块静态状态转发） */
export function pascalNameOf(part: string, beautiful: boolean): string {
  return beautiful ? underscoreToPascalCase(part) : upper1(part);
}

/** 按 `.` 和 `_` 分段、各段首字母大写后拼接（如 `task.completeconditiontype` → `TaskCompleteconditiontype`） */
export function upperStartSegments(name: string): string {
  return name
    .split(/[._]/)
    .map(upper1)
    .join('');
}

/** 是否 Java 原始类型（boolean/int/long/float） */
export function isJavaPrimitive(t: FieldType): boolean {
  return t === Primitive.BOOL || t === Primitive.INT || t === Primitive.LONG || t === Primitive.FLOAT;
}
