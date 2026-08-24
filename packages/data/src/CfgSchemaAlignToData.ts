/**
 * CfgSchemaAlignToData — TypeScript port of Java `configgen.data.CfgSchemaAlignToData`.
 *
 * Aligns a CfgSchema with CfgData:
 * - Existing tables: fields matched/added/removed based on data headers
 * - New tables: generated from data without a schema entry
 * - Enum tables: copied as-is (data comes from MetaEnumValues)
 * - Json tables: copied, error if Excel data also present
 * - Comment updates: trailing comment synced with header comment
 * - List/Map pattern matching: a1,a2,a3..→aList; a1,b1,a2,b2..→a2bMap
 * - ForeignKey/UniqueKey filtered when key fields removed
 *
 * Java record CfgSchemaAlignToData(HeadRow headRow) → TS class with constructor.
 */

import {
  CfgSchema,
  CfgSchemaErrs,
  TableSchema,
  FieldSchema,
  KeySchema,
  Metadata,
  Metadata_of,
  CommentData,
  ENo,
  EEntry,
  EEnum,
  isENo,
  isEEntry,
  isEEnum,
  Primitive,
  AutoOrPack,
  Fix,
  FList,
  FMap,
  isFList,
  isFMap,
  fieldSpan,
  simpleTypeSpan,
  CfgUtil,
  copyFieldType,
  type ForeignKeySchema,
  type Nameable,
  type Fieldable,
  type EntryType,
  type FieldType,
  type FieldFormat,
} from '@cfggen/schema';
import type { HeadRow } from './HeadRows';

// Error factory imports (functions from CfgSchemaErrs)
import {
  dataHeadNameNotIdentifier,
  dataHeadNameDuplicated,
  fieldHeaderSpanNotEnough,
  jsonTableNotSupportExcel,
  suggestTypeUnknown,
} from '@cfggen/schema';

// Data model imports
import type { DTable } from './DTable';
import type { DField } from './DField';
import type { CfgData } from './CfgData';
import type { DRawSheet } from './DRawSheet';

// Type guards for Nameable → Fieldable/TableSchema discrimination
function isFieldable(item: Nameable): item is Fieldable {
  return typeof (item as unknown as Fieldable).fmt === 'function'
    && typeof (item as unknown as Fieldable).meta === 'function'
    && typeof (item as unknown as Fieldable).fullName === 'function';
}

function isTableSchema(item: Nameable): item is TableSchema {
  return typeof (item as unknown as TableSchema).isJson === 'function'
    && typeof (item as unknown as TableSchema).primaryKey !== 'undefined';
}

export class CfgSchemaAlignToData {
  readonly headRow: HeadRow;

  constructor(headRow: HeadRow) {
    if (headRow === null || headRow === undefined) {
      throw new Error('headRow must not be null');
    }
    this.headRow = headRow;
  }

  /**
   * Align cfgSchema to cfgData.
   * @returns aligned CfgSchema (not resolved)
   */
  align(cfgSchema: CfgSchema, cfgData: CfgData, errs: CfgSchemaErrs): CfgSchema {
    const dTableMap = new Map<string, DTable>(
      [...cfgData.tables.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    );
    const alignedCfg = CfgSchema.of();

    for (const item of cfgSchema.items()) {
      if (isTableSchema(item)) {
        const table: TableSchema = item;
        const dTable = dTableMap.get(table.name());
        dTableMap.delete(table.name());

        // Schema enum doesn't need external data — data is auto-generated from MetaEnumValues
        if (table.meta().hasEnumValues()) {
          alignedCfg.add(table.copy());
          continue;
        }

        if (table.isJson()) {
          alignedCfg.add(table.copy());
          if (dTable !== undefined) {
            // Using json means can't use excel
            const sheets: string[] = [];
            for (const rawSheet of dTable.rawSheets) {
              sheets.push(`${rawSheet.relativeFilePath}[${rawSheet.sheetName}]`);
            }
            errs.addErr(jsonTableNotSupportExcel(table.name(), sheets));
          }
        } else {
          if (dTable !== undefined) {
            const alignedTable = this.alignTable(table, dTable.fields, errs);
            if (alignedTable !== null) {
              alignedCfg.add(alignedTable);
            }
          } else {
            // Table without data → removed
          }
        }
      } else {
        // Fieldable (struct/interface) → copy as-is
        alignedCfg.add(item.copy() as Nameable);
      }
    }

    // Generate new tables for data without schema
    for (const th of dTableMap.values()) {
      const newTable = this.newTableSchema(th, errs);
      if (newTable !== null) {
        alignedCfg.add(newTable);
      }
    }

    // Build index maps so findTable() works
    alignedCfg.buildIndexMaps();
    return alignedCfg;
  }

  private newTableSchema(th: DTable, errs: CfgSchemaErrs): TableSchema | null {
    const fields: FieldSchema[] = [];
    for (const hf of th.fields) {
      if (CfgUtil.isIdentifier(hf.name)) {
        const field = this.newFieldSchema(hf, th.tableName, errs);
        fields.push(field);
      } else {
        errs.addErr(dataHeadNameNotIdentifier(th.tableName, hf.name));
      }
    }

    if (fields.length === 0) {
      return null;
    }

    const first = fields[0].name;
    const primaryKey = new KeySchema([first]);

    const metadata = Metadata_of();
    const tag = th.nullableAddTag;
    if (tag !== null && tag.length > 0) {
      metadata.putTag(tag);
    }

    return new TableSchema(
      th.tableName,
      primaryKey,
      ENo.NO,
      false,
      metadata,
      fields,
      [],
      [],
    );
  }

  private newFieldSchema(hf: DField, tableName: string, errs: CfgSchemaErrs): FieldSchema {
    const meta = Metadata_of();
    if (hf.comment.length > 0) {
      meta.putComment(new CommentData('', hf.comment, null));
    }

    let type: FieldType;
    const typeStr = hf.suggestedType;
    if (typeStr !== null && typeStr.length > 0) {
      const parsed = this.headRow.parseType(typeStr);
      if (parsed === null || parsed === undefined) {
        errs.addWarn(suggestTypeUnknown(tableName, hf.name, typeStr));
        type = Primitive.STRING;
      } else {
        type = parsed;
      }
    } else {
      type = Primitive.STRING;
    }

    return new FieldSchema(hf.name, type, AutoOrPack.AUTO, meta);
  }

  private alignTable(
    table: TableSchema,
    header: DField[],
    errs: CfgSchemaErrs,
  ): TableSchema | null {
    const name = table.name();
    const fieldSchemas = this.alignFields(table, header, errs);
    if (Object.keys(fieldSchemas).length === 0) {
      return null;
    }

    // Primary key
    let primaryKey: KeySchema;
    if (!this.isKeyInSchemaList(table.primaryKey, fieldSchemas)) {
      const first = Object.keys(fieldSchemas)[0];
      primaryKey = new KeySchema([first]);
    } else {
      primaryKey = table.primaryKey.copy();
    }

    // Entry type
    let entry: EntryType = ENo.NO;
    if (isEEntry(table.entry)) {
      if (fieldSchemas[table.entry.field]) {
        entry = new EEntry(table.entry.field);
      }
    } else if (isEEnum(table.entry)) {
      if (fieldSchemas[table.entry.field]) {
        entry = new EEnum(table.entry.field);
      }
    }

    const isColumnMode = table.isColumnMode;
    const meta = table.meta().copy();
    const fields = Object.values(fieldSchemas);

    // Foreign keys — keep only if all key fields exist
    const fks: ForeignKeySchema[] = [];
    for (const fk of table.foreignKeys()) {
      if (this.isKeyInSchemaList(fk.key, fieldSchemas)) {
        fks.push(fk.copy());
      }
    }

    // Unique keys — keep only if all key fields exist
    const uks: KeySchema[] = [];
    for (const uk of table.uniqueKeys()) {
      if (this.isKeyInSchemaList(uk, fieldSchemas)) {
        uks.push(uk.copy());
      }
    }

    return new TableSchema(name, primaryKey, entry, isColumnMode, meta, fields, fks, uks);
  }

  private isKeyInSchemaList(key: KeySchema, fieldSchemas: Record<string, FieldSchema>): boolean {
    for (const k of key.fields()) {
      if (!fieldSchemas[k]) {
        return false;
      }
    }
    return true;
  }

  private alignFields(
    table: TableSchema,
    header: DField[],
    errs: CfgSchemaErrs,
  ): Record<string, FieldSchema> {
    // Build curFields map (preserves insertion order)
    const curFields: Record<string, FieldSchema> = {};
    for (const field of table.fields()) {
      curFields[field.name] = field;
    }

    const alignedFields: Record<string, FieldSchema> = {};
    let idx = 0;
    while (idx < header.length) {
      const hf = header[idx];
      const comment = hf.comment;

      const curField = this.findAndRemove(header, idx, curFields);
      if (curField !== null) {
        const span = fieldSpan(curField);
        const remain = header.length - idx;
        if (span > remain) {
          errs.addErr(fieldHeaderSpanNotEnough(
            table.name(),
            curField.name,
            span,
            remain,
          ));
          break;
        }
        idx += span;

        const fieldName = curField.name;
        const meta = curField.meta.copy();
        if (comment.length > 0 && !equalsIgnoreCase(comment, fieldName)) {
          const old = meta.getComment();
          const oldTrailing = old !== null ? old.trailing : '';
          if (comment !== oldTrailing) {
            const updated = old !== null
              ? new CommentData(old.leading, comment, old.suffix)
              : new CommentData('', comment, null);
            meta.putComment(updated);
          }
        } else {
          const old = meta.getComment();
          if (old !== null && old.trailing.length > 0) {
            const updated = new CommentData(old.leading, '', old.suffix);
            if (updated.encode().length === 0) {
              meta.removeComment();
            } else {
              meta.putComment(updated);
            }
          }
        }

        const newField = new FieldSchema(
          fieldName,
          copyFieldType(curField.type),
          curField.fmt,
          meta,
        );
        if (alignedFields[newField.name]) {
          errs.addErr(dataHeadNameDuplicated(table.name(), fieldName));
        }
        alignedFields[newField.name] = newField;
      } else {
        idx++;

        if (CfgUtil.isIdentifier(hf.name)) {
          const newField = this.newFieldSchema(hf, table.fullName(), errs);
          if (alignedFields[newField.name]) {
            errs.addErr(dataHeadNameDuplicated(table.name(), newField.name));
          }
          alignedFields[newField.name] = newField;
        } else {
          errs.addErr(dataHeadNameNotIdentifier(table.name(), hf.name));
        }
      }
    }

    // Removed fields (still in curFields) are silently dropped
    return alignedFields;
  }

  /**
   * Find and remove a field schema matching the header at the given index.
   * Supports list/map pattern matching:
   *   a1,a2,a3.. → aList (with Fix count)
   *   a1,b1,a2,b2.. → a2bMap (with Fix count)
   */
  private findAndRemove(
    headers: DField[],
    index: number,
    curFields: Record<string, FieldSchema>,
  ): FieldSchema | null {
    const name = headers[index].name;
    const fs = curFields[name];
    if (fs) {
      delete curFields[name];
      return fs;
    }

    // Pattern matching: a1,a2,a3.. → aList
    if (!name.endsWith('1')) {
      return null;
    }

    const nam = name.substring(0, name.length - 1);
    const listName = `${nam}List`;
    const listField = curFields[listName];

    if (listField
      && isFList(listField.type)
      && simpleTypeSpan(listField.type.item) === 1
      && listField.fmt instanceof Fix
      && headers.length > index + listField.fmt.count - 1) {

      const count = listField.fmt.count;
      let ok = true;
      for (let i = 2; i <= count; i++) {
        if (headers[index + i - 1].name !== `${nam}${i}`) {
          ok = false;
          break;
        }
      }
      if (ok) {
        delete curFields[listName];
        return listField;
      }
    }

    // Pattern matching: a1,b1,a2,b2.. → a2bMap
    if (headers.length <= index + 1) {
      return null;
    }
    const name2 = headers[index + 1].name;
    if (!name2.endsWith('1')) {
      return null;
    }
    const nam2 = name2.substring(0, name2.length - 1);
    const mapName = `${nam}2${nam2}Map`;
    const mapField = curFields[mapName];

    if (mapField
      && isFMap(mapField.type)
      && simpleTypeSpan(mapField.type.key) === 1
      && simpleTypeSpan(mapField.type.value) === 1
      && mapField.fmt instanceof Fix
      && headers.length > index + mapField.fmt.count * 2 - 1) {

      const count = mapField.fmt.count;
      let ok = true;
      for (let i = 2; i <= count; i++) {
        if (headers[index + (i - 1) * 2].name !== `${nam}${i}`) {
          ok = false;
          break;
        }
        if (headers[index + (i - 1) * 2 + 1].name !== `${nam2}${i}`) {
          ok = false;
          break;
        }
      }
      if (ok) {
        delete curFields[mapName];
        return mapField;
      }
    }

    return null;
  }
}

// ---------------------------------------------------------------------------
// Helper: equalsIgnoreCase
// ---------------------------------------------------------------------------

function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
