export * from './cfg/CfgLexer.js';
export * from './cfg/AstNode.js';
export * from './cfg/CfgParser.js';
export * from './FieldType.js';
export * from './FieldFormat.js';
export type { Fieldable } from './Fieldable.js';
export type { Structural } from './Structural.js';
export type { Nameable } from './Nameable.js';
export { makeName, defaultNamespace, defaultLastName } from './Nameable.js';
export {
  Metadata,
  Metadata_of,
  MetaTag,
  TAG,
  metaInt,
  metaFloat,
  metaStr,
  metaComment,
  metaEnumValuesOfEmpty,
  metaEnumValuesOfAssigned,
  isMetaTag,
  isMetaInt,
  isMetaFloat,
  isMetaStr,
  isMetaComment,
  isMetaEnumValues,
} from './Metadata.js';
export type {
  MetaValue,
  MetaInt,
  MetaFloat,
  MetaStr,
  MetaComment,
  MetaEnumValues,
  MetaEnumValuesOfEmpty,
  MetaEnumValuesOfAssigned,
  EnumValueEmpty,
  EnumValueAssigned,
} from './Metadata.js';
export { KeySchema } from './KeySchema.js';
export { FieldSchema } from './FieldSchema.js';
export { ForeignKeySchema } from './ForeignKeySchema.js';
export type { EntryType } from './EntryType.js';
export { ENo, EEntry, EEnum, isENo, isEEntry, isEEnum } from './EntryType.js';
export type { RefKey, RefSimple } from './RefKey.js';
export { RefPrimary, RefUniq, RefList, isRefPrimary, isRefUniq, isRefList } from './RefKey.js';
export { StructSchema } from './StructSchema.js';
export { TableSchema } from './TableSchema.js';
export { InterfaceSchema } from './InterfaceSchema.js';
export { CfgSchema } from './CfgSchema.js';
export { CommentData } from './CommentData.js';
export { CfgReader } from './cfg/CfgReader.js';
export { decodeComment } from './cfg/CfgReader.js';
export { CfgWriter } from './cfg/CfgWriter.js';
// T2.21: re-export CfgSchemaErrs and all error factory functions/interfaces
export * from './CfgSchemaErrs.js';
// T2.12-T2.17: CfgSchemaResolver and related modules
export { CfgSchemaResolver } from './CfgSchemaResolver.js';
export * from './ForeachSchema.js';
export { findFieldIndices, findFieldIndex, findFieldIndexByName } from './FindFieldIndex.js';
export { checkAnyOk, findAllIncludedStructs } from './IncludedStructs.js';
export type { CheckResult } from './IncludedStructs.js';
export type { Checker } from './IncludedStructs.js';
export { preCalculateAllNeededSpans, span, fieldSpan, simpleTypeSpan } from './Span.js';
export { preCalculateAllHasRef, hasRef, hasRefFieldType } from './HasRef.js';
export { preCalculateAllHasBlock, hasBlock } from './HasBlock.js';
export { preCalculateAllHasMap, hasMap } from './HasMap.js';
export { preCalculateAllHasText, hasText } from './HasText.js';
export { walkBlockAncestors } from './BlockAncestorWalker.js';
export type { BlockFieldVisitor } from './BlockAncestorWalker.js';
export { checkBlockFirstColOverlap } from './BlockFirstColOverlapChecker.js';
export { CfgSchemaFilterByTag } from './CfgSchemaFilterByTag.js';
export { CfgSchemas } from './CfgSchemas.js';
export type { CfgFileInfo } from './CfgSchemas.js';
export { XmlReader } from './cfg/XmlReader.js';
export type { XmlElement } from './cfg/XmlReader.js';
export { CfgUtil } from './cfg/CfgUtil.js';
export { TableSchemaRefGraph } from './TableSchemaRefGraph.js';
export type { Refs } from './TableSchemaRefGraph.js';
