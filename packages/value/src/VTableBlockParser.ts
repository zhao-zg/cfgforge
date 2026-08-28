/**
 * VTableBlockParser — TypeScript port of Java `configgen.value.VTableBlockParser`.
 *
 * Block parsing algorithm: uses "all ancestor block first columns that
 * lexically enclose this block" to detect nesting boundaries.
 * If any ancestor first column is non-empty => outer block started a new
 * item => end this block.
 *
 * From VTableParser, extracted so VTableParser becomes a pure parseTable
 * driver, and allows migration tools to inject other BlockParser
 * (e.g. ComparingBlockParser) for old/new algorithm comparison.
 */

import type { DCell } from '@cfgforge/data';
import { DTable } from '@cfgforge/data';
import type { TableSchema } from '@cfgforge/schema';
import type { Structural } from '@cfgforge/schema';
import { walkBlockAncestors } from '@cfgforge/schema';
import type { BlockFieldVisitor } from '@cfgforge/schema';
import { fieldSpan } from '@cfgforge/schema';
import type { FieldSchema } from '@cfgforge/schema';

import type { BlockParser } from './ValueParser.js';
import { CellsWithRowIndex } from './ValueParser.js';

// ---------------------------------------------------------------------------
// BlockFieldInfo
// ---------------------------------------------------------------------------

/** A block field's budget info: ancestor first-column set + field name. */
interface BlockFieldInfo {
  ancestors: Set<number>;
  fieldName: string;
}

const EMPTY_INFO: BlockFieldInfo = { ancestors: new Set<number>(), fieldName: '' };

// ---------------------------------------------------------------------------
// VTableBlockParser
// ---------------------------------------------------------------------------

export class VTableBlockParser implements BlockParser {
  private readonly dTable: DTable;
  private readonly pkColumnIndices: number[];
  private readonly blockFirstColToInfo: Map<number, BlockFieldInfo>;

  constructor(dTable: DTable, tableSchema: TableSchema) {
    this.dTable = dTable;
    this.pkColumnIndices = getPkColumnIndices(tableSchema);
    this.blockFirstColToInfo = VTableBlockParser.collectBlockAncestors(tableSchema);
  }

  /**
   * Parse a block: collect all rows that belong to this block.
   *
   * Algorithm:
   * 1. Start with the current row (cells passed in).
   * 2. For each subsequent row:
   *    a. If PK cells are non-empty → next record → break.
   *    b. If PK cells are all empty → still same record.
   *       Check ancestor first columns: if any non-empty → outer block new item → break.
   *       If firstCol of this block is empty → inner nested block row → skip.
   *       If firstCol is non-empty → add this row to the block.
   */
  parseBlock(cells: DCell[], curRowIndex: number): CellsWithRowIndex[] {
    const firstCell = cells[0];
    const rowSize = this.dTable.rows.length;
    const curRow = this.dTable.rows[curRowIndex];
    const firstColIndex = findColumnIndex(firstCell, curRow);

    const colSize = cells.length;

    const info = this.blockFirstColToInfo.get(firstColIndex) ?? EMPTY_INFO;
    const ancestors = info.ancestors;

    const res: CellsWithRowIndex[] = [];
    res.push(new CellsWithRowIndex(cells, curRowIndex));

    for (let row = curRowIndex + 1; row < rowSize; row++) {
      const line = this.dTable.rows[row];

      if (isPkCellAllEmpty(line, this.pkColumnIndices)) {
        // PK cells all empty → still same record
        let newOuterItem = false;
        for (const bc of ancestors) {
          if (bc < line.length && !line[bc].isCellEmpty()) {
            // Any ancestor first column non-empty → outer block started a new item
            newOuterItem = true;
            break;
          }
        }
        if (newOuterItem) {
          break;
        }

        const thisCell = firstColIndex < line.length ? line[firstColIndex] : null;
        if (thisCell !== null && !thisCell.isCellEmpty()) {
          // This block's first column is non-empty → add this row
          res.push(new CellsWithRowIndex(
            line.slice(firstColIndex, firstColIndex + colSize),
            row,
          ));
        }
        // else: firstCol empty → inner nested block row → skip
      } else {
        // Next record → break
        break;
      }
    }

    return res;
  }

  /** Current block field's name (migration report use). Returns '' if unknown. */
  fieldNameOf(firstColIndex: number): string {
    const info = this.blockFirstColToInfo.get(firstColIndex);
    return info ? info.fieldName : '';
  }

  /**
   * Pre-compute each block field's first column (cell-list index) →
   * {ancestor block first-column set, field name}.
   *
   * Column number space is consistent with parseBlock's firstColIndex:
   * both are fieldIndices-filtered cell list indices.
   * Traversal (column accumulation, recursive scope) is handled by
   * BlockAncestorWalker; this method only collects.
   */
  private static collectBlockAncestors(structural: Structural): Map<number, BlockFieldInfo> {
    const result = new Map<number, BlockFieldInfo>();
    const visitor: BlockFieldVisitor = {
      onBlockField(
        _structural: Structural,
        field: FieldSchema,
        startCol: number,
        outerAncestors: Set<number>,
      ): void {
        result.set(startCol, { ancestors: outerAncestors, fieldName: field.name });
      },
    };
    walkBlockAncestors(structural, visitor);
    return result;
  }
}

// ---------------------------------------------------------------------------
// getPkColumnIndices — ported from VTableParser.getPkColumnIndices
// ---------------------------------------------------------------------------

/**
 * Computes the cell-list indices for all primary key fields.
 * Traverses the table's field list, accumulating span per field.
 * When a PK field is found, its span may produce multiple indices.
 */
export function getPkColumnIndices(schema: TableSchema): number[] {
  const pks = schema.primaryKey.fieldSchemas();
  if (!pks) return [];

  const pkIndices: number[] = [];
  for (const pk of pks) {
    let idx = 0;
    for (const f of schema.fields()) {
      const s = fieldSpan(f);
      if (f === pk) {
        for (let i = 0; i < s; i++) {
          pkIndices.push(idx + i);
        }
        break;
      }
      idx += s;
    }
  }
  return pkIndices;
}

// ---------------------------------------------------------------------------
// isPkCellAllEmpty — ported from VTableParser.isPkCellAllEmpty
// ---------------------------------------------------------------------------

/**
 * Checks if all PK cells in a row are empty (value is empty string).
 * Used to determine if a row belongs to the previous record's block
 * or is a new record.
 */
export function isPkCellAllEmpty(row: DCell[], pkColumnIndices: number[]): boolean {
  for (const pkIndex of pkColumnIndices) {
    const dCell = row[pkIndex];
    if (dCell.value() !== '') {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// findColumnIndex — ported from VTableBlockParser.findColumnIndex
// ---------------------------------------------------------------------------

/**
 * Finds the cell-list index of a cell within a row by matching col().
 */
export function findColumnIndex(cell: DCell, curRow: DCell[]): number {
  let i = 0;
  for (const c of curRow) {
    if (c.col() === cell.col()) {
      return i;
    }
    i++;
  }
  return i;
}
