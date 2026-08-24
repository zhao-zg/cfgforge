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
  type SimpleValue,
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
import type { CfgValueErrs } from './CfgValueErrs';
import type { FieldType } from '@cfggen/schema';
import { AutoOrPack } from '@cfggen/schema';
import { FieldSchema } from '@cfggen/schema';
import { StructSchema } from '@cfggen/schema';
import { StructRef } from '@cfggen/schema';
import { Metadata_of } from '@cfggen/schema';
import type { TableSchema } from '@cfggen/schema';
import { findFieldIndices } from '@cfggen/schema';
import { DCell } from '@cfggen/data';
import { HeadRows } from '@cfggen/data';
import { ValueParser, ParseContext, dummyBlockParser } from './ValueParser';
import { ValueUtil } from './ValueUtil';

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

  // unpack() and unpackTablePrimaryKey() implemented below.

  /**
   * Unpacks a string into a Value using the given FieldType.
   * Delegates to ValueParser with pack=true, canBeEmpty=true.
   */
  static unpack(content: string, type: FieldType, errs: CfgValueErrs): Value | null {
    return ValuePack.unpackWithFileName(content, type, '<file>', errs);
  }

  private static unpackWithFileName(
    content: string,
    type: FieldType,
    fileName: string,
    errs: CfgValueErrs,
  ): Value | null {
    const field = new FieldSchema('<field>', type, AutoOrPack.AUTO, Metadata_of());
    const parser = new ValueParser(errs, HeadRows.A2_Default, dummyBlockParser);
    const dCell = DCell.of(content, fileName);
    return parser.parseField(field, [dCell], field,
      new ParseContext(fileName, true, true, 0));
  }

  /**
   * Unpacks a primary key string into a Value matching the table's primary key schema.
   * For single-key tables: returns the unpacked primitive value.
   * For multi-key tables: returns a VList of the struct's field values.
   */
  static unpackTablePrimaryKey(id: string, tableSchema: TableSchema, errs: CfgValueErrs): Value | null {
    const keyFields = tableSchema.primaryKey.fieldSchemas();
    if (keyFields === null) {
      throw new Error('primaryKey fieldSchemas not resolved');
    }
    const fileName = `<${tableSchema.name()}>`;

    if (keyFields.length === 1) {
      const pkFieldType = keyFields[0].type;
      return ValuePack.unpackWithFileName(id, pkFieldType, fileName, errs);
    }

    // Multi-key: build a temporary struct schema for the key fields
    const obj = new StructSchema('key', AutoOrPack.AUTO, Metadata_of(), keyFields, []);
    const ref = new StructRef('key');
    ref.obj = obj;
    const unpacked = ValuePack.unpackWithFileName(id, ref, fileName, errs);
    if (unpacked === null) {
      return null;
    }

    const vStruct = unpacked as VStruct;
    const values: SimpleValue[] = [];
    for (const value of vStruct.values) {
      if (ValuePack.isSimpleValue(value)) {
        values.push(value);
      } else {
        throw new Error('multi primary key not simple type, should not happen!');
      }
    }
    return ValueUtil.createList(values);
  }

  private static isSimpleValue(value: Value): value is SimpleValue {
    return value instanceof VBool
      || value instanceof VInt
      || value instanceof VLong
      || value instanceof VFloat
      || value instanceof VString
      || value instanceof VText
      || value instanceof VStruct
      || value instanceof VInterface;
  }
}
