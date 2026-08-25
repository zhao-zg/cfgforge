/**
 * RecordRefIdsService — TypeScript port of Java `configgen.editorserver.RecordRefIdsService`.
 *
 * Returns a simplified reference graph (table/id/title/depth) with configurable
 * inDepth (refIn layers) and outDepth (refOut layers), truncated by maxRefIds.
 *
 * Compared to RecordService, this returns less data per record (no descriptions,
 * no value, no fieldRefs) but can expand more layers of the reference graph.
 *
 * Depth convention:
 *   - self: depth = 0
 *   - refIn: depth = -1, -2, ... (negative)
 *   - refOut: depth = 1, 2, ... (positive)
 *
 * Algorithm (mirrors Java):
 *   1. Put self into result map.
 *   2. BFS refIn layers (depth 1..inDepth): use ValueRefInCollector.collectTo
 *      to find records referencing the current frontier. Dedup against result.
 *   3. BFS refOut layers (depth 1..outDepth): use ValueRefCollector to find
 *      records referenced by the current frontier. Dedup against result.
 *   4. Truncate at maxRefIds.
 *
 * Key differences from Java:
 * - RefId is a class with reference equality in TS Maps. We use refIdKey()
 *   string keys for dedup (same pattern as RecordService).
 * - Java's `result.keySet().remove(r)` → manual refIdMapDelete loop.
 * - Error response: Java passes null for recordRefIds; TS uses empty array.
 *
 * Java source: configgen.editorserver.RecordRefIdsService.java (173 lines)
 */

import type { CfgValue, VTable, VStruct, Value } from '@cfggen/value';
import {
  ValuePack,
  ValueRefCollector,
  ValueRefInCollector,
  CfgValueErrs,
  RefId,
  ForeachContext,
  valueEquals,
} from '@cfggen/value';
import type { TableSchemaRefGraph } from '@cfggen/schema';
import { RecordService } from './RecordService';
import type { ResultCode } from './RecordService';

// ---------------------------------------------------------------------------
// Types (mirror cfgeditor/src/api/recordModel.ts)
// ---------------------------------------------------------------------------

export interface RecordRefId {
  table: string;
  id: string;
  title: string;
  depth: number; // -1,-2 for refIn; 0 for self; 1,2.. for refOut
}

export interface RecordRefIdsResult {
  resultCode: ResultCode;
  table: string;
  id: string;
  inDepth: number;
  outDepth: number;
  maxRefIds: number;
  recordRefIds: RecordRefId[];
}

// ---------------------------------------------------------------------------
// Helpers: RefId Map key (workaround for TS Map reference equality)
// ---------------------------------------------------------------------------

function refIdKey(r: RefId): string {
  return r.table + '\0' + r.id;
}

/**
 * Remove all RefIds from `toRemove` that match any key in `result` (by value).
 */
function removeAllByIdentity(
  toRemove: Map<RefId, unknown>,
  result: Map<RefId, RecordRefId>,
): void {
  const resultKeys = new Set<string>();
  for (const k of result.keys()) {
    resultKeys.add(refIdKey(k));
  }
  for (const k of [...toRemove.keys()]) {
    if (resultKeys.has(refIdKey(k))) {
      toRemove.delete(k);
    }
  }
}

/**
 * Lookup a VStruct from primaryKeyMap using valueEquals (TS Map uses ===).
 */
function mapGetByValue(map: Map<Value, VStruct>, key: Value): VStruct | undefined {
  for (const [k, v] of map) {
    if (valueEquals(k, key)) {
      return v;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// RecordRefIdsService
// ---------------------------------------------------------------------------

export class RecordRefIdsService {
  private readonly cfgValue: CfgValue;
  private readonly graph: TableSchemaRefGraph;
  private readonly table: string | null;
  private readonly id: string | null;
  private readonly inDepth: number;
  private readonly outDepth: number;
  private readonly maxRefIds: number;

  constructor(
    cfgValue: CfgValue,
    graph: TableSchemaRefGraph,
    tableName: string | null,
    id: string | null,
    inDepth: number,
    outDepth: number,
    maxRefIds: number,
  ) {
    this.cfgValue = cfgValue;
    this.graph = graph;
    this.table = tableName;
    this.id = id;
    this.inDepth = inDepth;
    this.outDepth = outDepth;
    this.maxRefIds = maxRefIds;
  }

  /**
   * Execute the request and return a RecordRefIdsResult.
   * Java: RecordRefIdsService.retrieve()
   */
  retrieve(): RecordRefIdsResult {
    if (this.table === null) {
      return this.ofErr('tableNotSet');
    }
    if (this.id === null) {
      return this.ofErr('idNotSet');
    }
    if (this.inDepth < 0 || this.outDepth < 0 || this.maxRefIds <= 0) {
      return this.ofErr('paramErr');
    }

    const vTable = this.cfgValue.vTableMap.get(this.table);
    if (vTable === undefined) {
      return this.ofErr('tableNotFound');
    }

    const errs = CfgValueErrs.of();
    const pkValue = ValuePack.unpackTablePrimaryKey(this.id, vTable.schema, errs);

    if (errs.errs.length > 0) {
      for (const err of errs.errs) {
        console.error(err);
      }
      return this.ofErr('idParseErr');
    }

    const id = pkValue!.packStr();
    const vRecord = mapGetByValue(vTable.primaryKeyMap, pkValue!);
    if (vRecord === undefined) {
      return this.ofErr('idNotFound');
    }

    // --- Put self into result ---
    const result = new Map<RefId, RecordRefId>();
    const thisObjId = new RefId(this.table, id);
    result.set(
      thisObjId,
      { table: thisObjId.table, id: thisObjId.id, title: RecordService.getBriefTitle(vRecord) ?? '', depth: 0 },
    );

    // --- BFS refIn layers ---
    let refInFrontier = new Map<RefId, ForeachContext>();
    refInFrontier.set(thisObjId, new ForeachContext(vTable, pkValue!, vRecord));
    const refInCollector = new ValueRefInCollector(this.graph, this.cfgValue);

    let curInDepth = 1;
    while (curInDepth <= this.inDepth) {
      const newRefInFrontier = new Map<RefId, ForeachContext>();
      for (const [, ctx] of refInFrontier) {
        refInCollector.collectTo(ctx.fromVTable, ctx.pkValue, newRefInFrontier);
      }

      if (newRefInFrontier.size > 0) {
        // Dedup: remove entries already in result
        removeAllByIdentity(newRefInFrontier, result);

        for (const [refId, ri] of newRefInFrontier) {
          result.set(refId, {
            table: refId.table,
            id: refId.id,
            title: RecordService.getBriefTitle(ri.recordValue) ?? '',
            depth: -curInDepth,
          });
          if (result.size > this.maxRefIds) {
            break;
          }
        }
      }

      if (result.size > this.maxRefIds) {
        break;
      }
      refInFrontier = newRefInFrontier;
      curInDepth++;
    }

    // --- BFS refOut layers ---
    let refOutFrontier = new Map<RefId, VStruct>();
    refOutFrontier.set(thisObjId, vRecord);

    let curOutDepth = 1;
    while (curOutDepth <= this.outDepth) {
      const newRefOutFrontier = new Map<RefId, VStruct>();

      for (const [, record] of refOutFrontier) {
        const fieldRefs: unknown[] = [];
        const collector = new ValueRefCollector(
          this.cfgValue,
          newRefOutFrontier,
          fieldRefs as Parameters<typeof ValueRefCollector.prototype.collect>[2],
        );
        collector.collect(record, []);
      }

      if (newRefOutFrontier.size > 0) {
        // Dedup: remove entries already in result
        removeAllByIdentity(newRefOutFrontier, result);

        for (const [refId, ro] of newRefOutFrontier) {
          result.set(refId, {
            table: refId.table,
            id: refId.id,
            title: RecordService.getBriefTitle(ro) ?? '',
            depth: curOutDepth,
          });
          if (result.size > this.maxRefIds) {
            break;
          }
        }

        if (result.size > this.maxRefIds) {
          break;
        }
      }
      refOutFrontier = newRefOutFrontier;
      curOutDepth++;
    }

    return {
      resultCode: 'ok',
      table: this.table,
      id,
      inDepth: this.inDepth,
      outDepth: this.outDepth,
      maxRefIds: this.maxRefIds,
      recordRefIds: Array.from(result.values()),
    };
  }

  // -------------------------------------------------------------------------
  // Error response
  // -------------------------------------------------------------------------

  private ofErr(code: ResultCode): RecordRefIdsResult {
    return {
      resultCode: code,
      table: this.table ?? '',
      id: this.id ?? '',
      inDepth: this.inDepth,
      outDepth: this.outDepth,
      maxRefIds: this.maxRefIds,
      recordRefIds: [],
    };
  }
}
