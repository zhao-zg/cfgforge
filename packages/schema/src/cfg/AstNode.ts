/**
 * AST Node Definitions for CFG Parser
 *
 * These are the raw parse tree nodes produced by the recursive descent parser.
 * They are later transformed into Schema model objects (StructSchema, TableSchema, etc.)
 * in CfgReader (T2.6).
 *
 * The AST faithfully represents the CFG grammar structure, including comments.
 */

import { TokenType, Token } from './CfgLexer';

// ---- Comment Data ----

export interface CommentData {
  leading: string;    // comments before the declaration
  trailing: string;   // inline comment on the same line (from LC_COMMENT or SEMI_COMMENT)
  suffix: string | null; // comments after the closing brace (suffix_comment in g4)
}

export function emptyComment(): CommentData {
  return { leading: '', trailing: '', suffix: null };
}

export function commentFromLeadingTrailing(leadingComments: Token[], trailingToken: Token | null): CommentData {
  const leading = extractLeadingComment(leadingComments);
  const trailing = extractTrailingComment(trailingToken);
  return { leading, trailing, suffix: null };
}

export function commentFromFull(
  leadingComments: Token[],
  trailingToken: Token | null,
  suffixComments: Token[]
): CommentData {
  const leading = extractLeadingComment(leadingComments);
  const trailing = extractTrailingComment(trailingToken);
  const suffix = extractSuffixComment(suffixComments);
  return { leading, trailing, suffix: suffix || null };
}

function extractLeadingComment(comments: Token[]): string {
  if (!comments || comments.length === 0) return '';
  const parts: string[] = [];
  for (const c of comments) {
    // COMMENT token value is like "// text"
    let text = c.value;
    if (text.startsWith('//')) {
      text = text.substring(2).trim();
      if (text) parts.push(text);
    }
  }
  return parts.join('\n');
}

function extractTrailingComment(token: Token | null): string {
  if (!token) return '';
  const text = token.value;
  const idx = text.indexOf('//');
  if (idx >= 0) {
    return text.substring(idx + 2).trim();
  }
  return '';
}

function extractSuffixComment(comments: Token[]): string {
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

// ---- Type System AST ----

export type FieldTypeAst =
  | { kind: 'primitive'; name: string }
  | { kind: 'structRef'; namespace: string }
  | { kind: 'list'; elementType: FieldTypeEleAst }
  | { kind: 'map'; keyType: FieldTypeEleAst; valueType: FieldTypeEleAst };

export type FieldTypeEleAst =
  | { kind: 'primitive'; name: string }
  | { kind: 'structRef'; namespace: string };

// ---- Metadata AST ----

export type MetaValueAst =
  | { kind: 'int'; value: number }
  | { kind: 'float'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'bool'; value: string }; // "true" or "false"

export type MetaEntryAst =
  | { key: string; value: MetaValueAst | null }  // key with optional value
  | { key: string; isMinus: true };              // -tag (minus_ident)

export interface MetadataAst {
  entries: MetaEntryAst[];
}

// ---- Ref AST ----

export interface RefAst {
  refTable: string;           // ns_ident
  remoteKey: string[] | null; // key (identifiers), null if not specified
  isListRef: boolean;         // true for =>, false for ->
}

export interface KeyAst {
  names: string[];  // identifiers
}

// ---- Declaration ASTs ----

export interface FieldDeclAst {
  name: string;
  type: FieldTypeAst;
  ref: RefAst | null;
  metadata: MetadataAst;
  comment: CommentData;
}

export interface ForeignDeclAst {
  name: string;
  localKey: KeyAst;
  ref: RefAst;
  metadata: MetadataAst;
  comment: CommentData;
}

export interface KeyDeclAst {
  key: KeyAst;
  comment: CommentData;
}

export interface EnumValueEmptyAst {
  name: string;
  comment: CommentData;
}

export interface EnumValueAssignedAst {
  name: string;
  number: number;
  comment: CommentData;
}

export interface StructDeclAst {
  kind: 'struct';
  name: string;          // ns_ident
  metadata: MetadataAst;
  comment: CommentData;  // leading + LC_COMMENT trailing + suffix
  fields: FieldDeclAst[];
  foreignKeys: ForeignDeclAst[];
}

export interface InterfaceDeclAst {
  kind: 'interface';
  name: string;          // ns_ident
  metadata: MetadataAst;
  comment: CommentData;
  structs: StructDeclAst[];
}

export interface TableDeclAst {
  kind: 'table';
  name: string;          // ns_ident
  primaryKey: KeyAst;
  metadata: MetadataAst;
  comment: CommentData;
  fields: FieldDeclAst[];
  foreignKeys: ForeignDeclAst[];
  uniqueKeys: KeyDeclAst[];
}

export interface EnumDeclAst {
  kind: 'enum';
  name: string;          // ns_ident
  metadata: MetadataAst;
  comment: CommentData;
  // Either all empty or all assigned (guaranteed by grammar)
  enumValuesEmpty: EnumValueEmptyAst[];
  enumValuesAssigned: EnumValueAssignedAst[];
}

// Root
export interface SchemaAst {
  elements: (StructDeclAst | InterfaceDeclAst | TableDeclAst | EnumDeclAst)[];
  suffixComments: Token[];  // comments at end of file
}
