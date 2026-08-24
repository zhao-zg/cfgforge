/**
 * DRawRow — TypeScript port of Java `configgen.data.CfgData.DRawRow`.
 *
 * Interface for raw row data from Excel/CSV. Polymorphic: each reader
 * (Excel, CSV) provides its own implementation.
 */

export interface DRawRow {
  /** Get cell value at column c (0-based), trimmed. Returns "" if out of bounds. */
  cell(c: number): string;

  /** Number of cells in this row. */
  count(): number;
}

/**
 * Empty row implementation — returns "" for all cells, count 0.
 * Used to fill gaps when Excel has non-contiguous row numbers.
 */
export const EMPTY_ROW: DRawRow = {
  cell(): string {
    return '';
  },
  count(): number {
    return 0;
  },
};
