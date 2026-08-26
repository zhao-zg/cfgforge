/**
 * LangSwitchable — TypeScript port of Java `configgen.i18n.LangSwitchable`.
 *
 * Multi-language container: holds a map of language → LangTextFinder,
 * plus a default language name. The default language is NOT in the map
 * (it uses the original text directly).
 *
 * Java source: configgen.i18n.LangSwitchable.java (52 lines)
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDefaultFileSystem } from '@cfgforge/shared';
import { LangTextFinder } from './LangTextFinder';
import { TextByValueFinder } from './TextByValueFinder';
import { TextByIdFinder } from './TextByIdFinder';

export class LangSwitchable {
  readonly langMap: Map<string, LangTextFinder>;
  readonly defaultLang: string;

  constructor(langMap: Map<string, LangTextFinder>, defaultLang: string) {
    if (langMap === null || langMap === undefined) {
      throw new Error('langMap must not be null');
    }
    if (defaultLang === null || defaultLang === undefined) {
      throw new Error('defaultLang must not be null');
    }
    this.langMap = langMap;
    this.defaultLang = defaultLang;
  }

  /**
   * Returns list of all languages, default first.
   * [defaultLang, ...langMap keys]
   */
  languages(): string[] {
    const res: string[] = [this.defaultLang];
    for (const key of this.langMap.keys()) {
      res.push(key);
    }
    return res;
  }

  /**
   * Total language count = langMap.size + 1 (default is not in map).
   */
  languageCount(): number {
    return this.langMap.size + 1;
  }

  /**
   * Read a LangSwitchable from a directory.
   * - If any entry in the directory is itself a directory → byId strategy
   *   (TextByIdFinder, xlsx files).
   * - Otherwise → byValue strategy (CSV files).
   */
  static read(dir: string, defaultLang: string): LangSwitchable {
    const langMap = LangSwitchable.isById(dir)
      ? TextByIdFinder.loadMultiLang(dir)
      : TextByValueFinder.loadMultiLang(dir);
    return new LangSwitchable(langMap, defaultLang);
  }

  /**
   * byId if any entry in the directory is itself a directory.
   */
  private static isById(dir: string): boolean {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.some((e) => e.isDirectory());
  }

  /**
   * Read a LangSwitchable from a directory (async, via CfgFileSystem).
   */
  static async readAsync(dir: string, defaultLang: string): Promise<LangSwitchable> {
    const byId = await LangSwitchable.isByIdAsync(dir);
    const langMap = byId
      ? await TextByIdFinder.loadMultiLangAsync(dir)
      : await TextByValueFinder.loadMultiLangAsync(dir);
    return new LangSwitchable(langMap, defaultLang);
  }

  /**
   * byId if any entry in the directory is itself a directory (async).
   */
  private static async isByIdAsync(dir: string): Promise<boolean> {
    const dfs = getDefaultFileSystem();
    const entries = await dfs.readDir(dir);
    for (const name of entries) {
      if (await dfs.isDirectory(path.join(dir, name))) {
        return true;
      }
    }
    return false;
  }
}
