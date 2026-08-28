/**
 * JavaName — TypeScript port of Java `configgen.genjava.code.Name` + `NameableName`.
 *
 * Resolves a CFG nameable (struct/interface/table) into Java package name,
 * class name, full qualified name, and file path.
 *
 * Java has two classes (Name for static utilities + NameableName for per-nameable
 * resolution); in TS we merge them into one file for cohesion.
 *
 * Static state (codeTopPkg, beautifulName, isSealedInterface) is set once
 * by JavaCodeGenerator.generate() before rendering begins.
 *
 * Pure type/name utilities live in JavaTypeUtil.ts and method-string helpers
 * in JavaMethodStr.ts (parameterized, no static state); this file re-exports
 * them under the original names, injecting module static state so existing
 * callers (javaTemplates.ts etc.) keep their exact behavior and signatures.
 *
 * Java sources:
 * - configgen.genjava.code.Name.java (137 lines)
 * - configgen.genjava.code.NameableName.java (61 lines)
 */

import type {
  Nameable,
  TableSchema,
  ForeignKeySchema,
  KeySchema,
  FieldSchema,
  FieldType,
} from '@cfgforge/schema';
import { StructSchema, InterfaceSchema, isEEnum } from '@cfgforge/schema';
import {
  Primitive,
  isStructRef,
  isSimpleType,
  isFList,
  isFMap,
  isRefPrimary,
  isRefList,
  RefList,
  RefPrimary,
  RefUniq,
  type FMap as FMapType,
  type StructRef,
} from '@cfgforge/schema';
import { upper1 } from '@cfgforge/shared';

import {
  typeOf,
  boxTypeOf,
  enumFieldNameOf,
  pascalNameOf,
  type TypeOpts,
} from './JavaTypeUtil.js';

// Pure parameterized utilities re-exported for reuse (e.g. javamapper generator).
export {
  typeOf,
  boxTypeOf,
  enumFieldNameOf,
  pascalNameOf,
  upperStartSegments,
  isJavaPrimitive,
  type TypeOpts,
} from './JavaTypeUtil.js';
export {
  actualParams,
  actualParamsKeyRaw,
  keyDisplayExpr,
  hashCodes,
  equalsExpr,
  equal,
} from './JavaMethodStr.js';
import { formalParams as formalParamsOf, actualParamsKey as actualParamsKeyOf, keyClassNameOf } from './JavaMethodStr.js';

// ---------------------------------------------------------------------------
// Static state — set by JavaCodeGenerator.generate() before rendering
// ---------------------------------------------------------------------------

let _codeTopPkg: string = '';
let _beautifulName: boolean = false;
let _isSealedInterface: boolean = false;
let _isLangSwitch: boolean = false;

export function setCodeTopPkg(pkg: string): void { _codeTopPkg = pkg; }
export function getCodeTopPkg(): string { return _codeTopPkg; }
export function setBeautifulName(v: boolean): void { _beautifulName = v; }
export function getBeautifulName(): boolean { return _beautifulName; }
export function setIsSealedInterface(v: boolean): void { _isSealedInterface = v; }
export function getIsSealedInterface(): boolean { return _isSealedInterface; }
export function setIsLangSwitch(v: boolean): void { _isLangSwitch = v; }
export function getIsLangSwitch(): boolean { return _isLangSwitch; }

/**
 * TypeOpts capturing the current module static state.
 * resolveNameable keeps struct refs routed through NameableName (original behavior).
 */
function currentOpts(): TypeOpts {
  return { langSwitchText: _isLangSwitch, codeTopPkg: _codeTopPkg, resolveNameable: fullName };
}

// ---------------------------------------------------------------------------
// Name utility functions (from Name.java)
// ---------------------------------------------------------------------------

/** enum/entry constant field name */
export function enumFieldName(enumName: string): string {
  return enumFieldNameOf(enumName, _beautifulName);
}

/** PascalCase a single name segment */
export function pascalName(part: string): string {
  return pascalNameOf(part, _beautifulName);
}

export function GetByKeyFunctionNameInConfigMgr(
  keySchema: KeySchema,
  isPrimaryKey: boolean,
  nameable: Nameable,
): string {
  const name = 'get' + nameable.name().split('.').map(pascalName).join('');
  if (isPrimaryKey) return name;
  return name + 'By' + keySchema.fields().map(upper1).join('');
}

export function GetByKeyFunctionName(keySchema: KeySchema, isPrimaryKey: boolean): string {
  if (isPrimaryKey) return 'get';
  return 'getBy' + keySchema.fields().map(upper1).join('');
}

export function uniqueKeyMapName(keySchema: KeySchema): string {
  return keySchema.fields().map(upper1).join('') + 'Map';
}

export function keyClassName(keySchema: KeySchema, nullableName?: NameableName | null): string {
  return keyClassNameOf(keySchema, nullableName, currentOpts());
}

export function fullName(nameable: Nameable): string {
  return new NameableName(nameable).fullName;
}

export function tableDataFullName(table: TableSchema): string {
  const postfix =
    isEEnum(table.entry) && !isEnumAndHasOnlyPrimaryKeyAndEnumStr(table) ? '_Detail' : '';
  return new NameableName(table, postfix).fullName;
}

export function refType(table: TableSchema): string {
  return new NameableName(table).fullName;
}

export function refTypeFromFK(fk: ForeignKeySchema): string {
  const refTable = fk.refTableSchema();
  if (!refTable) throw new Error('refTableSchema not resolved for fk: ' + fk.name);

  if (isRefList(fk.refKey)) {
    return 'java.util.List<' + refType(refTable) + '>';
  }
  // RefSimple (RefPrimary or RefUniq)
  const firstLocal = fk.key.fieldSchemas()![0];
  const firstType = firstLocal.type;
  // Java's switch matches SimpleType (which includes both Primitive and StructRef).
  // TS must check both since a foreign key field can be a struct ref (e.g. LevelRank).
  if (isSimpleType(firstType)) {
    return refType(refTable);
  }
  if (isFList(firstType)) {
    return 'java.util.List<' + refType(refTable) + '>';
  }
  if (isFMap(firstType)) {
    return 'java.util.Map<' + boxType((firstType as FMapType).key) + ', ' + refType(refTable) + '>';
  }
  throw new Error('unexpected firstLocal type for refType');
}

export function refName(fk: ForeignKeySchema): string {
  let prefix: string;
  if (fk.refKey instanceof RefList) {
    prefix = 'ListRef';
  } else {
    // RefSimple (RefPrimary | RefUniq)
    prefix = (fk.refKey as RefPrimary | RefUniq).nullable ? 'NullableRef' : 'Ref';
  }
  return prefix + upper1(fk.name);
}

// ---------------------------------------------------------------------------
// TypeStr helpers (from TypeStr.java — needed by keyClassName/refType)
// ---------------------------------------------------------------------------

export function type(t: FieldType): string {
  return typeOf(t, currentOpts());
}

export function boxType(t: FieldType): string {
  return boxTypeOf(t, currentOpts());
}

export function readValue(t: FieldType): string {
  if (t === Primitive.BOOL) return 'input.readBool()';
  if (t === Primitive.INT) return 'input.readInt()';
  if (t === Primitive.LONG) return 'input.readLong()';
  if (t === Primitive.FLOAT) return 'input.readFloat()';
  if (t === Primitive.STRING) return 'input.readStringInPool()';
  if (t === Primitive.TEXT) return _isLangSwitch ? _codeTopPkg + '.Text._create(input)' : 'input.readTextInPool()';
  if (isStructRef(t)) return fullName((t as StructRef).obj!) + '._create(input)';
  return ''; // FList/FMap return null (handled by templates)
}

export function defaultValue(t: FieldType): string {
  if (t === Primitive.BOOL) return 'false';
  if (t === Primitive.INT || t === Primitive.LONG || t === Primitive.FLOAT) return '0';
  if (t === Primitive.STRING || t === Primitive.TEXT) return '""';
  if (isFList(t)) return 'new java.util.ArrayList<>()';
  if (isFMap(t)) return 'new java.util.LinkedHashMap<>()';
  if (isStructRef(t)) return 'null';
  throw new Error('unknown FieldType: ' + t);
}

// isJavaPrimitive moved to JavaTypeUtil.ts (re-exported above).

// ---------------------------------------------------------------------------
// GenJavaUtil (from GenJavaUtil.java)
// ---------------------------------------------------------------------------

export function isEnumAndHasOnlyPrimaryKeyAndEnumStr(tableSchema: TableSchema): boolean {
  if (isEEnum(tableSchema.entry)) {
    const fz = tableSchema.fields().length;
    if (fz > 2) return false;
    if (isEnumAsPrimaryKey(tableSchema) && fz > 1) return false;
    return tableSchema.foreignKeys().length === 0;
  }
  return false;
}

function isEnumAsPrimaryKey(tableSchema: TableSchema): boolean {
  if (isEEnum(tableSchema.entry)) {
    const pks = tableSchema.primaryKey.fieldSchemas()!;
    return pks.length === 1 && pks[0] === (tableSchema.entry as any).fieldSchema;
  }
  return false;
}

// ---------------------------------------------------------------------------
// MethodStr helpers (from MethodStr.java) — pure impls live in JavaMethodStr.ts;
// these wrappers inject module static state so signatures/behavior are unchanged.
// ---------------------------------------------------------------------------

export function formalParams(fs: FieldSchema[]): string {
  return formalParamsOf(fs, currentOpts());
}

export function actualParamsKey(keySchema: KeySchema, pre: string, nullableName?: NameableName | null): string {
  return actualParamsKeyOf(keySchema, pre, nullableName ?? null, currentOpts());
}

export function tableGet(
  refTable: TableSchema,
  refSimple: RefSimpleType,
  actualParam: string,
): string {
  const name = new NameableName(refTable);

  if (isEEnum(refTable.entry)) {
    return name.fullName + '.get(' + actualParam + ')';
  } else {
    const pre = 'mgr.' + name.containerPrefix;
    if (isRefPrimary(refSimple)) {
      const pkfs = refTable.primaryKey.fieldSchemas()!;
      const isSeq = pkfs.length === 1 && pkfs[0].isSeq();
      if (isSeq) return pre + 'All[' + actualParam + ']';
      if (pkfs.length === 1) return pre + 'All.get(' + actualParam + ')';
      return pre + 'All.get(new ' + keyClassName(refTable.primaryKey, name) + '(' + actualParam + '))';
    }
    // RefUniq
    const refUniq = refSimple as any;
    const ukfs = refUniq.key.fieldSchemas()!;
    const isSeq = ukfs.length === 1 && ukfs[0].isSeq();
    const mapName = uniqueKeyMapName(refUniq.key);
    if (isSeq) return pre + mapName + '[' + actualParam + ']';
    if (refUniq.key.fields().length === 1) return pre + mapName + '.get(' + actualParam + ')';
    return pre + mapName + '.get(new ' + keyClassName(refUniq.key, name) + '(' + actualParam + '))';
  }
}

// Re-export for convenience
export type RefSimpleType = import('@cfgforge/schema').RefSimple;

// ---------------------------------------------------------------------------
// NameableName (from NameableName.java)
// ---------------------------------------------------------------------------

export class NameableName {
  readonly nameable: Nameable;
  readonly pkg: string;
  readonly className: string;
  readonly fullName: string;
  readonly path: string;
  readonly containerPrefix: string;

  constructor(nameable: Nameable, postfix: string = '') {
    this.nameable = nameable;
    const nullableInterface =
      nameable instanceof StructSchema ? nameable.nullableInterface() : null;
    const topPkg = _codeTopPkg;
    let name: string;
    if (nullableInterface) {
      name = nullableInterface.name().toLowerCase() + '.' + nameable.name();
    } else if (_isSealedInterface && nameable instanceof InterfaceSchema) {
      const split = nameable.name().split('.');
      const interfaceName = split[split.length - 1];
      name = nameable.name().toLowerCase() + '.' + interfaceName;
    } else {
      name = nameable.name();
    }

    name += postfix;
    this.containerPrefix = nameable.name().replace(/\./g, '_') + '_';
    const seps = name.split('.');
    const c = seps[seps.length - 1];
    const base = postfix.length === 0 ? c : c.substring(0, c.length - postfix.length);
    this.className = pascalName(base) + postfix;

    const pks = seps.slice(0, -1);
    if (pks.length === 0) {
      this.pkg = topPkg;
    } else {
      this.pkg = topPkg + '.' + pks.join('.');
    }

    this.fullName = this.pkg + '.' + this.className;
    if (pks.length === 0) {
      this.path = this.className + '.java';
    } else {
      this.path = pks.join('/') + '/' + this.className + '.java';
    }
  }
}
