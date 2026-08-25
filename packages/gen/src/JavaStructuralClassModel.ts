/**
 * JavaStructuralClassModel — TypeScript port of Java `StructuralClassModel.java`.
 *
 * Model for GenStructuralClass.jte template: holds pre-computed field info,
 * foreign key info, interface/enum-ref metadata, and helper method strings.
 */

import type { Structural, InterfaceSchema, FieldSchema } from '@cfggen/schema';
import { TableSchema, StructSchema, hasRef } from '@cfggen/schema';
import { lower1 } from '@cfggen/shared';

import {
  NameableName,
  type,
  refType,
  refTypeFromFK,
  refName,
  getCodeTopPkg,
  getIsSealedInterface,
  formalParams,
  hashCodes,
  equalsExpr,
} from './JavaName';

export interface FieldInfo {
  name: string;
  type: string;
  comment: string;
}

export interface ForeignKeyInfo {
  type: string;
  name: string;
}

export class JavaStructuralClassModel {
  readonly structural: Structural;
  readonly name: NameableName;
  readonly pkg: string;
  readonly className: string;
  readonly isSealedInterface: boolean;
  readonly isImpl: boolean;
  readonly isTable: boolean;
  readonly isTableAndNeedBuilder: boolean;
  readonly isStructAndHasNoField: boolean;
  readonly nullableInterface: InterfaceSchema | null;
  readonly nullableInterfaceFullName: string | null;
  readonly enumRefTable: TableSchema | null;
  readonly fields: FieldInfo[];
  readonly foreignKeys: ForeignKeyInfo[];
  readonly hasRef: boolean;
  readonly codeTopPkg: string;
  readonly sourceComment: string;

  constructor(
    structural: Structural,
    name: NameableName,
    isTableAndNeedBuilder: boolean,
    sourceComment: string,
  ) {
    this.structural = structural;
    this.name = name;
    this.sourceComment = sourceComment;
    this.pkg = name.pkg;
    this.className = name.className;
    this.isSealedInterface = getIsSealedInterface();
    this.isTable = structural instanceof TableSchema;
    this.isTableAndNeedBuilder = isTableAndNeedBuilder;
    this.isStructAndHasNoField = !this.isTable && structural.fields().length === 0;
    this.codeTopPkg = getCodeTopPkg();

    // Interface information
    this.nullableInterface =
      structural instanceof StructSchema ? structural.nullableInterface() : null;
    this.isImpl = this.nullableInterface !== null;
    this.nullableInterfaceFullName = this.isImpl
      ? this.nullableInterface!.fullName()
      : null;
    this.enumRefTable = this.isImpl ? this.nullableInterface!.nullableEnumRefTable() : null;

    // Fields
    this.fields = structural.fields().map((f) => ({
      name: lower1(f.name),
      type: type(f.type),
      comment: f.comment(),
    }));

    // Foreign keys
    this.foreignKeys = structural.foreignKeys().map((fk) => ({
      type: refTypeFromFK(fk),
      name: refName(fk),
    }));

    this.hasRef = hasRef(structural);
  }

  formalParams(): string {
    return formalParams(this.structural.fields());
  }

  hashCodes(): string {
    return hashCodes(this.structural.fields());
  }

  equals(): string {
    return equalsExpr(this.structural.fields());
  }

  toStringParams(): string {
    const names = this.fields.map((f) => f.name);
    if (names.length === 0) return '';
    return names.reduce((a, b) => a + ' + "," + ' + b);
  }
}
