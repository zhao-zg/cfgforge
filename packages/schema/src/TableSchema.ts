/**
 * TableSchema — TypeScript port of Java `configgen.schema.TableSchema`.
 *
 * Java record implementing Structural + Nameable.
 * fmt() always returns AUTO.
 */

import { AutoOrPack } from './FieldFormat';
import type { FieldFormat } from './FieldFormat';
import type { Metadata } from './Metadata';
import { KeySchema } from './KeySchema';
import type { FieldSchema } from './FieldSchema';
import type { ForeignKeySchema } from './ForeignKeySchema';
import type { EntryType } from './EntryType';
import type { FieldType } from './FieldType';
import { defaultNamespace, defaultLastName } from './Nameable';
import type { Structural } from './interfaces';

export class TableSchema implements Structural {
  constructor(
    private readonly _name: string,
    public readonly primaryKey: KeySchema,
    public readonly entry: EntryType,
    public readonly isColumnMode: boolean,
    private readonly _meta: Metadata,
    private readonly _fields: FieldSchema[],
    private readonly _foreignKeys: ForeignKeySchema[],
    private readonly _uniqueKeys: KeySchema[],
  ) {
    if (!_name) throw new Error('table name empty');
    if (_name.length === 0) throw new Error('table name empty');
    if (!primaryKey) throw new Error('primaryKey must not be null');
    if (entry === null || entry === undefined) throw new Error('entry must not be null');
    if (!_meta) throw new Error('meta must not be null');
    if (!_fields) throw new Error('fields must not be null');
    if (!_foreignKeys) throw new Error('foreignKeys must not be null');
    if (!_uniqueKeys) throw new Error('uniqueKeys must not be null');
  }

  fmt(): FieldFormat {
    return AutoOrPack.AUTO;
  }

  name(): string { return this._name; }

  meta(): Metadata { return this._meta; }

  fields(): FieldSchema[] { return this._fields; }
  foreignKeys(): ForeignKeySchema[] { return this._foreignKeys; }

  uniqueKeys(): KeySchema[] { return this._uniqueKeys; }

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
        this._fields[i] = new FieldSchema(old.name, newType, old.fmt, old.meta);
        return;
      }
    }
  }

  addForeignKey(fk: ForeignKeySchema): void {
    this._foreignKeys.push(fk);
  }

  findUniqueKey(arg: KeySchema | string[]): KeySchema | null {
    const names = Array.isArray(arg) ? arg : arg.fields();
    for (const uk of this._uniqueKeys) {
      if (uk.fields().length === names.length && uk.fields().every((f, i) => f === names[i])) {
        return uk;
      }
    }
    return null;
  }

  namespace(): string { return defaultNamespace(this.name); }
  lastName(): string { return defaultLastName(this.name); }
  fullName(): string { return this.name; }
  comment(): string {
    const cd = this._meta.getComment();
    return cd !== null ? cd.encode() : '';
  }

  copy(): TableSchema {
    return new TableSchema(
      this._name,
      this.primaryKey.copy(),
      this.entry.copy(),
      this.isColumnMode,
      this._meta.copy(),
      this._fields.map((f) => f.copy()),
      this._foreignKeys.map((fk) => fk.copy()),
      this._uniqueKeys.map((uk) => uk.copy()),
    );
  }

  isJson(): boolean {
    return this._meta.isJson();
  }

  equals(other: unknown): boolean {
    if (this === other) return true;
    if (!(other instanceof TableSchema)) return false;
    return this._name === other._name
      && this.primaryKey.equals(other.primaryKey)
      && this.entry.equals(other.entry)
      && this.isColumnMode === other.isColumnMode
      && this._fields.length === other._fields.length
      && this._fields.every((f, i) => f.equals(other._fields[i]))
      && this._foreignKeys.length === other._foreignKeys.length
      && this._foreignKeys.every((fk, i) => fk.equals(other._foreignKeys[i]))
      && this._uniqueKeys.length === other._uniqueKeys.length
      && this._uniqueKeys.every((uk, i) => uk.equals(other._uniqueKeys[i]));
  }

  toString(): string {
    return `TableSchema{name=${this._name}, fields=${this._fields.length}}`;
  }
}
