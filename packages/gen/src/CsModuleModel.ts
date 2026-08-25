/**
 * CsModuleModel — TypeScript port of Java `configgen.gencs.ModuleModel`.
 *
 * Groups all structs/interfaces/tables in a top-level module (the first
 * directory segment of Name.path, or "" for root) and generates a module
 * loader file.
 *
 * Java source: configgen.gencs.ModuleModel.java (73 lines)
 */

import type { Nameable } from '@cfggen/schema';
import { upper1 } from '@cfggen/shared';
import type { CsCodeGenerator } from './CsCodeGenerator';
import type { CsStructModel } from './CsStructModel';
import type { CsInterfaceModel } from './CsInterfaceModel';
import { CsName } from './CsName';

export class CsModuleModel {
  readonly topPkg: string;
  readonly moduleKey: string;
  readonly unity: boolean;
  private readonly gen: CsCodeGenerator;
  private readonly groups: Map<string, NamespaceGroup> = new Map();
  private _hasTable = false;

  constructor(gen: CsCodeGenerator, moduleKey: string) {
    this.gen = gen;
    this.topPkg = gen.pkg;
    this.moduleKey = moduleKey;
    this.unity = gen.unity;
  }

  outputFilePath(): string {
    const key = this.moduleKey.length === 0 ? '_root' : this.moduleKey;
    return '_loaders/' + key + 'Loader.cs';
  }

  addStruct(model: CsStructModel): void {
    const ns = model.name.pkg;
    let group = this.groups.get(ns);
    if (!group) {
      group = new NamespaceGroup(ns);
      this.groups.set(ns, group);
    }
    group.structs.push(model);
    if (model.vTable !== null) {
      this._hasTable = true;
    }
  }

  addInterface(model: CsInterfaceModel): void {
    const ns = model.name.pkg;
    let group = this.groups.get(ns);
    if (!group) {
      group = new NamespaceGroup(ns);
      this.groups.set(ns, group);
    }
    group.interfaces.push(model);
  }

  groupsList(): NamespaceGroup[] {
    return Array.from(this.groups.values());
  }

  fullName(nameable: Nameable): string {
    return new CsName(this.gen.pkg, this.gen.prefix, nameable).fullName;
  }

  upper1Fn(value: string): string {
    return upper1(value);
  }

  hasTable(): boolean {
    return this._hasTable;
  }
}

export class NamespaceGroup {
  readonly ns: string;
  readonly structs: CsStructModel[] = [];
  readonly interfaces: CsInterfaceModel[] = [];

  constructor(ns: string) {
    this.ns = ns;
  }
}
