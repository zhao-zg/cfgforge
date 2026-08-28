/**
 * Metadata — TypeScript port of Java `configgen.schema.Metadata`.
 *
 * Java record wrapping a SequencedMap<String, MetaValue>.
 * TS implementation: class with Map<string, MetaValue> + putFirst/putLast helpers.
 * TS Map preserves insertion order; putFirst rebuilds the Map, putLast uses delete+set.
 */

import type { CommentData } from './CommentData.js';
import type { EntryType } from './EntryType.js';
import { ENo, EEntry, EEnum, isENo, isEEntry, isEEnum } from './EntryType.js';
import type { FieldFormat } from './FieldFormat.js';
import { AutoOrPack, Sep, Fix, Block, isSep, isFix, isBlock } from './FieldFormat.js';

// ---------------------------------------------------------------------------
// MetaValue types (discriminated union via _tag)
// ---------------------------------------------------------------------------

export type MetaValue = MetaTag | MetaInt | MetaFloat | MetaStr | MetaComment | MetaEnumValues;

export const MetaTag = 'TAG' as const;
export type MetaTag = typeof MetaTag; // 'TAG'

/** Convenience alias for the TAG sentinel value. */
export const TAG: MetaTag = MetaTag;

export interface MetaInt {
  _tag: 'MetaInt';
  value: number;
}

export interface MetaFloat {
  _tag: 'MetaFloat';
  value: number;
}

export interface MetaStr {
  _tag: 'MetaStr';
  value: string;
}

export interface MetaComment {
  _tag: 'MetaComment';
  comment: CommentData;
}

export type MetaEnumValues = MetaEnumValuesOfEmpty | MetaEnumValuesOfAssigned;

export interface MetaEnumValuesOfEmpty {
  _tag: 'OfEmpty';
  values: EnumValueEmpty[];
}

export interface MetaEnumValuesOfAssigned {
  _tag: 'OfAssigned';
  values: EnumValueAssigned[];
}

export interface EnumValueEmpty {
  name: string;
  comment: string;
}

export interface EnumValueAssigned {
  name: string;
  comment: string;
  number: number;
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function metaInt(value: number): MetaInt {
  return { _tag: 'MetaInt', value };
}

export function metaFloat(value: number): MetaFloat {
  return { _tag: 'MetaFloat', value };
}

export function metaStr(value: string): MetaStr {
  return { _tag: 'MetaStr', value };
}

export function metaComment(comment: CommentData): MetaComment {
  return { _tag: 'MetaComment', comment };
}

export function metaEnumValuesOfEmpty(values: EnumValueEmpty[]): MetaEnumValuesOfEmpty {
  return { _tag: 'OfEmpty', values };
}

export function metaEnumValuesOfAssigned(values: EnumValueAssigned[]): MetaEnumValuesOfAssigned {
  return { _tag: 'OfAssigned', values };
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isMetaTag(v: MetaValue | undefined): v is MetaTag {
  return v === 'TAG';
}

export function isMetaInt(v: MetaValue | undefined): v is MetaInt {
  return v !== undefined && typeof v === 'object' && v !== null && (v as { _tag: string })._tag === 'MetaInt';
}

export function isMetaFloat(v: MetaValue | undefined): v is MetaFloat {
  return v !== undefined && typeof v === 'object' && v !== null && (v as { _tag: string })._tag === 'MetaFloat';
}

export function isMetaStr(v: MetaValue | undefined): v is MetaStr {
  return v !== undefined && typeof v === 'object' && v !== null && (v as { _tag: string })._tag === 'MetaStr';
}

export function isMetaComment(v: MetaValue | undefined): v is MetaComment {
  return v !== undefined && typeof v === 'object' && v !== null && (v as { _tag: string })._tag === 'MetaComment';
}

export function isMetaEnumValues(v: MetaValue | undefined): v is MetaEnumValues {
  return (
    v !== undefined &&
    typeof v === 'object' &&
    v !== null &&
    ((v as { _tag: string })._tag === 'OfEmpty' || (v as { _tag: string })._tag === 'OfAssigned')
  );
}

// ---------------------------------------------------------------------------
// Internal tag name constants
// ---------------------------------------------------------------------------

const COMMENT = '_comment';
const SPAN = '_span';
const HAS_REF = '_hasRef';
const HAS_BLOCK = '_hasBlock';
const HAS_MAP = '_hasMap';
const HAS_TEXT = '_hasText';
const ENUM_VALUES = '_enumValues';
const FROM_ENUM_TYPE = '_fromEnumType';
const FROM_CFG_FILEPATH = '_fromCfgFilePATH';
const JSON_TAG = 'json';
const NULLABLE = 'nullable';
const ENUM_REF = 'enumRef';
const DEFAULT_IMPL = 'defaultImpl';
const ENTRY = 'entry';
const ENUM = 'enum';
const COLUMN_MODE = 'columnMode';
const PACK = 'pack';
const SEP = 'sep';
const FIX = 'fix';
const BLOCK_TAG = 'block';
const LOWER_CASE = 'lowercase';
const MUST_FILL = 'mustFill';
const ROOT = 'root';
const SEQ = 'seq';

const stateTags: ReadonlySet<string> = new Set([SPAN, HAS_REF, HAS_BLOCK, HAS_MAP, HAS_TEXT]);

const reservedTags: ReadonlySet<string> = new Set([
  COMMENT, SPAN, HAS_REF, HAS_BLOCK, HAS_MAP, HAS_TEXT,
  JSON_TAG, NULLABLE, ENUM_REF, DEFAULT_IMPL, ENTRY, ENUM, COLUMN_MODE,
  PACK, SEP, FIX, BLOCK_TAG, LOWER_CASE, MUST_FILL, ROOT, SEQ,
  ENUM_VALUES, FROM_ENUM_TYPE, FROM_CFG_FILEPATH,
]);

// ---------------------------------------------------------------------------
// Metadata class
// ---------------------------------------------------------------------------

export class Metadata {
  private _data: Map<string, MetaValue>;

  constructor(data?: Map<string, MetaValue>) {
    this._data = data ?? new Map();
  }

  data(): Map<string, MetaValue> {
    return this._data;
  }

  copy(): Metadata {
    return new Metadata(new Map(this._data));
  }

  copyWithoutState(): Metadata {
    const copy = new Map(this._data);
    for (const tag of stateTags) {
      copy.delete(tag);
    }
    return new Metadata(copy);
  }

  get(name: string): MetaValue | undefined {
    return this._data.get(name);
  }

  getStr(name: string, def: string): string {
    const v = this._data.get(name);
    if (v !== undefined && isMetaStr(v)) {
      return v.value;
    }
    return def;
  }

  // --- Tag-based boolean queries ---

  isJson(): boolean { return this.hasTag(JSON_TAG); }
  isLowercase(): boolean { return this.hasTag(LOWER_CASE); }
  isMustFill(): boolean { return this.hasTag(MUST_FILL); }
  isRoot(): boolean { return this.hasTag(ROOT); }
  isSeq(): boolean { return this.hasTag(SEQ); }

  putTag(tag: string): void {
    if (reservedTags.has(tag)) {
      throw new Error(`'${tag}' reserved`);
    }
    if (this._data.has(tag)) {
      throw new Error(`'${tag}' duplicated`);
    }
    this.putLast(tag, TAG);
  }

  hasTag(tag: string): boolean {
    return this._data.has(tag);
  }

  // --- State tags (putLast) ---

  putHasRef(hasRef: boolean): void {
    this.putLast(HAS_REF, metaInt(hasRef ? 1 : 0));
  }

  getHasRef(): MetaValue | undefined {
    return this._data.get(HAS_REF);
  }

  putHasBlock(hasBlock: boolean): void {
    this.putLast(HAS_BLOCK, metaInt(hasBlock ? 1 : 0));
  }

  getHasBlock(): MetaValue | undefined {
    return this._data.get(HAS_BLOCK);
  }

  putHasMap(hasMap: boolean): void {
    this.putLast(HAS_MAP, metaInt(hasMap ? 1 : 0));
  }

  getHasMap(): MetaValue | undefined {
    return this._data.get(HAS_MAP);
  }

  putHasText(hasText: boolean): void {
    this.putLast(HAS_TEXT, metaInt(hasText ? 1 : 0));
  }

  getHasText(): MetaValue | undefined {
    return this._data.get(HAS_TEXT);
  }

  putSpan(value: number): void {
    this.putLast(SPAN, metaInt(value));
  }

  getSpan(): MetaValue | undefined {
    return this._data.get(SPAN);
  }

  // --- Comment (putLast) ---

  getComment(): CommentData | null {
    const v = this._data.get(COMMENT);
    if (v !== undefined && isMetaComment(v)) {
      return v.comment;
    }
    return null;
  }

  putComment(comment: CommentData): void {
    this.putLast(COMMENT, metaComment(comment));
  }

  removeComment(): CommentData | null {
    const v = this._data.get(COMMENT);
    this._data.delete(COMMENT);
    if (v !== undefined && isMetaComment(v)) {
      return v.comment;
    }
    return null;
  }

  // --- Enum values (regular put) ---

  putEnumValues(values: MetaEnumValues): void {
    this._data.set(ENUM_VALUES, values);
  }

  removeEnumValues(): void {
    this._data.delete(ENUM_VALUES);
  }

  getEnumValues(): MetaEnumValues | null {
    const v = this._data.get(ENUM_VALUES);
    if (v !== undefined && isMetaEnumValues(v)) {
      return v;
    }
    return null;
  }

  hasEnumValues(): boolean {
    const v = this._data.get(ENUM_VALUES);
    return v !== undefined && isMetaEnumValues(v);
  }

  // --- From enum type (regular put) ---

  putFromEnumType(enumType: string): void {
    this._data.set(FROM_ENUM_TYPE, metaStr(enumType));
  }

  isFromEnumType(): boolean {
    return this._data.has(FROM_ENUM_TYPE);
  }

  getFromEnumType(): string | null {
    const v = this._data.get(FROM_ENUM_TYPE);
    if (v !== undefined && isMetaStr(v)) {
      return v.value;
    }
    return null;
  }

  // --- From cfg filepath (regular put) ---

  putFromCfgFilepath(filepath: string): void {
    this._data.set(FROM_CFG_FILEPATH, metaStr(filepath));
  }

  getFromCfgFilepath(): string | null {
    const v = this._data.get(FROM_CFG_FILEPATH);
    if (v !== undefined && isMetaStr(v)) {
      return v.value;
    }
    return null;
  }

  // --- Nullable (putFirst) ---

  putNullable(): void {
    this.putFirst(NULLABLE, TAG);
  }

  removeNullable(): boolean {
    return this._data.delete(NULLABLE);
  }

  // --- Enum ref (putFirst) ---

  putEnumRef(enumRef: string): void {
    this.putFirst(ENUM_REF, metaStr(enumRef));
  }

  removeEnumRef(): string {
    const v = this._data.get(ENUM_REF);
    this._data.delete(ENUM_REF);
    if (v !== undefined && isMetaStr(v)) {
      return v.value;
    }
    return '';
  }

  // --- Default impl (putFirst) ---

  putDefaultImpl(defaultImpl: string): void {
    this.putFirst(DEFAULT_IMPL, metaStr(defaultImpl));
  }

  removeDefaultImpl(): string {
    const v = this._data.get(DEFAULT_IMPL);
    this._data.delete(DEFAULT_IMPL);
    if (v !== undefined && isMetaStr(v)) {
      return v.value;
    }
    return '';
  }

  // --- Entry type (putFirst) ---

  putEntry(entry: EntryType): void {
    if (isEEntry(entry)) {
      this.putFirst(ENTRY, metaStr(entry.field));
    } else if (isEEnum(entry)) {
      this.putFirst(ENUM, metaStr(entry.field));
    } else if (isENo(entry)) {
      // ENo → store nothing
    }
  }

  removeEntry(): EntryType {
    const entryVal = this._data.get(ENTRY);
    this._data.delete(ENTRY);
    if (entryVal !== undefined && isMetaStr(entryVal)) {
      return new EEntry(entryVal.value);
    }

    const enumVal = this._data.get(ENUM);
    this._data.delete(ENUM);
    if (enumVal !== undefined && isMetaStr(enumVal)) {
      return new EEnum(enumVal.value);
    }

    return ENo.NO;
  }

  // --- Column mode (putFirst) ---

  putColumnMode(): void {
    this.putFirst(COLUMN_MODE, TAG);
  }

  removeColumnMode(): boolean {
    return this._data.delete(COLUMN_MODE);
  }

  // --- Field format (putFirst) ---

  putFmt(fmt: FieldFormat): void {
    if (fmt === AutoOrPack.AUTO) {
      // AUTO → store nothing
    } else if (fmt === AutoOrPack.PACK) {
      this.putFirst(PACK, TAG);
    } else if (isSep(fmt)) {
      this.putFirst(SEP, metaStr(fmt.sep));
    } else if (isFix(fmt)) {
      this.putFirst(FIX, metaInt(fmt.count));
    } else if (isBlock(fmt)) {
      this.putFirst(BLOCK_TAG, metaInt(fmt.fix));
    }
  }

  removeFmt(): FieldFormat {
    if (this._data.delete(PACK)) {
      return AutoOrPack.PACK;
    }

    const sepVal = this._data.get(SEP);
    this._data.delete(SEP);
    if (sepVal !== undefined && isMetaStr(sepVal)) {
      return new Sep(sepVal.value);
    }

    const fixVal = this._data.get(FIX);
    this._data.delete(FIX);
    if (fixVal !== undefined && isMetaInt(fixVal)) {
      return new Fix(fixVal.value);
    }

    const blockVal = this._data.get(BLOCK_TAG);
    this._data.delete(BLOCK_TAG);
    if (blockVal !== undefined && isMetaInt(blockVal)) {
      return new Block(blockVal.value);
    }

    return AutoOrPack.AUTO;
  }

  // --- Private helpers for SequencedMap emulation ---

  /**
   * Insert at the beginning of the map (Java SequencedMap.putFirst).
   * If key already exists, it is moved to the first position.
   */
  private putFirst(key: string, value: MetaValue): void {
    this._data.delete(key);
    const newMap = new Map<string, MetaValue>([[key, value]]);
    for (const [k, v] of this._data) {
      newMap.set(k, v);
    }
    this._data = newMap;
  }

  /**
   * Insert at the end of the map (Java SequencedMap.putLast).
   * If key already exists, it is moved to the last position.
   */
  private putLast(key: string, value: MetaValue): void {
    this._data.delete(key);
    this._data.set(key, value);
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

export function Metadata_of(): Metadata {
  return new Metadata();
}
