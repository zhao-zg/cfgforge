/**
 * GoCfgMgrModel — TypeScript port of Java `configgen.gengo.CfgMgrModel`.
 *
 * Java record: (pkg, cfgValue: CfgValue)
 *
 * Java source: configgen.gengo.CfgMgrModel.java (7 lines)
 */

import type { CfgValue } from '@cfgforge/value';

export class GoCfgMgrModel {
  constructor(
    readonly pkg: string,
    readonly cfgValue: CfgValue,
  ) {}
}
