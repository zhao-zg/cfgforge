/**
 * TableFileLocator — TypeScript port of Java `configgen.write.TableFileLocator`.
 *
 * Utility class for locating file positions of VStruct records and
 * creating TableFile instances (CSV or Excel) based on file extension.
 *
 * Java source: configgen.write.TableFileLocator.java (89 lines)
 */

import type { DRowId, DTable, DRawSheet } from '@cfggen/data';
import { DCell, DCellList, DFile } from '@cfggen/data';
import type { TableFile } from './TableFile';

// Minimal VStruct shape needed by this module
interface VStructLike {
  source: DCell | DCellList | DFile;
}

export class TableFileLocator {
  /**
   * Extract the DRowId from a VStruct record's source.
   * - DCell → returns the cell's rowId
   * - DCellList → returns the first cell's rowId (throws if empty)
   * - DFile → throws (JSON records don't have row locations)
   */
  static getLocFromRecord(record: VStructLike): DRowId {
    const source = record.source;

    if (source instanceof DCell) {
      return source.rowId();
    }

    if (source instanceof DCellList) {
      if (source.cells.length === 0) {
        throw new Error('DCellList is empty in record: ' + record);
      }
      return source.cells[0].rowId();
    }

    // DFile
    throw new Error('Record source is DFile, cannot get row location: ' + record);
  }

  /**
   * Get the last rawSheet from a DTable (the sheet where new records
   * are typically appended).
   */
  static getSheetFromDTable(dTable: DTable): DRawSheet {
    if (dTable.rawSheets.length === 0) {
      throw new Error('DTable has no rawSheets: ' + dTable.tableName);
    }
    return dTable.rawSheets[dTable.rawSheets.length - 1];
  }

  /**
   * Create a TableFile instance based on file extension.
   * Dispatches to CsvTableFile or ExcelTableFile.
   *
   * Note: In the Java version this returns CsvTableFile/ExcelTableFile.
   * In TS, the concrete implementations are in T7.2. This method
   * is a factory that will be wired up in T7.2. For now it validates
   * the file type and delegates to a provider function.
   *
   * @param fileName      relative file path (e.g. "data/user.csv")
   * @param sheetName     sheet name (empty for CSV)
   * @param dataDir       root data directory
   * @param headRow       head row count (2 = A2_Default)
   * @param csvEncoding   encoding for CSV files
   * @param isColumnMode  whether the table uses column mode
   * @returns TableFile instance
   */
  static createTableFile(
    fileName: string,
    sheetName: string,
    dataDir: string,
    headRow: number,
    csvEncoding: string,
    isColumnMode: boolean,
  ): TableFile {
    const toLower = fileName.toLowerCase();
    if (toLower.endsWith('.xlsx') || toLower.endsWith('.xls')) {
      // Delegated to ExcelTableFile — wired up in T7.2
      throw new Error('ExcelTableFile not yet implemented (T7.2)');
    } else if (toLower.endsWith('.csv')) {
      // Delegated to CsvTableFile — wired up in T7.2
      throw new Error('CsvTableFile not yet implemented (T7.2)');
    } else {
      throw new Error('Unsupported file type: ' + fileName);
    }
  }
}
