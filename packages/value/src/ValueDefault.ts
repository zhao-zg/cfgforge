/**
 * ValueDefault — TypeScript port of Java `configgen.value.ValueDefault`.
 *
 * Provides static methods to create default Values for any FieldType,
 * and to check if a Value is the default value.
 *
 * Java source: configgen.value.ValueDefault.java (66 lines)
 */

import {
  type Value,
  type SimpleValue,
  VBool,
  VInt,
  VLong,
  VFloat,
  VString,
  VText,
  VStruct,
  VInterface,
  VList,
  VMap,
} from './CfgValue';
import { type Source } from '@cfgforge/data';
import {
  type FieldType,
  type Nameable,
  type Structural,
  InterfaceSchema,
  Primitive,
  isPrimitive,
  isStructRef,
  isFList,
  isFMap,
} from '@cfgforge/schema';

export class ValueDefault {
  /**
   * Creates the default Value for a FieldType.
   * Primitives get zero/false/empty; containers get empty list/map;
   * StructRef delegates to ofNamable.
   */
  static of(type: FieldType, source: Source): Value {
    if (isPrimitive(type)) {
      switch (type) {
        case Primitive.BOOL: return new VBool(false, source);
        case Primitive.INT: return new VInt(0, source);
        case Primitive.LONG: return new VLong(0n, source);
        case Primitive.FLOAT: return new VFloat(0, source);
        case Primitive.STRING: return new VString('', source);
        case Primitive.TEXT: return new VText('', source);
      }
    }
    if (isFList(type)) {
      return new VList([], source);
    }
    if (isFMap(type)) {
      return new VMap(new Map(), source);
    }
    if (isStructRef(type)) {
      return ValueDefault.ofNamable(type.obj as Nameable, source);
    }
    // Should never reach here
    throw new Error(`Unknown FieldType: ${String(type)}`);
  }

  /**
   * Checks if a Value is the default value for its type.
   */
  static isDefault(value: Value): boolean {
    if (value instanceof VBool) return !value.value;
    if (value instanceof VInt) return value.value === 0;
    if (value instanceof VLong) return value.value === 0n;
    if (value instanceof VFloat) return value.value === 0;
    if (value instanceof VString) return value.value.length === 0;
    if (value instanceof VText) return value.value.length === 0;
    if (value instanceof VStruct) return false;
    if (value instanceof VInterface) return false;
    if (value instanceof VList) return value.valueList.length === 0;
    if (value instanceof VMap) return value.valueMap.size === 0;
    return false;
  }

  /**
   * Creates the default SimpleValue for a Nameable (Structural or InterfaceSchema).
   */
  static ofNamable(nameable: Nameable, source: Source): SimpleValue {
    // In Java, this uses pattern matching on the sealed interface Nameable.
    // In TS, we check for Structural (has fields()) or InterfaceSchema.
    if (isStructural(nameable)) {
      return ValueDefault.ofStructural(nameable, source);
    }
    if (nameable instanceof InterfaceSchema) {
      return ValueDefault.ofInterface(nameable, source);
    }
    throw new Error(`Unknown Nameable: ${nameable.name()}`);
  }

  /**
   * Creates a default VStruct for a Structural, with default values for each field.
   */
  static ofStructural(structural: Structural, source: Source): VStruct {
    const values: Value[] = [];
    for (const field of structural.fields()) {
      const fv = ValueDefault.of(field.type, source);
      values.push(fv);
    }
    return new VStruct(structural, values, source);
  }

  /**
   * Creates a default VInterface with the default impl struct.
   */
  static ofInterface(interfaceSchema: InterfaceSchema, source: Source): VInterface {
    const impl = interfaceSchema.defaultImplStruct();
    const vStruct = ValueDefault.ofStructural(impl, source);
    return new VInterface(interfaceSchema, vStruct, source);
  }
}

// ---------------------------------------------------------------------------
// Helper: type guard for Structural
// ---------------------------------------------------------------------------

function isStructural(n: Nameable): n is Structural {
  return 'fields' in n && typeof (n as Structural).fields === 'function';
}
