/**
 * NoteEditService — T9.9
 *
 * 原 Java: configgen.editorserver.NoteEditService (85 行)
 *
 * 管理 key-value 备注的 CSV 文件：
 *   - getNotes: 读取所有备注
 *   - updateNote: 新增/更新/删除备注，并写回 CSV
 */

import * as fs from 'fs';
import { readCSV, writeCSVToFile, type CSVRow } from '@cfggen/shared';

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

    if (fs.existsSync(noteCsvPath)) {
      const rows = readCSV(noteCsvPath, 'utf8');
      for (const row of rows) {
        if (row.length === 2) {
          this.noteMap.set(row[0], row[1]);
        }
        // else: field count not 2, ignore (与 Java 一致)
      }
    }
  }

  private writeNoteMap(): void {
    const list: CSVRow[] = [];
    for (const [key, note] of this.noteMap) {
      list.push([key, note]);
    }
    writeCSVToFile(this.noteCsvPath, list);
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
