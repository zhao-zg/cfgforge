/**
 * CfgValue — TypeScript port of Java `configgen.value.CfgValue`.
 *
 * Contains the full Value sealed type hierarchy:
 *
 *   Value (interface)
 *     ├── SimpleValue (interface)
 *     │     ├── PrimitiveValue (interface)
 *     │     │     ├── VBool
 *     │     │     ├── VInt
 *     │     │     ├── VLong
 *     │     │     ├── VFloat
 *     │     │     └── StringValue (interface)
 *     │     │           ├── VString
 *     │     │           └── VText
 *     │     ├── VStruct
 *     │     └── VInterface
 *     └── ContainerValue (interface)
 *           ├── VList
 *           └── VMap
 *
 * CompositeValue (abstract base for VStruct/VInterface/VList/VMap):
 *   holds `source` and `shared` flag.
 *
 * VTable: per-table container (schema + valueList + primaryKeyMap + uniqueKeyMaps + enum maps).
 * CfgValue: top-level container (schema + vTableMap + valueStat).
 * CfgValueStat: tracks JSON file last-modified times for cfgeditor (copy-on-write).
 */

import { DCell, DFile, DCellList, type Source } from '@cfggen/data';
import type { Structural, InterfaceSchema, TableSchema, CfgSchema } from '@cfggen/schema';

// ---------------------------------------------------------------------------
// Value interfaces (TS "sealed" simulation via abstract classes + instanceof)
// ---------------------------------------------------------------------------

/**
 * Root of the value hierarchy. Every value carries a `source` (where it
 * came from) and a `packStr()` (serialized form for writing back to Excel).
 */
export interface Value {
  readonly source: Source;
  packStr(): string;
}

/**
 * A value that can appear as a list element or map key/value.
 * (Java: sealed interface SimpleValue extends Value)
 */
export type SimpleValue = VBool | VInt | VLong | VFloat | VString | VText | VStruct | VInterface;

/**
 * A container value (list or map). Cannot be a list element.
 * (Java: sealed interface ContainerValue extends Value)
 */
export type ContainerValue = VList | VMap;

/**
 * Primitive values: VBool, VInt, VLong, VFloat, StringValue (VString, VText).
 * (Java: sealed interface PrimitiveValue extends SimpleValue)
 */
export type PrimitiveValue = VBool | VInt | VLong | VFloat | VString | VText;

/**
 * String values: VString (immutable) and VText (mutable, dual-value).
 * (Java: sealed interface StringValue extends PrimitiveValue)
 */
export type StringValue = VString | VText;

// ---------------------------------------------------------------------------
// CompositeValue — abstract base for VStruct, VInterface, VList, VMap
// ---------------------------------------------------------------------------

/**
 * Base class for mutable composite values. Holds `source` and `shared` flag.
 * `shared` is used by Lua generation to minimize memory for identical tables.
 */
export abstract class CompositeValue {
  protected _source: Source;
  protected _shared: boolean = false;

  constructor(source: Source) {
    this._source = source;
  }

  get source(): Source {
    return this._source;
  }

  setShared(): void {
    this._shared = true;
  }

  isShared(): boolean {
    return this._shared;
  }

  abstract packStr(): string;
}

// ---------------------------------------------------------------------------
// Primitive Values (immutable)
// ---------------------------------------------------------------------------

/**
 * Boolean value. hashCode: 1 (true) or 0 (false).
 */
export class VBool implements PrimitiveValue {
  readonly value: boolean;
  readonly source: Source;

  constructor(value: boolean, source: Source) {
    this.value = value;
    this.source = source;
  }

  equals(o: unknown): boolean {
    if (this === o) return true;
    if (!(o instanceof VBool)) return false;
    return this.value === o.value;
  }

  hashCode(): number {
    return this.value ? 1 : 0;
  }

  toStr(): string {
    return String(this.value);
  }

  packStr(): string {
    return this.toStr();
  }
}

/**
 * 32-bit integer value. hashCode === value.
 */
export class VInt implements PrimitiveValue {
  readonly value: number;
  readonly source: Source;

  constructor(value: number, source: Source) {
    this.value = value;
    this.source = source;
  }

  equals(o: unknown): boolean {
    if (this === o) return true;
    if (!(o instanceof VInt)) return false;
    return this.value === o.value;
  }

  hashCode(): number {
    return this.value;
  }

  toStr(): string {
    return String(this.value);
  }

  packStr(): string {
    return this.toStr();
  }
}

/**
 * 64-bit integer value. Uses bigint internally to match Java long semantics.
 * hashCode: (int)(value ^ (value >>> 32)) — for values fitting in 32 bits,
 * this is just the low 32 bits.
 */
export class VLong implements PrimitiveValue {
  readonly value: bigint;
  readonly source: Source;

  constructor(value: bigint, source: Source) {
    this.value = value;
    this.source = source;
  }

  equals(o: unknown): boolean {
    if (this === o) return true;
    if (!(o instanceof VLong)) return false;
    return this.value === o.value;
  }

  hashCode(): number {
    const v = this.value;
    // Java Long.hashCode(v) = (int)(v ^ (v >>> 32))
    // For bigint, simulate: low 32 bits XOR high 32 bits (if any)
    const low = Number(v & 0xFFFFFFFFn);
    const high = Number((v >> 32n) & 0xFFFFFFFFn);
    return (low ^ high) | 0; // |0 to get signed 32-bit
  }

  toStr(): string {
    return String(this.value);
  }

  packStr(): string {
    return this.toStr();
  }
}

/**
 * Float value. `repr()` preserves the original cell string to avoid
 * floating-point precision loss.
 */
export class VFloat implements PrimitiveValue {
  readonly value: number;
  readonly source: Source;

  constructor(value: number, source: Source) {
    this.value = value;
    this.source = source;
  }

  /**
   * Returns the original cell string (trimmed) if source is a DCell,
   * otherwise falls back to String(value).
   */
  repr(): string {
    if (this.source instanceof DCell) {
      return this.source.value().trim();
    }
    return String(this.value);
  }

  equals(o: unknown): boolean {
    if (this === o) return true;
    if (!(o instanceof VFloat)) return false;
    // Java Float.compare: handles NaN and -0.0
    return Object.is(this.value, o.value);
  }

  hashCode(): number {
    // Java Float.hashCode(float) = Float.floatToIntBits(value)
    // We approximate with a hash of the number
    return this.value.toFixed(7).split('').reduce((h, c) => {
      h = (h * 31 + c.charCodeAt(0)) | 0;
      return h;
    }, 0);
  }

  toStr(): string {
    return this.repr();
  }

  packStr(): string {
    return this.toStr();
  }
}

// ---------------------------------------------------------------------------
// String Values
// ---------------------------------------------------------------------------

/**
 * Immutable string value.
 */
export class VString implements StringValue {
  readonly value: string;
  readonly source: Source;

  constructor(value: string, source: Source) {
    this.value = value;
    this.source = source;
  }

  equals(o: unknown): boolean {
    if (this === o) return true;
    if (!(o instanceof VString)) return false;
    return this.value === o.value;
  }

  hashCode(): number {
    let h = 0;
    for (let i = 0; i < this.value.length; i++) {
      h = (h * 31 + this.value.charCodeAt(i)) | 0;
    }
    return h;
  }

  toStr(): string {
    return this.value;
  }

  packStr(): string {
    return this.value;
  }
}

/**
 * Mutable text value with dual-value mechanism (original / translated).
 * `value` defaults to `original`; after `setTranslated(nonEmpty)`, value
 * becomes the translated text.
 */
export class VText implements StringValue {
  readonly original: string;
  readonly source: Source;
  private _value: string;
  private _translated: string;

  constructor(original: string, source: Source) {
    this.original = original;
    this.source = source;
    this._value = original;
    this._translated = '';
  }

  get value(): string {
    return this._value;
  }

  get translated(): string {
    return this._translated;
  }

  setTranslated(translated: string | null): void {
    if (translated === null) {
      this._translated = '';
    } else {
      this._translated = translated;
      if (translated !== '') {
        this._value = translated;
      }
    }
  }

  equals(o: unknown): boolean {
    if (this === o) return true;
    if (!(o instanceof VText)) return false;
    return this._value === o._value;
  }

  hashCode(): number {
    let h = 0;
    for (let i = 0; i < this._value.length; i++) {
      h = (h * 31 + this._value.charCodeAt(i)) | 0;
    }
    return h;
  }

  toStr(): string {
    return this._value;
  }

  packStr(): string {
    return this._value;
  }
}

// ---------------------------------------------------------------------------
// VStruct — a struct value (schema + field values)
// ---------------------------------------------------------------------------

/**
 * A struct value: schema reference + list of field values + cfgeditor metadata.
 * equals uses schema reference equality (===) to prevent dynamic struct schemas
 * from being used for lookups.
 */
export class VStruct extends CompositeValue implements SimpleValue {
  readonly schema: Structural;
  readonly values: Value[];
  private _note?: string;
  private _fold: boolean = false;
  private _embedFields?: Map<string, boolean>;

  constructor(schema: Structural, values: Value[], source: Source) {
    super(source);
    this.schema = schema;
    this.values = values;
  }

  name(): string {
    return this.schema.name();
  }

  get note(): string | undefined {
    return this._note;
  }

  setNote(note: string): void {
    this._note = note;
  }

  isFold(): boolean {
    return this._fold;
  }

  setFold(fold: boolean): void {
    this._fold = fold;
  }

  get embedFields(): Map<string, boolean> | undefined {
    return this._embedFields;
  }

  setEmbedFields(embedFields: Map<string, boolean>): void {
    this._embedFields = embedFields;
  }

  equals(o: unknown): boolean {
    if (this === o) return true;
    if (!(o instanceof VStruct)) return false;
    return this.schema === o.schema && valuesEqual(this.values, o.values);
  }

  hashCode(): number {
    return this.values.length;
  }

  packStr(): string {
    return this.name();
  }
}

// ---------------------------------------------------------------------------
// VInterface — an interface value (schema + child VStruct)
// ---------------------------------------------------------------------------

/**
 * An interface value: interface schema + child struct (the implementation).
 * equals uses schema reference equality (===).
 */
export class VInterface extends CompositeValue implements SimpleValue {
  readonly schema: InterfaceSchema;
  readonly child: VStruct;

  constructor(schema: InterfaceSchema, child: VStruct, source: Source) {
    super(source);
    this.schema = schema;
    this.child = child;
  }

  /**
   * If source is a DCellList (multiple cells), returns the first cell
   * (which holds the impl name). Otherwise returns source directly.
   */
  getImplNameSource(): Source {
    if (this._source instanceof DCellList && this._source.cells.length > 0) {
      return this._source.cells[0];
    }
    return this._source;
  }

  equals(o: unknown): boolean {
    if (this === o) return true;
    if (!(o instanceof VInterface)) return false;
    return this.schema === o.schema && this.child.equals(o.child);
  }

  hashCode(): number {
    return this.child.hashCode();
  }

  packStr(): string {
    return this.child.packStr();
  }
}

// ---------------------------------------------------------------------------
// VList — a list value (list of SimpleValues)
// ---------------------------------------------------------------------------

export class VList extends CompositeValue implements ContainerValue {
  readonly valueList: SimpleValue[];

  constructor(valueList: SimpleValue[], source: Source) {
    super(source);
    this.valueList = valueList;
  }

  equals(o: unknown): boolean {
    if (this === o) return true;
    if (!(o instanceof VList)) return false;
    return valuesEqual(this.valueList, o.valueList);
  }

  hashCode(): number {
    return this.valueList.length;
  }

  packStr(): string {
    return this.valueList.map(v => v.packStr()).join(';');
  }
}

// ---------------------------------------------------------------------------
// VMap — a map value (Map<SimpleValue, SimpleValue>)
// ---------------------------------------------------------------------------

export class VMap extends CompositeValue implements ContainerValue {
  readonly valueMap: Map<SimpleValue, SimpleValue>;
  private _entryEmbeds?: Map<SimpleValue, boolean>;
  private _foldedEntries?: Set<SimpleValue>;
  private _entryNotes?: Map<SimpleValue, string>;

  constructor(valueMap: Map<SimpleValue, SimpleValue>, source: Source) {
    super(source);
    this.valueMap = valueMap;
  }

  get entryEmbeds(): Map<SimpleValue, boolean> | undefined {
    return this._entryEmbeds;
  }

  setEntryEmbeds(entryEmbeds: Map<SimpleValue, boolean>): void {
    this._entryEmbeds = entryEmbeds;
  }

  get foldedEntries(): Set<SimpleValue> | undefined {
    return this._foldedEntries;
  }

  setFoldedEntries(foldedEntries: Set<SimpleValue>): void {
    this._foldedEntries = foldedEntries;
  }

  get entryNotes(): Map<SimpleValue, string> | undefined {
    return this._entryNotes;
  }

  setEntryNotes(entryNotes: Map<SimpleValue, string>): void {
    this._entryNotes = entryNotes;
  }

  equals(o: unknown): boolean {
    if (this === o) return true;
    if (!(o instanceof VMap)) return false;
    // Structural comparison of Map
    if (this.valueMap.size !== o.valueMap.size) return false;
    for (const [k, v] of this.valueMap) {
      let found = false;
      for (const [ok, ov] of o.valueMap) {
        if (valueEquals(k, ok) && valueEquals(v, ov)) {
          found = true;
          break;
        }
      }
      if (!found) return false;
    }
    return true;
  }

  hashCode(): number {
    return this.valueMap.size;
  }

  packStr(): string {
    const entries: string[] = [];
    for (const [k, v] of this.valueMap) {
      entries.push(`${k.packStr()}=>${v.packStr()}`);
    }
    return entries.join(';');
  }
}

// ---------------------------------------------------------------------------
// VTable — per-table container
// ---------------------------------------------------------------------------

/**
 * A table's parsed values: schema, row list, primary key index, unique key
 * indexes, and optional enum name maps.
 */
export class VTable {
  readonly schema: TableSchema;
  readonly valueList: VStruct[];
  readonly primaryKeyMap: Map<Value, VStruct>;
  readonly uniqueKeyMaps: Map<string[], Map<Value, VStruct>>;
  readonly enumNames: Set<string> | null;
  readonly enumNameToIntegerValueMap: Map<string, number> | null;

  constructor(
    schema: TableSchema,
    valueList: VStruct[],
    primaryKeyMap: Map<Value, VStruct>,
    uniqueKeyMaps: Map<string[], Map<Value, VStruct>>,
    enumNames: Set<string> | null = null,
    enumNameToIntegerValueMap: Map<string, number> | null = null,
  ) {
    this.schema = schema;
    this.valueList = valueList;
    this.primaryKeyMap = primaryKeyMap;
    this.uniqueKeyMaps = uniqueKeyMaps;
    this.enumNames = enumNames;
    this.enumNameToIntegerValueMap = enumNameToIntegerValueMap;
  }

  name(): string {
    return this.schema.name();
  }
}

// ---------------------------------------------------------------------------
// CfgValue — top-level container
// ---------------------------------------------------------------------------

/**
 * Top-level configuration value: schema + table map + value stat.
 * Uses TreeMap (sorted) ordering for vTableMap.
 */
export class CfgValue {
  readonly schema: CfgSchema;
  readonly vTableMap: Map<string, VTable>;
  readonly valueStat: CfgValueStat;

  constructor(schema: CfgSchema, vTableMap: Map<string, VTable>, valueStat: CfgValueStat) {
    this.schema = schema;
    this.vTableMap = vTableMap;
    this.valueStat = valueStat;
  }

  static of(schema: CfgSchema): CfgValue {
    return new CfgValue(schema, new Map(), new CfgValueStat());
  }

  tables(): Iterable<VTable> {
    return this.vTableMap.values();
  }

  /**
   * Returns tables sorted alphabetically by name.
   */
  sortedTables(): VTable[] {
    const sorted = [...this.vTableMap.entries()].sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    return sorted.map(([, v]) => v);
  }

  getTable(tableName: string): VTable | undefined {
    return this.vTableMap.get(tableName);
  }
}

// ---------------------------------------------------------------------------
// CfgValueStat — JSON file last-modified tracking (copy-on-write)
// ---------------------------------------------------------------------------

/**
 * Tracks JSON file last-modified times for cfgeditor.
 * Maps: table -> recordId -> lastModified (bigint as long).
 *
 * `newAddLastModified` / `newRemoveLastModified` return new instances
 * (copy-on-write style), leaving the original unchanged.
 */
export class CfgValueStat {
  private readonly _lastModifiedMap: Map<string, Map<string, bigint>>;

  constructor() {
    this._lastModifiedMap = new Map();
  }

  getLastModifiedMap(): Map<string, Map<string, bigint>> {
    return this._lastModifiedMap;
  }

  newTableLastModified(table: string, lastModified: Map<string, bigint>): void {
    this._lastModifiedMap.set(table, lastModified);
  }

  private _addLastModified(table: string, id: string, time: bigint): void {
    let m = this._lastModifiedMap.get(table);
    if (!m) {
      m = new Map();
      this._lastModifiedMap.set(table, m);
    }
    m.set(id, time);
  }

  private _removeLastModified(table: string, id: string): void {
    const m = this._lastModifiedMap.get(table);
    if (m) {
      m.delete(id);
    }
  }

  private _copy(): CfgValueStat {
    const newStat = new CfgValueStat();
    for (const [key, value] of this._lastModifiedMap) {
      newStat._lastModifiedMap.set(key, new Map(value));
    }
    return newStat;
  }

  newAddLastModified(table: string, id: string, time: bigint): CfgValueStat {
    const newStat = this._copy();
    newStat._addLastModified(table, id, time);
    return newStat;
  }

  newRemoveLastModified(table: string, id: string): CfgValueStat {
    const newStat = this._copy();
    newStat._removeLastModified(table, id);
    return newStat;
  }
}

// ---------------------------------------------------------------------------
// Helper: value equality
// ---------------------------------------------------------------------------

export function valueEquals(a: Value, b: Value): boolean {
  if (a === b) return true;
  if (a instanceof VBool && b instanceof VBool) return a.equals(b);
  if (a instanceof VInt && b instanceof VInt) return a.equals(b);
  if (a instanceof VLong && b instanceof VLong) return a.equals(b);
  if (a instanceof VFloat && b instanceof VFloat) return a.equals(b);
  if (a instanceof VString && b instanceof VString) return a.equals(b);
  if (a instanceof VText && b instanceof VText) return a.equals(b);
  // VText and VString can be equal if values match (Java checks by instanceof StringValue)
  if ((a instanceof VString || a instanceof VText) &&
      (b instanceof VString || b instanceof VText)) {
    return (a as VString | VText).value === (b as VString | VText).value;
  }
  if (a instanceof VStruct && b instanceof VStruct) return a.equals(b);
  if (a instanceof VInterface && b instanceof VInterface) return a.equals(b);
  if (a instanceof VList && b instanceof VList) return a.equals(b);
  if (a instanceof VMap && b instanceof VMap) return a.equals(b);
  return false;
}

function valuesEqual(a: Value[], b: Value[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!valueEquals(a[i], b[i])) return false;
  }
  return true;
}
