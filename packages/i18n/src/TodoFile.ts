/**
 * TodoFile — TypeScript port of Java `configgen.i18n.TodoFile`.
 *
 * TODO translation workflow: read/write _todo_[lang].xlsx files.
 * Two sheets: "todo" (untranslated) and "参考用" (already translated reference).
 * Merges TODO entries back into a LangTextFinder.
 *
 * Uses SheetJS (xlsx) for synchronous reading/writing.
 *
 * Java source: configgen.i18n.TodoFile.java (181 lines)
 */

import * as XLSX from 'xlsx';
import { getDefaultFileSystem } from '@cfggen/shared';
import type { LangTextFinder } from './LangTextFinder';
import { TextByIdFinder, OneText } from './TextByIdFinder';
import { normalize } from './I18nUtils';

// ---------------------------------------------------------------------------
// TodoFileLine — one row in a TodoFile (top-level class)
// ---------------------------------------------------------------------------

export class TodoFileLine {
  readonly table: string;
  readonly id: string;
  readonly fieldChain: string;
  readonly original: string;
  readonly translated: string;

  constructor(table: string, id: string, fieldChain: string, original: string, translated: string) {
    this.table = table;
    this.id = id;
    this.fieldChain = fieldChain;
    this.original = original;
    this.translated = translated;
  }
}

// ---------------------------------------------------------------------------
// TodoFile
// ---------------------------------------------------------------------------

export class TodoFile {
  readonly todo: TodoFileLine[];
  readonly done: TodoFileLine[];

  constructor(todo: TodoFileLine[], done: TodoFileLine[]) {
    this.todo = todo;
    this.done = done;
  }

  static readonly TODO_SHEET_NAME = 'todo';
  static readonly DONE_SHEET_NAME = '参考用';
  static readonly HEADER: TodoFileLine = new TodoFileLine('table', 'id', 'fieldChain', 'original', 'translated');

  static header(): TodoFileLine {
    return TodoFile.HEADER;
  }

  /**
   * Read a _todo_[lang].xlsx file.
   */
  static read(todoFilePath: string): TodoFile {
    const wb = XLSX.readFile(todoFilePath);

    let todo: TodoFileLine[] = [];
    let done: TodoFileLine[] = [];

    const todoSheet = wb.Sheets[TodoFile.TODO_SHEET_NAME];
    if (todoSheet) {
      todo = TodoFile.readSheetToLines(todoSheet);
    }

    const doneSheet = wb.Sheets[TodoFile.DONE_SHEET_NAME];
    if (doneSheet) {
      done = TodoFile.readSheetToLines(doneSheet);
    }

    return new TodoFile(todo, done);
  }

  /**
   * Read a _todo_[lang].xlsx file (async, via CfgFileSystem).
   */
  static async readAsync(todoFilePath: string): Promise<TodoFile> {
    const dfs = getDefaultFileSystem();
    const bytes = await dfs.readFile(todoFilePath);
    const wb = XLSX.read(bytes);

    let todo: TodoFileLine[] = [];
    let done: TodoFileLine[] = [];

    const todoSheet = wb.Sheets[TodoFile.TODO_SHEET_NAME];
    if (todoSheet) {
      todo = TodoFile.readSheetToLines(todoSheet);
    }

    const doneSheet = wb.Sheets[TodoFile.DONE_SHEET_NAME];
    if (doneSheet) {
      done = TodoFile.readSheetToLines(doneSheet);
    }

    return new TodoFile(todo, done);
  }

  static readSheetToLines(sheet: XLSX.WorkSheet): TodoFileLine[] {
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: true,
      defval: null,
    });

    const lines: TodoFileLine[] = [];
    for (const row of rows) {
      const table = getCellVal(row, 0);
      const id = getCellVal(row, 1);
      const fieldChain = getCellVal(row, 2);
      const original = getCellVal(row, 3);
      const translated = getCellVal(row, 4);
      const normalized = normalize(original);
      lines.push(new TodoFileLine(table, id, fieldChain, normalized, translated));
    }

    return lines;
  }

  /**
   * Save the TodoFile to an .xlsx file.
   */
  static save(todoFilePath: string, todoFile: TodoFile): void {
    const wb = XLSX.utils.book_new();

    const todoAoA = todoFile.todo.map((line) => [line.table, line.id, line.fieldChain, line.original, line.translated]);
    const todoWs = XLSX.utils.aoa_to_sheet(todoAoA);
    XLSX.utils.book_append_sheet(wb, todoWs, TodoFile.TODO_SHEET_NAME);

    const doneAoA = todoFile.done.map((line) => [line.table, line.id, line.fieldChain, line.original, line.translated]);
    const doneWs = XLSX.utils.aoa_to_sheet(doneAoA);
    XLSX.utils.book_append_sheet(wb, doneWs, TodoFile.DONE_SHEET_NAME);

    XLSX.writeFile(wb, todoFilePath);
  }

  /**
   * Save the TodoFile to an .xlsx file (async, via CfgFileSystem).
   */
  static async saveAsync(todoFilePath: string, todoFile: TodoFile): Promise<void> {
    const dfs = getDefaultFileSystem();

    const wb = XLSX.utils.book_new();

    const todoAoA = todoFile.todo.map((line) => [line.table, line.id, line.fieldChain, line.original, line.translated]);
    const todoWs = XLSX.utils.aoa_to_sheet(todoAoA);
    XLSX.utils.book_append_sheet(wb, todoWs, TodoFile.TODO_SHEET_NAME);

    const doneAoA = todoFile.done.map((line) => [line.table, line.id, line.fieldChain, line.original, line.translated]);
    const doneWs = XLSX.utils.aoa_to_sheet(doneAoA);
    XLSX.utils.book_append_sheet(wb, doneWs, TodoFile.DONE_SHEET_NAME);

    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    await dfs.writeFile(todoFilePath, new Uint8Array(buffer));
  }

  /**
   * Read a _todo_[lang].xlsx and merge translations into the LangTextFinder.
   * Only the "todo" sheet is processed; "done" is already in other files.
   * Skips lines where translated is empty (keeps existing translation).
   */
  static readAndMergeToFinder(todoFilePath: string, langFinder: LangTextFinder): void {
    const wb = XLSX.readFile(todoFilePath);

    const todoSheet = wb.Sheets[TodoFile.TODO_SHEET_NAME];
    if (!todoSheet) {
      return;
    }

    const lines = TodoFile.readSheetToLines(todoSheet);

    // Skip header (index 0)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const table = line.table;
      const pk = line.id;
      const fieldChain = line.fieldChain;
      const original = line.original;
      const translated = line.translated;

      if (translated.length === 0) {
        // Keep existing translation from xlsx
        continue;
      }

      const finder = langFinder.getTextFinder(table) as TextByIdFinder | null;
      if (finder === null) {
        // Table not found, skip
        continue;
      }

      const record = finder.getPkToTexts().get(pk);
      if (record === undefined) {
        // Record not found, skip
        continue;
      }

      const fieldIndex = finder.getFieldChainToIndex().get(fieldChain);
      if (fieldIndex === undefined || fieldIndex >= record.texts.length) {
        // Field chain not found, skip
        continue;
      }

      const oldText = record.texts[fieldIndex];
      if (oldText === null || oldText.original !== original) {
        // Original mismatch, skip
        continue;
      }

      const newText = new OneText(original, translated);
      record.texts[fieldIndex] = newText;
    }
  }

  /**
   * Read a _todo_[lang].xlsx and merge translations into the LangTextFinder (async).
   */
  static async readAndMergeToFinderAsync(todoFilePath: string, langFinder: LangTextFinder): Promise<void> {
    const dfs = getDefaultFileSystem();
    const bytes = await dfs.readFile(todoFilePath);
    const wb = XLSX.read(bytes);

    const todoSheet = wb.Sheets[TodoFile.TODO_SHEET_NAME];
    if (!todoSheet) {
      return;
    }

    const lines = TodoFile.readSheetToLines(todoSheet);

    // Skip header (index 0)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const table = line.table;
      const pk = line.id;
      const fieldChain = line.fieldChain;
      const original = line.original;
      const translated = line.translated;

      if (translated.length === 0) {
        // Keep existing translation from xlsx
        continue;
      }

      const finder = langFinder.getTextFinder(table) as TextByIdFinder | null;
      if (finder === null) {
        // Table not found, skip
        continue;
      }

      const record = finder.getPkToTexts().get(pk);
      if (record === undefined) {
        // Record not found, skip
        continue;
      }

      const fieldIndex = finder.getFieldChainToIndex().get(fieldChain);
      if (fieldIndex === undefined || fieldIndex >= record.texts.length) {
        // Field chain not found, skip
        continue;
      }

      const oldText = record.texts[fieldIndex];
      if (oldText === null || oldText.original !== original) {
        // Original mismatch, skip
        continue;
      }

      const newText = new OneText(original, translated);
      record.texts[fieldIndex] = newText;
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: get cell value as string from SheetJS row array
// ---------------------------------------------------------------------------

function getCellVal(row: any[], c: number): string {
  if (!row || c >= row.length) {
    return '';
  }
  const val = row[c];
  if (val === null || val === undefined) {
    return '';
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
