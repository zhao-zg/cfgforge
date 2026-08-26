/**
 * TextByValueFinder — TypeScript port of Java
 * `configgen.i18n.TextByValueFinder`.
 *
 * Per-table text finder using the "by value" strategy:
 * the original text string itself is the lookup key.
 * Same original text → same translated text (no pk/fieldChain needed).
 *
 * Data source: CSV files with 3 columns: table, original, translated.
 *
 * Java source: configgen.i18n.TextByValueFinder.java (87 lines)
 */

import * as fs from 'fs';
import * as path from 'path';
import { readCSV, readCSVAsync, getDefaultFileSystem } from '@cfggen/shared';
import { normalize } from './I18nUtils';
import type { TextFinder, TextVisitor } from './LangTextFinder';
import { LangTextFinder } from './LangTextFinder';

export class TextByValueFinder implements TextFinder {
  private readonly _originalToTranslated = new Map<string, string>();

  findText(_pk: string, _fieldChain: string[], original: string): string | null {
    const normalized = normalize(original);
    const text = this._originalToTranslated.get(normalized);
    if (text !== undefined && text.length > 0) {
      return text;
    }
    return null;
  }

  foreachText(visitor: TextVisitor): void {
    for (const [original, translated] of this._originalToTranslated) {
      visitor.visit(original, translated);
    }
  }

  /** Internal: get the underlying map (for testing). */
  get originalToTranslated(): Map<string, string> {
    return this._originalToTranslated;
  }

  /**
   * Load one language from a single CSV file.
   * CSV format: 3 columns — table, original, translated.
   */
  static loadOneLang(filePath: string): LangTextFinder {
    const rows = readCSV(filePath, 'utf-8');

    if (rows.length === 0) {
      throw new Error('国际化i18n文件为空');
    }

    if (rows[0].length !== 3) {
      throw new Error('国际化i18n文件列数不为3');
    }

    const res = new LangTextFinder();
    for (const row of rows) {
      if (row.length === 0) {
        continue;
      }
      if (row.length !== 3) {
        // Skip malformed rows (matches Java behavior)
        // eslint-disable-next-line no-console
        console.log(`${row} 不是3列，被忽略`);
        continue;
      }

      const table = row[0];
      const original = row[1];
      const translated = row[2];
      const normalized = normalize(original);

      let finder = res.getTextFinder(table);
      if (finder === null) {
        finder = new TextByValueFinder();
        res.setTextFinder(table, finder);
      }
      (finder as TextByValueFinder)._originalToTranslated.set(normalized, translated);
    }

    return res;
  }

  /**
   * Load multiple languages from a directory of CSV files.
   * Each .csv file represents one language (filename without extension = lang name).
   */
  static loadMultiLang(dirPath: string): Map<string, LangTextFinder> {
    const langMap = new Map<string, LangTextFinder>();
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const name = entry.name;
        if (name.toLowerCase().endsWith('.csv')) {
          const langName = name.substring(0, name.length - 4);
          langMap.set(langName, TextByValueFinder.loadOneLang(path.join(dirPath, name)));
        }
      }
    }

    return langMap;
  }

  /**
   * Load one language from a single CSV file (async, via CfgFileSystem).
   */
  static async loadOneLangAsync(filePath: string): Promise<LangTextFinder> {
    const rows = await readCSVAsync(filePath, 'utf-8');

    if (rows.length === 0) {
      throw new Error('国际化i18n文件为空');
    }

    if (rows[0].length !== 3) {
      throw new Error('国际化i18n文件列数不为3');
    }

    const res = new LangTextFinder();
    for (const row of rows) {
      if (row.length === 0) {
        continue;
      }
      if (row.length !== 3) {
        console.log(`${row} 不是3列，被忽略`);
        continue;
      }

      const table = row[0];
      const original = row[1];
      const translated = row[2];
      const normalized = normalize(original);

      let finder = res.getTextFinder(table);
      if (finder === null) {
        finder = new TextByValueFinder();
        res.setTextFinder(table, finder);
      }
      (finder as TextByValueFinder)._originalToTranslated.set(normalized, translated);
    }

    return res;
  }

  /**
   * Load multiple languages from a directory of CSV files (async).
   */
  static async loadMultiLangAsync(dirPath: string): Promise<Map<string, LangTextFinder>> {
    const dfs = getDefaultFileSystem();
    const langMap = new Map<string, LangTextFinder>();
    const entries = await dfs.readDir(dirPath);

    for (const name of entries) {
      if (name.toLowerCase().endsWith('.csv')) {
        const langName = name.substring(0, name.length - 4);
        langMap.set(langName, await TextByValueFinder.loadOneLangAsync(path.join(dirPath, name)));
      }
    }

    return langMap;
  }
}
