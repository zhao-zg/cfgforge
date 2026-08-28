/**
 * StringPool — TypeScript port of Java `configgen.genbytes.StringPool`.
 *
 * Deduplicates strings: addString returns an existing index if the string
 * is already in the pool, otherwise adds it and returns the new index.
 *
 * serialize(out): writeInt(count) + writeString(each)
 *
 * Java source: configgen.genbytes.StringPool.java (31 lines)
 */

import { ConfigOutput } from './ConfigOutput.js';

export class StringPool {
  private stringToIndex = new Map<string, number>();
  private strings: string[] = [];

  /**
   * Returns the index of `str` in the pool, adding it if not present.
   */
  addString(str: string): number {
    const existing = this.stringToIndex.get(str);
    if (existing !== undefined) {
      return existing;
    }
    const idx = this.strings.length;
    this.strings.push(str);
    this.stringToIndex.set(str, idx);
    return idx;
  }

  serialize(out: ConfigOutput): void {
    out.writeInt(this.strings.length);
    for (const str of this.strings) {
      out.writeString(str);
    }
  }
}
