/**
 * RecordService — TypeScript port of Java `configgen.editorserver.RecordService`.
 *
 * Provides data for the cfgeditor record relationship UI:
 *   - requestRecord: JSON object of a single record + its refs
 *   - requestRefs: expanded ref-out graph (optionally including ref-in)
 *   - requestUnreferenced: unreferenced records in a table
 *
 * Key differences from Java:
 * - HTTP serialization removed; returns plain TS objects directly.
 * - RefId is a class with reference equality in TS Maps. We use a string-key
 *   helper (refIdKey) to work around this where needed (e.g. removing entries
 *   from frontier that came from result — those are different RefId instances
 *   but same logical identity).
 * - Java's switch expressions replaced with if/else chains.
 *
 * Java source: configgen.editorserver.RecordService.java (334 lines)
 */

import type { CfgValue, VTable, VStruct, Value } from '@cfggen/value';
import {
  ValueUtil,
  ValuePack,
  ValueToJson,
  ValueRefCollector,
  ValueRefInCollector,
  UnreferencedRecordCollector,
  CfgValueErrs,
  VString,
  RefId,
  valueEquals,
  type FieldRef,
  type ForeachContext,
} from '@cfggen/value';
import type { TableSchemaRefGraph } from '@cfggen/schema';
import { TableSchema } from '@cfggen/schema';
import { isEEnum } from '@cfggen/schema';
import type { FieldSchema } from '@cfggen/schema';

// ---------------------------------------------------------------------------
// Types (mirror cfgeditor/src/api/recordModel.ts)
// ---------------------------------------------------------------------------

export type ResultCode =
  | 'ok'
  | 'tableNotSet'
  | 'idNotSet'
  | 'tableNotFound'
  | 'idParseErr'
  | 'idNotFound'
  | 'paramErr';

export type RequestType = 'requestRecord' | 'requestRefs' | 'requestUnreferenced';

export interface BriefDescription {
  field: string;
  value: string;
  comment: string;
}

export interface BriefRecord {
  table: string;
  id: string;
  title?: string;
  descriptions?: BriefDescription[];
  value: string; // packStr
  refs: FieldRef[];
  depth: number;
}

export interface RecordResult {
  resultCode: ResultCode;
  table: string;
  id: string;
  maxObjs: number;
  object: Record<string, unknown> | null;
  refs: BriefRecord[] | null;
}

export interface RecordRefsResult {
  resultCode: ResultCode;
  table: string;
  id: string;
  depth: number;
  in: boolean;
  maxObjs: number;
  refs: BriefRecord[] | null;
}

export interface UnreferencedRecordsResult {
  resultCode: ResultCode;
  table: string;
  maxObjs: number;
  refs: BriefRecord[] | null;
}

export type RecordResponse = RecordResult | RecordRefsResult | UnreferencedRecordsResult;

// ---------------------------------------------------------------------------
// Helpers: RefId Map key (workaround for TS Map reference equality)
// ---------------------------------------------------------------------------

function refIdKey(r: RefId): string {
  return r.table + '\0' + r.id;
}

/**
 * Remove a RefId from a Map<RefId, VStruct> using value-based equality.
 */
function refIdMapDelete(map: Map<RefId, VStruct>, target: RefId): void {
  const tk = refIdKey(target);
  for (const k of map.keys()) {
    if (refIdKey(k) === tk) {
      map.delete(k);
      return;
    }
  }
}

/**
 * Check if a RefId is in a Set<RefId> using value-based equality.
 */
function refIdSetHas(set: Set<RefId>, target: RefId): boolean {
  const tk = refIdKey(target);
  for (const k of set) {
    if (refIdKey(k) === tk) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// RecordService
// ---------------------------------------------------------------------------

export class RecordService {
  private readonly cfgValue: CfgValue;
  private readonly graph: TableSchemaRefGraph;
  private readonly table: string | null;
  private readonly id: string | null;
  private readonly depth: number;
  private readonly in: boolean;
  private readonly maxObjs: number;
  private readonly requestType: RequestType;

  constructor(
    cfgValue: CfgValue,
    graph: TableSchemaRefGraph,
    tableName: string | null,
    id: string | null,
    depth: number,
    in_: boolean,
    maxObjs: number,
    requestType: RequestType,
  ) {
    this.cfgValue = cfgValue;
    this.graph = graph;
    this.table = tableName;
    this.id = id;
    this.depth = depth;
    this.in = in_;
    this.maxObjs = maxObjs;
    this.requestType = requestType;
  }

  /**
   * Execute the request and return a RecordResponse.
   * Java: RecordService.retrieve()
   */
  retrieve(): RecordResponse {
    if (this.table === null) {
      return this.ofErr('tableNotSet');
    }

    if (this.requestType !== 'requestUnreferenced') {
      if (this.id === null) {
        return this.ofErr('idNotSet');
      }
    }

    if (this.depth < 0 || this.maxObjs <= 0) {
      return this.ofErr('paramErr');
    }

    const vTable = this.cfgValue.vTableMap.get(this.table);
    if (vTable === undefined) {
      return this.ofErr('tableNotFound');
    }

    if (this.requestType === 'requestUnreferenced') {
      return this.handleRequestUnreferenced(vTable);
    }

    const errs = CfgValueErrs.of();
    const pkValue = ValuePack.unpackTablePrimaryKey(this.id!, vTable.schema, errs);

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

    const frontier = new Map<RefId, VStruct>();
    const thisObjId = new RefId(this.table, id);
    let object: Record<string, unknown> | null = null;
    let startDepth: number;

    if (this.requestType === 'requestRecord') {
      object = new ValueToJson(this.cfgValue, frontier).toJsonVStruct(vRecord);
      refIdMapDelete(frontier, thisObjId);
      startDepth = 1;
    } else {
      // requestRefs
      frontier.set(thisObjId, vRecord);
      startDepth = 0;
    }

    const result = this.expandRefOut(frontier, startDepth, new Set([thisObjId]));

    if (this.in) {
      const refInCollector = new ValueRefInCollector(this.graph, this.cfgValue);
      const refIns = refInCollector.collect(vTable, pkValue!);
      if (refIns.size > 0) {
        for (const r of result.keys()) {
          refIdMapDelete(refIns, r);
        }
      }

      for (const [refId, ctx] of refIns) {
        const vStruct = ctx.recordValue;
        const fieldRefs = ValueRefCollector.collectRefs(vStruct, this.cfgValue);
        result.set(refId, RecordService.vStructToBriefRecord(refId, vStruct, fieldRefs, -1));
        if (result.size > this.maxObjs + 8) {
          break;
        }
      }
    }

    if (this.requestType === 'requestRecord') {
      return {
        resultCode: 'ok',
        table: this.table,
        id,
        maxObjs: this.maxObjs,
        object,
        refs: Array.from(result.values()),
      };
    } else {
      return {
        resultCode: 'ok',
        table: this.table,
        id,
        depth: this.depth,
        in: this.in,
        maxObjs: this.maxObjs,
        refs: Array.from(result.values()),
      };
    }
  }

  // -------------------------------------------------------------------------
  // Error response
  // -------------------------------------------------------------------------

  private ofErr(code: ResultCode): RecordResponse {
    if (this.requestType === 'requestRecord') {
      return {
        resultCode: code,
        table: this.table ?? '',
        id: this.id ?? '',
        maxObjs: this.maxObjs,
        object: null,
        refs: null,
      };
    } else if (this.requestType === 'requestRefs') {
      return {
        resultCode: code,
        table: this.table ?? '',
        id: this.id ?? '',
        depth: this.depth,
        in: this.in,
        maxObjs: this.maxObjs,
        refs: null,
      };
    } else {
      return {
        resultCode: code,
        table: this.table ?? '',
        maxObjs: this.maxObjs,
        refs: null,
      };
    }
  }

  // -------------------------------------------------------------------------
  // expandRefOut: BFS expansion of outgoing references
  // -------------------------------------------------------------------------

  private expandRefOut(
    frontier: Map<RefId, VStruct>,
    startDepth: number,
    excludeIds: Set<RefId>,
  ): Map<RefId, BriefRecord> {
    const result = new Map<RefId, BriefRecord>();
    let curDepth = startDepth;

    while (curDepth <= this.depth) {
      const newFrontier = new Map<RefId, VStruct>();

      for (const [refId, record] of frontier) {
        const fieldRefs: FieldRef[] = [];
        const collector = new ValueRefCollector(this.cfgValue, newFrontier, fieldRefs);
        collector.collect(record, []);

        result.set(refId, RecordService.vStructToBriefRecord(refId, record, fieldRefs, curDepth));

        if (result.size > this.maxObjs) {
          break;
        }
      }

      if (result.size > this.maxObjs) {
        break;
      }

      // Dedup: remove already-processed records and excludeIds from newFrontier
      for (const refId of result.keys()) {
        refIdMapDelete(newFrontier, refId);
      }
      for (const refId of excludeIds) {
        refIdMapDelete(newFrontier, refId);
      }

      // Replace frontier with newFrontier (re-key to match)
      frontier = newFrontier;
      curDepth++;
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // handleRequestUnreferenced
  // -------------------------------------------------------------------------

  private handleRequestUnreferenced(vTable: VTable): UnreferencedRecordsResult {
    const unreferencedInTable = UnreferencedRecordCollector.collectUnreferencedInTable(
      this.cfgValue, vTable, this.graph,
    );

    const unreferencedRecords: BriefRecord[] = [];
    for (const rec of unreferencedInTable.unreferencedRecords) {
      if (unreferencedRecords.length >= this.maxObjs) {
        break;
      }
      const refId = new RefId(vTable.name(), rec.primaryKey);
      const fieldRefs = ValueRefCollector.collectRefs(rec.record, this.cfgValue);
      const briefRecord = RecordService.vStructToBriefRecord(refId, rec.record, fieldRefs, 0);
      unreferencedRecords.push(briefRecord);
    }

    return {
      resultCode: 'ok',
      table: this.table!,
      maxObjs: this.maxObjs,
      refs: unreferencedRecords,
    };
  }

  // -------------------------------------------------------------------------
  // Static helpers
  // -------------------------------------------------------------------------

  private static vStructToBriefRecord(
    refId: RefId,
    vStruct: VStruct,
    refs: FieldRef[],
    depth: number,
  ): BriefRecord {
    const title = RecordService.getBriefTitle(vStruct);
    const descriptions = RecordService.getBriefDescriptions(vStruct);
    const value = vStruct.packStr();
    return {
      table: refId.table,
      id: refId.id,
      title,
      descriptions,
      value,
      refs,
      depth,
    };
  }

  /**
   * Brief title for a record: from meta 'title' field, and if the table is an
   * enum table whose primary key is not the enum field, prefix the enum value.
   * Java: RecordService.getBriefTitle (also used by SchemaService).
   */
  static getBriefTitle(vStruct: VStruct): string | undefined {
    let title: string | undefined = undefined;
    const titleFieldName = vStruct.schema.meta().getStr('title', '');
    if (titleFieldName !== '') {
      title = ValueUtil.extractFieldValueStr(vStruct, titleFieldName) ?? undefined;
    }

    let enumName: string | undefined = undefined;
    const ts = vStruct.schema instanceof TableSchema ? vStruct.schema : null;
    if (ts !== null && isEEnum(ts.entry)) {
      const pkFields = ts.primaryKey.fieldSchemas();
      const firstPk = pkFields !== null && pkFields.length > 0 ? pkFields[0] : null;
      if (firstPk !== ts.entry.fieldSchema) {
        const fv = ValueUtil.extractFieldValue(vStruct, ts.entry.field);
        if (fv instanceof VString) {
          enumName = fv.value;
        }
      }
    }

    if (enumName !== undefined) {
      if (title !== undefined) {
        return `${enumName}: ${title}`;
      }
      return enumName;
    }
    return title;
  }

  /**
   * Brief descriptions: from meta 'description' (comma-separated field names).
   * Java: RecordService.getBriefDescriptions.
   */
  static getBriefDescriptions(vStruct: VStruct): BriefDescription[] | undefined {
    const fields = vStruct.schema.meta().getStr('description', '');
    if (fields === '') {
      return undefined;
    }

    const descriptions: BriefDescription[] = [];
    for (const f of fields.split(',')) {
      const fieldName = f.trim();
      const value = ValueUtil.extractFieldValueStr(vStruct, fieldName);
      if (value === null) {
        continue;
      }

      const fs: FieldSchema | null = vStruct.schema.findField(fieldName);
      if (fs === null) {
        continue;
      }

      descriptions.push({
        field: fieldName,
        value,
        comment: fs.comment(),
      });
    }

    return descriptions;
  }
}

// ---------------------------------------------------------------------------
// Internal: Map lookup using valueEquals (TS Map uses ===, not equals/hashCode)
// ---------------------------------------------------------------------------

function mapGetByValue(map: Map<Value, VStruct>, key: Value): VStruct | undefined {
  for (const [k, v] of map) {
    if (valueEquals(k, key)) {
      return v;
    }
  }
  return undefined;
}
