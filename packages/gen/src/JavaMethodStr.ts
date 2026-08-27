/**
 * JavaMethodStr — 方法片段的纯函数工具（从 JavaName.ts 的 MethodStr 段拆出）。
 *
 * 与 JavaTypeUtil 一样参数化、无静态状态：依赖类型的函数接受可选 TypeOpts
 * （默认 {langSwitchText:false}）；JavaName.ts 用模块静态状态包一层 re-export
 * 保持原签名与原行为，javamapper 等新 generator 直接用参数化版本。
 *
 * Java source: configgen.genjava.code.MethodStr.java
 */

import type { FieldSchema, KeySchema } from '@cfgforge/schema';
import { upper1, lower1 } from '@cfgforge/shared';
import { typeOf, boxTypeOf, isJavaPrimitive, type TypeOpts } from './JavaTypeUtil';

/** actualParamsKey/keyClassName 的宿主类参数只需 fullName（NameableName 结构兼容） */
export interface KeyClassNameTarget {
  fullName: string;
}

/**
 * key class 名（参数化版；JavaName.keyClassName 用模块静态状态转发到这里）。
 * 多字段 → `XxxYyyKey`（带宿主类则 `host.XxxYyyKey`）；单字段 → 该字段的包装类型。
 */
export function keyClassNameOf(
  keySchema: KeySchema,
  nullableName: KeyClassNameTarget | null | undefined,
  opts: TypeOpts,
): string {
  if (keySchema.fields().length > 1) {
    const klsName = keySchema.fields().map(upper1).join('') + 'Key';
    if (nullableName) {
      return nullableName.fullName + '.' + klsName;
    }
    return klsName;
  } else {
    try {
      const fs = keySchema.fieldSchemas();
      if (!fs || fs.length === 0) return '';
      return boxTypeOf(fs[0].type, opts);
    } catch {
      return '';
    }
  }
}

/** 形参列表：`Type name, Type name`（langSwitch 时 TEXT → `${pkg}.Text`） */
export function formalParams(fs: FieldSchema[], opts: TypeOpts = { langSwitchText: false }): string {
  return fs.map((f) => typeOf(f.type, opts) + ' ' + lower1(f.name)).join(', ');
}

/** 实参列表：`name, name` */
export function actualParams(keys: string[]): string {
  return keys.map(lower1).join(', ');
}

/** key 实参：多字段 key 包 `new XxxKey(...)`，单字段直接用值 */
export function actualParamsKey(
  keySchema: KeySchema,
  pre: string,
  nullableName: KeyClassNameTarget | null = null,
  opts: TypeOpts = { langSwitchText: false },
): string {
  const p = actualParamsKeyRaw(keySchema, pre);
  return keySchema.fields().length > 1
    ? 'new ' + keyClassNameOf(keySchema, nullableName, opts) + '(' + p + ')'
    : p;
}

/** key 实参（不包装 key class）：`preName, preName` */
export function actualParamsKeyRaw(keySchema: KeySchema, pre: string): string {
  return keySchema.fields().map((e) => pre + lower1(e)).join(', ');
}

/** key 的显示表达式：单字段 `name`；多字段 `"" + a + "," + b` */
export function keyDisplayExpr(keySchema: KeySchema): string {
  const fields = keySchema.fields();
  if (fields.length === 1) return lower1(fields[0]);
  return '"" + ' + fields.map((f) => lower1(f)).join(' + "," + ');
}

/** `java.util.Objects.hash(a, b)` */
export function hashCodes(fs: FieldSchema[]): string {
  return `java.util.Objects.hash(${fs.map((f) => lower1(f.name)).join(', ')})`;
}

/** 字段两两 equal 的 `&&` 串 */
export function equalsExpr(fs: FieldSchema[]): string {
  return fs.map((f) => equal(lower1(f.name), 'o.' + lower1(f.name), f.type)).join(' && ');
}

/** 原始类型用 `==`，其余用 `.equals()` */
export function equal(a: string, b: string, t: import('@cfgforge/schema').FieldType): string {
  return isJavaPrimitive(t) ? a + ' == ' + b : a + '.equals(' + b + ')';
}
