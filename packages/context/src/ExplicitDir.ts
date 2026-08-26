/**
 * ExplicitDir — TypeScript port of Java `configgen.ctx.ExplicitDir`.
 *
 * Specifies explicit subdirectories to use instead of auto-scanning.
 * - txtAsTsvFileInThisDirAsInRoot_To_AddTag_Map: dirs whose files are treated
 *   as being in rootDir, with auto-added tags (e.g. "ClientTables:noserver")
 * - excelFileDirs: directories to scan for excel files
 * - jsonFileDirs: directories to scan for json files
 *
 * Java source: configgen.ctx.ExplicitDir.java (37 lines)
 */

import { parseToMap, parseToSet } from '@cfgforge/shared';

export class ExplicitDir {
  readonly txtAsTsvFileInThisDirAsInRoot_To_AddTag_Map: Map<string, string | null>;
  readonly excelFileDirs: Set<string>;
  readonly jsonFileDirs: Set<string>;

  constructor(
    txtAsTsvFileInThisDirAsInRoot_To_AddTag_Map: Map<string, string | null>,
    excelFileDirs: Set<string>,
    jsonFileDirs: Set<string>,
  ) {
    if (txtAsTsvFileInThisDirAsInRoot_To_AddTag_Map === null || txtAsTsvFileInThisDirAsInRoot_To_AddTag_Map === undefined) {
      throw new Error('txtAsTsvFileInThisDirAsInRoot_To_AddTag_Map must not be null');
    }
    if (excelFileDirs === null || excelFileDirs === undefined) {
      throw new Error('excelFileDirs must not be null');
    }
    if (jsonFileDirs === null || jsonFileDirs === undefined) {
      throw new Error('jsonFileDirs must not be null');
    }
    this.txtAsTsvFileInThisDirAsInRoot_To_AddTag_Map = txtAsTsvFileInThisDirAsInRoot_To_AddTag_Map;
    this.excelFileDirs = excelFileDirs;
    this.jsonFileDirs = jsonFileDirs;
  }

  /**
   * Parse command-line arguments into an ExplicitDir, or null if all three are empty.
   */
  static parse(asRoot: string | null, excelDirs: string | null, jsonDirs: string | null): ExplicitDir | null {
    const root = parseToMap(asRoot);
    const excels = parseToSet(excelDirs);
    const jsons = parseToSet(jsonDirs);

    if (root.size === 0 && excels.size === 0 && jsons.size === 0) {
      return null;
    }
    return new ExplicitDir(root, excels, jsons);
  }
}
