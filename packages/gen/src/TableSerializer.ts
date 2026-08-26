/**
 * TableSerializer — TypeScript port of Java `configgen.genbytes.TableSerializer`
 * and `configgen.genbytes.MultiLangTableSerializer`.
 *
 * Serializes a VTable's rows into binary format. Two modes:
 *
 * 1. No langSwitchRuntime (single-language): directly writes each value
 *    via writeValue() recursion. VText → langTextPool.addText([value]).
 *
 * 2. With langSwitchRuntime (multi-language): uses ForeachValue visitor
 *    pattern. VText → langSwitchRuntime.findAllLangText(pk, fieldChain, original)
 *    → langTextPool.addText(i18nStrings).
 *
 * Both modes share the same binary format; only VText handling differs.
 *
 * Java sources:
 * - configgen.genbytes.TableSerializer.java (65 lines)
 * - configgen.genbytes.MultiLangTableSerializer.java (68 lines)
 */

import type { LangSwitchableRuntime } from '@cfgforge/i18n';
import {
  type Value,
  type PrimitiveValue,
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
  VTable,
} from '@cfgforge/value';
import { ForeachValue, type ValueVisitor } from '@cfgforge/value';

import { ConfigOutput } from './ConfigOutput';
import { StringPool } from './StringPool';
import { LangTextPool } from './LangTextPool';

export class TableSerializer implements ValueVisitor {
  constructor(
    private output: ConfigOutput,
    private stringPool: StringPool,
    private langTextPool: LangTextPool,
    private langSwitchRuntime: LangSwitchableRuntime | null,
  ) {}

  serialize(vTable: VTable): void {
    this.output.writeInt(vTable.valueList.length);
    if (this.langSwitchRuntime === null) {
      // Single-language mode: direct recursion
      for (const v of vTable.valueList) {
        this.writeValue(v);
      }
    } else {
      // Multi-language mode: ForeachValue visitor
      ForeachValue.foreachVTable(this, vTable);
    }
  }

  // -- ValueVisitor implementation (multi-language mode) --

  visitPrimitive(primitiveValue: PrimitiveValue, _pk: Value, _fieldChain: string[]): void {
    if (primitiveValue instanceof VBool) {
      this.output.writeBool(primitiveValue.value);
    } else if (primitiveValue instanceof VInt) {
      this.output.writeInt(primitiveValue.value);
    } else if (primitiveValue instanceof VLong) {
      this.output.writeLong(primitiveValue.value);
    } else if (primitiveValue instanceof VFloat) {
      this.output.writeFloat(primitiveValue.value);
    } else if (primitiveValue instanceof VString) {
      this.writeStringInPool(primitiveValue.value);
    } else if (primitiveValue instanceof VText) {
      // Multi-language: findAllLangText then addText
      const pk = _pk;
      const i18nStrings = this.langSwitchRuntime!.findAllLangText(
        pk.packStr(),
        _fieldChain,
        primitiveValue.value,
      );
      const idx = this.langTextPool.addText(i18nStrings);
      this.output.writeInt(idx);
    }
  }

  visitVList(vList: VList, _pk: Value, _fieldChain: string[]): void {
    this.output.writeInt(vList.valueList.length);
  }

  visitVMap(vMap: VMap, _pk: Value, _fieldChain: string[]): void {
    this.output.writeInt(vMap.valueMap.size);
  }

  visitVInterface(vInterface: VInterface, _pk: Value, _fieldChain: string[]): void {
    this.writeStringInPool(vInterface.child.name());
  }

  visitVStruct(_vStruct: VStruct, _pk: Value, _fieldChain: string[]): void {
    // ignore — ForeachValue handles recursion automatically
  }

  // -- Single-language mode: direct recursive writeValue --

  private writeValue(value: Value): void {
    if (value instanceof VBool) {
      this.output.writeBool(value.value);
    } else if (value instanceof VInt) {
      this.output.writeInt(value.value);
    } else if (value instanceof VLong) {
      this.output.writeLong(value.value);
    } else if (value instanceof VFloat) {
      this.output.writeFloat(value.value);
    } else if (value instanceof VString) {
      this.writeStringInPool(value.value);
    } else if (value instanceof VText) {
      const idx = this.langTextPool.addText([value.value]);
      this.output.writeInt(idx);
    } else if (value instanceof VStruct) {
      for (const v of value.values) {
        this.writeValue(v);
      }
    } else if (value instanceof VInterface) {
      this.writeStringInPool(value.child.name());
      for (const v of value.child.values) {
        this.writeValue(v);
      }
    } else if (value instanceof VList) {
      this.output.writeInt(value.valueList.length);
      for (const v of value.valueList) {
        this.writeValue(v);
      }
    } else if (value instanceof VMap) {
      this.output.writeInt(value.valueMap.size);
      for (const [k, v] of value.valueMap) {
        this.writeValue(k);
        this.writeValue(v);
      }
    }
  }

  private writeStringInPool(v: string): void {
    const idx = this.stringPool.addString(v);
    this.output.writeInt(idx);
  }
}
