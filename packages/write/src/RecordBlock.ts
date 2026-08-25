/**
 * RecordBlock — TypeScript port of Java `configgen.write.RecordBlock`.
 *
 * A 2D string array builder with dynamic row expansion. Used by
 * RecordBlockMapper to lay out a VStruct's field values into cells
 * suitable for writing back to CSV/Excel files.
 *
 * RecordBlockTransformed wraps a RecordBlock + fieldIndices, remapping
 * block columns to data file column indices.
 *
 * Java source: configgen.write.RecordBlock.java (109 lines)
 */

/**
 * A mutable 2D cell grid. Rows are lazily allocated and dynamically
 * expanded (doubling strategy) as setCell is called with higher row indices.
 */
export class RecordBlock {
  private readonly _maxColumns: number;
  private _cells: (string[] | null)[];
  private _maxRow: number = -1;

  constructor(maxColumns: number) {
    this._maxColumns = maxColumns;
    this._cells = new Array(4).fill(null);
  }

  /**
   * Set a cell value at (row, col).
   * Expands the row array if needed. Tracks the maximum row index used.
   */
  setCell(row: number, col: number, value: string): void {
    if (value === null || value === undefined) {
      throw new Error('value must not be null');
    }
    if (row < 0 || col < 0 || col >= this._maxColumns) {
      throw new Error('Invalid row or column index');
    }
    this._expandIfNeeded(row);
    if (this._cells[row] === null) {
      this._cells[row] = new Array(this._maxColumns).fill(null);
    }
    this._cells[row]![col] = value;
    if (row > this._maxRow) {
      this._maxRow = row;
    }
  }

  private _expandIfNeeded(row: number): void {
    const neededRows = row + 1;
    let len = this._cells.length;
    let needExpand = false;
    while (len < neededRows) {
      len *= 2;
      needExpand = true;
    }
    if (needExpand) {
      const newCells = new Array(len).fill(null);
      for (let i = 0; i < this._cells.length; i++) {
        newCells[i] = this._cells[i];
      }
      this._cells = newCells;
    }
  }

  /**
   * Number of rows that have data (maxRow + 1), or 0 if no cells set.
   */
  getRowCount(): number {
    return this._maxRow + 1;
  }

  /** @internal — exposed for RecordBlockTransformed */
  get _internalCells(): (string[] | null)[] {
    return this._cells;
  }

  /** @internal */
  get _internalMaxColumns(): number {
    return this._maxColumns;
  }

  /** @internal */
  get _internalMaxRow(): number {
    return this._maxRow;
  }
}

/**
 * Wraps a RecordBlock + fieldIndices, remapping block column indices
 * to data file column indices. getRow(row) returns an array sized
 * to dataMaxColumns (= max(fieldIndices) + 1) with values placed at
 * their mapped positions.
 */
export class RecordBlockTransformed {
  private readonly _block: RecordBlock;
  private readonly _fieldIndices: number[];
  private readonly _dataMaxColumns: number;

  constructor(block: RecordBlock, fieldIndices: number[]) {
    this._block = block;
    this._fieldIndices = fieldIndices;
    // dataMaxColumns = last element + 1
    this._dataMaxColumns = fieldIndices[fieldIndices.length - 1] + 1;
    if (block._internalMaxColumns !== fieldIndices.length) {
      throw new Error('fieldIndices size does not match block columns');
    }
  }

  /**
   * Get a row's cell values, mapped to data file column positions.
   * Returns null if the row has no data in the block.
   */
  getRow(row: number): (string | null)[] | null {
    if (row < 0 || row > this._block._internalMaxRow) {
      throw new Error('Invalid row index');
    }
    const rowCells = this._block._internalCells[row];
    if (rowCells === null) {
      return null;
    }
    const trans = new Array(this._dataMaxColumns).fill(null);
    for (let i = 0; i < this._block._internalMaxColumns; i++) {
      const cell = rowCells[i];
      if (cell !== null) {
        const fi = this._fieldIndices[i];
        trans[fi] = cell;
      }
    }
    return trans;
  }

  getRowCount(): number {
    return this._block.getRowCount();
  }
}
