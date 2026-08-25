/**
 * TableFile — TypeScript port of Java `configgen.write.TableFile`.
 *
 * Interface for writing records back to CSV/Excel files.
 *
 * Java source: configgen.write.TableFile.java (35 lines)
 */

import type { RecordBlockTransformed } from './RecordBlock';

export interface TableFile {
  /**
   * Clear data in the specified row range.
   * @param startRow  start row index (0-based)
   * @param count     number of rows to clear
   * @param fieldIndices  if null, clear all cells in the first row;
   *                      if non-null, only clear cells at these indices
   *                      in the first row (rest are fully cleared)
   */
  emptyRows(startRow: number, count: number, fieldIndices: number[] | null): void;

  /**
   * Insert a record block at the specified position.
   * @param startRow       start row, -1 = append to end
   * @param emptyRowCount  available empty rows that can be overwritten
   * @param content        the record block to insert
   */
  insertRecordBlock(startRow: number, emptyRowCount: number, content: RecordBlockTransformed): void;

  /**
   * Save the file and close resources.
   * Returns a Promise because ExcelJS writes are async.
   */
  saveAndClose(): Promise<void>;
}
