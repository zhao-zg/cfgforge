/**
 * StructSchema — TypeScript port of Java `configgen.schema.StructSchema`.
 *
 * Implements Fieldable + Structural + Nameable.
 * Has mutable nullableInterface pointer.
 */

import type { FieldFormat, Sep } from './FieldFormat';
import { AutoOrPack, isSep } from './FieldFormat';
import type { Metadata } from './Metadata';
import type { FieldSchema } from './FieldSchema';
import { FieldSchema as FieldSchemaClass } from './FieldSchema';
import type { ForeignKeySchema } from './ForeignKeySchema';
import type { InterfaceSchema } from './InterfaceSchema';
import type { FieldType } from './FieldType';
import { defaultNamespace, defaultLastName } from './Nameable';
import type { Fieldable, Structural } from './interfaces';

export class StructSchema implements Fieldable, Structural {
  private _nullableInterface: InterfaceSchema | null = null;

  constructor(
    private readonly _name: string,
    private readonly _fmt: FieldFormat,
    private readonly _meta: Metadata,
    private readonly _fields: FieldSchema[],
    private readonly _foreignKeys: ForeignKeySchema[],
  ) {
    if (!_name) throw new Error('struct name empty');
    if (!_fmt) throw new Error('struct fmt must not be null');
    if (!_meta) throw new Error('struct meta must not be null');
    if (!_fields) throw new Error('struct fields must not be null');
    if (!_foreignKeys) throw new Error('struct foreignKeys must not be null');
    if (_name.length === 0) throw new Error('struct name empty');

    // Validate fmt: only auto/pack/sep allowed
    if (_fmt !== AutoOrPack.AUTO && _fmt !== AutoOrPack.PACK && !isSep(_fmt)) {
      throw new Error('struct fmt must be auto/pack/sep');
    }
  }

  name(): string { return this._name; }
  fmt(): FieldFormat { return this._fmt; }
  meta(): Metadata { return this._meta; }

  fields(): FieldSchema[] { return this._fields; }
  foreignKeys(): ForeignKeySchema[] { return this._foreignKeys; }

  findField(name: string): FieldSchema | null {
    for (const f of this._fields) {
      if (f.name === name) return f;
    }
    return null;
  }

  findForeignKey(name: string): ForeignKeySchema | null {
    for (const fk of this._foreignKeys) {
      if (fk.name === name) return fk;
    }
    return null;
  }

  fieldNameSet(): Set<string> {
    return new Set(this._fields.map((f) => f.name));
  }

  updateFieldType(fieldName: string, newType: FieldType): void {
    for (let i = 0; i < this._fields.length; i++) {
      if (this._fields[i].name === fieldName) {
        const old = this._fields[i];
        this._fields[i] = new FieldSchemaClass(old.name, newType, old.fmt, old.meta);
        return;
      }
    }
  }

  addForeignKey(fk: ForeignKeySchema): void {
    this._foreignKeys.push(fk);
  }

  // fullName override
  fullName(): string {
    if (this._nullableInterface) {
      return `${this._nullableInterface.name()}.${this._name}`;
    }
    return this._name;
  }

  namespace(): string {
    return defaultNamespace(this.fullName());
  }

  lastName(): string {
    return defaultLastName(this.fullName());
  }

  comment(): string {
    // Will be implemented when Metadata is fully done in T2.10
    return '';
  }

  copy(): StructSchema {
    const fieldsCopy = this._fields.map((f) => f.copy());
    const fksCopy = this._foreignKeys.map((fk) => fk.copy());
    return new StructSchema(this._name, this._fmt, this._meta.copy(), fieldsCopy, fksCopy);
  }

  nullableInterface(): InterfaceSchema | null {
    return this._nullableInterface;
  }

  setNullableInterface(iface: InterfaceSchema): void {
    this._nullableInterface = iface;
  }

  equals(other: unknown): boolean {
    if (this === other) return true;
    if (!(other instanceof StructSchema)) return false;
    return this._name === other._name
      && fieldFormatEquals(this._fmt, other._fmt)
      && this._fields.length === other._fields.length
      && this._fields.every((f, i) => f.equals(other._fields[i]))
      && this._foreignKeys.length === other._foreignKeys.length
      && this._foreignKeys.every((fk, i) => fk.equals(other._foreignKeys[i]));
  }

  toString(): string {
    return `StructSchema{name=${this._name}, fmt=${this._fmt}, fields=${this._fields.length}, foreignKeys=${this._foreignKeys.length}}`;
  }
}

function fieldFormatEquals(a: FieldFormat, b: FieldFormat): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  if (a instanceof Object && b instanceof Object && 'equals' in a) {
    return (a as any).equals(b);
  }
  return false;
}

type FieldFormat = import('./FieldFormat').FieldFormat;
