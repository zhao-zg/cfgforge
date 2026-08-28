/**
 * JsonTableFiles — TypeScript port of Java `configgen.data.JsonTableFiles`.
 *
 * Port interface (hexagonal architecture): provides JSON file listings
 * by table name. The value layer uses this port to discover which JSON
 * files to parse, without depending on the ctx layer.
 *
 * Implementation: `DirectoryStructure` (ctx layer, Phase 5).
 */

import type { JsonFileInfo } from './JsonFileInfo.js';

export interface JsonTableFiles {
  /**
   * Returns all JSON files for the given table name.
   * @param tableName  fully-qualified table name (e.g. "buff.buff")
   * @returns ordered list of JsonFileInfo (empty if no files)
   */
  jsonFilesOf(tableName: string): JsonFileInfo[];
}
