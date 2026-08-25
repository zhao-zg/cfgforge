/**
 * SchemaService — TypeScript port of Java `configgen.editorserver.SchemaService`.
 *
 * Converts a CfgValue (schema + values) into a RawSchema matching the
 * cfgeditor frontend's schemaModel.ts types:
 *
 *   RawSchema {
 *     isEditable: boolean;
 *     items: SItem[];            // SStruct | SInterface | STable
 *     lastModifiedMap: Map<string, Map<string, number>>;
 *   }
 *
 * Key differences from Java:
 * - HTTP serialization layer removed; returns plain TS objects directly.
 * - Java's `lastModifiedMap` is Map<String, Map<String, Long>>; the frontend
 *   expects number, so bigint values are converted with Number().
 * - Java uses `recordIds` from VTable.primaryKeyMap; implemented here.
 *
 * Java source: configgen.editorserver.SchemaService.java (214 lines)
 */

import type { CfgValue, VTable, VStruct } from '@cfggen/value';
import { ValueUtil, VString } from '@cfggen/value';
import {
  CfgSchema,
  CfgWriter,
  Nameable,
  FieldSchema,
  ForeignKeySchema,
  StructSchema,
  InterfaceSchema,
  TableSchema,
  isRefPrimary,
  isRefUniq,
  isRefList,
  isENo,
  isEEntry,
  isEEnum,
} from '@cfggen/schema';

// ---------------------------------------------------------------------------
// Types (mirror cfgeditor/src/api/schemaModel.ts)
// ---------------------------------------------------------------------------

export interface SField {
  name: string;
  type: string;
  comment: string;
}

export type SRefType = 'rPrimary' | 'rUniq' | 'rList' | 'rNullablePrimary' | 'rNullableUniq';

export interface SForeignKey {
  name: string;
  keys: string[];
  refTable: string;
  refType: SRefType;
  refKeys?: string[];
}

export interface SStruct {
  name: string;
  comment: string;
  type: 'struct';
  fields: SField[];
  foreignKeys?: SForeignKey[];
}

export interface SInterface {
  name: string;
  comment: string;
  type: 'interface';
  enumRef?: string;
  defaultImpl?: string;
  impls: SStruct[];
}

export type SEntryType = 'eNo' | 'eEnum' | 'eEntry';

export interface RecordId {
  id: string;
  title?: string;
}

export interface STable {
  name: string;
  comment: string;
  type: 'table';
  pk: string[];
  uks: string[][];
  entryType: SEntryType;
  entryField?: string;
  fields: SField[];
  foreignKeys?: SForeignKey[];
  recordIds: RecordId[];
}

export type SNameable = SStruct | SInterface | STable;

export interface RawSchema {
  isEditable: boolean;
  items: SNameable[];
  lastModifiedMap: Map<string, Map<string, number>>;
}

// ---------------------------------------------------------------------------
// SchemaService
// ---------------------------------------------------------------------------

export class SchemaService {
  private constructor() {}

  /**
   * Build a RawSchema from a CfgValue (schema + data + value stat).
   * Java: SchemaService.fromCfgValue.
   */
  static fromCfgValue(cfgValue: CfgValue): RawSchema {
    return {
      isEditable: !cfgValue.schema.isPartial(),
      items: cfgValue.schema.items().map((n) => SchemaService.fromNameable(n, cfgValue)),
      lastModifiedMap: SchemaService.toNumberMap(cfgValue.valueStat.getLastModifiedMap()),
    };
  }

  /**
   * Build a RawSchema from a CfgSchema (no value data — empty recordIds,
   * empty lastModifiedMap).
   * Java: SchemaService.fromCfgSchema.
   */
  static fromCfgSchema(cfgSchema: CfgSchema): RawSchema {
    return {
      isEditable: !cfgSchema.isPartial(),
      items: cfgSchema.items().map((n) => SchemaService.fromNameable(n, null)),
      lastModifiedMap: new Map(),
    };
  }

  // -------------------------------------------------------------------------
  // Nameable → SNameable
  // -------------------------------------------------------------------------

  private static fromNameable(n: Nameable, cfgValue: CfgValue | null): SNameable {
    if (n instanceof InterfaceSchema) return SchemaService.fromInterface(n);
    if (n instanceof StructSchema) return SchemaService.fromStruct(n);
    if (n instanceof TableSchema) return SchemaService.fromTable(n, cfgValue);
    // Unknown Nameable → treat as struct (should not happen)
    return SchemaService.fromStruct(n as unknown as StructSchema);
  }

  private static fromInterface(is: InterfaceSchema): SInterface {
    return {
      name: is.name(),
      comment: is.comment(),
      type: 'interface',
      enumRef: is.nullableEnumRefTable() !== null ? is.nullableEnumRefTable()!.name() : '',
      defaultImpl: is.defaultImpl(),
      impls: is.impls().map((s) => SchemaService.fromStruct(s)),
    };
  }

  private static fromStruct(ss: StructSchema): SStruct {
    return {
      name: ss.name(),
      comment: ss.comment(),
      type: 'struct',
      fields: SchemaService.fromFields(ss.fields()),
      foreignKeys: SchemaService.fromFks(ss.foreignKeys()),
    };
  }

  private static fromTable(ts: TableSchema, cfgValue: CfgValue | null): STable {
    let entryType: SEntryType;
    let entryField: string | undefined;
    if (isENo(ts.entry)) {
      entryType = 'eNo';
      entryField = undefined;
    } else if (isEEntry(ts.entry)) {
      entryType = 'eEntry';
      entryField = ts.entry.field;
    } else if (isEEnum(ts.entry)) {
      entryType = 'eEnum';
      entryField = ts.entry.field;
    } else {
      entryType = 'eNo';
      entryField = undefined;
    }

    const vTable = cfgValue !== null ? cfgValue.vTableMap.get(ts.name()) : undefined;
    const recordIds = SchemaService.getRecordIds(vTable);

    return {
      name: ts.name(),
      comment: ts.comment(),
      type: 'table',
      pk: ts.primaryKey.fields(),
      uks: ts.uniqueKeys().map((uk) => uk.fields()),
      entryType,
      entryField,
      fields: SchemaService.fromFields(ts.fields()),
      foreignKeys: SchemaService.fromFks(ts.foreignKeys()),
      recordIds,
    };
  }

  // -------------------------------------------------------------------------
  // recordIds
  // -------------------------------------------------------------------------

  private static getRecordIds(vTable: VTable | undefined): RecordId[] {
    if (vTable === undefined) {
      return [];
    }
    const recordIds: RecordId[] = [];
    for (const [pk, vStruct] of vTable.primaryKeyMap) {
      recordIds.push({
        id: pk.packStr(),
        title: SchemaService.getBriefTitle(vStruct),
      });
    }
    return recordIds;
  }

  /**
   * Brief title for a record: from meta 'title' field, and if the table is an
   * enum table whose primary key is not the enum field, prefix the enum value.
   * Java: RecordService.getBriefTitle.
   */
  static getBriefTitle(vStruct: VStruct): string | undefined {
    let title: string | undefined = undefined;
    const titleFieldName = vStruct.schema.meta().getStr('title', '');
    if (titleFieldName !== null && titleFieldName !== '') {
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

  // -------------------------------------------------------------------------
  // fields + foreign keys
  // -------------------------------------------------------------------------

  private static fromFields(fields: FieldSchema[]): SField[] {
    return fields.map((f) => ({
      name: f.name,
      type: CfgWriter.typeStrWithFullName(f.type),
      comment: f.comment(),
    }));
  }

  private static fromFks(fks: ForeignKeySchema[]): SForeignKey[] {
    const res: SForeignKey[] = [];
    for (const f of fks) {
      let refType: SRefType;
      let refKeys: string[] | undefined;
      if (isRefPrimary(f.refKey)) {
        refType = f.refKey.nullable ? 'rNullablePrimary' : 'rPrimary';
      } else if (isRefUniq(f.refKey)) {
        refType = f.refKey.nullable ? 'rNullableUniq' : 'rUniq';
        refKeys = f.refKey.keyNames();
      } else if (isRefList(f.refKey)) {
        refType = 'rList';
        refKeys = f.refKey.keyNames();
      } else {
        refType = 'rPrimary';
      }
      res.push({
        name: f.name,
        keys: f.key.fields(),
        refTable: f.refTableSchema() !== null ? f.refTableSchema()!.fullName() : f.refTable,
        refType,
        refKeys,
      });
    }
    return res;
  }

  // -------------------------------------------------------------------------
  // lastModifiedMap (bigint → number)
  // -------------------------------------------------------------------------

  private static toNumberMap(map: Map<string, Map<string, bigint>>): Map<string, Map<string, number>> {
    const res = new Map<string, Map<string, number>>();
    for (const [table, inner] of map) {
      const innerRes = new Map<string, number>();
      for (const [id, time] of inner) {
        innerRes.set(id, Number(time));
      }
      res.set(table, innerRes);
    }
    return res;
  }
}