/**
 * VTableStorage — TypeScript port of Java `configgen.write.VTableStorage`.
 *
 * Provides add/update/delete operations on CSV/Excel table files.
 * Does NOT modify any in-memory data structures — only reads the value
 * tree to locate file positions, then writes via TableFile.
 *
 * Key difference from Java:
 * - `addOrUpdateRecord` and `deleteRecord` are async because:
 *   a) `TableFileLocator.createTableFile()` is async (ExcelJS reads async)
 *   b) `TableFile.saveAndClose()` is async (ExcelJS writes async)
 * - `RecordBlockMapper.mapToBlock()` is injected via a static function
 *   reference, because RecordBlockMapper (T7.6) is implemented later.
 *   At T7.6 wiring time, set `VTableStorage.mapToBlockFn = RecordBlockMapper.mapToBlock`.
 *
 * Java source: configgen.write.VTableStorage.java (162 lines)
 */

import type { Context } from '@cfggen/context';
import { VTable, VStruct, VInterface, VList, VMap, type Value } from '@cfggen/value';
import type { DTable, DRawSheet, DRowId, Source } from '@cfggen/data';
import { DCell, DCellList } from '@cfggen/data';
import { TableFileLocator } from '../TableFileLocator';
import type { TableFile } from '../TableFile';
import { RecordBlock, RecordBlockTransformed } from '../RecordBlock';
import { RecordBlockMapper } from '../RecordBlockMapper';

/**
 * Function type for mapping a VStruct to a RecordBlock.
 * Provided by RecordBlockMapper (T7.6).
 */
export type MapToBlockFn = (record: VStruct) => RecordBlock;

export class VTableStorage {
  /**
   * Injectable function for mapping VStruct → RecordBlock.
   * Set this when wiring up T7.6 (RecordBlockMapper).
   * Defaults to throwing if called before T7.6 wiring.
   */
  static mapToBlockFn: MapToBlockFn = (_record: VStruct): RecordBlock => {
    throw new Error('RecordBlockMapper not yet wired (T7.6). Set VTableStorage.mapToBlockFn first.');
  };

  /**
   * Add or update a record in a CSV/Excel table file.
   *
   * - If `pkValue` already exists in `vTable.primaryKeyMap`, updates the
   *   existing record in-place (empty old row(s), then insert new block).
   * - If `pkValue` is new, appends the record to the end of the last sheet.
   *
   * @returns the DRawSheet where the write occurred.
   */
  static async addOrUpdateRecord(
    context: Context,
    vTable: VTable,
    dTable: DTable,
    pkValue: Value,
    newRecord: VStruct,
  ): Promise<DRawSheet> {
    const block = VTableStorage.mapToBlockFn(newRecord);

    const oldRecord = vTable.primaryKeyMap.get(pkValue);

    let tableFile: TableFile;
    let startRow: number;
    let rowCount: number;
    let sheet: DRawSheet;

    if (oldRecord) {
      // Update: find old record's file position, then blank its rows
      const loc = await VTableStorage.findRecordLoc(context, oldRecord);
      tableFile = loc.tableFile;
      startRow = loc.startRow;
      rowCount = loc.rowCount;
      sheet = dTable.getSheetByRowId(loc.rowId);
      tableFile.emptyRows(startRow, rowCount, sheet.fieldIndices);
    } else {
      // Insert: get file position from last sheet, append to end
      sheet = TableFileLocator.getSheetFromDTable(dTable);
      const isColumnMode = vTable.schema.isColumnMode;
      const cfg = context.contextCfg();
      tableFile = await TableFileLocator.createTableFile(
        sheet.relativeFilePath,
        sheet.sheetName,
        cfg.dataDir,
        cfg.headRow.rowCount(),
        cfg.csvOrTsvDefaultEncoding,
        isColumnMode,
      );
      startRow = -1; // append to end
      rowCount = 0;  // no empty rows reserved
    }

    tableFile.insertRecordBlock(startRow, rowCount, new RecordBlockTransformed(block, sheet.fieldIndices));
    await tableFile.saveAndClose();

    return sheet;
  }

  /**
   * Delete a record from a CSV/Excel table file.
   * Blanks the old record's row(s) in the file.
   *
   * @returns the DRawSheet where the deletion occurred.
   */
  static async deleteRecord(
    context: Context,
    dTable: DTable,
    oldRecord: VStruct,
  ): Promise<DRawSheet> {
    const loc = await VTableStorage.findRecordLoc(context, oldRecord);
    loc.tableFile.emptyRows(loc.startRow, loc.rowCount, null);
    await loc.tableFile.saveAndClose();
    return dTable.getSheetByRowId(loc.rowId);
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Find the file location (TableFile + row range) of an existing record.
   */
  private static async findRecordLoc(
    context: Context,
    oldRecord: VStruct,
  ): Promise<RecordLoc> {
    const rowId = TableFileLocator.getLocFromRecord(oldRecord);
    const startRow = rowId.row;
    const rowCount = VTableStorage.computePhysicalRowCount(oldRecord);

    const isColumnMode = (oldRecord.schema as any).isColumnMode as boolean;
    const cfg = context.contextCfg();
    const tableFile = await TableFileLocator.createTableFile(
      rowId.fileName,
      rowId.sheetName,
      cfg.dataDir,
      cfg.headRow.rowCount(),
      cfg.csvOrTsvDefaultEncoding,
      isColumnMode,
    );
    return new RecordLoc(tableFile, rowId, startRow, rowCount);
  }

  /**
   * Compute the physical row span of a record in the file (maxRow - minRow + 1).
   *
   * Cannot use `mapToBlock(oldRecord).getRowCount()` — that gives "logical
   * element rows" which excludes artificial empty separator rows that
   * designers may have added. If those aren't cleared, residual old rows
   * would be treated as new elements on next reload, causing "extra nodes
   * after each update" bug.
   *
   * Here we recursively traverse the entire value tree collecting all
   * DCell physical row numbers. CellParser filters all-empty rows from
   * the in-memory table, but surviving data rows' physical row numbers
   * will have gaps, so max-min+1 naturally covers the skipped empty rows.
   * The top-level record's source only has the first row's cell; nested
   * block subsequent rows' cells are scattered in child Values' sources,
   * hence the recursion.
   */
  private static computePhysicalRowCount(record: VStruct): number {
    let minRow = Number.MAX_SAFE_INTEGER;
    let maxRow = Number.MIN_SAFE_INTEGER;
    let found = false;

    const stack: Value[] = [record];
    while (stack.length > 0) {
      const v = stack.pop()!;
      const source: Source = v.source;

      if (source instanceof DCell) {
        const r = source.rowId().row;
        if (r < minRow) minRow = r;
        if (r > maxRow) maxRow = r;
        found = true;
      } else if (source instanceof DCellList) {
        for (const c of source.cells) {
          const r = c.rowId().row;
          if (r < minRow) minRow = r;
          if (r > maxRow) maxRow = r;
        }
        found = true;
      }
      // DFile: JSON tables don't go through VTableStorage

      // Push children for recursion
      if (v instanceof VStruct) {
        for (const child of v.values) {
          stack.push(child);
        }
      }
      // VInterface: traverse child struct's values
      if (v instanceof VInterface) {
        for (const child of v.child.values) {
          stack.push(child);
        }
      }
      // VList: traverse list elements
      if (v instanceof VList) {
        for (const sv of v.valueList) {
          stack.push(sv);
        }
      }
      // VMap: traverse keys and values
      if (v instanceof VMap) {
        for (const [k, val] of v.valueMap.entries()) {
          stack.push(k);
          stack.push(val);
        }
      }
    }

    return found ? (maxRow - minRow + 1) : 1;
  }
}

// -------------------------------------------------------------------------
// RecordLoc: internal record location type
// -------------------------------------------------------------------------

class RecordLoc {
  constructor(
    readonly tableFile: TableFile,
    readonly rowId: DRowId,
    readonly startRow: number,
    readonly rowCount: number,
  ) {}
}

// Wire up the mapper function — T7.6 completion.
// This replaces the default throwing stub with the real implementation.
VTableStorage.mapToBlockFn = RecordBlockMapper.mapToBlock;
