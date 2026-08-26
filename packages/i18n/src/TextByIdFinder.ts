/**
 * TextByIdFinder — TypeScript port of Java
 * `configgen.i18n.TextByIdFinder`.
 *
 * Per-table text finder using the "by id" strategy:
 * pk + fieldChain combo is the lookup key.
 * Same original text can map to different translations for different pks.
 *
 * Data source: xlsx files (one per module, sheets = tables).
 * Column layout: pk | [desc] | orig1 | t(field1) | orig2 | t(field2) | ...
 *
 * Uses SheetJS (xlsx) for synchronous xlsx reading, matching Java's sync API.
 *
 * Java source: configgen.i18n.TextByIdFinder.java (349 lines)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { getDefaultFileSystem } from '@cfgforge/shared';
import type { TextFinder, TextVisitor } from './LangTextFinder';
import { LangTextFinder } from './LangTextFinder';
import { normalize, fieldChainStr } from './I18nUtils';

// ---------------------------------------------------------------------------
// OneText / OneRecord
// ---------------------------------------------------------------------------

export class OneText {
  readonly original: string;
  readonly translated: string;

  constructor(original: string, translated: string) {
    if (original === null || translated === null) {
      throw new Error('original和translated都不能为null');
    }
    this.original = original;
    this.translated = translated;
  }
}

export class OneRecord {
  readonly description: string | null;
  readonly texts: (OneText | null)[];

  constructor(description: string | null, texts: (OneText | null)[]) {
    this.description = description;
    this.texts = texts;
  }
}

// ---------------------------------------------------------------------------
// Cell value helpers (SheetJS version of I18nUtils.getCellAsString)
// ---------------------------------------------------------------------------

/**
 * Get cell value as string from a SheetJS row array.
 * SheetJS returns: number, string, boolean, null/undefined, Date.
 */
function getCellAsString(row: any[], c: number): string | null {
  if (!row || c >= row.length) {
    return null;
  }
  const val = row[c];
  // null/undefined = cell not present (Java: Optional.empty())
  if (val === null || val === undefined) {
    return null;
  }
  switch (typeof val) {
    case 'number':
      return String(val);
    case 'string':
      return val;
    case 'boolean':
      return String(val);
    default:
      if (val instanceof Date) {
        return val.toISOString();
      }
      return String(val);
  }
}

// ---------------------------------------------------------------------------
// TextByIdFinder
// ---------------------------------------------------------------------------

export class TextByIdFinder implements TextFinder {
  nullableDescriptionName: string | null = null;
  private readonly fieldChainToIndex: Map<string, number> = new Map();
  private readonly pkToTexts: Map<string, OneRecord> = new Map();

  findText(pk: string, fieldChain: string[], original: string): string | null {
    const fcStr = fieldChainStr(fieldChain);
    const idx = this.fieldChainToIndex.get(fcStr);
    if (idx === undefined) {
      return null;
    }

    const line = this.pkToTexts.get(pk);
    if (line === undefined) {
      return null;
    }

    if (idx >= line.texts.length) {
      return null;
    }

    const txt = line.texts[idx];
    const normalized = normalize(original);
    if (txt !== null && txt.original === normalized) {
      return txt.translated;
    }
    return null;
  }

  foreachText(visitor: TextVisitor): void {
    for (const line of this.pkToTexts.values()) {
      for (const t of line.texts) {
        if (t !== null) {
          visitor.visit(t.original, t.translated);
        }
      }
    }
  }

  getNullableDescriptionName(): string | null {
    return this.nullableDescriptionName;
  }

  setNullableDescriptionName(name: string | null): void {
    this.nullableDescriptionName = name;
  }

  getFieldChainToIndex(): Map<string, number> {
    return this.fieldChainToIndex;
  }

  getPkToTexts(): Map<string, OneRecord> {
    return this.pkToTexts;
  }

  // -----------------------------------------------------------------------
  // Static load methods
  // -----------------------------------------------------------------------

  /**
   * Load all languages from a directory.
   * Each subdirectory = one language. Each .xlsx file inside = one module.
   */
  static loadMultiLang(dirPath: string): Map<string, LangTextFinder> {
    const lang2i18n = new Map<string, LangTextFinder>();
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const langName = entry.name;
        lang2i18n.set(langName, TextByIdFinder.loadOneLang(path.join(dirPath, langName)));
      }
    }

    return lang2i18n;
  }

  /**
   * Load one language from its directory.
   * Reads all .xlsx files (except _todo_*.xlsx) and merges into LangTextFinder.
   * Also merges _todo_[lang].xlsx if it exists at the parent level.
   */
  static loadOneLang(langDir: string): LangTextFinder {
    const langName = path.basename(langDir);
    const todoFilename = TextByIdFinder.getTodoFileName(langName);

    const langFinder = new LangTextFinder();

    const entries = fs.readdirSync(langDir, { withFileTypes: true });
    const xlsxFiles = entries
      .filter((e) => e.isFile())
      .filter((e) => {
        const name = e.name.toLowerCase();
        return name.endsWith('.xlsx') && name !== todoFilename.toLowerCase();
      })
      .map((e) => path.join(langDir, e.name));

    // Read files sequentially (sync I/O)
    for (const filePath of xlsxFiles) {
      const map = TextByIdFinder.loadOneFile(filePath);
      for (const [tableName, finder] of map) {
        langFinder.setTextFinder(tableName, finder);
      }
    }

    // Merge _todo_[lang].xlsx if it exists at parent level
    const parentDir = path.dirname(langDir);
    const todoFilePath = path.join(parentDir, todoFilename);
    if (fs.existsSync(todoFilePath)) {
      TodoFile.readAndMergeToFinder(todoFilePath, langFinder);
    }

    return langFinder;
  }

  /**
   * Load all languages from a directory (async, via CfgFileSystem).
   */
  static async loadMultiLangAsync(dirPath: string): Promise<Map<string, LangTextFinder>> {
    const dfs = getDefaultFileSystem();
    const lang2i18n = new Map<string, LangTextFinder>();
    const entries = await dfs.readDir(dirPath);

    for (const name of entries) {
      const fullPath = path.join(dirPath, name);
      if (await dfs.isDirectory(fullPath)) {
        lang2i18n.set(name, await TextByIdFinder.loadOneLangAsync(fullPath));
      }
    }

    return lang2i18n;
  }

  /**
   * Load one language from its directory (async, via CfgFileSystem).
   */
  static async loadOneLangAsync(langDir: string): Promise<LangTextFinder> {
    const dfs = getDefaultFileSystem();
    const langName = path.basename(langDir);
    const todoFilename = TextByIdFinder.getTodoFileName(langName);

    const langFinder = new LangTextFinder();

    const entries = await dfs.readDir(langDir);
    const xlsxFiles: string[] = [];
    for (const name of entries) {
      const lower = name.toLowerCase();
      if (lower.endsWith('.xlsx') && lower !== todoFilename.toLowerCase()) {
        const fullPath = path.join(langDir, name);
        if (await dfs.isFile(fullPath)) {
          xlsxFiles.push(fullPath);
        }
      }
    }

    for (const filePath of xlsxFiles) {
      const map = await TextByIdFinder.loadOneFileAsync(filePath);
      for (const [tableName, finder] of map) {
        langFinder.setTextFinder(tableName, finder);
      }
    }

    // Merge _todo_[lang].xlsx if it exists at parent level
    const parentDir = path.dirname(langDir);
    const todoFilePath = path.join(parentDir, todoFilename);
    if (await dfs.exists(todoFilePath)) {
      await TodoFile.readAndMergeToFinderAsync(todoFilePath, langFinder);
    }

    return langFinder;
  }

  /**
   * Load one .xlsx file → Map<tableName, TextByIdFinder> (async, via CfgFileSystem).
   */
  static async loadOneFileAsync(filePath: string): Promise<Map<string, TextByIdFinder>> {
    const dfs = getDefaultFileSystem();
    const fileName = path.basename(filePath).toLowerCase();
    if (!fileName.endsWith('.xlsx')) {
      throw new Error(`file ${filePath} is not .xlsx`);
    }
    const moduleName = fileName.substring(0, fileName.length - 5);

    const map = new Map<string, TextByIdFinder>();
    const bytes = await dfs.readFile(filePath);
    const wb = XLSX.read(bytes);

    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const trimmedSheetName = sheetName.trim();
      const tableName = TextByIdFinder.getTableName(moduleName, trimmedSheetName);

      const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        blankrows: true,
        defval: null,
      });

      if (rawRows.length <= 1) {
        continue;
      }

      try {
        const textFinder = TextByIdFinder.loadOneSheet(rawRows);
        map.set(tableName, textFinder);
      } catch (e) {
        throw new Error(`${tableName} in ${filePath} read error: ${(e as Error).message}`);
      }
    }

    return map;
  }

  /**
   * Load one .xlsx file → Map<tableName, TextByIdFinder>.
   * Each sheet in the file becomes one table's finder.
   */
  static loadOneFile(filePath: string): Map<string, TextByIdFinder> {
    const fileName = path.basename(filePath).toLowerCase();
    if (!fileName.endsWith('.xlsx')) {
      throw new Error(`file ${filePath} is not .xlsx`);
    }
    const moduleName = fileName.substring(0, fileName.length - 5);

    const map = new Map<string, TextByIdFinder>();
    const wb = XLSX.readFile(filePath);

    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const trimmedSheetName = sheetName.trim();
      const tableName = TextByIdFinder.getTableName(moduleName, trimmedSheetName);

      // Convert sheet to array of rows (array of arrays)
      const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        blankrows: true,
        defval: null,
      });

      if (rawRows.length <= 1) {
        continue;
      }

      try {
        const textFinder = TextByIdFinder.loadOneSheet(rawRows);
        map.set(tableName, textFinder);
      } catch (e) {
        throw new Error(`${tableName} in ${filePath} read error: ${(e as Error).message}`);
      }
    }

    return map;
  }

  /**
   * Parse one sheet's rows into a TextByIdFinder.
   * Row 0 = header: pk | [desc] | orig1 | t(field1) | orig2 | t(field2) | ...
   * Rows 1+ = data: pk value, [desc value], original text, translated text, ...
   *
   * @param rawRows Array of rows, each row is an array of cell values.
   */
  static loadOneSheet(rawRows: any[][]): TextByIdFinder {
    const textFinder = new TextByIdFinder();

    const header = rawRows[0];
    const columnCount = header.length;
    if (columnCount <= 1) {
      return textFinder;
    }

    // Analyze header: find t(fieldChain) columns
    const tColumns: number[] = []; // column indices (0-based) of translated text
    let tColumnCnt = 0;

    for (let i = 2; i < columnCount; i++) {
      const cellStr = getCellAsString(header, i);
      if (cellStr !== null) {
        const field = cellStr;
        if (field.startsWith('t(') && field.endsWith(')')) {
          const fcStr = field.substring(2, field.length - 1);
          textFinder.fieldChainToIndex.set(fcStr, tColumnCnt);
          tColumns[tColumnCnt] = i;
          tColumnCnt++;
        }
      }
    }

    if (tColumnCnt === 0) {
      return textFinder;
    }

    // Check if there's a description column
    const hasDescription = tColumns[0] > 2;
    if (hasDescription) {
      const descName = getCellAsString(header, 1);
      textFinder.nullableDescriptionName = descName ?? '';
    }

    // Process data rows
    for (let r = 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0) {
        continue;
      }
      const pkCell = getCellAsString(row, 0);
      if (pkCell === null) {
        continue;
      }
      const pkStr = pkCell;

      let description: string | null = null;
      if (hasDescription) {
        description = getCellAsString(row, 1) ?? '';
      }

      const texts: (OneText | null)[] = [];
      for (let i = 0; i < tColumnCnt; i++) {
        const translateCol = tColumns[i];
        const originalCol = translateCol - 1;

        const oC = getCellAsString(row, originalCol);
        const tC = getCellAsString(row, translateCol);

        let ot: OneText | null;
        if ((oC === null || oC === '') && (tC === null || tC === '')) {
          ot = null;
        } else {
          const original = oC ?? '';
          const translate = tC ?? '';
          const normalized = normalize(original);
          ot = new OneText(normalized, translate);
        }
        texts.push(ot);
      }

      textFinder.pkToTexts.set(pkStr, new OneRecord(description, texts));
    }

    return textFinder;
  }

  static getTableName(moduleName: string, sheetName: string): string {
    if (sheetName.includes('.')) {
      return sheetName;
    }
    return moduleName + '.' + sheetName;
  }

  static getTodoFileName(lang: string): string {
    return '_todo_' + lang + '.xlsx';
  }
}

// ---------------------------------------------------------------------------
// TodoFile — TODO translation workflow
// ---------------------------------------------------------------------------

import { TodoFile } from './TodoFile';
