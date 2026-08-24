/**
 * FieldType — TypeScript port of Java `configgen.schema.FieldType`.
 *
 * Java sealed interface hierarchy:
 *   FieldType
 *     SimpleType (interface)
 *       Primitive (enum: BOOL/INT/LONG/FLOAT/STRING/TEXT)
 *       StructRef (class with mutable obj pointer)
 *     ContainerType (interface)
 *       FList (record: item)
 *       FMap (record: key, value)
 *
 * In TS we use discriminated unions + classes for mutable state.
 */

// ---------------------------------------------------------------------------
// Primitive
// ---------------------------------------------------------------------------

/**
 * Primitive types. Values mirror the Java enum names lowercased,
 * matching how they appear in CFG syntax: bool, int, long, float, str, text.
 *
 * NOTE: STRING maps to 'str' (not 'string') to match CFG syntax.
 *       TEXT indicates the field requires i18n.
 */
export const Primitive = {
  BOOL: 'bool',
  INT: 'int',
  LONG: 'long',
  FLOAT: 'float',
  STRING: 'str',
  TEXT: 'text',
} as const;

export type Primitive = (typeof Primitive)[keyof typeof Primitive];

// ---------------------------------------------------------------------------
// SimpleType / ContainerType markers
// ---------------------------------------------------------------------------

/**
 * SimpleType = Primitive | StructRef
 * ContainerType = FList | FMap
 */
export type SimpleType = Primitive | StructRef;
export type ContainerType = FList | FMap;
export type FieldType = SimpleType | ContainerType;

// ---------------------------------------------------------------------------
// FList
// ---------------------------------------------------------------------------

export class FList {
  constructor(public readonly item: SimpleType) {
    if (item === null || item === undefined) {
      throw new Error('FList item must not be null');
    }
  }

  copy(): FList {
    return new FList(copySimpleType(this.item));
  }

  equals(other: unknown): boolean {
    if (!(other instanceof FList)) return false;
    return simpleTypeEquals(this.item, other.item);
  }

  toString(): string {
    return `FList(item=${simpleTypeStr(this.item)})`;
  }
}

// ---------------------------------------------------------------------------
// FMap
// ---------------------------------------------------------------------------

export class FMap {
  constructor(
    public readonly key: SimpleType,
    public readonly value: SimpleType,
  ) {
    if (key === null || key === undefined) {
      throw new Error('FMap key must not be null');
    }
    if (value === null || value === undefined) {
      throw new Error('FMap value must not be null');
    }
  }

  copy(): FMap {
    return new FMap(copySimpleType(this.key), copySimpleType(this.value));
  }

  equals(other: unknown): boolean {
    if (!(other instanceof FMap)) return false;
    return simpleTypeEquals(this.key, other.key) && simpleTypeEquals(this.value, other.value);
  }

  toString(): string {
    return `FMap(key=${simpleTypeStr(this.key)}, value=${simpleTypeStr(this.value)})`;
  }
}

// ---------------------------------------------------------------------------
// StructRef
// ---------------------------------------------------------------------------

/**
 * Reference to a struct/interface by name.
 * The `obj` pointer is mutable — it is set during schema resolution
 * to point to the actual Fieldable (StructSchema or InterfaceSchema).
 */
export class StructRef {
  public obj: import('./Fieldable').Fieldable | null = null;

  constructor(public readonly name: string) {
    if (name === null || name === undefined) {
      throw new Error('StructRef name must not be null');
    }
  }

  /**
   * The normalized name — after resolution, this is the fullName of the
   * referenced Fieldable. Before resolution, returns the raw name.
   */
  nameNormalized(): string {
    return this.obj ? this.obj.name() : this.name;
  }

  copy(): StructRef {
    // copy() intentionally does NOT copy obj — it returns a fresh ref
    // that needs to be resolved again.
    return new StructRef(this.name);
  }

  equals(other: unknown): boolean {
    if (!(other instanceof StructRef)) return false;
    return this.name === other.name;
  }

  toString(): string {
    return `StructRef(name=${this.name})`;
  }
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isPrimitive(t: FieldType): t is Primitive {
  return typeof t === 'string';
}

export function isStructRef(t: FieldType): t is StructRef {
  return t instanceof StructRef;
}

export function isFList(t: FieldType): t is FList {
  return t instanceof FList;
}

export function isFMap(t: FieldType): t is FMap {
  return t instanceof FMap;
}

export function isSimpleType(t: FieldType): t is SimpleType {
  return isPrimitive(t) || isStructRef(t);
}

export function isContainerType(t: FieldType): t is ContainerType {
  return isFList(t) || isFMap(t);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function copySimpleType(t: SimpleType): SimpleType {
  if (typeof t === 'string') return t; // Primitive is immutable
  return t.copy(); // StructRef.copy()
}

function simpleTypeEquals(a: SimpleType, b: SimpleType): boolean {
  if (typeof a === 'string' && typeof b === 'string') {
    return a === b;
  }
  if (a instanceof StructRef && b instanceof StructRef) {
    return a.equals(b);
  }
  return false;
}

function simpleTypeStr(t: SimpleType): string {
  if (typeof t === 'string') return t;
  return t.name;
}
