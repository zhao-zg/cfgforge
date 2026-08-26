/**
 * CfgWriter — TypeScript port of Java `configgen.schema.cfg.CfgWriter`.
 *
 * Serializes a CfgSchema model back to CFG text format.
 * Supports round-trip: CfgReader.parse(src) → CfgWriter.stringify → identical schema.
 *
 * Options:
 * - useLastName: use last name segment instead of full name
 * - includeMetaStartWith_: include internal metadata tags starting with '_'
 */

import type { CfgSchema } from '../CfgSchema';
import type { Nameable } from '../Nameable';
import { StructSchema } from '../StructSchema';
import { TableSchema } from '../TableSchema';
import { InterfaceSchema } from '../InterfaceSchema';
import type { FieldSchema } from '../FieldSchema';
import type { ForeignKeySchema } from '../ForeignKeySchema';
import type { KeySchema } from '../KeySchema';
import type { Structural } from '../Structural';
import type { FieldType, SimpleType } from '../FieldType';
import { Primitive, FList, FMap, isStructRef } from '../FieldType';
import type { FieldFormat } from '../FieldFormat';
import type { Metadata, MetaValue } from '../Metadata';
import { Metadata_of } from '../Metadata';
import {
  isMetaTag, isMetaInt, isMetaFloat, isMetaStr,
} from '../Metadata';
import { CommentData } from '../CommentData';
import { isRefPrimary, isRefUniq, isRefList } from '../RefKey';
import type { MetaEnumValues } from '../Metadata';

// ---------------------------------------------------------------------------
// CfgWriter
// ---------------------------------------------------------------------------

export class CfgWriter {
  private readonly destination: string[] = [];
  private readonly useLastName: boolean;
  private readonly includeMetaStartWith_: boolean;

  /**
   * Stringify a CfgSchema to CFG text.
   * Default: useFullName=false, includeMetaStartWith_=false
   */
  static stringify(cfg: CfgSchema): string {
    return CfgWriter.stringifyWithOptions(cfg, false, false);
  }

  /**
   * Stringify with options.
   * @param useLastName Use last name segment instead of full name
   * @param includeMetaStartWith_ Include internal metadata tags starting with '_'
   */
  static stringifyWithOptions(
    cfg: CfgSchema,
    useLastName: boolean,
    includeMetaStartWith_: boolean,
  ): string {
    const writer = new CfgWriter(useLastName, includeMetaStartWith_);
    writer.writeCfg(cfg, '');
    return writer.destination.join('');
  }

  /**
   * Stringify a single Nameable (struct/interface/table) to CFG text.
   * Used by genbyai TableRelatedInfoFinder.findRelatedCfgStr.
   */
  static stringifyNamable(item: Nameable): string {
    const writer = new CfgWriter(false, false);
    writer.writeNamable(item, '');
    return writer.destination.join('');
  }

  private constructor(useLastName: boolean, includeMetaStartWith_: boolean) {
    this.useLastName = useLastName;
    this.includeMetaStartWith_ = includeMetaStartWith_;
  }

  // ---- Main entry point ----

  private writeCfg(cfg: CfgSchema, prefix: string): void {
    for (const item of cfg.items()) {
      this.writeNamable(item, prefix);
    }

    // Write file end comments (default package name "")
    const endComment = cfg.getFileEndComment('');
    if (endComment.length > 0) {
      const lines = endComment.split('\n');
      for (let line of lines) {
        line = line.trim();
        if (line.length > 0) {
          this.printlnStr(`${prefix}// ${line}`);
        }
      }
    }
  }

  private writeNamable(item: Nameable, prefix: string): void {
    if (item instanceof StructSchema) {
      this.writeStruct(item, prefix, false);
    } else if (item instanceof InterfaceSchema) {
      this.writeInterface(item, prefix);
    } else if (item instanceof TableSchema) {
      const enumValues = item.meta().getEnumValues();
      if (enumValues !== null) {
        this.writeEnum(item, enumValues, prefix);
      } else {
        this.writeTable(item, prefix);
      }
    }
  }

  // ---- Table ----

  private writeTable(table: TableSchema, prefix: string): void {
    const meta = table.meta().copy();
    if (table.isColumnMode) {
      meta.putColumnMode();
    }
    meta.putEntry(table.entry);

    let comment = meta.removeComment();
    if (comment === null) comment = new CommentData('', '', '');
    this.writeLeadingComment(comment, prefix);

    const name = this.useLastName ? table.lastName() : table.name();
    this.printlnStr(
      `${prefix}table ${name}${CfgWriter.keyStr(table.primaryKey)}${this.metadataStr(meta)} {${comment.formatTrailing()}`,
    );

    for (const keySchema of table.uniqueKeys()) {
      this.printlnStr(`${prefix}\t${CfgWriter.keyStr(keySchema)};`);
    }

    this.writeStructural(table, prefix);

    this.writeSuffixComment(comment, prefix);

    this.printlnStr(`${prefix}}`);
    this.println();
  }

  // ---- Enum ----

  private writeEnum(table: TableSchema, enumValues: MetaEnumValues, prefix: string): void {
    const meta = table.meta().copy();
    meta.removeEnumValues();

    let comment = meta.removeComment();
    if (comment === null) comment = new CommentData('', '', '');
    this.writeLeadingComment(comment, prefix);

    const name = this.useLastName ? table.lastName() : table.name();
    this.printlnStr(
      `${prefix}enum ${name}${this.metadataStr(meta)} {${comment.formatTrailing()}`,
    );

    if (enumValues._tag === 'OfEmpty') {
      for (const ev of enumValues.values) {
        const valueComment = ev.comment.length > 0 ? ` // ${ev.comment}` : '';
        this.printlnStr(`${prefix}\t${ev.name};${valueComment}`);
      }
    } else {
      // OfAssigned
      for (const ev of enumValues.values) {
        const valueComment = ev.comment.length > 0 ? ` // ${ev.comment}` : '';
        this.printlnStr(`${prefix}\t${ev.name} = ${ev.number};${valueComment}`);
      }
    }

    this.writeSuffixComment(comment, prefix);

    this.printlnStr(`${prefix}}`);
    this.println();
  }

  // ---- Interface ----

  private writeInterface(sInterface: InterfaceSchema, prefix: string): void {
    const meta = sInterface.meta().copy();
    meta.putFmt(sInterface.fmt());
    if (sInterface.defaultImpl().length > 0) {
      meta.putDefaultImpl(sInterface.defaultImpl());
    }
    if (sInterface.enumRef().length > 0) {
      meta.putEnumRef(sInterface.enumRef());
    }

    let comment = meta.removeComment();
    if (comment === null) comment = new CommentData('', '', '');
    this.writeLeadingComment(comment, prefix);

    const name = this.useLastName ? sInterface.lastName() : sInterface.name();
    this.printlnStr(
      `${prefix}interface ${name}${this.metadataStr(meta)} {${comment.formatTrailing()}`,
    );

    const impls = sInterface.impls();
    for (let i = 0; i < impls.length; i++) {
      const noLineSeparator = impls.length === i + 1;
      this.writeStruct(impls[i], prefix + '\t', noLineSeparator);
    }

    this.writeSuffixComment(comment, prefix);

    this.printlnStr(`${prefix}}`);
    this.println();
  }

  // ---- Struct ----

  private writeStruct(struct: StructSchema, prefix: string, noLineSeparator: boolean): void {
    const meta = struct.meta().copy();
    meta.putFmt(struct.fmt());

    let comment = meta.removeComment();
    if (comment === null) comment = new CommentData('', '', '');
    this.writeLeadingComment(comment, prefix);

    const name = this.useLastName ? struct.lastName() : struct.name();
    this.printlnStr(
      `${prefix}struct ${name}${this.metadataStr(meta)} {${comment.formatTrailing()}`,
    );
    this.writeStructural(struct, prefix);

    this.writeSuffixComment(comment, prefix);

    this.printlnStr(`${prefix}}`);
    if (!noLineSeparator) {
      this.println();
    }
  }

  // ---- Structural (fields + foreign keys) ----

  private writeStructural(structural: Structural, prefix: string): void {
    for (const f of structural.fields()) {
      const meta = f.meta.copy();
      meta.putFmt(f.fmt);

      const fk = structural.findForeignKey(f.name);

      const typeStr = CfgWriter.typeStr(f);
      // (f.name and f.meta are properties, not methods, on FieldSchema)

      let fkStr = '';
      if (fk !== null && !fk.meta.isFromEnumType()) {
        fkStr = this.foreignStr(fk);
      }

      if (fk !== null) {
        this.foreignToMeta(fk, meta);
      }

      let comment = meta.removeComment();
      if (comment === null) comment = new CommentData('', '', '');
      this.writeLeadingComment(comment, prefix + '\t');
      this.printlnStr(
        `${prefix}\t${f.name}:${typeStr}${fkStr}${this.metadataStr(meta)};${comment.formatTrailing()}`,
      );
    }

    for (const fk of structural.foreignKeys()) {
      // Skip fromEnumType foreign keys (already handled in field) and field-named foreign keys
      if (fk.meta.isFromEnumType()) {
        continue;
      }
      if (structural.findField(fk.name) !== null) {
        // fk.name is a property on ForeignKeySchema
        continue;
      }

      const meta = fk.meta.copy();
      this.foreignToMeta(fk, meta);

      let comment = meta.removeComment();
      if (comment === null) comment = new CommentData('', '', '');
      this.writeLeadingComment(comment, prefix + '\t');
      this.printlnStr(
        `${prefix}\t->${fk.name}:${CfgWriter.keyStr(fk.key)}${this.foreignStr(fk)}${this.metadataStr(meta)};${comment.formatTrailing()}`,
      );
    }
  }

  // ---- Comment helpers ----

  private writeLeadingComment(cd: CommentData, prefix: string): void {
    const leadingComment = cd.formatLeading(prefix);
    if (leadingComment.length > 0) {
      this.destination.push(leadingComment);
    }
  }

  private writeSuffixComment(cd: CommentData, prefix: string): void {
    const suffixComment = cd.formatSuffix(prefix);
    if (suffixComment.length > 0) {
      this.destination.push(suffixComment);
    }
  }

  // ---- Print helpers ----

  private printlnStr(s: string): void {
    this.destination.push(s);
    this.println();
  }

  private println(): void {
    this.destination.push('\n');
  }

  // =========================================================================
  // Public static helpers (matching Java CfgWriter static methods)
  // =========================================================================

  static typeStr(f: FieldSchema): string {
    return CfgWriter.typeStrInternal(f.type, f);
  }

  static simpleTypeStr(t: SimpleType): string {
    if (t === Primitive.STRING) return 'str';
    if (typeof t === 'string') return t; // BOOL, INT, LONG, FLOAT, TEXT
    return t.name; // StructRef
  }

  static typeStrWithFullName(t: FieldType): string {
    if (t === Primitive.STRING) return 'str';
    if (typeof t === 'string') return t; // other primitives
    if (isStructRef(t)) return t.obj ? t.obj.fullName() : t.name;
    if (t instanceof FList) return `list<${CfgWriter.typeStrWithFullName(t.item)}>`;
    if (t instanceof FMap) {
      return `map<${CfgWriter.typeStrWithFullName(t.key)},${CfgWriter.typeStrWithFullName(t.value)}>`;
    }
    return String(t);
  }

  static fmtStr(fmt: FieldFormat): string {
    const meta = Metadata_of();
    meta.putFmt(fmt);
    const entries = Array.from(meta.data().entries());
    if (entries.length > 0) {
      return CfgWriter.metaEntryStr(entries[0][0], entries[0][1]);
    }
    return '';
  }

  static keyStr(key: KeySchema): string {
    return `[${key.fields().join(',')}]`;
  }

  // =========================================================================
  // Private static helpers
  // =========================================================================

  private static typeStrInternal(nullableType: FieldType, f: FieldSchema): string {
    const type = nullableType;
    if (type === Primitive.STRING) {
      const s = f.meta.getFromEnumType();
      return s !== null ? s : 'str';
    }
    if (typeof type === 'string') {
      return type; // BOOL='bool', INT='int', LONG='long', FLOAT='float', TEXT='text'
    }
    if (isStructRef(type)) {
      return type.name;
    }
    if (type instanceof FList) {
      return `list<${CfgWriter.typeStrInternal(type.item, f)}>`;
    }
    if (type instanceof FMap) {
      return `map<${CfgWriter.simpleTypeStr(type.key)},${CfgWriter.typeStrInternal(type.value, f)}>`;
    }
    return String(type);
  }

  private foreignToMeta(fk: ForeignKeySchema, meta: Metadata): void {
    if (isRefPrimary(fk.refKey)) {
      if (fk.refKey.nullable) {
        meta.putNullable();
      }
    }
    // RefUniq: nullable is not stored in meta (it's in the refKey)
    // Actually, looking at Java: RefSimple.nullable() → putNullable
    // RefUniq implements RefSimple, so nullable should be put
    if (isRefUniq(fk.refKey)) {
      if (fk.refKey.nullable) {
        meta.putNullable();
      }
    }
    // RefList: nothing to add
  }

  private foreignStr(fk: ForeignKeySchema): string {
    if (isRefPrimary(fk.refKey)) {
      return ` ->${fk.refTable}`;
    }
    if (isRefUniq(fk.refKey)) {
      return ` ->${fk.refTable}${CfgWriter.keyStr(fk.refKey.key)}`;
    }
    if (isRefList(fk.refKey)) {
      return ` =>${fk.refTable}${CfgWriter.keyStr(fk.refKey.key)}`;
    }
    return '';
  }

  private metadataStr(meta: Metadata): string {
    if (meta.data().size === 0) {
      return '';
    }

    let m: Metadata;
    if (this.includeMetaStartWith_) {
      m = meta;
    } else {
      m = Metadata_of();
      for (const [k, v] of meta.data()) {
        if (!k.startsWith('_')) {
          m.data().set(k, v);
        }
      }
      if (m.data().size === 0) {
        return '';
      }
    }

    const list: string[] = [];
    for (const [k, v] of m.data()) {
      list.push(CfgWriter.metaEntryStr(k, v));
    }
    return ` (${list.join(', ')})`;
  }

  private static metaEntryStr(k: string, v: MetaValue): string {
    if (isMetaTag(v)) {
      return k;
    }
    if (isMetaInt(v)) {
      return `${k}=${v.value}`;
    }
    if (isMetaFloat(v)) {
      return `${k}=${v.value}`;
    }
    if (isMetaStr(v)) {
      return `${k}='${v.value}'`;
    }
    // MetaEnumValues and MetaComment are not written via metadataStr
    return '';
  }
}
