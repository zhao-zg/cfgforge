/**
 * I18nUtils — TypeScript port of Java `configgen.i18n.I18nUtils`.
 *
 * Pure utility functions for text normalization and field chain formatting.
 *
 * Java source: configgen.i18n.I18nUtils.java (46 lines)
 */

/**
 * Normalize line endings: \r\n → \n.
 * Ensures consistent matching regardless of platform line-ending differences.
 */
export function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/**
 * Convert a field chain array to its string representation.
 * Single element: return the element directly.
 * Multiple elements: join with '-'.
 *   ["a"] → "a"
 *   ["a", "b"] → "a-b"
 *   ["a", "b", "c"] → "a-b-c"
 */
export function fieldChainStr(fieldChain: string[]): string {
  return fieldChain.length === 1 ? fieldChain[0] : fieldChain.join('-');
}
