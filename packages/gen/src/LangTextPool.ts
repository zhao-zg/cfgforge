/**
 * LangTextPool — TypeScript port of Java `configgen.genbytes.LangTextPool`.
 *
 * Multi-language text pool: groups one TextPool per language.
 * addText(i18nStrings) adds the same text in all languages simultaneously,
 * returning a shared text index (same across all language pools).
 *
 * serialize(out): writeInt(poolCount) + each TextPool.serialize(out)
 * serializeFirst(out): writeInt(1) + textPools[0].serialize(out)
 *
 * Java source: configgen.genbytes.LangTextPool.java (56 lines)
 */

import { ConfigOutput } from './ConfigOutput';
import { TextPool } from './TextPool';

export class LangTextPool {
  private readonly _textPools: TextPool[];
  private _nextTextIndex = 0;

  constructor(langNames: string[]) {
    this._textPools = langNames.map((name) => new TextPool(name));
  }

  getTextPools(): TextPool[] {
    return this._textPools;
  }

  /**
   * Add multi-language text. i18nStrings.length must equal the number of
   * language pools. Returns the shared text index.
   */
  addText(i18nStrings: string[]): number {
    if (this._textPools.length !== i18nStrings.length) {
      throw new Error(
        `Language count mismatch: expected ${this._textPools.length}, got ${i18nStrings.length}`,
      );
    }

    for (let i = 0; i < this._textPools.length; i++) {
      this._textPools[i].addText(i18nStrings[i]);
    }

    const thisIndex = this._nextTextIndex;
    this._nextTextIndex++;
    return thisIndex;
  }

  serialize(out: ConfigOutput): void {
    out.writeInt(this._textPools.length);
    for (const tp of this._textPools) {
      tp.serialize(out);
    }
  }

  serializeFirst(out: ConfigOutput): void {
    out.writeInt(1);
    this._textPools[0].serialize(out);
  }
}
