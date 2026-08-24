/**
 * FieldSchema — TypeScript port of Java `configgen.schema.FieldSchema`.
 *
 * Java record: name, type, fmt, meta.
 */

import { KeySchema } from './KeySchema';
import type { FieldType } from './FieldType';
import type { FieldFormat } from './FieldFormat';
import type { Metadata } from './Metadata';
import { copyFieldType } from './FieldType';

export class FieldSchema {
  constructor(
    public readonly name: string,
    public readonly type: FieldType,
    public readonly fmt: FieldFormat,
    public readonly meta: Metadata,
  ) {
    if (name === null || name === undefined) {
      throw new Error('FieldSchema name must not be null');
    }
    if (type === null || type === undefined) {
      throw new Error('FieldSchema type must not be null');
    }
    if (fmt === null || fmt === undefined) {
      throw new Error('FieldSchema fmt must not be null');
    }
    if (meta === null || meta === undefined) {
      throw new Error('FieldSchema meta must not be null');
    }
    if (name.length === 0) {
      throw new Error('field name empty');
    }
  }

  /**
   * Encoded comment string, or empty string if no comment.
   */
  comment(): string {
    const cd = this.meta.getComment();
    return cd !== null ? cd.encode() : '';
  }

  isLowercase(): boolean {
    return this.meta.isLowercase();
  }

  isMustFill(): boolean {
    return this.meta.isMustFill();
  }

  isSeq(): boolean {
    return this.meta.isSeq();
  }

  copy(): FieldSchema {
    return new FieldSchema(
      this.name,
      copyFieldType(this.type),
      this.fmt,
      this.meta.copy(),
    );
  }

  equals(other: unknown): boolean {
    if (this === other) return true;
    if (!(other instanceof FieldSchema)) return false;
    return this.name === other.name
      && fieldTypeEquals(this.type, other.type)
      && fieldFormatEquals(this.fmt, other.fmt);
  }

  toString(): string {
    return `FieldSchema{name=${this.name}, type=${this.type}, fmt=${this.fmt}}`;
  }
}

// ---------------------------------------------------------------------------
// Internal equality helpers (since FieldType/FieldFormat are union types)
// ---------------------------------------------------------------------------

function fieldTypeEquals(a: FieldType, b: FieldType): boolean {
  if (typeof a === 'string' && typeof b === 'string') {
    return a === b;
  }
  if (a instanceof Object && b instanceof Object && 'equals' in a && typeof a.equals === 'function') {
    return a.equals(b);
  }
  return false;
}

function fieldFormatEquals(a: FieldFormat, b: FieldFormat): boolean {
  if (typeof a === 'string' && typeof b === 'string') {
    return a === b;
  }
  if (a instanceof Object && b instanceof Object && 'equals' in a && typeof a.equals === 'function') {
    return a.equals(b);
  }
  return false;
}
