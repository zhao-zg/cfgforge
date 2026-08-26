/**
 * GoStructModel — TypeScript port of Java `configgen.gengo.StructModel`.
 *
 * Template helper class that provides:
 * - Instance methods: genReadField, type, isLangSwitch
 * - Static methods: plainType, ClassName, refType, refName, keyClassName,
 *   mapName, GetParamVars, GetParamVarsInV, GetVarDefines, GetFuncName,
 *   toStringField
 *
 * Key differences from Java:
 * - `gen.isLangSwitch` is accessed via the GoCodeGenerator instance
 * - TS discriminated unions (isFList, isFMap, isStructRef, isPrimitive) replace Java pattern matching
 * - `fieldSchemas()` returns `FieldSchema[] | null` (must non-null assert with `!`)
 *
 * Java source: configgen.gengo.StructModel.java (176 lines)
 */

import {
  Primitive,
  isPrimitive,
  isStructRef,
  isFList,
  isFMap,
  isSimpleType,
  type FieldType,
  type FList as FListType,
  type FMap as FMapType,
  type StructRef,
  StructSchema,
  InterfaceSchema,
} from '@cfggen/schema';
import type {
  Structural,
  Nameable,
  FieldSchema,
  ForeignKeySchema,
  KeySchema,
} from '@cfggen/schema';
import { isRefList, type RefSimple } from '@cfggen/schema';
import { upper1, lower1 } from '@cfggen/shared';
import type { VTable } from '@cfggen/value';
import type { GoCodeGenerator } from './GoCodeGenerator';
import { GoName } from './GoName';

export class GoStructModel {
  readonly pkg: string;
  readonly name: GoName;
  readonly structural: Structural;
  readonly className: string;
  readonly vTable: VTable | null;
  private readonly gen: GoCodeGenerator;

  constructor(
    gen: GoCodeGenerator,
    pkg: string,
    name: GoName,
    structural: Structural,
    vTable: VTable | null,
  ) {
    this.gen = gen;
    this.pkg = pkg;
    this.name = name;
    this.structural = structural;
    this.className = name.className;
    this.vTable = vTable;
  }

  isLangSwitch(): boolean {
    return this.gen.isLangSwitch;
  }

  genReadField(t: FieldType): string | null {
    if (isPrimitive(t)) {
      switch (t) {
        case Primitive.BOOL:
          return 'stream.ReadBool()';
        case Primitive.INT:
          return 'stream.ReadInt32()';
        case Primitive.LONG:
          return 'stream.ReadInt64()';
        case Primitive.FLOAT:
          return 'stream.ReadFloat32()';
        case Primitive.STRING:
          return 'stream.ReadStringInPool()';
        case Primitive.TEXT:
          return this.gen.isLangSwitch ? 'createText(stream)' : 'stream.ReadTextInPool()';
      }
    }
    if (isStructRef(t)) {
      const structRef = t as StructRef;
      return `create${GoStructModel.ClassName(structRef.obj! as Nameable)}(stream)`;
    }
    // FList and FMap → null (handled specially in template)
    return null;
  }

  type(t: FieldType): string {
    if (t === Primitive.TEXT) {
      return this.gen.isLangSwitch ? '*Text' : 'string';
    }
    return GoStructModel.plainType(t);
  }

  /// Plain type — same as type() except TEXT always returns "string"
  /// (used for keys, map keys, etc. where isLangSwitch doesn't apply)
  static plainType(t: FieldType): string {
    if (isPrimitive(t)) {
      switch (t) {
        case Primitive.BOOL:
          return 'bool';
        case Primitive.INT:
          return 'int32';
        case Primitive.LONG:
          return 'int64';
        case Primitive.FLOAT:
          return 'float32';
        case Primitive.STRING:
          return 'string';
        case Primitive.TEXT:
          return 'string';
      }
    }
    if (isStructRef(t)) {
      const structRef = t as StructRef;
      const fieldable = structRef.obj!;
      if (fieldable instanceof StructSchema) {
        return '*' + GoStructModel.ClassName(fieldable as Nameable);
      }
      if (fieldable instanceof InterfaceSchema) {
        return GoStructModel.ClassName(fieldable as Nameable);
      }
      // Fallback — should not happen
      return GoStructModel.ClassName(fieldable as Nameable);
    }
    if (isFList(t)) {
      const fList = t as FListType;
      return '[]' + GoStructModel.plainType(fList.item);
    }
    if (isFMap(t)) {
      const fMap = t as FMapType;
      return `map[${GoStructModel.plainType(fMap.key)}]${GoStructModel.plainType(fMap.value)}`;
    }
    throw new Error('unreachable: unknown FieldType');
  }

  static ClassName(nameable: Nameable): string {
    const varName = new GoName(nameable);
    return varName.className;
  }

  static refType(fk: ForeignKeySchema): string {
    const refTableName = new GoName(fk.refTableSchema()!);
    if (isRefList(fk.refKey)) {
      return '[]*' + GoStructModel.ClassName(fk.refTableSchema()! as Nameable);
    }
    // RefSimple
    const firstLocal = fk.key.fieldSchemas()![0];
    const firstType = firstLocal.type;
    if (isSimpleType(firstType)) {
      return '*' + refTableName.className;
    }
    if (isFList(firstType)) {
      return '[]*' + GoStructModel.ClassName(fk.refTableSchema()! as Nameable);
    }
    if (isFMap(firstType)) {
      const fMap = firstType as FMapType;
      return `map[${GoStructModel.plainType(fMap.key)}]*${GoStructModel.ClassName(fk.refTableSchema()! as Nameable)}`;
    }
    throw new Error('unreachable: unknown first field type in refType');
  }

  static refName(fk: ForeignKeySchema): string {
    if (isRefList(fk.refKey)) {
      return 'ListRef' + upper1(fk.name);
    }
    // RefSimple
    const refSimple = fk.refKey as RefSimple;
    if (refSimple.nullable) {
      return 'NullableRef' + upper1(fk.name);
    }
    return 'Ref' + upper1(fk.name);
  }

  static keyClassName(keySchema: KeySchema): string {
    const fieldSchemas = keySchema.fieldSchemas()!;
    if (fieldSchemas.length > 1) {
      return 'Key' + keySchema.fields().map(upper1).join('');
    }
    return GoStructModel.plainType(fieldSchemas[0].type);
  }

  static mapName(keySchema: KeySchema): string {
    const fieldSchemas = keySchema.fieldSchemas()!;
    if (fieldSchemas.length > 1) {
      return lower1(keySchema.fields().map(upper1).join(''));
    }
    return lower1(keySchema.fields()[0]);
  }

  static GetParamVars(keySchema: KeySchema): string {
    return keySchema.fieldSchemas()!.map((f) => lower1(f.name)).join(', ');
  }

  static GetParamVarsInV(keySchema: KeySchema, tempVarName: string): string {
    return keySchema
      .fieldSchemas()!.map((f) => `${tempVarName}.${lower1(f.name)}`)
      .join(', ');
  }

  static GetVarDefines(keySchema: KeySchema): string {
    return keySchema
      .fieldSchemas()!.map((f) => `${lower1(f.name)} ${GoStructModel.plainType(f.type)}`)
      .join(', ');
  }

  static GetFuncName(keySchema: KeySchema, refPrimary: boolean): string {
    const fieldSchemas = keySchema.fieldSchemas()!;
    const fieldCnt = fieldSchemas.length;
    if (refPrimary) {
      return 'Get';
    } else if (fieldCnt > 1) {
      return 'GetBy' + GoStructModel.keyClassName(keySchema);
    } else {
      return 'GetBy' + GoStructModel.GetParamVars(keySchema);
    }
  }

  /// Generate field print expression in String() method
  static toStringField(f: FieldSchema): string {
    const fieldName = lower1(f.name);
    const t = f.type;
    if (isFList(t) || isFMap(t) || isStructRef(t)) {
      return `fmt.Sprintf("%v", t.${fieldName})`;
    }
    return 't.' + fieldName;
  }
}
