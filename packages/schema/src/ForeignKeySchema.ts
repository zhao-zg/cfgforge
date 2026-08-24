/**
 * ForeignKeySchema — TypeScript port of Java `configgen.schema.ForeignKeySchema`.
 *
 * Class with mutable refTableSchema and keyIndices pointers.
 */

import { KeySchema } from './KeySchema';
import type { RefKey } from './RefKey';
import type { Metadata } from './Metadata';
import type { TableSchema } from './TableSchema';

export class ForeignKeySchema {
  private _refTableSchema: TableSchema | null = null;
  private _keyIndices: number[] | null = null;

  constructor(
    public readonly name: string,
    public readonly key: KeySchema,
    public readonly refTable: string,
    public readonly refKey: RefKey,
    public readonly meta: Metadata,
  ) {
    if (name === null || name === undefined) throw new Error('name must not be null');
    if (key === null || key === undefined) throw new Error('key must not be null');
    if (refTable === null || refTable === undefined) throw new Error('refTable must not be null');
    if (refKey === null || refKey === undefined) throw new Error('refKey must not be null');
    if (meta === null || meta === undefined) throw new Error('meta must not be null');
    if (name.length === 0) throw new Error('struct name empty');
  }

  copy(): ForeignKeySchema {
    return new ForeignKeySchema(
      this.name,
      this.key.copy(),
      this.refTable,
      this.refKey.copy(),
      this.meta.copy(),
    );
  }

  refTableSchema(): TableSchema | null {
    return this._refTableSchema;
  }

  setRefTableSchema(ts: TableSchema): void {
    this._refTableSchema = ts;
  }

  keyIndices(): number[] | null {
    return this._keyIndices;
  }

  setKeyIndices(indices: number[]): void {
    this._keyIndices = indices;
  }

  refTableNormalized(): string {
    return this._refTableSchema ? this._refTableSchema.name() : this.refTable;
  }

  equals(other: unknown): boolean {
    if (this === other) return true;
    if (!(other instanceof ForeignKeySchema)) return false;
    return this.name === other.name
      && this.key.equals(other.key)
      && this.refTable === other.refTable
      && refKeyEquals(this.refKey, other.refKey);
  }

  toString(): string {
    return `ForeignKeySchema{name='${this.name}', key=${this.key}, refTable='${this.refTable}', refKey=${this.refKey}}`;
  }
}

// ---------------------------------------------------------------------------
// Internal equality helper
// ---------------------------------------------------------------------------

function refKeyEquals(a: RefKey, b: RefKey): boolean {
  if (a instanceof Object && b instanceof Object && 'equals' in a && typeof a.equals === 'function') {
    return a.equals(b);
  }
  return false;
}
