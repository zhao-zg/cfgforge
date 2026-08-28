/**
 * ForeachValue — TypeScript port of Java `configgen.value.ForeachValue`.
 *
 * Traverses all values in a CfgValue tree (including primitive values):
 *   - foreach(cfgValue): iterate sortedTables → foreachVTable → foreachValue
 *   - foreachVTable(vTable): iterate primaryKeyMap entries → foreachValue
 *   - foreachValue(value, pk, fieldChain): recursive switch on Value type
 *
 * ValueVisitor has hooks for each value type:
 *   - visitPrimitive / visitVList / visitVMap / visitVInterface / visitVStruct
 *
 * ValueVisitorForPrimitive: abstract class that only requires visitPrimitive
 *   (other methods have no-op default implementations).
 *   Used by TextValue's SetTextTranslatedVisitor.
 *
 * searchCfgValue / searchVTable: use ForSearchVisitor which also visits
 *   - VInterface child name (as VString)
 *   - VStruct note (as VString at $note)
 *
 * Java source: configgen.value.ForeachValue.java (148 lines)
 */

import type { FieldSchema } from '@cfgforge/schema';
import {
  type Value,
  type PrimitiveValue,
  VString,
  VStruct,
  VInterface,
  VList,
  VMap,
  VTable,
  CfgValue,
} from './CfgValue.js';

// ---------------------------------------------------------------------------
// ValueVisitor — full visitor interface
// ---------------------------------------------------------------------------

export interface ValueVisitor {
  visitPrimitive(primitiveValue: PrimitiveValue, pk: Value, fieldChain: string[]): void;
  visitVList(vList: VList, pk: Value, fieldChain: string[]): void;
  visitVMap(vMap: VMap, pk: Value, fieldChain: string[]): void;
  visitVInterface(vInterface: VInterface, pk: Value, fieldChain: string[]): void;
  visitVStruct(vStruct: VStruct, pk: Value, fieldChain: string[]): void;
}

// ---------------------------------------------------------------------------
// ValueVisitorForSearch — search-specific visitor
// ---------------------------------------------------------------------------

export interface ValueVisitorForSearch {
  visit(primitiveValue: PrimitiveValue, table: string, pk: Value, fieldChain: string[]): void;
}

// ---------------------------------------------------------------------------
// ValueVisitorForPrimitive — abstract class with no-op defaults
// (Java: `abstract class ValueVisitorForPrimitive implements ValueVisitor`)
// ---------------------------------------------------------------------------

export abstract class ValueVisitorForPrimitive implements ValueVisitor {
  abstract visitPrimitive(primitiveValue: PrimitiveValue, pk: Value, fieldChain: string[]): void;

  visitVList(_vList: VList, _pk: Value, _fieldChain: string[]): void {}
  visitVMap(_vMap: VMap, _pk: Value, _fieldChain: string[]): void {}
  visitVInterface(_vInterface: VInterface, _pk: Value, _fieldChain: string[]): void {}
  visitVStruct(_vStruct: VStruct, _pk: Value, _fieldChain: string[]): void {}
}

// ---------------------------------------------------------------------------
// ForSearchVisitor — wraps ValueVisitorForSearch, also visits
// interface names and struct notes
// ---------------------------------------------------------------------------

class ForSearchVisitor implements ValueVisitor {
  constructor(
    private readonly _visitor: ValueVisitorForSearch,
    private readonly _table: string,
  ) {}

  visitPrimitive(pv: PrimitiveValue, pk: Value, fieldChain: string[]): void {
    this._visitor.visit(pv, this._table, pk, fieldChain);
  }

  visitVList(): void {}

  visitVMap(): void {}

  visitVInterface(vi: VInterface, pk: Value, fieldChain: string[]): void {
    // Visit interface impl name as VString
    this._visitor.visit(
      new VString(vi.child.name(), vi.getImplNameSource()),
      this._table,
      pk,
      fieldChain,
    );
    // Then recurse into child struct
    this.visitVStruct(vi.child, pk, fieldChain);
  }

  visitVStruct(vs: VStruct, pk: Value, fieldChain: string[]): void {
    const note = vs.note;
    if (note !== undefined && note !== '') {
      this._visitor.visit(
        new VString(note, vs.source),
        this._table,
        pk,
        subChain(fieldChain, '$note'),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// ForeachValue — static traversal methods
// ---------------------------------------------------------------------------

export class ForeachValue {
  /**
   * Traverse all values in CfgValue, visiting in sorted table order.
   */
  static foreach(visitor: ValueVisitor, cfgValue: CfgValue): void {
    for (const vTable of cfgValue.sortedTables()) {
      ForeachValue.foreachVTable(visitor, vTable);
    }
  }

  /**
   * Search all primitive values in CfgValue (sorted table order),
   * including interface names and struct notes.
   */
  static searchCfgValue(visitor: ValueVisitorForSearch, cfgValue: CfgValue): void {
    for (const vTable of cfgValue.sortedTables()) {
      ForeachValue.searchVTable(visitor, vTable);
    }
  }

  /**
   * Search all primitive values in a single VTable.
   */
  static searchVTable(visitor: ValueVisitorForSearch, vTable: VTable): void {
    ForeachValue.foreachVTable(
      new ForSearchVisitor(visitor, vTable.name()),
      vTable,
    );
  }

  /**
   * Traverse all values in a single VTable.
   */
  static foreachVTable(visitor: ValueVisitor, vTable: VTable): void {
    for (const [pk, vStruct] of vTable.primaryKeyMap) {
      ForeachValue.foreachValue(visitor, vStruct, pk, []);
    }
  }

  /**
   * Recursive traversal of a Value.
   */
  static foreachValue(
    visitor: ValueVisitor,
    value: Value,
    pk: Value,
    fieldChain: string[],
  ): void {
    if (isPrimitiveValue(value)) {
      visitor.visitPrimitive(value, pk, fieldChain);
    } else if (value instanceof VStruct) {
      visitor.visitVStruct(value, pk, fieldChain);
      const fields: FieldSchema[] = value.schema.fields();
      const values = value.values;
      for (let i = 0; i < fields.length && i < values.length; i++) {
        ForeachValue.foreachValue(
          visitor,
          values[i],
          pk,
          subChain(fieldChain, fields[i].name),
        );
      }
    } else if (value instanceof VInterface) {
      visitor.visitVInterface(value, pk, fieldChain);
      const child = value.child;
      const fields: FieldSchema[] = child.schema.fields();
      const values = child.values;
      for (let i = 0; i < fields.length && i < values.length; i++) {
        ForeachValue.foreachValue(
          visitor,
          values[i],
          pk,
          subChain(fieldChain, fields[i].name),
        );
      }
    } else if (value instanceof VList) {
      visitor.visitVList(value, pk, fieldChain);
      let i = 0;
      for (const sv of value.valueList) {
        ForeachValue.foreachValue(visitor, sv, pk, subChain(fieldChain, String(i)));
        i++;
      }
    } else if (value instanceof VMap) {
      visitor.visitVMap(value, pk, fieldChain);
      let i = 0;
      for (const [k, v] of value.valueMap) {
        ForeachValue.foreachValue(visitor, k, pk, subChain(fieldChain, `${i}k`));
        ForeachValue.foreachValue(visitor, v, pk, subChain(fieldChain, `${i}v`));
        i++;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: create a new field chain (immutable copy + append)
// ---------------------------------------------------------------------------

function subChain(old: string[], e: string): string[] {
  const res = old.slice();
  res.push(e);
  return res;
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
