/**
 * CfgData — TypeScript port of Java `configgen.data.CfgData`.
 *
 * The top-level data model: a map of table names to DTable, plus statistics.
 */

import type { DTable } from './DTable.js';
import type { CfgDataStat } from './CfgDataStat.js';

export class CfgData {
  readonly tables: Map<string, DTable>;
  readonly stat: CfgDataStat;

  constructor(tables: Map<string, DTable>, stat: CfgDataStat) {
    this.tables = tables;
    this.stat = stat;
  }

  getDTable(tableName: string): DTable | undefined {
    return this.tables.get(tableName);
  }
}
