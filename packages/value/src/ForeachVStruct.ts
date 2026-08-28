/**
 * ForeachVStruct — TypeScript port of Java `configgen.value.ForeachVStruct`.
 *
 * Traverses all VStruct instances in a CfgValue tree:
 *   - Top level: iterate cfgValue.sortedTables()
 *   - Per table: iterate table.primaryKeyMap entries
 *   - Per VStruct: visit it, then recurse into field values
 *     (SimpleValue → PrimitiveValue stops; VStruct/VInterface recurse;
 *      VList/VMap iterate their elements)
 *
 * Java source: configgen.value.ForeachVStruct.java (98 lines)
 */

import {
  type Value,
  type SimpleValue,
  type PrimitiveValue,
  VStruct,
  VInterface,
  VList,
  VMap,
  VTable,
  CfgValue,
} from './CfgValue.js';

// ---------------------------------------------------------------------------
// Context — carries the origin of the current VStruct
// ---------------------------------------------------------------------------

export class ForeachContext {
  constructor(
    readonly fromVTable: VTable,
    readonly pkValue: Value,
    readonly recordValue: VStruct,
  ) {}

  recordId(): string {
    return `${this.fromVTable.name()}-${this.pkValue.packStr()}`;
  }
}

// ---------------------------------------------------------------------------
// VStructVisitor — visitor pattern with early-exit
// ---------------------------------------------------------------------------

export interface VStructVisitor {
  /**
   * Visit a VStruct.
   * @returns true to continue traversal, false to stop.
   */
  visit(vStruct: VStruct, ctx: ForeachContext): boolean;
}

// ---------------------------------------------------------------------------
// ForeachVStruct — static traversal methods
// ---------------------------------------------------------------------------

export class ForeachVStruct {
  /**
   * Traverse all VStructs in the CfgValue tree.
   * Tables are visited in sorted order; records within a table in map order.
   */
  static foreach(visitor: VStructVisitor, cfgValue: CfgValue): void {
    for (const table of cfgValue.sortedTables()) {
      if (!ForeachVStruct.foreachVTable(visitor, table)) {
        break; // early exit
      }
    }
  }

  /**
   * Traverse all VStructs in a single VTable.
   * @returns false if visitor requested stop, true to continue.
   */
  static foreachVTable(visitor: VStructVisitor, table: VTable): boolean {
    for (const [pk, vStruct] of table.primaryKeyMap) {
      const ctx = new ForeachContext(table, pk, vStruct);
      if (!ForeachVStruct.foreachVStruct(visitor, vStruct, ctx)) {
        return false; // visitor requested stop
      }
    }
    return true; // continue
  }

  /**
   * Visit a VStruct, then recurse into its field values.
   * @returns false if visitor requested stop, true to continue.
   */
  static foreachVStruct(
    visitor: VStructVisitor,
    vStruct: VStruct,
    ctx: ForeachContext,
  ): boolean {
    if (!visitor.visit(vStruct, ctx)) {
      return false; // visitor requested stop
    }

    for (const fieldValue of vStruct.values) {
      if (fieldValue instanceof VStruct) {
        if (!ForeachVStruct.foreachVStruct(visitor, fieldValue, ctx)) {
          return false;
        }
      } else if (fieldValue instanceof VInterface) {
        if (!ForeachVStruct.foreachVStruct(visitor, fieldValue.child, ctx)) {
          return false;
        }
      } else if (fieldValue instanceof VList) {
        for (const sv of fieldValue.valueList) {
          if (!ForeachVStruct.foreachVStructSimpleValue(visitor, sv, ctx)) {
            return false;
          }
        }
      } else if (fieldValue instanceof VMap) {
        for (const [k, v] of fieldValue.valueMap) {
          if (!ForeachVStruct.foreachVStructSimpleValue(visitor, k, ctx)) {
            return false;
          }
          if (!ForeachVStruct.foreachVStructSimpleValue(visitor, v, ctx)) {
            return false;
          }
        }
      }
      // PrimitiveValue: nothing to recurse into
    }
    return true;
  }

  /**
   * Recurse into a SimpleValue that might contain nested VStructs.
   * PrimitiveValue → stop; VInterface → recurse child; VStruct → recurse.
   */
  private static foreachVStructSimpleValue(
    visitor: VStructVisitor,
    simpleValue: SimpleValue,
    ctx: ForeachContext,
  ): boolean {
    if (isPrimitiveValue(simpleValue)) {
      return true; // nothing to recurse into
    }
    if (simpleValue instanceof VInterface) {
      return ForeachVStruct.foreachVStruct(visitor, simpleValue.child, ctx);
    }
    if (simpleValue instanceof VStruct) {
      return ForeachVStruct.foreachVStruct(visitor, simpleValue, ctx);
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// Helper: type guard for PrimitiveValue
// ---------------------------------------------------------------------------

function isPrimitiveValue(v: unknown): v is PrimitiveValue {
  return (
    v instanceof Object &&
    'value' in v &&
    !(
      v instanceof VStruct ||
      v instanceof VInterface ||
      v instanceof VList ||
      v instanceof VMap
    )
  );
}
