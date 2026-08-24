/**
 * DRowId — TypeScript port of Java `configgen.data.CfgData.DRowId`.
 *
 * Identifies a row's source location: file name, sheet name (empty for CSV),
 * and the row index within the sheet.
 */

export class DRowId {
  readonly fileName: string;
  readonly sheetName: string;
  readonly row: number;

  constructor(fileName: string, sheetName: string, row: number) {
    this.fileName = fileName;
    this.sheetName = sheetName;
    this.row = row;
  }
}
