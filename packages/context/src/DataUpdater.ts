/**
 * DataUpdater — TypeScript port of Java `configgen.ctx.DataUpdater`.
 *
 * Reloads a single table's data from its source files (CSV/Excel),
 * then re-parses headers and cells. Returns a new CfgData with the
 * updated table merged in.
 *
 * Key difference from Java:
 * - Java's `updateByReloadTable` is synchronous (POI/FastExcel are sync).
 * - TS `readExcel` is async (ExcelJS), so this method is async.
 * - CSV reading remains synchronous via `context.csvReader()`.
 *
 * Java source: configgen.ctx.DataUpdater.java (79 lines)
 */

import * as path from 'path';
import type { Context } from './Context';
import { DTable, FileFmt, getFileFormat, getTableNameIndex, HeadParser, CellParser, CfgDataStat, readExcel } from '@cfgforge/data';
import { CfgSchemaErrs } from '@cfgforge/schema';

export class DataUpdater {
  /**
   * Result of reloading a table: new CfgData (with the updated table merged in)
   * and a list of error strings.
   */
  readonly newCfgData: import('@cfgforge/data').CfgData;
  readonly errStrList: string[];

  private constructor(newCfgData: import('@cfgforge/data').CfgData, errStrList: string[]) {
    this.newCfgData = newCfgData;
    this.errStrList = errStrList;
  }

  /**
   * Reload a single table's data from its source files.
   *
   * Re-reads each DRawSheet's file, re-parses headers and cells,
   * and returns a new CfgData with the updated table replacing the old one.
   */
  static async updateByReloadTable(context: Context, dTable: DTable): Promise<DataUpdater> {
    const newRawSheets: import('@cfgforge/data').DRawSheet[] = [];
    const rootDir = context.rootDir();

    for (const sheet of dTable.rawSheets) {
      const absPath = path.join(rootDir, sheet.relativeFilePath);
      const relativePath = sheet.relativeFilePath;
      const fmt = getFileFormat(absPath);
      if (fmt === null) {
        throw new Error(`Unknown file: ${relativePath}`);
      }

      if (fmt === FileFmt.CSV || fmt === FileFmt.TXT_AS_TSV) {
        const ti = getTableNameIndex(relativePath);
        if (ti === null) {
          throw new Error(`Not legal path: ${relativePath}`);
        }
        const fieldSeparator = fmt === FileFmt.CSV ? ',' : '\t';
        const result = context.csvReader()(
          absPath,
          relativePath,
          ti.tableName,
          ti.index,
          fieldSeparator,
          dTable.nullableAddTag,
        );
        for (const oneSheet of result.sheets) {
          newRawSheets.push(oneSheet.sheet);
        }
      } else if (fmt === FileFmt.EXCEL) {
        // Excel reading is async in TS (ExcelJS)
        const result = await readExcel(absPath, relativePath, sheet.sheetName);
        for (const oneSheet of result.sheets) {
          newRawSheets.push(oneSheet.sheet);
        }
      } else {
        throw new Error(`Unsupported file format for table reload: ${relativePath}`);
      }
    }

    const newTable = DTable.of(dTable.tableName, newRawSheets, dTable.nullableAddTag);

    const errs = CfgSchemaErrs.of();
    const tStat = new CfgDataStat();
    const cfgSchema = context.cfgSchema();
    const isColumnMode = DataUpdater.isColumnMode(cfgSchema, dTable.tableName);
    const headRow = context.contextCfg().headRow;

    HeadParser.parse(newTable, tStat, headRow, isColumnMode, errs);
    CellParser.parse(newTable, tStat, headRow.rowCount(), isColumnMode);

    const cfgData = context.cfgData();
    const newTables = new Map(cfgData.tables);
    newTables.set(newTable.tableName, newTable);
    const newCfgData = new (cfgData.constructor as any)(newTables, cfgData.stat);

    const errStrList = errs.errs.map((e) => e.msg());
    return new DataUpdater(newCfgData, errStrList);
  }

  /**
   * Check if a table is in column mode.
   * Ported from Java SchemaUtil.isColumnMode.
   */
  private static isColumnMode(cfgSchema: any, tableName: string): boolean {
    const table = cfgSchema.findTable(tableName);
    if (table !== undefined) {
      return table.isColumnMode;
    }
    return false;
  }
}
