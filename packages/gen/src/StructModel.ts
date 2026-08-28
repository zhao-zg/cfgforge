/**
 * StructModel — TypeScript port of Java `configgen.gents.StructModel`.
 *
 * Template helper class that provides type mapping, create expressions,
 * ref field generation, and key expression utilities for the TS code
 * generator.
 *
 * Java source: configgen.gents.StructModel.java (227 lines)
 */

import {
  Primitive,
  isPrimitive,
  isStructRef,
  isFList,
  isFMap,
  isSimpleType,
  type FieldType,
  type StructRef,
} from '@cfgforge/schema';
import type {
  Structural,
  Nameable,
  FieldSchema,
  ForeignKeySchema,
  KeySchema,
  TableSchema,
  StructSchema,
} from '@cfgforge/schema';
import { isRefList, RefPrimary, RefUniq, type RefSimple } from '@cfgforge/schema';
import { upper1, lower1 } from '@cfgforge/shared';
import type { VTable } from '@cfgforge/value';
import type { TsCodeGenerator } from './TsCodeGenerator.js';

export class StructModel {
  readonly structural: Structural;
  readonly vTable: VTable | null;
  readonly structClassName: string;
  private readonly gen: TsCodeGenerator;

  constructor(gen: TsCodeGenerator, structural: Structural, vTable: VTable | null) {
    this.gen = gen;
    this.structural = structural;
    this.vTable = vTable;
    this.structClassName = gen.className(structural);
  }

  className(nameable: Nameable): string {
    return this.gen.className(nameable);
  }

  upper1(value: string): string {
    return upper1(value);
  }

  lower1(value: string): string {
    return lower1(value);
  }

  type(t: FieldType): string {
    return this._type(t, false);
  }

  private _type(t: FieldType, asMapKey: boolean): string {
    if (isPrimitive(t)) {
      switch (t) {
        case Primitive.BOOL: return 'boolean';
        case Primitive.INT:
        case Primitive.LONG:
        case Primitive.FLOAT: return 'number';
        case Primitive.STRING: return 'string';
        case Primitive.TEXT: return this.gen.nullableLanguageSwitch !== null ? 'Text' : 'string';
      }
    }
    if (isStructRef(t)) {
      return asMapKey ? 'number' : this.className(t.obj!);
    }
    if (isFList(t)) {
      return this.type(t.item) + '[]';
    }
    if (isFMap(t)) {
      return 'Map<' + this._type(t.key, true) + ', ' + this.type(t.value) + '>';
    }
    throw new Error('unreachable: unknown FieldType');
  }

  mapKeyType(keySchema: KeySchema): string {
    const fieldSchemas = keySchema.fieldSchemas()!;
    if (fieldSchemas.length > 1) {
      return 'number'; // 跟lua一样的约定，最多2个int，组装成一个大int
    } else {
      return this._type(fieldSchemas[0].type, true);
    }
  }

  create(t: FieldType): string | null {
    if (isPrimitive(t)) {
      switch (t) {
        case Primitive.BOOL: return 'os.ReadBool()';
        case Primitive.INT: return 'os.ReadInt32()';
        case Primitive.LONG: return 'os.ReadInt64()';
        case Primitive.FLOAT: return 'os.ReadSingle()';
        case Primitive.STRING: return 'os.ReadStringInPool()';
        case Primitive.TEXT:
          return this.gen.nullableLanguageSwitch !== null ? 'Text._create(os)' : 'os.ReadTextInPool()';
      }
    }
    if (isStructRef(t)) {
      return this.className(t.obj!) + '._create(os)';
    }
    // FList and FMap → null (handled specially in template)
    return null;
  }

  refType(fk: ForeignKeySchema): string {
    const refTableSchema = fk.refTableSchema()!;
    if (isRefList(fk.refKey)) {
      return this.className(refTableSchema) + '[]';
    }
    // RefSimple
    const firstLocal = fk.key.fieldSchemas()![0];
    const firstType = firstLocal.type;
    if (isSimpleType(firstType)) {
      return this.className(refTableSchema);
    }
    if (isFList(firstType)) {
      return this.className(refTableSchema) + '[]';
    }
    if (isFMap(firstType)) {
      return 'Map<' + this._type(firstType.key, true) + ', ' + this.className(refTableSchema) + '>';
    }
    throw new Error('unreachable: unknown first field type in refType');
  }

  refName(fk: ForeignKeySchema): string {
    if (isRefList(fk.refKey)) {
      return 'ListRef' + upper1(fk.name);
    }
    // RefSimple
    const refSimple = fk.refKey as RefSimple;
    if (refSimple.nullable) {
      return 'NullableRef' + upper1(fk.name);
    } else {
      return 'Ref' + upper1(fk.name);
    }
  }

  isNullableRef(fk: ForeignKeySchema): boolean {
    return (fk.refKey instanceof RefPrimary && fk.refKey.nullable)
      || (fk.refKey instanceof RefUniq && fk.refKey.nullable);
  }

  fieldDeclaration(field: FieldSchema): string {
    return `_${field.name}!: ${this.type(field.type)}`;
  }

  refFieldDeclaration(fk: ForeignKeySchema): string {
    const typeName = this.refType(fk);
    const fieldName = `_${this.refName(fk)}`;
    if (this.isNullableRef(fk)) {
      return `${fieldName}: ${typeName} | undefined`;
    } else {
      return `${fieldName}!: ${typeName}`;
    }
  }

  uniqueKeyGetByName(keySchema: KeySchema): string {
    return 'GetBy' + keySchema.fields().map(upper1).join('');
  }

  uniqueKeyMapName(keySchema: KeySchema): string {
    return lower1(keySchema.fields().map(upper1).join('') + 'Map');
  }

  formalParams(fs: FieldSchema[]): string {
    return fs.map(f => `${f.name}: ${this.type(f.type)}`).join(', ');
  }

  actualParamsKey(keySchema: KeySchema): string {
    return this._actualParamsKey(keySchema, '');
  }

  actualParamsKeySelf(keySchema: KeySchema): string {
    return this._actualParamsKey(keySchema, 'self._');
  }

  actualParamsKeyThis(keySchema: KeySchema): string {
    const count = keySchema.fields().length;
    if (count === 1) {
      return 'this._' + keySchema.fields()[0];
    } else if (count === 2) {
      const k = keySchema.fields()[0];
      const j = keySchema.fields()[1];
      return `this._${k}, this._${j}`;
    } else {
      throw new Error('generate typescript, multi key not support > 2 count');
    }
  }

  private _actualParamsKey(keySchema: KeySchema, prefix: string): string {
    // 2个字段可以做为uniqkey，但都必须是数字，并且第一个<1亿，第二个<1万
    // self[getname] = function(k, j)
    //     return map[k + j * 100000000]
    // end
    const count = keySchema.fields().length;
    if (count === 1) {
      const first = keySchema.fieldSchemas()![0];
      if (isPrimitive(first.type)) {
        return prefix + keySchema.fields()[0];
      }
      if (isStructRef(first.type)) {
        const structRef = first.type as StructRef;
        const structSchema = structRef.obj as StructSchema;
        if (structSchema.fields().length === 2) {
          const cur = prefix + keySchema.fields()[0];
          const k = structSchema.fields()[0].name;
          const j = structSchema.fields()[1].name;
          return `${cur}.${upper1(k)} + ${cur}.${upper1(j)} * 100000000`;
        }
      }
      throw new Error('generate typescript, struct key not support > 2 fields');
    } else if (count === 2) {
      const k = keySchema.fields()[0];
      const j = keySchema.fields()[1];
      return `${prefix}${k} + ${prefix}${j} * 100000000`;
    } else {
      throw new Error('generate typescript, multi key not support > 2 count');
    }
  }

  toStrings(fs: FieldSchema[]): string {
    return fs.map(f => this._fieldToStringExpr(f)).join(' + "," + ');
  }

  private _fieldToStringExpr(f: FieldSchema): string {
    const fieldName = 'this._' + f.name;
    if (isFList(f.type)) {
      return 'ToStringList(' + fieldName + ')';
    }
    if (isFMap(f.type)) {
      return 'ToStringMap(' + fieldName + ')';
    }
    if (isStructRef(f.type)) {
      return 'this.' + upper1(f.name) + '.toString()';
    }
    return fieldName;
  }

  tableGet(refTable: TableSchema, refSimple: RefSimple, actualParam: string): string {
    if (refSimple instanceof RefPrimary) {
      return this.className(refTable) + '.Get(' + actualParam + ')';
    }
    // RefUniq
    return this.className(refTable) + '.GetBy' + refSimple.keyNames().map(upper1).join('') + '(' + actualParam + ')';
  }
}
