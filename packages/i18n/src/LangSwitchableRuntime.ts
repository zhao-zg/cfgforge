/**
 * LangSwitchableRuntime — TypeScript port of Java
 * `configgen.i18n.LangSwitchableRuntime`.
 *
 * Runtime batch-query optimization: pre-loads TextFinder references for
 * the current table via enterTable(), then findAllLangText() returns
 * translations for ALL languages in one call (including default = original).
 *
 * Uses reusable arrays to avoid per-field allocation.
 *
 * Java source: configgen.i18n.LangSwitchableRuntime.java (52 lines)
 */

import type { LangSwitchable } from './LangSwitchable.js';
import type { TextFinder } from './LangTextFinder.js';

export class LangSwitchableRuntime {
  private readonly langSwitch: LangSwitchable;
  private readonly curTableTextFinderList: (TextFinder | null)[] = [];
  private readonly tmp: string[];
  private readonly tmpEmpty: string[];

  constructor(langSwitch: LangSwitchable) {
    this.langSwitch = langSwitch;
    const langCnt = langSwitch.languageCount();
    this.tmp = new Array<string>(langCnt);

    this.tmpEmpty = new Array<string>(langCnt);
    for (let i = 0; i < langCnt; i++) {
      this.tmpEmpty[i] = '';
    }
  }

  /**
   * Pre-load TextFinder references for the given table across all languages.
   */
  enterTable(table: string): void {
    this.curTableTextFinderList.length = 0;
    for (const i18n of this.langSwitch.langMap.values()) {
      this.curTableTextFinderList.push(i18n.getTextFinder(table));
    }
  }

  /**
   * Find translations for all languages in one call.
   * Returns array: [original, lang1Translation, lang2Translation, ...]
   * - Index 0 = original text (default language)
   * - If original is empty, returns array of empty strings
   * - If no translation found, uses original text as fallback
   */
  findAllLangText(pk: string, fieldChain: string[], original: string): string[] {
    if (original.length === 0) {
      return this.tmpEmpty;
    }

    this.tmp[0] = original;
    let i = 1;

    for (const finder of this.curTableTextFinderList) {
      let t: string | null = null;
      if (finder !== null) {
        t = finder.findText(pk, fieldChain, original);
      }
      if (t === null) {
        t = original;
      }
      this.tmp[i] = t;
      i++;
    }

    return this.tmp;
  }
}
