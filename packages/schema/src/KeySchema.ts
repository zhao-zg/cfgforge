/**
 * KeySchema — TypeScript port of Java `configgen.schema.KeySchema`.
 *
 * A list of field names that form a key (primary, unique, or foreign).
 * Has a mutable fieldSchemas pointer that gets filled during resolution.
 */

import type { FieldSchema } from './FieldSchema.js';

export class KeySchema {
  private _fieldSchemas: FieldSchema[] | null = null;

  constructor(private readonly _fields: string[]) {
    if (_fields === null || _fields === undefined) {
      throw new Error('KeySchema fields must not be null');
    }
    if (_fields.length === 0) {
      throw new Error('keySchema key empty');
    }
  }

  fields(): string[] {
    return this._fields;
  }

  fieldSchemas(): FieldSchema[] | null {
    return this._fieldSchemas;
  }

  setFieldSchemas(fs: FieldSchema[]): void {
    this._fieldSchemas = fs;
  }

  copy(): KeySchema {
    return new KeySchema([...this._fields]);
  }

  equals(other: unknown): boolean {
    if (this === other) return true;
    if (!(other instanceof KeySchema)) return false;
    if (this._fields.length !== other._fields.length) return false;
    return this._fields.every((f, i) => f === other._fields[i]);
  }

  toString(): string {
    return `KeySchema{fields=[${this._fields.join(', ')}]}`;
  }
}
