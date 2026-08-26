/**
 * EntryRecordCollector — TypeScript port of Java `configgen.value.EntryRecordCollector`.
 *
 * Collects "entry" records from a CfgValue tree:
 *   - ROOT tables (meta.isRoot): collect all records
 *   - EEnum tables: collect all records
 *   - EEntry tables: collect only records where the entry field has a non-empty value
 *   - ENo tables: collect nothing
 *
 * Does NOT implement print() (TS version doesn't need Logger/LocaleUtil).
 *
 * Java source: configgen.value.EntryRecordCollector.java (154 lines)
 */

import {
  VStruct,
  VString,
  VText,
  type VTable,
  type CfgValue,
} from './CfgValue';
import { ValueUtil } from './ValueUtil';
import type { TableSchema } from '@cfggen/schema';
import { isEEntry, isEEnum } from '@cfggen/schema';

// ---------------------------------------------------------------------------
// Types (Java records → TS classes)
// ---------------------------------------------------------------------------

export enum EntryTypeTag {
  ROOT = 'ROOT',
  ENUM = 'ENUM',
  ENTRY = 'ENTRY',
}

export class EntryRecord {
  constructor(
    public readonly primaryKey: string,
    public readonly record: VStruct,
  ) {}
}

export class EntryInTable {
  constructor(
    public readonly tableName: string,
    public readonly entryRecords: EntryRecord[],
    public readonly typeTag: EntryTypeTag,
  ) {}
}

export class Entry {
  constructor(
    public readonly total: number,
    public readonly tables: EntryInTable[],
  ) {}
}

// ---------------------------------------------------------------------------
// EntryRecordCollector
// ---------------------------------------------------------------------------

export class EntryRecordCollector {

  static collectEntry(cfgValue: CfgValue): Entry {
    const tables: EntryInTable[] = [];
    let totalEntryCount = 0;

    for (const vTable of cfgValue.sortedTables()) {
      const result = EntryRecordCollector.collectEntryInTable(vTable);
      if (result.entryRecords.length > 0) {
        tables.push(result);
        totalEntryCount += result.entryRecords.length;
      }
    }

    return new Entry(totalEntryCount, tables);
  }

  static collectEntryInTable(vTable: VTable): EntryInTable {
    const entryRecords: EntryRecord[] = [];
    const tableSchema: TableSchema = vTable.schema;

    let typeTag: EntryTypeTag;
    let entryFieldName: string | null = null;
    let collectAll = false;

    // Determine table type
    if (tableSchema.meta().isRoot()) {
      typeTag = EntryTypeTag.ROOT;
      collectAll = true;
    } else {
      const entry = tableSchema.entry;
      if (isEEnum(entry)) {
        // Enum type: collect all records
        typeTag = EntryTypeTag.ENUM;
        collectAll = true;
      } else if (isEEntry(entry)) {
        // EEntry type: only collect records where entry field has a value
        typeTag = EntryTypeTag.ENTRY;
        entryFieldName = entry.field;
      } else {
        // ENo type: don't collect any records
        return new EntryInTable(vTable.name(), entryRecords, EntryTypeTag.ENTRY);
      }
    }

    // Iterate all records in the table
    for (const [pkValue, record] of vTable.primaryKeyMap) {
      if (collectAll) {
        // ROOT or enum type: collect all records
        entryRecords.push(new EntryRecord(pkValue.packStr(), record));
      } else if (entryFieldName !== null) {
        // EEntry type: check if entry field has a value
        const entryFieldValue = ValueUtil.extractFieldValue(record, entryFieldName);
        if ((entryFieldValue instanceof VString || entryFieldValue instanceof VText) &&
            (entryFieldValue as VString | VText).value !== '') {
          entryRecords.push(new EntryRecord(pkValue.packStr(), record));
        }
      }
    }

    return new EntryInTable(vTable.name(), entryRecords, typeTag);
  }
}
