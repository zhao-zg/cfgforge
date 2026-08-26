/**
 * JavaInterfaceModel — TypeScript port of Java `InterfaceModel.java`.
 *
 * Model for GenInterface.jte template.
 */

import type { InterfaceSchema } from '@cfgforge/schema';
import { hasRef } from '@cfgforge/schema';

import {
  NameableName,
  pascalName,
  fullName,
  refType,
  getCodeTopPkg,
  getIsSealedInterface,
} from './JavaName';

export interface InterfaceImpl {
  name: string;
  upper1Name: string;
  fullName: string;
}

export class JavaInterfaceModel {
  readonly pkg: string;
  readonly codeTopPkg: string;
  readonly className: string;
  readonly isSealedInterface: boolean;
  readonly nullableEnumRefTable: string | null;
  readonly hasRef: boolean;
  readonly impls: InterfaceImpl[];

  constructor(sInterface: InterfaceSchema, name: NameableName) {
    this.pkg = name.pkg;
    this.codeTopPkg = getCodeTopPkg();
    this.className = name.className;
    this.isSealedInterface = getIsSealedInterface();
    const enumRefTable = sInterface.nullableEnumRefTable();
    this.nullableEnumRefTable = enumRefTable !== null ? refType(enumRefTable) : null;
    this.hasRef = hasRef(sInterface);
    this.impls = sInterface.impls().map((impl) => ({
      name: impl.name(),
      upper1Name: pascalName(impl.name()),
      fullName: fullName(impl),
    }));
  }
}
