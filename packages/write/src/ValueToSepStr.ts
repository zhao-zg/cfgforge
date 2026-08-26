/**
 * ValueToSepStr — TypeScript port of Java `configgen.write.ValueToSepStr`.
 *
 * Serializes VList and VStruct values whose FieldFormat is Sep into a
 * single string joined by the separator character.
 *
 * Java source: configgen.write.ValueToSepStr.java (73 lines)
 */

import {
  type VList,
  VStruct,
  VInterface,
  VBool, VInt, VLong, VFloat, VString, VText,
  type SimpleValue,
  type PrimitiveValue,
} from '@cfgforge/value';
import {
  type FieldSchema,
  type Structural,
  Sep,
  AutoOrPack,
  FList,
} from '@cfgforge/schema';

export class ValueToSepStr {
  /**
   * Serialize a VList (whose field fmt is Sep) into a sep-joined string.
   * Each element must be a PrimitiveValue, a Pack/Sep VStruct, or a Pack VInterface.
   */
  static toSepStrForList(vList: VList, field: FieldSchema): string {
    if (!(field.fmt instanceof Sep)) {
      throw new Error('FieldFormat is not Sep');
    }
    if (!(field.type instanceof FList)) {
      throw new Error('FieldType is not FList');
    }

    const sepStr = field.fmt.sep;
    return vList.valueList.map((v) => ValueToSepStr.toStr(v)).join(sepStr);
  }

  /**
   * Serialize a VStruct (whose schema fmt is Sep) into a sep-joined string.
   * All fields must be primitive values.
   */
  static toSepStrForStruct(vStruct: VStruct): string {
    const schema = vStruct.schema as Structural;
    const fmt = schema.fmt();
    if (!(fmt instanceof Sep)) {
      throw new Error('FieldFormat is not Sep');
    }

    const sepStr = fmt.sep;
    return vStruct.values
      .map((v) => (v as PrimitiveValue).toStr())
      .join(sepStr);
  }

  /**
   * Serialize a single SimpleValue for Sep list elements.
   * - PrimitiveValue: toStr()
   * - VStruct: packStr() if PACK, toSepStrForStruct() if Sep
   * - VInterface: packStr() if PACK
   */
  private static toStr(value: SimpleValue): string {
    if (ValueToSepStr.isPrimitiveValue(value)) {
      return value.toStr();
    }

    if (value instanceof VStruct) {
      const structFmt = (value.schema as Structural).fmt();
      if (structFmt === AutoOrPack.PACK) {
        return value.packStr();
      }
      if (structFmt instanceof Sep) {
        return ValueToSepStr.toSepStrForStruct(value);
      }
      throw new Error('StructSchema is not Pack or Sep');
    }

    if (value instanceof VInterface) {
      if (value.schema.fmt() === AutoOrPack.PACK) {
        return value.packStr();
      }
      throw new Error('InterfaceSchema is not Pack');
    }

    throw new Error('Unexpected SimpleValue type');
  }

  private static isPrimitiveValue(v: unknown): v is PrimitiveValue {
    return v instanceof VBool ||
      v instanceof VInt ||
      v instanceof VLong ||
      v instanceof VFloat ||
      v instanceof VString ||
      v instanceof VText;
  }
}
