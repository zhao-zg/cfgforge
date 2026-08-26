/**
 * LangTextFinder — TypeScript port of Java `configgen.i18n.LangTextFinder`.
 *
 * A per-language text finder that holds translation data for multiple tables.
 * Keyed by table name → TextFinder.
 *
 * Java source: configgen.i18n.LangTextFinder.java (50 lines)
 */

import { getDefaultFileSystem } from '@cfggen/shared';
import { TextByValueFinder } from './TextByValueFinder';
import { TextByIdFinder } from './TextByIdFinder';

// ---------------------------------------------------------------------------
// TextVisitor — visit (original, translated) pairs
// ---------------------------------------------------------------------------

export interface TextVisitor {
  visit(original: string, translated: string): void;
}

// ---------------------------------------------------------------------------
// TextFinder — per-table text finder
// ---------------------------------------------------------------------------

export interface TextFinder {
  /**
   * Find the translated text for a given primary key, field chain, and original text.
   * @returns the translated text, or null if not found
   */
  findText(pk: string, fieldChain: string[], original: string): string | null;

  /**
   * Iterate over all (original, translated) pairs in this table.
   */
  foreachText(visitor: TextVisitor): void;
}

// ---------------------------------------------------------------------------
// LangTextFinder — maps table names to their TextFinder
// ---------------------------------------------------------------------------

/**
 * Maps table name → TextFinder.
 * Java extends TreeMap<String, TextFinder> (sorted); TS uses Map.
 */
export class LangTextFinder {
  private readonly _map: Map<string, TextFinder> = new Map();

  getTextFinder(table: string): TextFinder | null {
    return this._map.get(table) ?? null;
  }

  setTextFinder(table: string, finder: TextFinder): void {
    this._map.set(table, finder);
  }

  /**
   * Read a LangTextFinder from a path.
   * If path is a directory → byId strategy (TextByIdFinder, xlsx).
   * If path is a file → byValue strategy (TextByValueFinder, CSV).
   */
  static read(filePath: string): LangTextFinder {
    const dfs = getDefaultFileSystem();
    if (dfs.isDirectorySync(filePath)) {
      // byId strategy: directory of xlsx files per language
      return TextByIdFinder.loadOneLang(filePath);
    } else {
      // byValue strategy: single CSV file
      return TextByValueFinder.loadOneLang(filePath);
    }
  }

  /**
   * Read a LangTextFinder from a path (async, via CfgFileSystem).
   * If path is a directory → byId strategy (TextByIdFinder, xlsx).
   * If path is a file → byValue strategy (CSV).
   */
  static async readAsync(filePath: string): Promise<LangTextFinder> {
    const dfs = getDefaultFileSystem();
    const isDir = await dfs.isDirectory(filePath);
    if (isDir) {
      return TextByIdFinder.loadOneLangAsync(filePath);
    } else {
      return TextByValueFinder.loadOneLangAsync(filePath);
    }
  }
}
