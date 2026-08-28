/**
 * CfgReader — TypeScript port of Java `configgen.schema.cfg.CfgReader`.
 *
 * Reads CFG source text → Lexer → Parser → SchemaAst → Schema model objects.
 * Builds CfgSchema container with StructSchema/TableSchema/InterfaceSchema items.
 *
 * Also includes CommentUtil functionality (ported from Java CommentUtil.java).
 */

import { CfgParser } from './CfgParser.js';
import type {
  StructDeclAst, InterfaceDeclAst, TableDeclAst, EnumDeclAst,
  FieldDeclAst, ForeignDeclAst,
  FieldTypeAst, FieldTypeEleAst, MetadataAst, MetaValueAst,
  RefAst, KeyAst, CommentData as AstCommentData,
} from './AstNode.js';
import { CfgSchema } from '../CfgSchema.js';
import { StructSchema } from '../StructSchema.js';
import { TableSchema } from '../TableSchema.js';
import { InterfaceSchema } from '../InterfaceSchema.js';
import { FieldSchema } from '../FieldSchema.js';
import { ForeignKeySchema } from '../ForeignKeySchema.js';
import { KeySchema } from '../KeySchema.js';
import { RefPrimary, RefUniq, RefList } from '../RefKey.js';
import { EEnum } from '../EntryType.js';
import { Primitive, FList, FMap, StructRef } from '../FieldType.js';
import type { FieldType, SimpleType } from '../FieldType.js';
import { AutoOrPack } from '../FieldFormat.js';
import { Metadata, Metadata_of, metaInt, metaFloat, metaStr, TAG } from '../Metadata.js';
import type { MetaValue } from '../Metadata.js';
import { CommentData } from '../CommentData.js';

// ---------------------------------------------------------------------------
// CommentUtil (ported from Java CommentUtil.java)
// ---------------------------------------------------------------------------

/**
 * Build a CommentData from AST comment data.
 * Maps AST {leading, trailing, suffix} → CommentData(leading, trailing, suffix).
 */
function buildCommentData(astComment: AstCommentData): CommentData {
  return new CommentData(astComment.leading, astComment.trailing, astComment.suffix ?? '');
}

/**
 * Decode a raw encoded comment string back into CommentData.
 * Ported from Java CommentUtil.decode().
 */
export function decodeComment(raw: string | null): CommentData {
  if (raw === null || raw.trim().length === 0) {
    return new CommentData('', '', '');
  }

  // Split suffix with DELIMITER2 ("<<<")
  let mainPart: string;
  let suffix: string;
  const idx2 = raw.indexOf(CommentData.DELIMITER2);
  if (idx2 >= 0) {
    mainPart = raw.substring(0, idx2);
    suffix = raw.substring(idx2 + CommentData.DELIMITER2.length);
  } else {
    mainPart = raw;
    suffix = '';
  }

  // Split leading/trailing with DELIMITER1 (">>>")
  let leading: string;
  let trailing: string;
  const idx1 = mainPart.indexOf(CommentData.DELIMITER1);
  if (idx1 >= 0) {
    leading = mainPart.substring(0, idx1);
    trailing = mainPart.substring(idx1 + CommentData.DELIMITER1.length);
  } else {
    // Heuristic: if contains \n, it's leading; otherwise trailing
    if (mainPart.includes('\n')) {
      leading = mainPart;
      if (leading.endsWith('\n')) {
        const maybeLeading = leading.substring(0, leading.length - 1);
        if (!maybeLeading.includes('\n')) {
          leading = maybeLeading;
        }
      }
      trailing = '';
    } else {
      leading = '';
      trailing = mainPart;
    }
  }

  return new CommentData(leading, trailing, suffix);
}

// ---------------------------------------------------------------------------
// CfgReader
// ---------------------------------------------------------------------------

export class CfgReader {
  /**
   * Parse a CFG source string into a CfgSchema.
   * Convenience static method.
   */
  static parse(cfgStr: string): CfgSchema {
    return new CfgReader().readCfgSchema(cfgStr, '', '<>');
  }

  /**
   * Parse a CFG source string with a package name prefix.
   */
  read(cfgStr: string, pkgNameDot: string = '', fromCfgFilePath: string = '<>'): CfgSchema {
    return this.readCfgSchema(cfgStr, pkgNameDot, fromCfgFilePath);
  }

  /**
   * Core: parse CFG source string → SchemaAst → CfgSchema.
   */
  private readCfgSchema(cfgStr: string, pkgNameDot: string, fromCfgFilePath: string): CfgSchema {
    const ast = CfgParser.parse(cfgStr);
    const schema = CfgSchema.of();

    for (const element of ast.elements) {
      switch (element.kind) {
        case 'struct':
          schema.add(this.readStruct(element, pkgNameDot));
          break;
        case 'interface':
          schema.add(this.readInterface(element, pkgNameDot));
          break;
        case 'table':
          schema.add(this.readTable(element, pkgNameDot, fromCfgFilePath));
          break;
        case 'enum':
          schema.add(this.readEnum(element, pkgNameDot));
          break;
      }
    }

    // Store file end comments
    const fileEndComment = extractSuffixComments(ast.suffixComments);
    if (fileEndComment.length > 0) {
      schema.setFileEndComment(pkgNameDot, fileEndComment);
    }

    return schema;
  }

  // ---- Struct ----

  private readStruct(ctx: StructDeclAst, pkgNameDot: string): StructSchema {
    const name = ctx.name;
    const fullComment = buildCommentData(ctx.comment);
    const meta = this.readMetadata(ctx.metadata);
    if (fullComment.encode().length > 0) {
      meta.putComment(fullComment);
    }

    const fmt = meta.removeFmt();
    const { fieldSchemas, foreignKeySchemas } = this.readStructSpec(ctx.fields, ctx.foreignKeys);
    return new StructSchema(pkgNameDot + name, fmt, meta, fieldSchemas, foreignKeySchemas);
  }

  // ---- Interface ----

  private readInterface(ctx: InterfaceDeclAst, pkgNameDot: string): InterfaceSchema {
    const name = ctx.name;
    const fullComment = buildCommentData(ctx.comment);
    const meta = this.readMetadata(ctx.metadata);
    if (fullComment.encode().length > 0) {
      meta.putComment(fullComment);
    }

    const enumRef = meta.removeEnumRef();
    const defaultImpl = meta.removeDefaultImpl();
    const fmt = meta.removeFmt();

    const structSchemas = ctx.structs.map(sc => this.readStruct(sc, ''));
    return new InterfaceSchema(pkgNameDot + name, enumRef, defaultImpl, fmt, meta, structSchemas);
  }

  // ---- Table ----

  private readTable(ctx: TableDeclAst, pkgNameDot: string, fromCfgFilePath: string): TableSchema {
    const name = ctx.name;
    const primaryKey = this.readKey(ctx.primaryKey);

    const fullComment = buildCommentData(ctx.comment);
    const meta = this.readMetadata(ctx.metadata);
    meta.putFromCfgFilepath(fromCfgFilePath);
    if (fullComment.encode().length > 0) {
      meta.putComment(fullComment);
    }

    const entry = meta.removeEntry();
    const isColumnMode = meta.removeColumnMode();
    const { fieldSchemas, foreignKeySchemas } = this.readStructSpec(ctx.fields, ctx.foreignKeys);

    const uniqueKeys = ctx.uniqueKeys.map(kd => this.readKey(kd.key));

    return new TableSchema(
      pkgNameDot + name,
      primaryKey,
      entry,
      isColumnMode,
      meta,
      fieldSchemas,
      foreignKeySchemas,
      uniqueKeys,
    );
  }

  // ---- Enum ----

  private readEnum(ctx: EnumDeclAst, pkgNameDot: string): TableSchema {
    const name = ctx.name;
    const fullComment = buildCommentData(ctx.comment);
    const meta = this.readMetadata(ctx.metadata);
    if (fullComment.encode().length > 0) {
      meta.putComment(fullComment);
    }

    if (ctx.enumValuesAssigned.length > 0) {
      // Assigned enum
      const enumValues: { name: string; comment: string; number: number }[] = [];
      for (const evc of ctx.enumValuesAssigned) {
        const valueName = evc.name;
        const valueComment = buildCommentData(evc.comment).encode();
        const number = evc.number;
        enumValues.push({ name: valueName, comment: valueComment, number });
      }
      meta.putEnumValues({
        _tag: 'OfAssigned',
        values: enumValues,
      });

      return new TableSchema(
        pkgNameDot + name,
        new KeySchema(['name']),
        new EEnum('name'),
        false,
        meta,
        [
          new FieldSchema('name', Primitive.STRING, AutoOrPack.AUTO, Metadata_of()),
          new FieldSchema('id', Primitive.INT, AutoOrPack.AUTO, Metadata_of()),
          new FieldSchema('comment', Primitive.TEXT, AutoOrPack.AUTO, Metadata_of()),
        ],
        [],
        [new KeySchema(['id'])],
      );
    } else {
      // Empty enum
      const enumValues: { name: string; comment: string }[] = [];
      for (const evc of ctx.enumValuesEmpty) {
        const valueName = evc.name;
        const valueComment = buildCommentData(evc.comment).encode();
        enumValues.push({ name: valueName, comment: valueComment });
      }
      meta.putEnumValues({
        _tag: 'OfEmpty',
        values: enumValues,
      });

      return new TableSchema(
        pkgNameDot + name,
        new KeySchema(['name']),
        new EEnum('name'),
        false,
        meta,
        [
          new FieldSchema('name', Primitive.STRING, AutoOrPack.AUTO, Metadata_of()),
          new FieldSchema('comment', Primitive.TEXT, AutoOrPack.AUTO, Metadata_of()),
        ],
        [],
        [],
      );
    }
  }

  // ---- StructSpec (fields + foreign keys) ----

  private readStructSpec(
    fieldDecls: FieldDeclAst[],
    foreignDecls: ForeignDeclAst[],
  ): { fieldSchemas: FieldSchema[]; foreignKeySchemas: ForeignKeySchema[] } {
    const fieldSchemas: FieldSchema[] = [];
    const foreignKeySchemas: ForeignKeySchema[] = [];

    for (const ctx of fieldDecls) {
      const name = ctx.name;
      const type = this.readType(ctx.type);
      const comment = buildCommentData(ctx.comment);
      const meta = this.readMetadata(ctx.metadata);
      if (comment.encode().length > 0) {
        meta.putComment(comment);
      }

      const fmt = meta.removeFmt();
      const fieldSchema = new FieldSchema(name, type, fmt, meta);
      fieldSchemas.push(fieldSchema);

      if (ctx.ref) {
        const localKey = new KeySchema([name]);
        const nullable = meta.removeNullable();
        const refMeta = meta.copy();
        refMeta.removeComment();
        const fk = this.readRef(ctx.ref, name, localKey, refMeta, nullable);
        foreignKeySchemas.push(fk);
      }
    }

    for (const ctx of foreignDecls) {
      const name = ctx.name;
      const localKey = this.readKey(ctx.localKey);
      const comment = buildCommentData(ctx.comment);
      const meta = this.readMetadata(ctx.metadata);
      if (comment.encode().length > 0) {
        meta.putComment(comment);
      }

      const nullable = meta.removeNullable();
      const fk = this.readRef(ctx.ref, name, localKey, meta, nullable);
      foreignKeySchemas.push(fk);
    }

    return { fieldSchemas, foreignKeySchemas };
  }

  // ---- Type reading ----

  private readType(ctx: FieldTypeAst): FieldType {
    switch (ctx.kind) {
      case 'list':
        return new FList(this.readTypeEle(ctx.elementType));
      case 'map':
        return new FMap(this.readTypeEle(ctx.keyType), this.readTypeEle(ctx.valueType));
      case 'primitive':
        return this.readPrimitive(ctx.name);
      case 'structRef':
        return new StructRef(ctx.namespace);
      default:
        throw new Error(`Unknown type kind: ${(ctx as { kind: string }).kind}`);
    }
  }

  private readTypeEle(ctx: FieldTypeEleAst): SimpleType {
    switch (ctx.kind) {
      case 'primitive':
        return this.readPrimitive(ctx.name);
      case 'structRef':
        return new StructRef(ctx.namespace);
      default:
        throw new Error(`Unknown type ele kind: ${(ctx as { kind: string }).kind}`);
    }
  }

  private readPrimitive(name: string): Primitive {
    const upper = name.toUpperCase();
    switch (upper) {
      case 'BOOL': return Primitive.BOOL;
      case 'INT': return Primitive.INT;
      case 'LONG': return Primitive.LONG;
      case 'FLOAT': return Primitive.FLOAT;
      case 'STR': return Primitive.STRING;
      case 'STRING': return Primitive.STRING;
      case 'TEXT': return Primitive.TEXT;
      default:
        throw new Error(`Unknown primitive type: ${name}`);
    }
  }

  // ---- Ref reading ----

  private readRef(
    ctx: RefAst,
    name: string,
    localKey: KeySchema,
    meta: Metadata,
    nullable: boolean,
  ): ForeignKeySchema {
    const refTable = ctx.refTable;
    let refKey: RefPrimary | RefUniq | RefList;
    let remoteKey: KeySchema | null = null;

    if (ctx.remoteKey) {
      remoteKey = new KeySchema([...ctx.remoteKey]);
    }

    if (remoteKey === null) {
      refKey = new RefPrimary(nullable);
    } else if (!ctx.isListRef) {
      refKey = new RefUniq(remoteKey, nullable);
    } else {
      refKey = new RefList(remoteKey);
    }

    return new ForeignKeySchema(name, localKey, refTable, refKey, meta);
  }

  // ---- Key reading ----

  private readKey(ctx: KeyAst): KeySchema {
    return new KeySchema([...ctx.names]);
  }

  // ---- Metadata reading ----

  private readMetadata(ctx: MetadataAst): Metadata {
    const meta = Metadata_of();
    for (const entry of ctx.entries) {
      if ('isMinus' in entry && entry.isMinus) {
        // Parser already prepends '-' to the key for minus idents (see parseIdentWithOptSingleValue)
        meta.data().set(entry.key, TAG);
      } else {
        const k = entry.key;
        const val = (entry as { key: string; value: MetaValueAst | null }).value;
        if (val === null) {
          meta.data().set(k, TAG);
        } else {
          meta.data().set(k, this.readMetaValue(val));
        }
      }
    }
    return meta;
  }

  private readMetaValue(val: MetaValueAst): MetaValue {
    switch (val.kind) {
      case 'int':
        return metaInt(val.value);
      case 'float':
        return metaFloat(val.value);
      case 'string':
        return metaStr(val.value);
      case 'bool':
        return metaStr(val.value);
      default:
        throw new Error(`Unknown meta value kind: ${(val as { kind: string }).kind}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractSuffixComments(comments: { value: string }[]): string {
  if (!comments || comments.length === 0) return '';
  const parts: string[] = [];
  for (const c of comments) {
    let text = c.value;
    if (text.startsWith('//')) {
      text = text.substring(2).trim();
      if (text) parts.push(text);
    }
  }
  return parts.join('\n');
}
