/**
 * DCell — TypeScript port of Java `configgen.data.CfgData.DCell`.
 *
 * A single cell value from Excel/CSV data. Implements the Source marker
 * interface (DCell side; DFile is the JSON side).
 *
 * Carries: trimmed value, row source location (DRowId), column index,
 * and a bitfield mode (column mode / fake / pack-or-sep).
 */

import { DRowId } from './DRowId.js';
export { DRowId } from './DRowId.js';

const N = 'Z'.charCodeAt(0) - 'A'.charCodeAt(0) + 1; // 26

function toAZ(v: number): string {
  const q = Math.floor(v / N);
  const r = String.fromCharCode('A'.charCodeAt(0) + (v % N));
  if (q > 0) {
    return toAZ(q - 1) + r;
  } else {
    return r;
  }
}

export class DCell {
  static readonly COLUMN_MODE: number = 0x1;
  static readonly CELL_FAKE: number = 0x4;
  static readonly CELL_PACK_OR_SEP: number = 0x8;

  private readonly _value: string;
  private readonly _rowId: DRowId;
  private readonly _col: number;
  private _mode: number;

  constructor(value: string, rowId: DRowId, col: number, mode: number) {
    this._value = value;
    this._rowId = rowId;
    this._col = col;
    this._mode = mode;
  }

  static of(content: string, fileName: string): DCell {
    return new DCell(content, new DRowId(fileName, '', 0), 0, DCell.CELL_FAKE);
  }

  static modeOf(isColumnMode: boolean): number {
    return isColumnMode ? DCell.COLUMN_MODE : 0;
  }

  value(): string {
    return this._value;
  }

  rowId(): DRowId {
    return this._rowId;
  }

  col(): number {
    return this._col;
  }

  mode(): number {
    return this._mode;
  }

  setModePackOrSep(): void {
    this._mode |= DCell.CELL_PACK_OR_SEP;
  }

  isModePackOrSep(): boolean {
    return (this._mode & DCell.CELL_PACK_OR_SEP) !== 0;
  }

  isCellEmpty(): boolean {
    return this._value.length === 0;
  }

  createSub(sub: string): DCell {
    return new DCell(sub, this._rowId, this._col, this._mode);
  }

  displayRow(): number {
    const isCol = (this._mode & DCell.COLUMN_MODE) !== 0;
    return (isCol ? this._col : this._rowId.row) + 1;
  }

  displayCol(): string {
    const isCol = (this._mode & DCell.COLUMN_MODE) !== 0;
    return toAZ(isCol ? this._rowId.row : this._col);
  }
}
