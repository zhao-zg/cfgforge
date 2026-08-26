/**
 * JavaConfigMgrLoaderModel — TypeScript port of Java `ConfigMgrLoaderModel.java`.
 *
 * Model for ConfigMgrLoader.jte template.
 */

import type { CfgValue } from '@cfggen/value';
import { getCodeTopPkg, tableDataFullName, isEnumAndHasOnlyPrimaryKeyAndEnumStr } from './JavaName';

export interface TableInfo {
  name: string;
  fullName: string;
}

export class JavaConfigMgrLoaderModel {
  readonly pkg: string;
  readonly tables: TableInfo[];
  readonly setAllRefs_FullClassNames: string[];

  constructor(cfgValue: CfgValue, setAllRefsInMgrLoader: string[]) {
    this.pkg = getCodeTopPkg();
    this.setAllRefs_FullClassNames = setAllRefsInMgrLoader;

    this.tables = [];
    for (const vTable of cfgValue.tables()) {
      if (!isEnumAndHasOnlyPrimaryKeyAndEnumStr(vTable.schema)) {
        this.tables.push({
          name: vTable.name(),
          fullName: tableDataFullName(vTable.schema),
        });
      }
    }
  }
}
