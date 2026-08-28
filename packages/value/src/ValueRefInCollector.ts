/**
 * ValueRefInCollector — TypeScript port of Java `configgen.value.ValueRefInCollector`.
 *
 * Finds all incoming references to a given record (VTable + pkValue).
 * Uses TableSchemaRefGraph to know which tables reference the target table,
 * then searches each refIn table's records for foreign key matches.
 *
 * - hasReference(): fast early-exit check (finds first match, returns true)
 * - collect(): full collection, returns Map<RefId, ForeachContext>
 * - collectTo(): collect into an externally-provided map
 *
 * Java source: configgen.value.ValueRefInCollector.java (227 lines)
 */

import {
  type Value,
  VStruct,
  VList,
  VMap,
  type VTable,
  type CfgValue,
  valueEquals,
} from './CfgValue.js';
import { ForeachVStruct, type ForeachContext, type VStructVisitor } from './ForeachVStruct.js';
import { ValueUtil } from './ValueUtil.js';
import { RefId } from './ValueRefCollector.js';
import type { TableSchemaRefGraph } from '@cfgforge/schema';
import { TableSchema } from '@cfgforge/schema';
import type { ForeignKeySchema, Structural } from '@cfgforge/schema';
import { RefPrimary, RefUniq, RefList } from '@cfgforge/schema';
import { findFieldIndices } from '@cfgforge/schema';
import { isSimpleType, isFList, isFMap, type FieldType } from '@cfgforge/schema';

// ---------------------------------------------------------------------------
// SearchParams
// ---------------------------------------------------------------------------

class SearchParams {
  constructor(public readonly refInTables: Set<string>) {}
}

// ---------------------------------------------------------------------------
// ValueRefInCollector
// ---------------------------------------------------------------------------

export class ValueRefInCollector {
  private readonly _graph: TableSchemaRefGraph;
  private readonly _cfgValue: CfgValue;

  constructor(graph: TableSchemaRefGraph, cfgValue: CfgValue) {
    this._graph = graph;
    this._cfgValue = cfgValue;
  }

  /**
   * Collect all incoming references to a record.
   */
  collect(vTable: VTable, pkValue: Value): Map<RefId, ForeachContext> {
    const result = new Map<RefId, ForeachContext>();
    this.collectTo(vTable, pkValue, result);
    return result;
  }

  /**
   * Fast check: does at least one reference to this record exist?
   * Stops at the first match.
   */
  hasReference(vTable: VTable, pkValue: Value): boolean {
    const params = this.buildSearchParams(vTable, pkValue);
    if (params === null) {
      return false;
    }
    return this.searchReferences(params.refInTables, vTable, pkValue, null, true);
  }

  /**
   * Collect all incoming references into an externally-provided map.
   */
  collectTo(vTable: VTable, pkValue: Value, result: Map<RefId, ForeachContext>): void {
    const params = this.buildSearchParams(vTable, pkValue);
    if (params === null) {
      return;
    }
    this.searchReferences(params.refInTables, vTable, pkValue, result, false);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private buildSearchParams(vTable: VTable, pkValue: Value): SearchParams | null {
    // Check record exists
    let recordExists = false;
    for (const k of vTable.primaryKeyMap.keys()) {
      if (valueEquals(k, pkValue)) {
        recordExists = true;
        break;
      }
    }
    if (!recordExists) {
      return null;
    }

    // Check if any table references this table
    const refs = this._graph.refsMap.get(vTable.name());
    if (!refs) {
      return null;
    }

    const refInTables = refs.refIn();
    if (refInTables.size === 0) {
      return null;
    }

    return new SearchParams(refInTables);
  }

  private searchReferences(
    refInTables: Set<string>,
    targetTable: VTable,
    targetPkValue: Value,
    result: Map<RefId, ForeachContext> | null,
    stopAtFirst: boolean,
  ): boolean {
    for (const refInTableName of refInTables) {
      const vRefInTable = this._cfgValue.vTableMap.get(refInTableName);
      if (!vRefInTable) continue;
      const found = ValueRefInCollector.searchInTable(
        vRefInTable, targetTable, targetPkValue, result, stopAtFirst,
      );
      if (found && stopAtFirst) {
        return true;
      }
    }
    return false;
  }

  private static searchInTable(
    searchTable: VTable,
    targetTable: VTable,
    targetPkValue: Value,
    result: Map<RefId, ForeachContext> | null,
    stopAtFirst: boolean,
  ): boolean {
    // Get target record (early exit if not found)
    let targetRecord: VStruct | undefined;
    for (const [k, v] of targetTable.primaryKeyMap) {
      if (valueEquals(k, targetPkValue)) {
        targetRecord = v;
        break;
      }
    }
    if (!targetRecord) {
      return false;
    }

    const found = { value: false };

    const visitor: VStructVisitor = {
      visit(vStruct: VStruct, ctx: ForeachContext): boolean {
        const structural: Structural = vStruct.schema;
        for (const fk of structural.foreignKeys()) {
          if (fk.refTableSchema() !== targetTable.schema) {
            continue;
          }
          const matchFound = ValueRefInCollector.checkForeignKeyMatch(vStruct, fk, targetRecord!);
          if (matchFound) {
            if (result !== null) {
              ValueRefInCollector.addCtx(result, ctx);
            }
            found.value = true;
            if (stopAtFirst) {
              return false; // stop traversal
            }
          }
        }
        return true; // continue traversal
      },
    };

    ForeachVStruct.foreachVTable(visitor, searchTable);
    return found.value;
  }

  /**
   * Check if the foreign key value in vStruct matches the target record's key.
   */
  private static checkForeignKeyMatch(
    vStruct: VStruct,
    fk: ForeignKeySchema,
    targetRecord: VStruct,
  ): boolean {
    const targetValue = ValueRefInCollector.getTargetValue(fk, targetRecord);
    const ft: FieldType = fk.key.fieldSchemas()![0].type;

    if (isSimpleType(ft)) {
      const localValue = ValueUtil.extractKeyValue(vStruct, fk.keyIndices()!);
      return valueEquals(localValue, targetValue);
    } else if (isFList(ft)) {
      const localList = vStruct.values[fk.keyIndices()![0]] as VList;
      return localList.valueList.some((item) => valueEquals(item, targetValue));
    } else if (isFMap(ft)) {
      const localMap = vStruct.values[fk.keyIndices()![0]] as VMap;
      for (const val of localMap.valueMap.values()) {
        if (valueEquals(val, targetValue)) {
          return true;
        }
      }
      return false;
    }
    return false;
  }

  /**
   * Get the target record's key value based on the refKey type.
   */
  private static getTargetValue(fk: ForeignKeySchema, targetRecord: VStruct): Value {
    const refKey = fk.refKey;
    const structural = targetRecord.schema;

    if (!(structural instanceof TableSchema)) {
      throw new Error(
        `targetRecord schema must be a TableSchema, but got: ${structural.constructor.name}`,
      );
    }

    const tableSchema = structural as TableSchema;

    if (refKey instanceof RefPrimary) {
      return ValueUtil.extractPrimaryKeyValue(targetRecord, tableSchema);
    } else if (refKey instanceof RefUniq) {
      const uniqKey = tableSchema.findUniqueKey(refKey.keyNames());
      if (!uniqKey) {
        throw new Error(`RefUniq key not found: ${refKey.keyNames()}`);
      }
      const indices = findFieldIndices(tableSchema, uniqKey);
      return ValueUtil.extractKeyValue(targetRecord, indices);
    } else if (refKey instanceof RefList) {
      // RefList keyNames point to the referenced table's key (primary or unique)
      let refKeySchema = null;
      const pkFields = tableSchema.primaryKey.fields();
      if (pkFields.length === refKey.keyNames().length &&
          pkFields.every((f, i) => f === refKey.keyNames()[i])) {
        refKeySchema = tableSchema.primaryKey;
      } else {
        refKeySchema = tableSchema.findUniqueKey(refKey.keyNames());
      }
      if (!refKeySchema) {
        throw new Error(`RefList key not found: ${refKey.keyNames()}`);
      }
      const indices = findFieldIndices(tableSchema, refKeySchema);
      return ValueUtil.extractKeyValue(targetRecord, indices);
    }

    throw new Error(`Unknown RefKey type: ${(refKey as unknown as { constructor: { name: string } }).constructor.name}`);
  }

  private static addCtx(
    result: Map<RefId, ForeachContext>,
    ctx: ForeachContext,
  ): void {
    const refId = new RefId(ctx.fromVTable.name(), ctx.pkValue.packStr());
    result.set(refId, ctx);
  }
}
