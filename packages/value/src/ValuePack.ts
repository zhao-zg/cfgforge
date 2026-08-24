/**
 * ValuePack — TypeScript port of Java `configgen.value.ValuePack`.
 *
 * pack(): serializes a Value to a string for writing back to Excel.
 * unpack(): parses a string back into a Value (depends on ValueParser, implemented in T4.2d).
 *
 * Java source: configgen.value.ValuePack.java (103 lines)
 */

import {
  type Value,
  VList,
  VMap,
  VStruct,
  VInterface,
  VBool,
  VInt,
  VLong,
  VFloat,
  VString,
  VText,
} from './CfgValue';

export class ValuePack {
  /**
   * Returns the packStr(value) — the string you should write to the Excel cell.
   * @param value the value to pack
   */
  static pack(value: Value): string {
    return ValuePack.packStr(value, false);
  }

  /**
   * Internal recursive pack.
   * @param value the value to pack
   * @param hasParenthesesAround whether to wrap the result in parentheses
   */
  private static packStr(value: Value, hasParenthesesAround: boolean): string {
    // PrimitiveValue: VBool, VInt, VLong, VFloat, VString, VText
    if (value instanceof VBool ||
        value instanceof VInt ||
        value instanceof VLong ||
        value instanceof VFloat ||
        value instanceof VString ||
        value instanceof VText) {
      return (value as { toStr(): string }).toStr();
    }

    // VList
    if (value instanceof VList) {
      const parts = value.valueList.map((v) => ValuePack.packStr(v, true));
      return ValuePack.join(parts, hasParenthesesAround);
    }

    // VMap
    if (value instanceof VMap) {
      const parts: string[] = [];
      for (const [key, val] of value.valueMap.entries()) {
        parts.push(ValuePack.packStr(key, true) + ',' + ValuePack.packStr(val, true));
      }
      return ValuePack.join(parts, hasParenthesesAround);
    }

    // VStruct
    if (value instanceof VStruct) {
      const parts = value.values.map((v) => ValuePack.packStr(v, true));
      return ValuePack.join(parts, hasParenthesesAround);
    }

    // VInterface: implName(field1,field2,...) — always with parentheses
    if (value instanceof VInterface) {
      const implName = value.child.schema.lastName();
      const parts = value.child.values.map((v) => ValuePack.packStr(v, true));
      return implName + '(' + parts.join(',') + ')';
    }

    throw new Error('Unknown value type for packing');
  }

  /**
   * Join parts with comma, optionally wrapping in parentheses.
   */
  private static join(parts: string[], hasParenthesesAround: boolean): string {
    const joined = parts.join(',');
    return hasParenthesesAround ? '(' + joined + ')' : joined;
  }

  // unpack() and unpackTablePrimaryKey() will be implemented in T4.2d
  // after ValueParser is available.
}
