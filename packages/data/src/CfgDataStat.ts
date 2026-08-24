/**
 * CfgDataStat — TypeScript port of Java `configgen.data.CfgDataStat`.
 *
 * Statistics counters for data reading. Tracks file counts, sheet counts,
 * cell type breakdowns, and ignored counts.
 */

export class CfgDataStat {
  tableCount = 0;
  csvCount = 0;
  excelCount = 0;
  sheetCount = 0;
  rowCount = 0;
  columnCount = 0;

  emptyTableCount = 0;
  ignoredSheetCount = 0;
  ignoredCsvCount = 0;
  ignoredColumnCount = 0;
  ignoredRowCount = 0;

  cellCsvCount = 0;
  cellNumberCount = 0;
  cellStrCount = 0;
  cellBoolCount = 0;
  cellEmptyCount = 0;
  cellNullCount = 0;
  cellFormulaCount = 0;
  cellErrCount = 0;

  merge(other: CfgDataStat): void {
    this.tableCount += other.tableCount;
    this.csvCount += other.csvCount;
    this.excelCount += other.excelCount;
    this.sheetCount += other.sheetCount;
    this.rowCount += other.rowCount;
    this.columnCount += other.columnCount;
    this.emptyTableCount += other.emptyTableCount;
    this.ignoredSheetCount += other.ignoredSheetCount;
    this.ignoredCsvCount += other.ignoredCsvCount;
    this.ignoredColumnCount += other.ignoredColumnCount;
    this.ignoredRowCount += other.ignoredRowCount;
    this.cellCsvCount += other.cellCsvCount;
    this.cellNumberCount += other.cellNumberCount;
    this.cellStrCount += other.cellStrCount;
    this.cellBoolCount += other.cellBoolCount;
    this.cellEmptyCount += other.cellEmptyCount;
    this.cellNullCount += other.cellNullCount;
    this.cellFormulaCount += other.cellFormulaCount;
    this.cellErrCount += other.cellErrCount;
  }
}
