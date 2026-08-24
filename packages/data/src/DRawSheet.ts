/**
 * DRawSheet — TypeScript port of Java `configgen.data.CfgData.DRawSheet`.
 *
 * Raw sheet data read from Excel or CSV. Contains the raw rows before
 * HeadParser/CellParser process them into DTable.
 *
 * @param relativeFilePath  relative path from root data dir
 * @param sheetName         sheet name (empty for CSV)
 * @param index             supports multiple CSV/sheet forming one logical table
 * @param rows              raw cell data per row
 * @param fieldIndices      indices of program-use columns (filled by HeadParser)
 */

import type { DRawRow } from './DRawRow';

export class DRawSheet {
  readonly relativeFilePath: string;
  readonly sheetName: string;
  readonly index: number;
  readonly rows: DRawRow[];
  fieldIndices: number[];

  constructor(
    relativeFilePath: string,
    sheetName: string,
    index: number,
    rows: DRawRow[],
    fieldIndices: number[] = [],
  ) {
    this.relativeFilePath = relativeFilePath;
    this.sheetName = sheetName;
    this.index = index;
    this.rows = rows;
    this.fieldIndices = fieldIndices;
  }

  id(): string {
    if (this.sheetName.length === 0) {
      return this.relativeFilePath;
    }
    return `${this.relativeFilePath}[${this.sheetName}]`;
  }

  isCsv(): boolean {
    return this.sheetName.length === 0;
  }
}
