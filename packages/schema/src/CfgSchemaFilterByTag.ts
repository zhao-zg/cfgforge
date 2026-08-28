/**
 * CfgSchemaFilterByTag — TypeScript port of Java `configgen.schema.CfgSchemaFilterByTag`.
 *
 * Filters a resolved CfgSchema by tag, producing a partial CfgSchema containing
 * only items/fields that match the tag.
 *
 * Tag semantics:
 * - Positive tag "c": keep items that have tag "c" on themselves or their fields
 * - Negative tag "-c": keep items that do NOT have tag "c"
 *
 * Field-level filtering rules (for positive tag):
 * 1. If no field has tag/-tag → include all fields
 * 2. If some fields have tag → only include tagged fields
 * 3. If no field has tag but some have -tag → include non--tag fields
 * 4. If none have tag/-tag but impl has tag → return empty struct (name-only marker)
 * 5. Otherwise → include all fields
 *
 * Two-phase table processing:
 * - Phase 1: filter fields/entry/uniqueKeys (no foreign keys)
 * - Phase 2: filter foreign keys against phase1 table map
 */

import { CfgSchema } from './CfgSchema.js';
import type { CfgSchemaErrs } from './CfgSchemaErrs.js';
import type { Structural } from './Structural.js';
import type { FieldSchema } from './FieldSchema.js';
import type { ForeignKeySchema } from './ForeignKeySchema.js';
import type { KeySchema } from './KeySchema.js';
import { TableSchema } from './TableSchema.js';
import { InterfaceSchema } from './InterfaceSchema.js';
import { StructSchema } from './StructSchema.js';
import type { EntryType } from './EntryType.js';
import { ENo, EEntry, EEnum, isEEntry, isEEnum } from './EntryType.js';
import { isRefPrimary, isRefUniq, isRefList } from './RefKey.js';
import { makeName } from './Nameable.js';
import {
  filterRefIgnoredByRefTableNotFound,
  filterRefIgnoredByRefKeyNotFound,
} from './CfgSchemaErrs.js';

// ---------------------------------------------------------------------------
// RefErr (internal enum)
// ---------------------------------------------------------------------------

enum RefErr {
  OK,
  TABLE_NOT_FOUND,
  KEY_NOT_FOUND,
}

// ---------------------------------------------------------------------------

export class CfgSchemaFilterByTag {
  private readonly cfg: CfgSchema;
  private readonly tag: string;
  private readonly isMinusTag: boolean;
  private readonly minusTag: string;
  private readonly noMinusTag: string;
  private readonly errs: CfgSchemaErrs;

  constructor(cfg: CfgSchema, tag: string, errs: CfgSchemaErrs) {
    cfg.requireResolved();
    if (tag === null || tag === undefined) {
      throw new Error('tag must not be null');
    }
    if (tag.length === 0) {
      throw new Error('filter tag empty');
    }
    if (errs === null || errs === undefined) {
      throw new Error('errs must not be null');
    }
    this.cfg = cfg;
    this.tag = tag;
    this.isMinusTag = tag.startsWith('-');
    this.minusTag = '-' + tag;
    this.noMinusTag = this.isMinusTag ? tag.substring(1) : tag;
    this.errs = errs;
  }

  filter(): CfgSchema {
    const tableMap = this.buildFilteredTableMap();

    const filtered = CfgSchema.ofPartial();
    for (const item of this.cfg.items()) {
      if (item instanceof InterfaceSchema) {
        if (this.hasTagForInterface(item)) {
          filtered.add(this.filterInterface(item, tableMap));
        }
      } else if (item instanceof StructSchema) {
        if (this.hasTagForStructural(item)) {
          filtered.add(this.filterStruct(item, false, tableMap));
        }
      } else if (item instanceof TableSchema) {
        const ts = tableMap.get(item.name());
        if (ts !== undefined) {
          filtered.items().push(this.tablePhase2_handleForeignKey(item, ts, tableMap));
        }
      }
    }
    return filtered;
  }

  // -----------------------------------------------------------------------
  // Phase 1: build filtered table map
  // -----------------------------------------------------------------------

  private buildFilteredTableMap(): Map<string, TableSchema> {
    const tableMap = new Map<string, TableSchema>();
    for (const item of this.cfg.items()) {
      if (item instanceof TableSchema && this.hasTagForStructural(item)) {
        const ts = this.tablePhase1_filter(item);
        tableMap.set(ts.name(), ts);
      }
    }
    return tableMap;
  }

  // -----------------------------------------------------------------------
  // Tag matching rules
  // -----------------------------------------------------------------------

  private hasTagForInterface(interfaceSchema: InterfaceSchema): boolean {
    if (this.isMinusTag) {
      return !interfaceSchema.meta().hasTag(this.noMinusTag);
    } else {
      return interfaceSchema.meta().hasTag(this.tag);
    }
  }

  private hasTagForStructural(struct: Structural): boolean {
    if (this.isMinusTag) {
      return !struct.meta().hasTag(this.noMinusTag);
    } else {
      if (struct.meta().hasTag(this.tag)) {
        return true;
      }
      for (const field of struct.fields()) {
        if (field.meta.hasTag(this.tag)) {
          return true;
        }
      }
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Field filtering
  // -----------------------------------------------------------------------

  private filterFields(structural: Structural, isImpl: boolean): FieldSchema[] {
    const filteredFields: FieldSchema[] = [];

    if (this.isMinusTag) {
      for (const field of structural.fields()) {
        if (!field.meta.hasTag(this.noMinusTag)) {
          filteredFields.push(field.copy());
        }
      }
      return filteredFields;
    }

    let withMinusTagFieldCount = 0;
    for (const field of structural.fields()) {
      if (field.meta.hasTag(this.tag)) {
        filteredFields.push(field.copy());
      } else if (field.meta.hasTag(this.minusTag)) {
        withMinusTagFieldCount++;
      }
    }

    // Rule 2: if some fields have the tag → only keep tagged fields
    if (filteredFields.length > 0) {
      return filteredFields;
    }

    // Rule 3: if no field has tag but some have -tag → keep non--tag fields
    if (withMinusTagFieldCount > 0) {
      for (const field of structural.fields()) {
        if (!field.meta.hasTag(this.minusTag)) {
          filteredFields.push(field.copy());
        }
      }
      return filteredFields;
    }

    // Rule 4: if none have tag/-tag but impl has tag → return empty (name-only marker)
    if (isImpl && structural.meta().hasTag(this.tag)) {
      return filteredFields; // empty
    }

    // Rule 5: include all fields
    for (const field of structural.fields()) {
      filteredFields.push(field.copy());
    }

    return filteredFields;
  }

  // -----------------------------------------------------------------------
  // Struct / Interface filtering
  // -----------------------------------------------------------------------

  private filterStruct(
    struct: StructSchema,
    isImpl: boolean,
    tableMap: Map<string, TableSchema>,
  ): StructSchema {
    const filteredFields = this.filterFields(struct, isImpl);
    const fks = this.filterForeignKeys(struct, filteredFields, tableMap);
    return new StructSchema(
      struct.name(),
      struct.fmt(),
      struct.meta().copyWithoutState(),
      filteredFields,
      fks,
    );
  }

  private filterInterface(
    sInterface: InterfaceSchema,
    tableMap: Map<string, TableSchema>,
  ): InterfaceSchema {
    const impls: StructSchema[] = [];
    for (const impl of sInterface.impls()) {
      impls.push(this.filterStruct(impl, true, tableMap));
    }
    return new InterfaceSchema(
      sInterface.name(),
      sInterface.enumRef(),
      sInterface.defaultImpl(),
      sInterface.fmt(),
      sInterface.meta().copyWithoutState(),
      impls,
    );
  }

  // -----------------------------------------------------------------------
  // Table two-phase filtering
  // -----------------------------------------------------------------------

  private tablePhase1_filter(table: TableSchema): TableSchema {
    const filteredFields = this.filterFields(table, false);

    let entry: EntryType = ENo.NO;
    if (isEEntry(table.entry)) {
      if (isFieldIn(table.entry.field, filteredFields)) {
        entry = new EEntry(table.entry.field);
      }
    } else if (isEEnum(table.entry)) {
      if (isFieldIn(table.entry.field, filteredFields)) {
        entry = new EEnum(table.entry.field);
      }
    }

    const uks = this.filterUniqueKeys(table, filteredFields);
    const meta = table.meta().copyWithoutState();

    return new TableSchema(
      table.name(),
      table.primaryKey.copy(),
      entry,
      table.isColumnMode,
      meta,
      filteredFields,
      [], // no foreign keys in phase 1
      uks,
    );
  }

  private tablePhase2_handleForeignKey(
    originalTable: TableSchema,
    table: TableSchema,
    phase1TableMap: Map<string, TableSchema>,
  ): TableSchema {
    const fks = this.filterForeignKeys(originalTable, table.fields(), phase1TableMap);

    return new TableSchema(
      table.name(),
      table.primaryKey,
      table.entry,
      table.isColumnMode,
      table.meta().copyWithoutState(),
      table.fields(),
      fks,
      table.uniqueKeys(),
    );
  }

  // -----------------------------------------------------------------------
  // Foreign key filtering
  // -----------------------------------------------------------------------

  private filterForeignKeys(
    originalStructural: Structural,
    filteredFields: FieldSchema[],
    phase1FilteredTableMap: Map<string, TableSchema>,
  ): ForeignKeySchema[] {
    const resultFks: ForeignKeySchema[] = [];
    for (const fk of originalStructural.foreignKeys()) {
      if (isKeyIn(fk.key, filteredFields)) {
        this.recordForeignKeyIfOk(resultFks, fk, originalStructural, phase1FilteredTableMap);
      }
    }
    return resultFks;
  }

  private recordForeignKeyIfOk(
    resultFks: ForeignKeySchema[],
    fk: ForeignKeySchema,
    structural: Structural,
    phase1TableMap: Map<string, TableSchema>,
  ): void {
    const err = this.isForeignKeyIn(structural, fk, phase1TableMap);
    switch (err) {
      case RefErr.OK:
        resultFks.push(fk.copy());
        break;
      case RefErr.TABLE_NOT_FOUND:
        this.errs.addWeakWarn(
          filterRefIgnoredByRefTableNotFound(
            structural.name(),
            fk.name,
            fk.refTable,
          ),
        );
        break;
      case RefErr.KEY_NOT_FOUND:
        this.errs.addWeakWarn(
          filterRefIgnoredByRefKeyNotFound(
            structural.name(),
            fk.name,
            fk.refTable,
            fk.refKey.keyNames(),
          ),
        );
        break;
    }
  }

  private isForeignKeyIn(
    structural: Structural,
    fk: ForeignKeySchema,
    phase1TableMap: Map<string, TableSchema>,
  ): RefErr {
    let refTable: TableSchema | undefined;

    // Search in namespace first
    const namespace = structural.namespace();
    if (namespace.length > 0) {
      const fullName = makeName(namespace, fk.refTable);
      refTable = phase1TableMap.get(fullName);
    }

    // Global search
    if (refTable === undefined) {
      refTable = phase1TableMap.get(fk.refTable);
    }

    if (refTable === undefined) {
      return RefErr.TABLE_NOT_FOUND;
    }

    if (isRefPrimary(fk.refKey)) {
      return RefErr.OK;
    }

    if (isRefUniq(fk.refKey)) {
      const uk = refTable.findUniqueKey(fk.refKey.key);
      if (uk !== null) {
        return RefErr.OK;
      } else {
        return RefErr.KEY_NOT_FOUND;
      }
    }

    // RefList
    if (isRefList(fk.refKey)) {
      const names = new Set<string>();
      for (const field of refTable.fields()) {
        names.add(field.name);
      }
      const allIn = fk.refKey.key.fields().every((name) => names.has(name));
      return allIn ? RefErr.OK : RefErr.KEY_NOT_FOUND;
    }

    return RefErr.OK; // unreachable
  }

  // -----------------------------------------------------------------------
  // Unique key filtering
  // -----------------------------------------------------------------------

  private filterUniqueKeys(table: TableSchema, ff: FieldSchema[]): KeySchema[] {
    const uks: KeySchema[] = [];
    for (const uk of table.uniqueKeys()) {
      if (isKeyIn(uk, ff)) {
        uks.push(uk.copy());
      }
    }
    return uks;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isFieldIn(name: string, filteredFields: FieldSchema[]): boolean {
  return filteredFields.some((f) => f.name === name);
}

function isKeyIn(key: KeySchema, filteredFields: FieldSchema[]): boolean {
  return key.fields().every((name) => isFieldIn(name, filteredFields));
}
