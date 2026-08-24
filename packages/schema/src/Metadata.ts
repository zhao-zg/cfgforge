/**
 * Metadata — TypeScript port of Java `configgen.schema.Metadata`.
 *
 * STUB: Full implementation will be in T2.10.
 * This minimal type declaration allows other modules to reference
 * the Metadata type without compilation errors.
 */

export interface Metadata {
  data(): Map<string, MetaValue>;
  copy(): Metadata;
}

export type MetaValue = MetaTag | MetaInt | MetaFloat | MetaStr | MetaComment | MetaEnumValues;

export const MetaTag = 'TAG' as const;
export type MetaTag = typeof MetaTag;

export interface MetaInt {
  _tag: 'MetaInt';
  value: number;
}

export interface MetaFloat {
  _tag: 'MetaFloat';
  value: number;
}

export interface MetaStr {
  _tag: 'MetaStr';
  value: string;
}

export interface MetaComment {
  _tag: 'MetaComment';
  comment: import('./CommentData').CommentData;
}

export type MetaEnumValues = MetaEnumValuesOfEmpty | MetaEnumValuesOfAssigned;

export interface MetaEnumValuesOfEmpty {
  _tag: 'OfEmpty';
  values: EnumValueEmpty[];
}

export interface MetaEnumValuesOfAssigned {
  _tag: 'OfAssigned';
  values: EnumValueAssigned[];
}

export interface EnumValueEmpty {
  name: string;
  comment: string;
}

export interface EnumValueAssigned {
  name: string;
  comment: string;
  number: number;
}

export function Metadata_of(): Metadata {
  return new MetadataStub();
}

class MetadataStub implements Metadata {
  private _data = new Map<string, MetaValue>();
  data(): Map<string, MetaValue> { return this._data; }
  copy(): Metadata { return new MetadataStub(); }
}
