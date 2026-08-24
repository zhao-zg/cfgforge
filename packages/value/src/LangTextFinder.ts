/**
 * LangTextFinder — TypeScript port of Java `configgen.i18n.LangTextFinder`.
 *
 * A per-language text finder that holds translation data for multiple tables.
 * Full implementation (reading from disk, TextByIdFinder, TextByValueFinder)
 * is Phase 5. This module defines the interfaces and a minimal stub class
 * that the value layer can depend on without waiting for Phase 5.
 *
 * Java source: configgen.i18n.LangTextFinder.java (50 lines)
 */

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
   * Full implementation is in Phase 5 (TextByIdFinder / TextByValueFinder).
   */
  static read(_path: string): LangTextFinder {
    throw new Error('LangTextFinder.read() not yet implemented (Phase 5)');
  }
}
