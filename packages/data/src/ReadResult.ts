/**
 * ReadResult — TypeScript port of Java `configgen.data.ReadResult`.
 *
 * Result of reading an Excel file or CSV file.
 *
 * @param sheets         one sheet per valid sheet/tab
 * @param stat           cell type statistics
 * @param nullableAddTag optional tag like "-client" or "-server"
 */

import type { DRawSheet } from './DRawSheet.js';
import type { CfgDataStat } from './CfgDataStat.js';

export class ReadResult {
  readonly sheets: OneSheet[];
  readonly stat: CfgDataStat;
  readonly nullableAddTag: string | null;

  constructor(sheets: OneSheet[], stat: CfgDataStat, nullableAddTag: string | null) {
    this.sheets = sheets;
    this.stat = stat;
    this.nullableAddTag = nullableAddTag;
  }
}

export class OneSheet {
  readonly tableName: string;
  readonly sheet: DRawSheet;

  constructor(tableName: string, sheet: DRawSheet) {
    this.tableName = tableName;
    this.sheet = sheet;
  }
}
