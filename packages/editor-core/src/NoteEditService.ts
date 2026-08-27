/**
 * NoteEditService — T9.9
 *
 * 原 Java: configgen.editorserver.NoteEditService (85 行)
 *
 * 管理 key-value 备注的 CSV 文件：
 *   - getNotes: 读取所有备注
 *   - updateNote: 新增/更新/删除备注，并写回 CSV
 */

import { writeCSVToFile, writeCSVToFileAsync, type CSVRow } from '@cfgforge/shared';
import { getDefaultFileSystem } from '@cfgforge/shared';

export interface Note {
  key: string;
  note: string;
}

export interface Notes {
  notes: Note[];
}

export type NoteResultCode =
  | 'addOk'
  | 'updateOk'
  | 'deleteOk'
  | 'keyNotSet'
  | 'keyNotFoundOnDelete'
  | 'storeErr';

export interface NoteEditResult {
  resultCode: NoteResultCode;
  notes: Note[];
}

export class NoteEditService {
  private readonly noteMap: Map<string, string>;
  private readonly noteCsvPath: string;

  constructor(noteCsvPath: string) {
    this.noteCsvPath = noteCsvPath;
    this.noteMap = new Map<string, string>();
  }

  /**
   * Async factory: creates a NoteEditService and loads notes from CSV.
   * Uses CfgFileSystem abstraction (Tauri/WebView compatible).
   */
  static async create(noteCsvPath: string): Promise<NoteEditService> {
    const svc = new NoteEditService(noteCsvPath);
    const dfs = getDefaultFileSystem();
    if (await dfs.exists(noteCsvPath)) {
      const bytes = await dfs.readFile(noteCsvPath);
      const text = Buffer.from(bytes).toString('utf8');
      // Parse CSV manually (same as readCSV but from string)
      const rows = NoteEditService.parseCsvText(text);
      for (const row of rows) {
        if (row.length === 2) {
          svc.noteMap.set(row[0], row[1]);
        }
      }
    }
    return svc;
  }

  /**
   * Simple CSV parser (handles basic CSV without quoting edge cases).
   * readCSV from @cfgforge/shared uses fs directly; this is a lightweight
   * inline parser for async path.
   */
  private static parseCsvText(text: string): CSVRow[] {
    // Strip UTF-8 BOM if present (writeCSVToFileAsync writes BOM)
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    return lines.map((line) => line.split(','));
  }

  private writeNoteMap(): void {
    const list: CSVRow[] = [];
    for (const [key, note] of this.noteMap) {
      list.push([key, note]);
    }
    writeCSVToFile(this.noteCsvPath, list);
  }

  /**
   * Async variant of writeNoteMap.
   * Uses CfgFileSystem abstraction (Tauri/WebView compatible).
   */
  private async writeNoteMapAsync(): Promise<void> {
    const list: CSVRow[] = [];
    for (const [key, note] of this.noteMap) {
      list.push([key, note]);
    }
    if (list.length === 0) {
      // Write empty file to clear existing content (matches sync BomUtf8Writer behavior)
      const dfs = getDefaultFileSystem();
      await dfs.writeFile(this.noteCsvPath, Buffer.from('\uFEFF', 'utf8'));
      return;
    }
    await writeCSVToFileAsync(this.noteCsvPath, list);
  }

  /**
   * Async variant of updateNote.
   * Uses CfgFileSystem abstraction (Tauri/WebView compatible).
   */
  async updateNoteAsync(key: string, note: string): Promise<NoteEditResult> {
    if (key == null || key === '') {
      return { resultCode: 'keyNotSet', notes: this.getNotes().notes };
    }

    try {
      let code: NoteResultCode;
      if (note === '') {
        const old = this.noteMap.get(key);
        this.noteMap.delete(key);
        code = old != null ? 'deleteOk' : 'keyNotFoundOnDelete';
      } else {
        const old = this.noteMap.get(key);
        this.noteMap.set(key, note);
        code = old != null ? 'updateOk' : 'addOk';
      }
      await this.writeNoteMapAsync();
      return { resultCode: code, notes: this.getNotes().notes };
    } catch {
      return { resultCode: 'storeErr', notes: this.getNotes().notes };
    }
  }

  getNotes(): Notes {
    const notes: Note[] = [];
    for (const [key, note] of this.noteMap) {
      notes.push({ key, note });
    }
    return { notes };
  }

  updateNote(key: string, note: string): NoteEditResult {
    if (key == null || key === '') {
      return { resultCode: 'keyNotSet', notes: this.getNotes().notes };
    }

    try {
      let code: NoteResultCode;
      if (note === '') {
        const old = this.noteMap.get(key);
        this.noteMap.delete(key);
        code = old != null ? 'deleteOk' : 'keyNotFoundOnDelete';
      } else {
        const old = this.noteMap.get(key);
        this.noteMap.set(key, note);
        code = old != null ? 'updateOk' : 'addOk';
      }
      this.writeNoteMap();
      return { resultCode: code, notes: this.getNotes().notes };
    } catch {
      return { resultCode: 'storeErr', notes: this.getNotes().notes };
    }
  }
}
