/**
 * GdStructModel — TypeScript port of Java `configgen.gengd.StructModel`.
 *
 * Model used by genStruct template to generate GDScript struct/table .gd files.
 * Provides type mapping, create expressions, ref type/name generation,
 * unique key helpers, toString, etc.
 *
 * Differences from Java:
 * - Switch statements → if/else chains or Map lookups
 * - Java streams → TS array methods
 */

import { upper1, lower1 } from '@cfggen/shared';
import type { Nameable, FieldType, FieldSchema, ForeignKeySchema, KeySchema, Structural } from '@cfggen/schema';
import { Primitive, StructRef, FList, FMap, isFList } from '@cfggen/schema';
import { RefPrimary, RefUniq, RefList } from '@cfggen/schema';
import { TableSchema } from '@cfggen/schema';
import type { VTable } from '@cfggen/value';
import { GdName } from './GdName';
import type { GdCodeGenerator } from './GdCodeGenerator';

export class GdStructModel {
  readonly name: GdName;
  readonly structural: Structural;
  readonly vTable: VTable | null;
  private readonly gen: GdCodeGenerator;

  constructor(gen: GdCodeGenerator, structural: Structural, vTable: VTable | null) {
    this.gen = gen;
    this.name = new GdName(gen.prefix, structural);
    this.structural = structural;
    this.vTable = vTable;
  }

  fullName(nameable: Nameable): string {
    return new GdName(this.gen.prefix, nameable).className;
  }

  type(t: FieldType): string {
    if (typeof t === 'string') {
      switch (t) {
        case Primitive.BOOL: return 'bool';
        case Primitive.INT: return 'int';
        case Primitive.LONG: return 'int';
        case Primitive.FLOAT: return 'float';
        case Primitive.STRING: return 'String';
        case Primitive.TEXT: return this.gen.isLangSwitch ? 'ConfigText' : 'String';
      }
    }
    if (t instanceof StructRef) {
      return this.fullName(t.obj!);
    }
    if (t instanceof FList) {
      return 'Array[' + this.type(t.item) + ']';
    }
    if (t instanceof FMap) {
      return 'Dictionary[' + this.type(t.key) + ', ' + this.type(t.value) + ']';
    }
    throw new Error('Unknown FieldType');
  }

  create(t: FieldType): string | null {
    if (typeof t === 'string') {
      switch (t) {
        case Primitive.BOOL: return 'stream.read_bool()';
        case Primitive.INT: return 'stream.read_int32()';
        case Primitive.LONG: return 'stream.read_int64()';
        case Primitive.FLOAT: return 'stream.read_float()';
        case Primitive.STRING: return 'stream.read_string_in_pool()';
        case Primitive.TEXT: return this.gen.isLangSwitch ? 'ConfigText._create(stream)' : 'stream.read_text_in_pool()';
      }
    }
    if (t instanceof StructRef) {
      return this.fullName(t.obj!) + '._create(stream)';
    }
    // FList and FMap return null (handled specially in template)
    return null;
  }

  refType(fk: ForeignKeySchema): string {
    const refKey = fk.refKey;
    if (refKey instanceof RefList) {
      return 'Array[' + this.fullName(fk.refTableSchema()!) + ']';
    }
    // RefSimple = RefPrimary | RefUniq
    const firstLocal = fk.key.fieldSchemas()![0];
    const ft = firstLocal.type;
    if (isFList(ft)) {
      return 'Array[' + this.fullName(fk.refTableSchema()!) + ']';
    }
    if (ft instanceof FMap) {
      return 'Dictionary[' + this.type(ft.key) + ', ' + this.fullName(fk.refTableSchema()!) + ']';
    }
    // SimpleType
    return this.fullName(fk.refTableSchema()!);
  }

  refName(fk: ForeignKeySchema): string {
    const refKey = fk.refKey;
    if (refKey instanceof RefList) {
      return 'ListRef' + upper1(fk.name);
    }
    // RefSimple
    if (refKey.nullable) {
      return 'NullableRef' + upper1(fk.name);
    }
    return 'Ref' + upper1(fk.name);
  }

  uniqueKeyGetByName(keySchema: KeySchema): string {
    return 'find_by_' + keySchema.fields().map(lower1).join('_');
  }

  uniqueKeyMapName(keySchema: KeySchema): string {
    return '_' + keySchema.fields().map(lower1).join('_') + '_map';
  }

  keyClassName(keySchema: KeySchema): string {
    if (keySchema.fieldSchemas()!.length > 1) {
      return 'Dictionary';
    }
    return this.type(keySchema.fieldSchemas()![0].type);
  }

  actualParams(keySchema: KeySchema): string {
    return keySchema.fields().map(lower1).join(', ');
  }

  equals(fs: FieldSchema[]): string {
    return fs.map(f => lower1(f.name) + ' == other.' + lower1(f.name)).join(' and ');
  }

  toStrings(fs: FieldSchema[]): string {
    return fs.map(f => this.toStringSingle(f.name, f.type)).join(' + "," + ');
  }

  private toStringSingle(n: string, t: FieldType): string {
    const varName = lower1(n);
    if (typeof t === 'string') {
      if (t === Primitive.STRING) return varName;
      if (t === Primitive.TEXT) {
        return this.gen.isLangSwitch ? 'str(' + varName + ')' : varName;
      }
      return 'str(' + varName + ')';
    }
    return 'str(' + varName + ')';
  }

  tableGet(refTable: TableSchema, refSimple: RefPrimary | RefUniq, actualParam: string): string {
    if (refSimple instanceof RefPrimary) {
      return this.fullName(refTable) + '.find(' + actualParam + ')';
    }
    // RefUniq
    const keyName = refSimple.keyNames().map(lower1).join('_');
    return this.fullName(refTable) + '.find_by_' + keyName + '(' + actualParam + ')';
  }

  fieldName(field: FieldSchema): string {
    return lower1(field.name);
  }

  primaryKeyFieldName(): string | null {
    if (this.structural instanceof TableSchema) {
      const ts = this.structural as TableSchema;
      return this.fieldName(ts.primaryKey.fieldSchemas()![0]);
    }
    return null;
  }

  keyType(): string | null {
    if (this.structural instanceof TableSchema) {
      const ts = this.structural as TableSchema;
      return this.type(ts.primaryKey.fieldSchemas()![0].type);
    }
    return null;
  }

  dictionaryType(keySchema: KeySchema, valueType: string): string {
    if (keySchema.fieldSchemas()!.length > 1) {
      throw new Error('gd script not support composite key');
    }
    const keyType = this.type(keySchema.fieldSchemas()![0].type);
    return 'Dictionary[' + keyType + ', ' + valueType + ']';
  }

  actualParamsKeySelf(keySchema: KeySchema): string {
    if (keySchema.fieldSchemas()!.length > 1) {
      throw new Error('gd script not support composite key');
    }
    return lower1(keySchema.fieldSchemas()![0].name);
  }
}
