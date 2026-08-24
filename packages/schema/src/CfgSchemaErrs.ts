/**
 * CfgSchemaErrs — TypeScript port of Java `configgen.schema.CfgSchemaErrs`.
 *
 * Three-level error collector: errs / warns / weakWarns.
 * Each message is an interface with a `_tag` discriminant field and a `msg()` method.
 * CfgSchemaException holds a reference to the CfgSchemaErrs instance.
 */

// ---------------------------------------------------------------------------
// Msg interfaces (discriminated unions via _tag)
// ---------------------------------------------------------------------------

export interface Msg {
  readonly _tag: string;
  msg(): string;
}

// ---------------------------------------------------------------------------
// WeakWarn (2 records)
// ---------------------------------------------------------------------------

export interface FilterRefIgnoredByRefTableNotFound extends Msg {
  readonly _tag: 'FilterRefIgnoredByRefTableNotFound';
  readonly name: string;
  readonly foreignKey: string;
  readonly notFoundRefTable: string;
}

export interface FilterRefIgnoredByRefKeyNotFound extends Msg {
  readonly _tag: 'FilterRefIgnoredByRefKeyNotFound';
  readonly name: string;
  readonly foreignKey: string;
  readonly refTable: string;
  readonly notFoundRefKey: string[];
}

export type WeakWarn = FilterRefIgnoredByRefTableNotFound | FilterRefIgnoredByRefKeyNotFound;

// ---------------------------------------------------------------------------
// Warn (6 records — note: spec lists 5 but defines 6)
// ---------------------------------------------------------------------------

export interface NameMayConflictByRef extends Msg {
  readonly _tag: 'NameMayConflictByRef';
  readonly name1: string;
  readonly name2: string;
}

export interface StructNotUsed extends Msg {
  readonly _tag: 'StructNotUsed';
  readonly name: string;
}

export interface InterfaceNotUsed extends Msg {
  readonly _tag: 'InterfaceNotUsed';
  readonly name: string;
}

export interface LowercaseNotOnStrOrText extends Msg {
  readonly _tag: 'LowercaseNotOnStrOrText';
  readonly struct: string;
  readonly field: string;
  readonly unMatchedType: string;
}

export interface SuggestTypeUnknown extends Msg {
  readonly _tag: 'SuggestTypeUnknown';
  readonly table: string;
  readonly field: string;
  readonly unknownType: string;
}

export interface MapKeyNotSupportEnumType extends Msg {
  readonly _tag: 'MapKeyNotSupportEnumType';
  readonly struct: string;
  readonly field: string;
  readonly refEnum: string;
}

export type Warn =
  | NameMayConflictByRef
  | StructNotUsed
  | InterfaceNotUsed
  | LowercaseNotOnStrOrText
  | SuggestTypeUnknown
  | MapKeyNotSupportEnumType;

// ---------------------------------------------------------------------------
// Err (~40 records)
// ---------------------------------------------------------------------------

export interface FieldHeaderSpanNotEnough extends Msg {
  readonly _tag: 'FieldHeaderSpanNotEnough';
  readonly table: string;
  readonly field: string;
  readonly expectedSpan: number;
  readonly headerRemain: number;
}

export interface TableNameNotLowerCase extends Msg {
  readonly _tag: 'TableNameNotLowerCase';
  readonly tableName: string;
}

export interface ImplNamespaceNotEmpty extends Msg {
  readonly _tag: 'ImplNamespaceNotEmpty';
  readonly sInterface: string;
  readonly errImplName: string;
}

export interface InterfaceImplNameConflict extends Msg {
  readonly _tag: 'InterfaceImplNameConflict';
  readonly sInterface: string;
  readonly impl: string;
}

export interface ImplNameConflict extends Msg {
  readonly _tag: 'ImplNameConflict';
  readonly sInterface: string;
  readonly impl1: string;
  readonly impl2: string;
}

export interface NameConflict extends Msg {
  readonly _tag: 'NameConflict';
  readonly name: string;
}

export interface InnerNameConflict extends Msg {
  readonly _tag: 'InnerNameConflict';
  readonly item: string;
  readonly name: string;
}

export interface TypeStructNotFound extends Msg {
  readonly _tag: 'TypeStructNotFound';
  readonly struct: string;
  readonly field: string;
  readonly notFoundStruct: string;
}

export interface PrimitiveFieldFmtMustBeAuto extends Msg {
  readonly _tag: 'PrimitiveFieldFmtMustBeAuto';
  readonly struct: string;
  readonly field: string;
  readonly type: string;
  readonly errFmt: string;
}

export interface StructFieldFmtMustBeAutoOrPack extends Msg {
  readonly _tag: 'StructFieldFmtMustBeAutoOrPack';
  readonly struct: string;
  readonly field: string;
  readonly type: string;
  readonly errFmt: string;
}

export interface ListFieldFmtMustBePackOrSepOrFixOrBlock extends Msg {
  readonly _tag: 'ListFieldFmtMustBePackOrSepOrFixOrBlock';
  readonly struct: string;
  readonly field: string;
  readonly type: string;
  readonly errFmt: string;
}

export interface MapFieldFmtMustBePackOrFixOrBlock extends Msg {
  readonly _tag: 'MapFieldFmtMustBePackOrFixOrBlock';
  readonly struct: string;
  readonly field: string;
  readonly type: string;
  readonly errFmt: string;
}

export interface ImplFmtNotSupport extends Msg {
  readonly _tag: 'ImplFmtNotSupport';
  readonly inInterface: string;
  readonly impl: string;
  readonly errFmt: string;
}

export interface SepFmtStructHasUnPrimitiveField extends Msg {
  readonly _tag: 'SepFmtStructHasUnPrimitiveField';
  readonly struct: string;
}

export interface ListStructSepEqual extends Msg {
  readonly _tag: 'ListStructSepEqual';
  readonly structural: string;
  readonly field: string;
}

export interface EnumRefNotFound extends Msg {
  readonly _tag: 'EnumRefNotFound';
  readonly sInterface: string;
  readonly enumRef: string;
}

export interface InterfaceImplEmpty extends Msg {
  readonly _tag: 'InterfaceImplEmpty';
  readonly sInterface: string;
}

export interface DefaultImplNotFound extends Msg {
  readonly _tag: 'DefaultImplNotFound';
  readonly sInterface: string;
  readonly defaultImpl: string;
}

export interface EntryNotFound extends Msg {
  readonly _tag: 'EntryNotFound';
  readonly table: string;
  readonly entry: string;
}

export interface EntryFieldTypeNotStr extends Msg {
  readonly _tag: 'EntryFieldTypeNotStr';
  readonly table: string;
  readonly entry: string;
  readonly errType: string;
}

export interface BlockTableFirstFieldNotInPrimaryKey extends Msg {
  readonly _tag: 'BlockTableFirstFieldNotInPrimaryKey';
  readonly table: string;
}

export interface BlockFirstColOverlap extends Msg {
  readonly _tag: 'BlockFirstColOverlap';
  readonly structural: string;
  readonly field: string;
}

export interface KeyNotFound extends Msg {
  readonly _tag: 'KeyNotFound';
  readonly structural: string;
  readonly key: string;
}

export interface KeyTypeNotSupport extends Msg {
  readonly _tag: 'KeyTypeNotSupport';
  readonly structural: string;
  readonly field: string;
  readonly errType: string;
}

export interface PrimaryKeyNotEnumOrIntWhenEnum extends Msg {
  readonly _tag: 'PrimaryKeyNotEnumOrIntWhenEnum';
  readonly structural: string;
  readonly field: string;
  readonly errType: string;
  readonly enumField: string;
}

export interface RefTableNotFound extends Msg {
  readonly _tag: 'RefTableNotFound';
  readonly table: string;
  readonly foreignKey: string;
  readonly errRefTable: string;
}

export interface RefTableKeyNotUniq extends Msg {
  readonly _tag: 'RefTableKeyNotUniq';
  readonly table: string;
  readonly foreignKey: string;
  readonly refTable: string;
  readonly notUniqRefKey: string[];
}

export interface ListRefMultiKeyNotSupport extends Msg {
  readonly _tag: 'ListRefMultiKeyNotSupport';
  readonly table: string;
  readonly foreignKey: string;
  readonly errMultiKey: string[];
}

export interface RefLocalKeyRemoteKeyCountNotMatch extends Msg {
  readonly _tag: 'RefLocalKeyRemoteKeyCountNotMatch';
  readonly table: string;
  readonly foreignKey: string;
}

export interface RefLocalKeyRemoteKeyTypeNotMatch extends Msg {
  readonly _tag: 'RefLocalKeyRemoteKeyTypeNotMatch';
  readonly structural: string;
  readonly foreignKey: string;
  readonly localType: string;
  readonly refType: string;
}

export interface RefContainerNullable extends Msg {
  readonly _tag: 'RefContainerNullable';
  readonly structural: string;
  readonly foreignKey: string;
}

export interface DataHeadNameNotIdentifier extends Msg {
  readonly _tag: 'DataHeadNameNotIdentifier';
  readonly table: string;
  readonly notIdentifierName: string;
}

export interface DataHeadNameDuplicated extends Msg {
  readonly _tag: 'DataHeadNameDuplicated';
  readonly table: string;
  readonly duplicatedName: string;
}

export interface SplitDataHeaderNotEqual extends Msg {
  readonly _tag: 'SplitDataHeaderNotEqual';
  readonly sheet1: string;
  readonly header1: string[];
  readonly sheet2: string;
  readonly header2: string[];
}

export interface JsonTableNotSupportExcel extends Msg {
  readonly _tag: 'JsonTableNotSupportExcel';
  readonly table: string;
  readonly excelSheetList: string[];
}

export interface JsonTableNotSupportMap extends Msg {
  readonly _tag: 'JsonTableNotSupportMap';
  readonly table: string;
}

export interface MappingToExcelLoop extends Msg {
  readonly _tag: 'MappingToExcelLoop';
  readonly structNameLoop: string[];
}

export interface SeqFieldMustBeInt extends Msg {
  readonly _tag: 'SeqFieldMustBeInt';
  readonly structural: string;
  readonly field: string;
  readonly actualType: string;
}

export type Err =
  | FieldHeaderSpanNotEnough
  | TableNameNotLowerCase
  | ImplNamespaceNotEmpty
  | InterfaceImplNameConflict
  | ImplNameConflict
  | NameConflict
  | InnerNameConflict
  | TypeStructNotFound
  | PrimitiveFieldFmtMustBeAuto
  | StructFieldFmtMustBeAutoOrPack
  | ListFieldFmtMustBePackOrSepOrFixOrBlock
  | MapFieldFmtMustBePackOrFixOrBlock
  | ImplFmtNotSupport
  | SepFmtStructHasUnPrimitiveField
  | ListStructSepEqual
  | EnumRefNotFound
  | InterfaceImplEmpty
  | DefaultImplNotFound
  | EntryNotFound
  | EntryFieldTypeNotStr
  | BlockTableFirstFieldNotInPrimaryKey
  | BlockFirstColOverlap
  | KeyNotFound
  | KeyTypeNotSupport
  | PrimaryKeyNotEnumOrIntWhenEnum
  | RefTableNotFound
  | RefTableKeyNotUniq
  | ListRefMultiKeyNotSupport
  | RefLocalKeyRemoteKeyCountNotMatch
  | RefLocalKeyRemoteKeyTypeNotMatch
  | RefContainerNullable
  | DataHeadNameNotIdentifier
  | DataHeadNameDuplicated
  | SplitDataHeaderNotEqual
  | JsonTableNotSupportExcel
  | JsonTableNotSupportMap
  | MappingToExcelLoop
  | SeqFieldMustBeInt;

// ---------------------------------------------------------------------------
// msg() — generic formatter: `${_tag}(${arg1}, ${arg2}, ...)`
// ---------------------------------------------------------------------------

function fmtVal(v: unknown): string {
  if (Array.isArray(v)) {
    return `[${v.join(', ')}]`;
  }
  return String(v);
}

function formatMsg(m: Msg): string {
  const keys = Object.keys(m).filter((k) => k !== '_tag' && k !== 'msg');
  const args = keys.map((k) => (m as unknown as Record<string, unknown>)[k]).map(fmtVal);
  return `${m._tag}(${args.join(', ')})`;
}

// ---------------------------------------------------------------------------
// Factory functions — WeakWarn (2)
// ---------------------------------------------------------------------------

export function filterRefIgnoredByRefTableNotFound(
  name: string,
  foreignKey: string,
  notFoundRefTable: string,
): FilterRefIgnoredByRefTableNotFound {
  return makeMsgObj<FilterRefIgnoredByRefTableNotFound>({
    _tag: 'FilterRefIgnoredByRefTableNotFound',
    name,
    foreignKey,
    notFoundRefTable,
  });
}

// Build a Msg object: attach msg() closure referencing the object itself
function makeMsgObj<T extends Msg>(obj: Omit<T, 'msg'>): T {
  const o = obj as T;
  o.msg = () => formatMsg(o);
  return o;
}

export function filterRefIgnoredByRefKeyNotFound(
  name: string,
  foreignKey: string,
  refTable: string,
  notFoundRefKey: string[],
): FilterRefIgnoredByRefKeyNotFound {
  return makeMsgObj<FilterRefIgnoredByRefKeyNotFound>({
    _tag: 'FilterRefIgnoredByRefKeyNotFound',
    name,
    foreignKey,
    refTable,
    notFoundRefKey,
  });
}

// ---------------------------------------------------------------------------
// Factory functions — Warn (6)
// ---------------------------------------------------------------------------

export function nameMayConflictByRef(name1: string, name2: string): NameMayConflictByRef {
  return makeMsgObj<NameMayConflictByRef>({
    _tag: 'NameMayConflictByRef',
    name1,
    name2,
  });
}

export function structNotUsed(name: string): StructNotUsed {
  return makeMsgObj<StructNotUsed>({ _tag: 'StructNotUsed', name });
}

export function interfaceNotUsed(name: string): InterfaceNotUsed {
  return makeMsgObj<InterfaceNotUsed>({ _tag: 'InterfaceNotUsed', name });
}

export function lowercaseNotOnStrOrText(
  struct: string,
  field: string,
  unMatchedType: string,
): LowercaseNotOnStrOrText {
  return makeMsgObj<LowercaseNotOnStrOrText>({
    _tag: 'LowercaseNotOnStrOrText',
    struct,
    field,
    unMatchedType,
  });
}

export function suggestTypeUnknown(
  table: string,
  field: string,
  unknownType: string,
): SuggestTypeUnknown {
  return makeMsgObj<SuggestTypeUnknown>({
    _tag: 'SuggestTypeUnknown',
    table,
    field,
    unknownType,
  });
}

export function mapKeyNotSupportEnumType(
  struct: string,
  field: string,
  refEnum: string,
): MapKeyNotSupportEnumType {
  return makeMsgObj<MapKeyNotSupportEnumType>({
    _tag: 'MapKeyNotSupportEnumType',
    struct,
    field,
    refEnum,
  });
}

// ---------------------------------------------------------------------------
// Factory functions — Err (~40)
// ---------------------------------------------------------------------------

export function fieldHeaderSpanNotEnough(
  table: string,
  field: string,
  expectedSpan: number,
  headerRemain: number,
): FieldHeaderSpanNotEnough {
  return makeMsgObj<FieldHeaderSpanNotEnough>({
    _tag: 'FieldHeaderSpanNotEnough',
    table,
    field,
    expectedSpan,
    headerRemain,
  });
}

export function tableNameNotLowerCase(tableName: string): TableNameNotLowerCase {
  return makeMsgObj<TableNameNotLowerCase>({ _tag: 'TableNameNotLowerCase', tableName });
}

export function implNamespaceNotEmpty(
  sInterface: string,
  errImplName: string,
): ImplNamespaceNotEmpty {
  return makeMsgObj<ImplNamespaceNotEmpty>({
    _tag: 'ImplNamespaceNotEmpty',
    sInterface,
    errImplName,
  });
}

export function interfaceImplNameConflict(
  sInterface: string,
  impl: string,
): InterfaceImplNameConflict {
  return makeMsgObj<InterfaceImplNameConflict>({
    _tag: 'InterfaceImplNameConflict',
    sInterface,
    impl,
  });
}

export function implNameConflict(
  sInterface: string,
  impl1: string,
  impl2: string,
): ImplNameConflict {
  return makeMsgObj<ImplNameConflict>({
    _tag: 'ImplNameConflict',
    sInterface,
    impl1,
    impl2,
  });
}

export function nameConflict(name: string): NameConflict {
  return makeMsgObj<NameConflict>({ _tag: 'NameConflict', name });
}

export function innerNameConflict(item: string, name: string): InnerNameConflict {
  return makeMsgObj<InnerNameConflict>({ _tag: 'InnerNameConflict', item, name });
}

export function typeStructNotFound(
  struct: string,
  field: string,
  notFoundStruct: string,
): TypeStructNotFound {
  return makeMsgObj<TypeStructNotFound>({
    _tag: 'TypeStructNotFound',
    struct,
    field,
    notFoundStruct,
  });
}

export function primitiveFieldFmtMustBeAuto(
  struct: string,
  field: string,
  type: string,
  errFmt: string,
): PrimitiveFieldFmtMustBeAuto {
  return makeMsgObj<PrimitiveFieldFmtMustBeAuto>({
    _tag: 'PrimitiveFieldFmtMustBeAuto',
    struct,
    field,
    type,
    errFmt,
  });
}

export function structFieldFmtMustBeAutoOrPack(
  struct: string,
  field: string,
  type: string,
  errFmt: string,
): StructFieldFmtMustBeAutoOrPack {
  return makeMsgObj<StructFieldFmtMustBeAutoOrPack>({
    _tag: 'StructFieldFmtMustBeAutoOrPack',
    struct,
    field,
    type,
    errFmt,
  });
}

export function listFieldFmtMustBePackOrSepOrFixOrBlock(
  struct: string,
  field: string,
  type: string,
  errFmt: string,
): ListFieldFmtMustBePackOrSepOrFixOrBlock {
  return makeMsgObj<ListFieldFmtMustBePackOrSepOrFixOrBlock>({
    _tag: 'ListFieldFmtMustBePackOrSepOrFixOrBlock',
    struct,
    field,
    type,
    errFmt,
  });
}

export function mapFieldFmtMustBePackOrFixOrBlock(
  struct: string,
  field: string,
  type: string,
  errFmt: string,
): MapFieldFmtMustBePackOrFixOrBlock {
  return makeMsgObj<MapFieldFmtMustBePackOrFixOrBlock>({
    _tag: 'MapFieldFmtMustBePackOrFixOrBlock',
    struct,
    field,
    type,
    errFmt,
  });
}

export function implFmtNotSupport(
  inInterface: string,
  impl: string,
  errFmt: string,
): ImplFmtNotSupport {
  return makeMsgObj<ImplFmtNotSupport>({
    _tag: 'ImplFmtNotSupport',
    inInterface,
    impl,
    errFmt,
  });
}

export function sepFmtStructHasUnPrimitiveField(
  struct: string,
): SepFmtStructHasUnPrimitiveField {
  return makeMsgObj<SepFmtStructHasUnPrimitiveField>({
    _tag: 'SepFmtStructHasUnPrimitiveField',
    struct,
  });
}

export function listStructSepEqual(structural: string, field: string): ListStructSepEqual {
  return makeMsgObj<ListStructSepEqual>({
    _tag: 'ListStructSepEqual',
    structural,
    field,
  });
}

export function enumRefNotFound(sInterface: string, enumRef: string): EnumRefNotFound {
  return makeMsgObj<EnumRefNotFound>({
    _tag: 'EnumRefNotFound',
    sInterface,
    enumRef,
  });
}

export function interfaceImplEmpty(sInterface: string): InterfaceImplEmpty {
  return makeMsgObj<InterfaceImplEmpty>({ _tag: 'InterfaceImplEmpty', sInterface });
}

export function defaultImplNotFound(
  sInterface: string,
  defaultImpl: string,
): DefaultImplNotFound {
  return makeMsgObj<DefaultImplNotFound>({
    _tag: 'DefaultImplNotFound',
    sInterface,
    defaultImpl,
  });
}

export function entryNotFound(table: string, entry: string): EntryNotFound {
  return makeMsgObj<EntryNotFound>({ _tag: 'EntryNotFound', table, entry });
}

export function entryFieldTypeNotStr(
  table: string,
  entry: string,
  errType: string,
): EntryFieldTypeNotStr {
  return makeMsgObj<EntryFieldTypeNotStr>({
    _tag: 'EntryFieldTypeNotStr',
    table,
    entry,
    errType,
  });
}

export function blockTableFirstFieldNotInPrimaryKey(
  table: string,
): BlockTableFirstFieldNotInPrimaryKey {
  return makeMsgObj<BlockTableFirstFieldNotInPrimaryKey>({
    _tag: 'BlockTableFirstFieldNotInPrimaryKey',
    table,
  });
}

export function blockFirstColOverlap(
  structural: string,
  field: string,
): BlockFirstColOverlap {
  return makeMsgObj<BlockFirstColOverlap>({
    _tag: 'BlockFirstColOverlap',
    structural,
    field,
  });
}

export function keyNotFound(structural: string, key: string): KeyNotFound {
  return makeMsgObj<KeyNotFound>({ _tag: 'KeyNotFound', structural, key });
}

export function keyTypeNotSupport(
  structural: string,
  field: string,
  errType: string,
): KeyTypeNotSupport {
  return makeMsgObj<KeyTypeNotSupport>({
    _tag: 'KeyTypeNotSupport',
    structural,
    field,
    errType,
  });
}

export function primaryKeyNotEnumOrIntWhenEnum(
  structural: string,
  field: string,
  errType: string,
  enumField: string,
): PrimaryKeyNotEnumOrIntWhenEnum {
  return makeMsgObj<PrimaryKeyNotEnumOrIntWhenEnum>({
    _tag: 'PrimaryKeyNotEnumOrIntWhenEnum',
    structural,
    field,
    errType,
    enumField,
  });
}

export function refTableNotFound(
  table: string,
  foreignKey: string,
  errRefTable: string,
): RefTableNotFound {
  return makeMsgObj<RefTableNotFound>({
    _tag: 'RefTableNotFound',
    table,
    foreignKey,
    errRefTable,
  });
}

export function refTableKeyNotUniq(
  table: string,
  foreignKey: string,
  refTable: string,
  notUniqRefKey: string[],
): RefTableKeyNotUniq {
  return makeMsgObj<RefTableKeyNotUniq>({
    _tag: 'RefTableKeyNotUniq',
    table,
    foreignKey,
    refTable,
    notUniqRefKey,
  });
}

export function listRefMultiKeyNotSupport(
  table: string,
  foreignKey: string,
  errMultiKey: string[],
): ListRefMultiKeyNotSupport {
  return makeMsgObj<ListRefMultiKeyNotSupport>({
    _tag: 'ListRefMultiKeyNotSupport',
    table,
    foreignKey,
    errMultiKey,
  });
}

export function refLocalKeyRemoteKeyCountNotMatch(
  table: string,
  foreignKey: string,
): RefLocalKeyRemoteKeyCountNotMatch {
  return makeMsgObj<RefLocalKeyRemoteKeyCountNotMatch>({
    _tag: 'RefLocalKeyRemoteKeyCountNotMatch',
    table,
    foreignKey,
  });
}

export function refLocalKeyRemoteKeyTypeNotMatch(
  structural: string,
  foreignKey: string,
  localType: string,
  refType: string,
): RefLocalKeyRemoteKeyTypeNotMatch {
  return makeMsgObj<RefLocalKeyRemoteKeyTypeNotMatch>({
    _tag: 'RefLocalKeyRemoteKeyTypeNotMatch',
    structural,
    foreignKey,
    localType,
    refType,
  });
}

export function refContainerNullable(
  structural: string,
  foreignKey: string,
): RefContainerNullable {
  return makeMsgObj<RefContainerNullable>({
    _tag: 'RefContainerNullable',
    structural,
    foreignKey,
  });
}

export function dataHeadNameNotIdentifier(
  table: string,
  notIdentifierName: string,
): DataHeadNameNotIdentifier {
  return makeMsgObj<DataHeadNameNotIdentifier>({
    _tag: 'DataHeadNameNotIdentifier',
    table,
    notIdentifierName,
  });
}

export function dataHeadNameDuplicated(
  table: string,
  duplicatedName: string,
): DataHeadNameDuplicated {
  return makeMsgObj<DataHeadNameDuplicated>({
    _tag: 'DataHeadNameDuplicated',
    table,
    duplicatedName,
  });
}

export function splitDataHeaderNotEqual(
  sheet1: string,
  header1: string[],
  sheet2: string,
  header2: string[],
): SplitDataHeaderNotEqual {
  return makeMsgObj<SplitDataHeaderNotEqual>({
    _tag: 'SplitDataHeaderNotEqual',
    sheet1,
    header1,
    sheet2,
    header2,
  });
}

export function jsonTableNotSupportExcel(
  table: string,
  excelSheetList: string[],
): JsonTableNotSupportExcel {
  return makeMsgObj<JsonTableNotSupportExcel>({
    _tag: 'JsonTableNotSupportExcel',
    table,
    excelSheetList,
  });
}

export function jsonTableNotSupportMap(table: string): JsonTableNotSupportMap {
  return makeMsgObj<JsonTableNotSupportMap>({ _tag: 'JsonTableNotSupportMap', table });
}

export function mappingToExcelLoop(structNameLoop: string[]): MappingToExcelLoop {
  return makeMsgObj<MappingToExcelLoop>({
    _tag: 'MappingToExcelLoop',
    structNameLoop,
  });
}

export function seqFieldMustBeInt(
  structural: string,
  field: string,
  actualType: string,
): SeqFieldMustBeInt {
  return makeMsgObj<SeqFieldMustBeInt>({
    _tag: 'SeqFieldMustBeInt',
    structural,
    field,
    actualType,
  });
}

// ---------------------------------------------------------------------------
// CfgSchemaException
// ---------------------------------------------------------------------------

export class CfgSchemaException extends Error {
  readonly errs: CfgSchemaErrs;

  constructor(errs: CfgSchemaErrs) {
    super(`CfgSchemaException: ${errs.errs.length} error(s)`);
    this.name = 'CfgSchemaException';
    this.errs = errs;
  }

  getErrs(): CfgSchemaErrs {
    return this.errs;
  }
}

// ---------------------------------------------------------------------------
// CfgSchemaErrs
// ---------------------------------------------------------------------------

export class CfgSchemaErrs {
  readonly errs: Err[];
  readonly warns: Warn[];
  readonly weakWarns: WeakWarn[];

  private constructor(errs: Err[], warns: Warn[], weakWarns: WeakWarn[]) {
    this.errs = errs;
    this.warns = warns;
    this.weakWarns = weakWarns;
  }

  static of(): CfgSchemaErrs {
    return new CfgSchemaErrs([], [], []);
  }

  addErr(err: Err): void {
    this.errs.push(err);
  }

  addWarn(warn: Warn): void {
    this.warns.push(warn);
  }

  addWeakWarn(weakWarn: WeakWarn): void {
    this.weakWarns.push(weakWarn);
  }

  merge(other: CfgSchemaErrs): void {
    for (const e of other.errs) this.errs.push(e);
    for (const w of other.warns) this.warns.push(w);
    for (const ww of other.weakWarns) this.weakWarns.push(ww);
  }

  checkErrors(prefix: string = 'schema'): void {
    const log = (s: string): void => {
      // eslint-disable-next-line no-console
      (globalThis as { console?: { warn: (s: string) => void } }).console?.warn(s);
    };

    if (this.weakWarns.length > 0) {
      log(`${prefix} weak warnings ${this.weakWarns.length}:`);
      for (const ww of this.weakWarns) {
        log('\t' + ww.msg());
      }
    }

    if (this.warns.length > 0) {
      log(`${prefix} warnings ${this.warns.length}:`);
      for (const w of this.warns) {
        log('\t' + w.msg());
      }
    }

    if (this.errs.length > 0) {
      log(`${prefix} errors ${this.errs.length}:`);
      for (const e of this.errs) {
        log('\t' + e.msg());
      }
      log('fix schema errors first');
      throw new CfgSchemaException(this);
    }
  }
}

// Re-export makeMsgObj for potential reuse / testing
export { makeMsgObj as _makeMsgObj };
export { formatMsg as _formatMsg };
