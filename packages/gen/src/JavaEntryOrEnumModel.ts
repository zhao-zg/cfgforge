/**
 * JavaEntryOrEnumModel — TypeScript port of Java `EntryOrEnumModel.java`.
 *
 * Model for GenEntryOrEnumClass.jte template.
 */

import type { TableSchema, EntryType } from '@cfggen/schema';
import { isEEnum, EEntry, EEnum } from '@cfggen/schema';
import type { VTable } from '@cfggen/value';

import { NameableName, getCodeTopPkg } from './JavaName';

// Re-export EntryBase type for convenience
export type EntryBase = EEntry | EEnum;

export class JavaEntryOrEnumModel {
  readonly pkg: string;
  readonly name: NameableName;
  readonly className: string;
  readonly isEnum: boolean;
  readonly hasNoIntValue: boolean;
  readonly enumNameToIntegerValueMap: Map<string, number> | null;
  readonly enumNames: Iterable<string> | null;
  readonly table: TableSchema;
  readonly isNeedReadData: boolean;
  readonly dataNameFullName: string;
  readonly entryBase: EntryBase;
  readonly codeTopPkg: string;
  readonly sourceComment: string;

  constructor(
    vTable: VTable,
    entryBase: EntryBase,
    name: NameableName,
    isNeedReadData: boolean,
    dataName: NameableName,
    sourceComment: string,
  ) {
    this.pkg = name.pkg;
    this.name = name;
    this.codeTopPkg = getCodeTopPkg();
    this.className = name.className;
    this.isEnum = isEEnum(entryBase);
    this.hasNoIntValue = vTable.enumNameToIntegerValueMap === null;
    this.enumNameToIntegerValueMap = vTable.enumNameToIntegerValueMap;
    this.enumNames = vTable.enumNames;
    this.table = vTable.schema;
    this.isNeedReadData = isNeedReadData;
    this.dataNameFullName = dataName.fullName;
    this.entryBase = entryBase;
    this.sourceComment = sourceComment;
  }
}
