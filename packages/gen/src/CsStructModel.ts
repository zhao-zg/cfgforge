/**
 * CsStructModel — TypeScript port of Java `configgen.gencs.StructModel`.
 *
 * Template helper class that provides type mapping, create expressions,
 * ref field generation, key expression utilities, and dict type helpers
 * for the C# code generator.
 *
 * Java source: configgen.gencs.StructModel.java (266 lines)
 *
 * Key differences from the TS StructModel:
 * - Uses CsName (not the TS generator's className method)
 * - C# type mapping differs (bool/int/long/float/string/Text)
 * - Has unity vs non-unity mode differences
 * - OrderedDictionary for FMap
 * - reserved keyword handling (_lower1)
 * - refInit, nullInit, requiredKeyword, refAssignExpr, isSeqKey, dictType methods
 */

import {
  Primitive,
  isPrimitive,
  isStructRef,
  isFList,
  isFMap,
  isSimpleType,
  isContainerType,
  type FieldType,
  type SimpleType,
  type FList as FListType,
  type FMap as FMapType,
} from '@cfggen/schema';
import type {
  Structural,
  Nameable,
  FieldSchema,
  ForeignKeySchema,
  KeySchema,
  TableSchema,
  StructSchema,
  InterfaceSchema,
  EntryType,
} from '@cfggen/schema';
import { isEEnum, isEEntry, isRefPrimary, isRefUniq, isRefList, type RefSimple, type RefUniq } from '@cfggen/schema';
import { upper1, lower1, removeLineSep } from '@cfggen/shared';
import type { VTable } from '@cfggen/value';
import type { CsCodeGenerator } from './CsCodeGenerator';
import { CsName } from './CsName';

const RESERVED = new Set([
  'object', 'string', 'event', 'params', 'ref', 'base', 'namespace', 'class', 'struct',
]);

export class CsStructModel {
  readonly topPkg: string;
  readonly name: CsName;
  readonly structural: Structural;
  readonly vTable: VTable | null;
  readonly unity: boolean;
  private readonly gen: CsCodeGenerator;

  constructor(gen: CsCodeGenerator, structural: Structural, vTable: VTable | null) {
    this.gen = gen;
    this.topPkg = gen.pkg;
    this.name = new CsName(gen.pkg, gen.prefix, structural);
    this.structural = structural;
    this.vTable = vTable;
    this.unity = gen.unity;
  }

  isEnum(): boolean {
    return this.vTable !== null && isEEnum(this.vTable.schema.entry);
  }

  static isEnum(tableSchema: TableSchema): boolean {
    return isEEnum(tableSchema.entry);
  }

  hasEntry(): boolean {
    return this.vTable !== null && isEEntry(this.vTable.schema.entry) && this.vTable.enumNames !== null && this.vTable.enumNames.size > 0;
  }

  fullName(nameable: Nameable): string {
    return new CsName(this.gen.pkg, this.gen.prefix, nameable).fullName;
  }

  upper1Fn(value: string): string {
    return upper1(value);
  }

  lower1Fn(value: string): string {
    return lower1(value);
  }

  static lower1Static(value: string): string {
    const v = lower1(value);
    if (RESERVED.has(v)) {
      return '_' + v;
    }
    return v;
  }

  type(t: FieldType): string {
    if (isPrimitive(t)) {
      switch (t) {
        case Primitive.BOOL: return 'bool';
        case Primitive.INT: return 'int';
        case Primitive.LONG: return 'long';
        case Primitive.FLOAT: return 'float';
        case Primitive.STRING: return 'string';
        case Primitive.TEXT: return this.gen.isLangSwitch ? this.topPkg + '.Text' : 'string';
      }
    }
    if (isStructRef(t)) {
      return this.fullName(t.obj! as Nameable);
    }
    if (isFList(t)) {
      return 'List<' + this.type(t.item) + '>';
    }
    if (isFMap(t)) {
      return 'OrderedDictionary<' + this.type(t.key) + ', ' + this.type(t.value) + '>';
    }
    throw new Error('unreachable: unknown FieldType');
  }

  toStringOrNot(t: FieldType): string {
    if (t === Primitive.STRING || t === Primitive.TEXT) {
      return '';
    }
    return '.ToString()';
  }

  create(t: FieldType): string | null {
    if (isPrimitive(t)) {
      switch (t) {
        case Primitive.BOOL: return 'reader.ReadBool()';
        case Primitive.INT: return 'reader.ReadInt32()';
        case Primitive.LONG: return 'reader.ReadInt64()';
        case Primitive.FLOAT: return 'reader.ReadSingle()';
        case Primitive.STRING: return 'reader.ReadStringInPool()';
        case Primitive.TEXT: return this.gen.isLangSwitch ? this.topPkg + '.Text._create(reader)' : 'reader.ReadTextInPool()';
      }
    }
    if (isStructRef(t)) {
      return this.fullName(t.obj! as Nameable) + '._create(reader)';
    }
    // FList and FMap → null (handled specially in template)
    return null;
  }

  refType(fk: ForeignKeySchema): string {
    const refTableSchema = fk.refTableSchema()!;
    if (isRefList(fk.refKey)) {
      return 'List<' + this.fullName(refTableSchema) + '>';
    }
    // RefSimple
    const refSimple = fk.refKey as RefSimple;
    const firstLocal = fk.key.fieldSchemas()![0];
    const firstType = firstLocal.type;
    if (isSimpleType(firstType)) {
      return this.fullName(refTableSchema) + (refSimple.nullable ? '?' : '');
    }
    if (isFList(firstType)) {
      return 'List<' + this.fullName(refTableSchema) + '>';
    }
    if (isFMap(firstType)) {
      const fmap = firstType as FMapType;
      return 'OrderedDictionary<' + this.type(fmap.key) + ', ' + this.fullName(refTableSchema) + '>';
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
    }
    return 'Ref' + upper1(fk.name);
  }

  uniqueKeyGetByName(keySchema: KeySchema): string {
    return 'GetBy' + keySchema.fields().map(upper1).join('');
  }

  uniqueKeyMapName(keySchema: KeySchema): string {
    return '_' + lower1(keySchema.fields().map(upper1).join('') + 'Map');
  }

  keyClassName(keySchema: KeySchema): string {
    const fieldSchemas = keySchema.fieldSchemas()!;
    if (fieldSchemas.length > 1) {
      return fieldSchemas.map(f => upper1(f.name)).join('') + 'Key';
    }
    return this.type(fieldSchemas[0].type);
  }

  formalParams(fs: FieldSchema[]): string {
    return fs.map(f => this.type(f.type) + ' ' + CsStructModel.lower1Static(f.name)).join(', ');
  }

  actualParams(keySchema: KeySchema): string {
    return keySchema.fields().map(upper1).join(', ');
  }

  actualParamsKey(keySchema: KeySchema): string {
    const p = keySchema.fields().map(CsStructModel.lower1Static).join(', ');
    return keySchema.fields().length > 1 ? 'new ' + this.keyClassName(keySchema) + '(' + p + ')' : p;
  }

  actualParamsKeySelf(keySchema: KeySchema): string {
    const p = keySchema.fields().map(n => 'self.' + upper1(n)).join(', ');
    return keySchema.fields().length > 1 ? 'new ' + this.keyClassName(keySchema) + '(' + p + ')' : p;
  }

  equals(fs: FieldSchema[]): string {
    return fs.map(f => upper1(f.name) + '.Equals(o.' + upper1(f.name) + ')').join(' && ');
  }

  hashCodes(fs: FieldSchema[]): string {
    return fs.map(f => upper1(f.name) + '.GetHashCode()').join(' + ');
  }

  toStrings(fs: FieldSchema[]): string {
    return fs.map(f => this.toStringField(f.name, f.type)).join(' + "," + ');
  }

  private toStringField(n: string, t: FieldType): string {
    if (isFList(t)) {
      return 'StringUtil.ToString(' + upper1(n) + ')';
    }
    return upper1(n);
  }

  tableGet(refTable: TableSchema, refSimple: RefSimple, actualParam: string): string {
    const isEnumTable = isEEnum(refTable.entry);
    const post = isEnumTable ? 'Info' : '';
    if (isRefPrimary(refSimple)) {
      return this.fullName(refTable) + post + '.Get(' + actualParam + ')';
    }
    if (isRefUniq(refSimple)) {
      const refUniq = refSimple as RefUniq;
      return this.fullName(refTable) + post + '.GetBy' + refUniq.keyNames().map(upper1).join('') + '(' + actualParam + ')';
    }
    throw new Error('unreachable: tableGet expects RefSimple');
  }

  dictValueType(): string {
    return this.name.className + (this.isEnum() ? 'Info' : '');
  }

  dictType(keySchema: KeySchema): string {
    const dict = this.unity ? 'Dictionary' : 'System.Collections.Frozen.FrozenDictionary';
    return dict + '<' + this.keyClassName(keySchema) + ', ' + this.dictValueType() + '>';
  }

  dictTypeWhenInit(keySchema: KeySchema): string {
    return 'Dictionary<' + this.keyClassName(keySchema) + ', ' + this.dictValueType() + '>';
  }

  nsLine(): string {
    return this.unity ? 'namespace ' + this.name.pkg + '\n{' : 'namespace ' + this.name.pkg + ';';
  }

  isSeqKey(keySchema: KeySchema): boolean {
    const fieldSchemas = keySchema.fieldSchemas()!;
    return fieldSchemas.length === 1 && fieldSchemas[0].isSeq();
  }

  static refInit(fk: ForeignKeySchema): string {
    if (isRefPrimary(fk.refKey) || isRefUniq(fk.refKey)) {
      const refSimple = fk.refKey as RefSimple;
      if (refSimple.nullable) {
        return '';
      }
      let isContainer = false;
      for (const fs of fk.key.fieldSchemas()!) {
        if (isContainerType(fs.type)) {
          isContainer = true;
          break;
        }
      }
      if (!isContainer && isEEnum(fk.refTableSchema()!.entry)) {
        return '';
      }
    }
    return ' = null!;';
  }

  nullInit(t: FieldType): string {
    if (!this.unity) return '';
    if (t === Primitive.BOOL || t === Primitive.INT || t === Primitive.LONG || t === Primitive.FLOAT) {
      return '';
    }
    return ' = null!;';
  }

  requiredKeyword(): string {
    return this.unity ? '' : 'required ';
  }

  refAssignExpr(fk: ForeignKeySchema): string {
    return this.unity ? 'new ' + this.refType(fk) + '()' : '[]';
  }
}
