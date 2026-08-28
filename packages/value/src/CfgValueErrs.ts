/**
 * CfgValueErrs — TypeScript port of Java `configgen.value.CfgValueErrs`.
 *
 * Two-level error collector: errs / warns.
 * Each message is an interface with a `_tag` discriminant field and a `msg()` method.
 * CfgValueException holds a reference to the CfgValueErrs instance.
 *
 * Java source: configgen.value.CfgValueErrs.java (239 lines)
 */

import { DFile, type Source } from '@cfgforge/data';
import type { FieldType } from '@cfgforge/schema';
import type { Value } from './CfgValue.js';

// ---------------------------------------------------------------------------
// Msg interfaces (discriminated unions via _tag) — mirrors CfgSchemaErrs pattern
// ---------------------------------------------------------------------------

export interface Msg {
  readonly _tag: string;
  msg(): string;
}

export interface VErr extends Msg {}
export interface VWarn extends Msg {}

// ---------------------------------------------------------------------------
// VErr records (18 types)
// ---------------------------------------------------------------------------

/** pack格式不对 */
export interface ParsePackErr extends VErr {
  readonly _tag: 'ParsePackErr';
  readonly source: Source;
  readonly nameable: string;
  readonly err: string;
}

/** interface没有这个impl */
export interface InterfaceCellImplNotFound extends VErr {
  readonly _tag: 'InterfaceCellImplNotFound';
  readonly source: Source;
  readonly interfaceName: string;
  readonly notFoundImpl: string;
}

/** 内部错误，不该发生，请检查程序 */
export interface InternalError extends VErr {
  readonly _tag: 'InternalError';
  readonly internal: string;
}

/** 需要的cell个数不匹配 */
export interface FieldCellSpanNotEnough extends VErr {
  readonly _tag: 'FieldCellSpanNotEnough';
  readonly source: Source;
  readonly nameable: string;
  readonly field: string;
  readonly expected: number;
  readonly notEnoughDataSpan: number;
}

/** 需要的cell比实际提供的少，信息会丢失，可能是配错了 */
export interface FieldCellNotUsed extends VErr {
  readonly _tag: 'FieldCellNotUsed';
  readonly source: Source;
  readonly nameable: string;
  readonly unused: string[];
}

/** 类型不匹配 */
export interface NotMatchFieldType extends VErr {
  readonly _tag: 'NotMatchFieldType';
  readonly source: Source;
  readonly nameable: string;
  readonly field: string;
  readonly expectedType: FieldType;
}

/** 字典类型key重复 */
export interface MapKeyDuplicated extends VErr {
  readonly _tag: 'MapKeyDuplicated';
  readonly source: Source;
  readonly nameable: string;
  readonly field: string;
}

/** 主键或唯一键重复 */
export interface PrimaryOrUniqueKeyDuplicated extends VErr {
  readonly _tag: 'PrimaryOrUniqueKeyDuplicated';
  readonly value: Value;
  readonly table: string;
  readonly keys: string[];
}

/** 枚举字符串为空 */
export interface EnumEmpty extends VErr {
  readonly _tag: 'EnumEmpty';
  readonly source: Source;
  readonly table: string;
}

/** 入口或枚举字符串包含空格 */
export interface EntryContainsSpace extends VErr {
  readonly _tag: 'EntryContainsSpace';
  readonly source: Source;
  readonly table: string;
}

/** 入口或枚举字符串有重复 */
export interface EntryDuplicated extends VErr {
  readonly _tag: 'EntryDuplicated';
  readonly source: Source;
  readonly table: string;
}

/** 声明mustFill的字段，excel格子不能为空 */
export interface MustFillButCellEmpty extends VErr {
  readonly _tag: 'MustFillButCellEmpty';
  readonly value: Value;
}

/** 有外键的字段，excel格子不能为空 */
export interface RefNotNullableButCellEmpty extends VErr {
  readonly _tag: 'RefNotNullableButCellEmpty';
  readonly value: Value;
  readonly recordId: string;
}

/** 外键未找到 */
export interface ForeignValueNotFound extends VErr {
  readonly _tag: 'ForeignValueNotFound';
  readonly value: Value;
  readonly recordId: string;
  readonly foreignTable: string;
  readonly foreignKey: string;
}

/** 读json文件出错 */
export interface JsonFileReadErr extends VErr {
  readonly _tag: 'JsonFileReadErr';
  readonly jsonFile: string;
  readonly errMsg: string;
}

/** json文件内容为空 */
export interface JsonStrEmpty extends VErr {
  readonly _tag: 'JsonStrEmpty';
  readonly source: DFile;
}

/** 解析json出错 */
export interface JsonParseException extends VErr {
  readonly _tag: 'JsonParseException';
  readonly source: DFile;
  readonly err: string;
}

/** json文件中$type类型未找到 */
export interface JsonTypeNotExist extends VErr {
  readonly _tag: 'JsonTypeNotExist';
  readonly source: DFile;
  readonly expected: string;
}

/** json文件中$type跟实际期待的不匹配 */
export interface JsonTypeNotMatch extends VErr {
  readonly _tag: 'JsonTypeNotMatch';
  readonly source: DFile;
  readonly type: string;
  readonly expected: string;
}

/** seq字段的值不连续 */
export interface SeqValueNotContinuous extends VErr {
  readonly _tag: 'SeqValueNotContinuous';
  readonly source: Source;
  readonly table: string;
  readonly field: string;
  readonly expectedValue: number;
}

// ---------------------------------------------------------------------------
// EType enum — JSON value type mismatch
// ---------------------------------------------------------------------------

export const EType = {
  BOOL: 'BOOL',
  INT: 'INT',
  LONG: 'LONG',
  FLOAT: 'FLOAT',
  STR: 'STR',
  ARRAY: 'ARRAY',
  MAP: 'MAP',
  MAP_ENTRY: 'MAP_ENTRY',
  STRUCT: 'STRUCT',
} as const;

export type EType = (typeof EType)[keyof typeof EType];

/** json文件中的值不是期待的类型 */
export interface JsonValueNotMatchType extends VErr {
  readonly _tag: 'JsonValueNotMatchType';
  readonly source: DFile;
  readonly value: string;
  readonly expectedType: EType;
}

// ---------------------------------------------------------------------------
// VWarn records (1 type)
// ---------------------------------------------------------------------------

/** json文件里包含了额外的字段，可能是json结构变化了 */
export interface JsonHasExtraFields extends VWarn {
  readonly _tag: 'JsonHasExtraFields';
  readonly source: DFile;
  readonly type: string;
  readonly extraFields: Set<string>;
}

// ---------------------------------------------------------------------------
// msg() — generic formatter (same pattern as CfgSchemaErrs)
// ---------------------------------------------------------------------------

function fmtVal(v: unknown): string {
  if (v instanceof Set) {
    return `[${[...v].join(', ')}]`;
  }
  if (Array.isArray(v)) {
    return `[${v.join(', ')}]`;
  }
  if (v instanceof DFile) {
    return v.fileName;
  }
  return String(v);
}

function formatMsg(m: Msg): string {
  const keys = Object.keys(m).filter((k) => k !== '_tag' && k !== 'msg');
  const args = keys.map((k) => (m as unknown as Record<string, unknown>)[k]).map(fmtVal);
  return `${m._tag}(${args.join(', ')})`;
}

// Build a Msg object: attach msg() closure referencing the object itself
function makeMsgObj<T extends Msg>(obj: Omit<T, 'msg'>): T {
  const o = obj as T;
  o.msg = () => formatMsg(o);
  return o;
}

// ---------------------------------------------------------------------------
// Factory functions — VErr (18 types)
// ---------------------------------------------------------------------------

export function parsePackErr(source: Source, nameable: string, err: string): ParsePackErr {
  return makeMsgObj<ParsePackErr>({ _tag: 'ParsePackErr', source, nameable, err });
}

export function interfaceCellImplNotFound(
  source: Source,
  interfaceName: string,
  notFoundImpl: string,
): InterfaceCellImplNotFound {
  return makeMsgObj<InterfaceCellImplNotFound>({ _tag: 'InterfaceCellImplNotFound', source, interfaceName, notFoundImpl });
}

export function internalError(internal: string): InternalError {
  return makeMsgObj<InternalError>({ _tag: 'InternalError', internal });
}

export function fieldCellSpanNotEnough(
  source: Source,
  nameable: string,
  field: string,
  expected: number,
  notEnoughDataSpan: number,
): FieldCellSpanNotEnough {
  return makeMsgObj<FieldCellSpanNotEnough>({ _tag: 'FieldCellSpanNotEnough', source, nameable, field, expected, notEnoughDataSpan });
}

export function fieldCellNotUsed(source: Source, nameable: string, unused: string[]): FieldCellNotUsed {
  return makeMsgObj<FieldCellNotUsed>({ _tag: 'FieldCellNotUsed', source, nameable, unused });
}

export function notMatchFieldType(
  source: Source,
  nameable: string,
  field: string,
  expectedType: FieldType,
): NotMatchFieldType {
  return makeMsgObj<NotMatchFieldType>({ _tag: 'NotMatchFieldType', source, nameable, field, expectedType });
}

export function mapKeyDuplicated(source: Source, nameable: string, field: string): MapKeyDuplicated {
  return makeMsgObj<MapKeyDuplicated>({ _tag: 'MapKeyDuplicated', source, nameable, field });
}

export function primaryOrUniqueKeyDuplicated(
  value: Value,
  table: string,
  keys: string[],
): PrimaryOrUniqueKeyDuplicated {
  return makeMsgObj<PrimaryOrUniqueKeyDuplicated>({ _tag: 'PrimaryOrUniqueKeyDuplicated', value, table, keys });
}

export function enumEmpty(source: Source, table: string): EnumEmpty {
  return makeMsgObj<EnumEmpty>({ _tag: 'EnumEmpty', source, table });
}

export function entryContainsSpace(source: Source, table: string): EntryContainsSpace {
  return makeMsgObj<EntryContainsSpace>({ _tag: 'EntryContainsSpace', source, table });
}

export function entryDuplicated(source: Source, table: string): EntryDuplicated {
  return makeMsgObj<EntryDuplicated>({ _tag: 'EntryDuplicated', source, table });
}

export function mustFillButCellEmpty(value: Value): MustFillButCellEmpty {
  return makeMsgObj<MustFillButCellEmpty>({ _tag: 'MustFillButCellEmpty', value });
}

export function refNotNullableButCellEmpty(value: Value, recordId: string): RefNotNullableButCellEmpty {
  return makeMsgObj<RefNotNullableButCellEmpty>({ _tag: 'RefNotNullableButCellEmpty', value, recordId });
}

export function foreignValueNotFound(
  value: Value,
  recordId: string,
  foreignTable: string,
  foreignKey: string,
): ForeignValueNotFound {
  return makeMsgObj<ForeignValueNotFound>({ _tag: 'ForeignValueNotFound', value, recordId, foreignTable, foreignKey });
}

export function jsonFileReadErr(jsonFile: string, errMsg: string): JsonFileReadErr {
  return makeMsgObj<JsonFileReadErr>({ _tag: 'JsonFileReadErr', jsonFile, errMsg });
}

export function jsonStrEmpty(source: DFile): JsonStrEmpty {
  return makeMsgObj<JsonStrEmpty>({ _tag: 'JsonStrEmpty', source });
}

export function jsonParseException(source: DFile, err: string): JsonParseException {
  return makeMsgObj<JsonParseException>({ _tag: 'JsonParseException', source, err });
}

export function jsonTypeNotExist(source: DFile, expected: string): JsonTypeNotExist {
  return makeMsgObj<JsonTypeNotExist>({ _tag: 'JsonTypeNotExist', source, expected });
}

export function jsonTypeNotMatch(source: DFile, type: string, expected: string): JsonTypeNotMatch {
  return makeMsgObj<JsonTypeNotMatch>({ _tag: 'JsonTypeNotMatch', source, type, expected });
}

export function jsonValueNotMatchType(source: DFile, value: string, expectedType: EType): JsonValueNotMatchType {
  return makeMsgObj<JsonValueNotMatchType>({ _tag: 'JsonValueNotMatchType', source, value, expectedType });
}

export function seqValueNotContinuous(
  source: Source,
  table: string,
  field: string,
  expectedValue: number,
): SeqValueNotContinuous {
  return makeMsgObj<SeqValueNotContinuous>({ _tag: 'SeqValueNotContinuous', source, table, field, expectedValue });
}

// ---------------------------------------------------------------------------
// Factory functions — VWarn (1 type)
// ---------------------------------------------------------------------------

export function jsonHasExtraFields(source: DFile, type: string, extraFields: Set<string>): JsonHasExtraFields {
  return makeMsgObj<JsonHasExtraFields>({ _tag: 'JsonHasExtraFields', source, type, extraFields });
}

// ---------------------------------------------------------------------------
// CfgValueException
// ---------------------------------------------------------------------------

export class CfgValueException extends Error {
  readonly errs: CfgValueErrs;

  constructor(errs: CfgValueErrs) {
    super(`CfgValueException: ${errs.errs.length} error(s)`);
    this.name = 'CfgValueException';
    this.errs = errs;
  }

  getErrs(): CfgValueErrs {
    return this.errs;
  }
}

// ---------------------------------------------------------------------------
// CfgValueErrs
// ---------------------------------------------------------------------------

export class CfgValueErrs {
  readonly errs: VErr[];
  readonly warns: VWarn[];

  private constructor(errs: VErr[], warns: VWarn[]) {
    this.errs = errs;
    this.warns = warns;
  }

  static of(): CfgValueErrs {
    return new CfgValueErrs([], []);
  }

  addErr(err: VErr): void {
    this.errs.push(err);
  }

  addWarn(warn: VWarn): void {
    this.warns.push(warn);
  }

  merge(other: CfgValueErrs): void {
    for (const e of other.errs) this.errs.push(e);
    for (const w of other.warns) this.warns.push(w);
  }

  /**
   * Java has two overloads:
   *   checkErrors(prefix, allowErr) → checkErrors(prefix, allowErr, Logger.isWarningEnabled())
   *   checkErrors(prefix, allowErr, logWarn)
   *
   * In TS we use a single method with optional logWarn param.
   * When logWarn is omitted, it defaults to Logger.isWarningEnabled().
   */
  checkErrors(prefix: string, allowErr: boolean, logWarn?: boolean): void {
    const shouldLogWarn = logWarn ?? true; // default: log warnings

    if (shouldLogWarn && this.warns.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`${prefix} warnings ${this.warns.length}:`);
      for (const w of this.warns) {
        // eslint-disable-next-line no-console
        console.warn('\t' + w.msg());
      }
    }

    if (this.errs.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`${prefix} errors ${this.errs.length}:`);
      for (const e of this.errs) {
        // eslint-disable-next-line no-console
        console.warn('\t' + e.msg());
      }

      if (!allowErr) {
        // eslint-disable-next-line no-console
        console.warn('fix value errors first');
        throw new CfgValueException(this);
      }
    }
  }
}
