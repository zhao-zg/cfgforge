/**
 * LangTextFinder — TypeScript port of Java `configgen.i18n.LangTextFinder`.
 *
 * A per-language text finder that holds translation data for multiple tables.
 * Full implementation (reading from disk, TextByIdFinder, TextByValueFinder)
 * is in @cfggen/i18n (Phase 5).
 *
 * This module defines the interfaces that the value layer can depend on
 * without waiting for Phase 5. The i18n package's LangTextFinder class
 * structurally satisfies this interface.
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
 *
 * Defined as an interface so the i18n package's class can structurally
 * satisfy it without private-field nominal incompatibility.
 */
export interface LangTextFinder {
  getTextFinder(table: string): TextFinder | null;
  setTextFinder(table: string, finder: TextFinder): void;
}
