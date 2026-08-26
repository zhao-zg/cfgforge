/**
 * UnreferencedRecordCollector — TypeScript port of Java `configgen.value.UnreferencedRecordCollector`.
 *
 * Finds records that are not referenced by any other table:
 *   - Skip root tables (they're like GC roots — never unreferenced)
 *   - Skip EEnum tables (all enum values are considered entry points)
 *   - For EEntry tables: skip records where the entry field has a value
 *   - For all other records: check if any incoming reference exists via ValueRefInCollector
 *
 * TS version is synchronous (no worker_threads / ExecutorService).
 * Does NOT implement print() (TS version doesn't need Logger/LocaleUtil).
 *
 * Java source: configgen.value.UnreferencedRecordCollector.java (176 lines)
 */

import {
  VStruct,
  VString,
  VText,
  type VTable,
  type CfgValue,
} from './CfgValue';
import { ValueUtil } from './ValueUtil';
import { ValueRefInCollector } from './ValueRefInCollector';
import { TableSchemaRefGraph } from '@cfggen/schema';
import type { TableSchema } from '@cfggen/schema';
import { isEEnum, isEEntry } from '@cfggen/schema';

// ---------------------------------------------------------------------------
// Types (Java records → TS classes)
// ---------------------------------------------------------------------------

export class UnreferencedRecord {
  constructor(
    public readonly primaryKey: string,
    public readonly record: VStruct,
  ) {}
}

export class UnreferencedInTable {
  constructor(
    public readonly tableName: string,
    public readonly unreferencedRecords: UnreferencedRecord[],
  ) {}
}

export class Unreferenced {
  constructor(
    public readonly total: number,
    public readonly tableToUnreferenced: Map<string, UnreferencedRecord[]>,
  ) {}
}

// ---------------------------------------------------------------------------
// UnreferencedRecordCollector (synchronous)
// ---------------------------------------------------------------------------

export class UnreferencedRecordCollector {

  static collectUnreferenced(cfgValue: CfgValue): Unreferenced {
    const graph = new TableSchemaRefGraph(cfgValue.schema);

    const allUnreferenced = new Map<string, UnreferencedRecord[]>();
    let totalUnreferencedCount = 0;

    for (const vTable of cfgValue.sortedTables()) {
      // Skip root tables (GC-root-like, never unreferenced)
      if (vTable.schema.meta().isRoot()) {
        continue;
      }

      const result = UnreferencedRecordCollector.collectUnreferencedInTable(
        cfgValue, vTable, graph,
      );

      if (result.unreferencedRecords.length > 0) {
        allUnreferenced.set(result.tableName, result.unreferencedRecords);
        totalUnreferencedCount += result.unreferencedRecords.length;
      }
    }

    return new Unreferenced(totalUnreferencedCount, allUnreferenced);
  }

  static collectUnreferencedInTable(
    cfgValue: CfgValue,
    vTable: VTable,
    graph: TableSchemaRefGraph,
  ): UnreferencedInTable {
    const unreferencedRecords: UnreferencedRecord[] = [];
    const refInCollector = new ValueRefInCollector(graph, cfgValue);
    const tableSchema: TableSchema = vTable.schema;

    let entryFieldName: string | null = null;
    const entry = tableSchema.entry;

    if (isEEnum(entry)) {
      // Enum type: all are entry points, none unreferenced
      return new UnreferencedInTable(vTable.name(), unreferencedRecords);
    } else if (isEEntry(entry)) {
      entryFieldName = entry.field;
    }
    // ENo: entryFieldName stays null, all records checked

    for (const [pkValue, record] of vTable.primaryKeyMap) {
      // EEntry special: if entry field has a value, it's an entry point — not unreferenced
      if (entryFieldName !== null) {
        const entryFieldValue = ValueUtil.extractFieldValue(record, entryFieldName);
        if ((entryFieldValue instanceof VString || entryFieldValue instanceof VText) &&
            (entryFieldValue as VString | VText).value !== '') {
          continue;
        }
      }

      // Check if this record is referenced by any other table
      if (!refInCollector.hasReference(vTable, pkValue)) {
        unreferencedRecords.push(new UnreferencedRecord(pkValue.packStr(), record));
      }
    }

    return new UnreferencedInTable(vTable.name(), unreferencedRecords);
  }
}
