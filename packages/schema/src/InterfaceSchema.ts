/**
 * InterfaceSchema — TypeScript port of Java `configgen.schema.InterfaceSchema`.
 *
 * Implements Fieldable + Nameable.
 * Has mutable enumRefTable and nullableDefaultImplStruct pointers.
 */

import { AutoOrPack } from './FieldFormat';
import type { FieldFormat } from './FieldFormat';
import type { Metadata } from './Metadata';
import type { StructSchema } from './StructSchema';
import type { TableSchema } from './TableSchema';
import { Primitive, isFList, isFMap, isStructRef } from './FieldType';
import type { FieldType } from './FieldType';
import { defaultNamespace, defaultLastName } from './Nameable';
import type { Fieldable } from './interfaces';

export class InterfaceSchema implements Fieldable {
  private _enumRefTable: TableSchema | null = null;
  private _nullableDefaultImplStruct: StructSchema | null = null;

  constructor(
    private readonly _name: string,
    private readonly _enumRef: string,
    private readonly _defaultImpl: string,
    private readonly _fmt: FieldFormat,
    private readonly _meta: Metadata,
    private readonly _impls: StructSchema[],
  ) {
    if (!_name) throw new Error('interface name empty');
    if (_enumRef === null || _enumRef === undefined) throw new Error('enumRef must not be null');
    if (_defaultImpl === null || _defaultImpl === undefined) throw new Error('defaultImpl must not be null');
    if (!_fmt) throw new Error('fmt must not be null');
    if (!_impls) throw new Error('impls must not be null');
    if (_name.length === 0) throw new Error('interface name empty');
    if (_fmt !== AutoOrPack.AUTO && _fmt !== AutoOrPack.PACK) {
      throw new Error('interface fmt must be auto/pack');
    }
  }

  name(): string { return this._name; }
  fmt(): FieldFormat { return this._fmt; }
  meta(): Metadata { return this._meta; }
  enumRef(): string { return this._enumRef; }
  defaultImpl(): string { return this._defaultImpl; }
  impls(): StructSchema[] { return this._impls; }

  findImpl(name: string): StructSchema | null {
    for (const impl of this._impls) {
      if (impl.name() === name) return impl;
    }
    return null;
  }

  nullableEnumRefTable(): TableSchema | null {
    return this._enumRefTable;
  }

  setNullableEnumRefTable(ts: TableSchema): void {
    this._enumRefTable = ts;
  }

  defaultImplStruct(): StructSchema {
    if (this._nullableDefaultImplStruct) {
      return this._nullableDefaultImplStruct;
    }
    return this._impls[0];
  }

  setNullableDefaultImplStruct(s: StructSchema): void {
    this._nullableDefaultImplStruct = s;
  }

  canBeNumberOrBool(): boolean {
    if (this._fmt === AutoOrPack.PACK && this._nullableDefaultImplStruct) {
      const fields = this._nullableDefaultImplStruct.fields();
      if (fields.length === 1) {
        const type = fields[0].type;
        return type === Primitive.BOOL
          || type === Primitive.INT
          || type === Primitive.LONG
          || type === Primitive.FLOAT;
      }
    }
    return false;
  }

  namespace(): string { return defaultNamespace(this._name); }
  lastName(): string { return defaultLastName(this._name); }
  fullName(): string { return this._name; }
  comment(): string { return ''; }

  copy(): InterfaceSchema {
    return new InterfaceSchema(
      this._name,
      this._enumRef,
      this._defaultImpl,
      this._fmt,
      this._meta.copy(),
      this._impls.map((impl) => impl.copy()),
    );
  }

  equals(other: unknown): boolean {
    if (this === other) return true;
    if (!(other instanceof InterfaceSchema)) return false;
    return this._name === other._name
      && this._enumRef === other._enumRef
      && this._defaultImpl === other._defaultImpl
      && this._fmt === other._fmt
      && this._impls.length === other._impls.length
      && this._impls.every((impl, i) => impl.equals(other._impls[i]));
  }

  toString(): string {
    return `InterfaceSchema{name=${this._name}, enumRef=${this._enumRef}, defaultImpl=${this._defaultImpl}, impls=${this._impls.length}}`;
  }
}
