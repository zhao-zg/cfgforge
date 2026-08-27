/**
 * NoteEditService tests — T9.9
 *
 * NoteEditService manages key-value notes stored in a CSV file:
 *   - getNotes: read all notes from CSV
 *   - updateNote: add/update/delete a note, then write back to CSV
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { NoteEditService } from '../NoteEditService';
import type { Note, Notes, NoteEditResult, NoteResultCode } from '../NoteEditService';

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NoteEditService', () => {
  let tempDir: string;
  let noteCsvPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-noteedit-'));
    noteCsvPath = path.join(tempDir, 'note.csv');
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  // -------------------------------------------------------------------------
  // getNotes
  // -------------------------------------------------------------------------

  it('getNotes returns empty when file does not exist', async () => {
    const svc = await NoteEditService.create(noteCsvPath);
    const result = svc.getNotes();

    expect(result.notes).toEqual([]);
  });

  it('getNotes reads existing notes from CSV', async () => {
    // Write a test CSV first
    fs.writeFileSync(noteCsvPath, 'key1,这是备注1\r\nkey2,这是备注2\r\n', 'utf8');

    const svc = await NoteEditService.create(noteCsvPath);
    const result = svc.getNotes();

    expect(result.notes.length).toBe(2);
    expect(result.notes[0].key).toBe('key1');
    expect(result.notes[0].note).toBe('这是备注1');
    expect(result.notes[1].key).toBe('key2');
    expect(result.notes[1].note).toBe('这是备注2');
  });

  // -------------------------------------------------------------------------
  // updateNote — add
  // -------------------------------------------------------------------------

  it('updateNote adds a new note', async () => {
    const svc = await NoteEditService.create(noteCsvPath);
    const result = svc.updateNote('newKey', 'new note') as NoteEditResult;

    expect(result.resultCode).toBe('addOk');
    expect(result.notes.length).toBe(1);
    expect(result.notes[0].key).toBe('newKey');
    expect(result.notes[0].note).toBe('new note');

    // Verify file was written
    expect(fs.existsSync(noteCsvPath)).toBe(true);
  });

  it('updateNote updates an existing note', async () => {
    fs.writeFileSync(noteCsvPath, 'key1,old note\r\n', 'utf8');
    const svc = await NoteEditService.create(noteCsvPath);
    const result = svc.updateNote('key1', 'new note') as NoteEditResult;

    expect(result.resultCode).toBe('updateOk');
    expect(result.notes.length).toBe(1);
    expect(result.notes[0].note).toBe('new note');
  });

  // -------------------------------------------------------------------------
  // updateNote — delete
  // -------------------------------------------------------------------------

  it('updateNote with empty note deletes existing note', async () => {
    fs.writeFileSync(noteCsvPath, 'key1,note1\r\nkey2,note2\r\n', 'utf8');
    const svc = await NoteEditService.create(noteCsvPath);
    const result = svc.updateNote('key1', '') as NoteEditResult;

    expect(result.resultCode).toBe('deleteOk');
    expect(result.notes.length).toBe(1);
    expect(result.notes[0].key).toBe('key2');
  });

  it('updateNote with empty note on non-existent key returns keyNotFoundOnDelete', async () => {
    const svc = await NoteEditService.create(noteCsvPath);
    const result = svc.updateNote('nonexistent', '') as NoteEditResult;

    expect(result.resultCode).toBe('keyNotFoundOnDelete');
    expect(result.notes.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // updateNote — error cases
  // -------------------------------------------------------------------------

  it('updateNote with empty key returns keyNotSet', async () => {
    const svc = await NoteEditService.create(noteCsvPath);
    const result = svc.updateNote('', 'some note') as NoteEditResult;

    expect(result.resultCode).toBe('keyNotSet');
  });

  it('updateNote with null key returns keyNotSet', async () => {
    const svc = await NoteEditService.create(noteCsvPath);
    const result = svc.updateNote(null as unknown as string, 'some note') as NoteEditResult;

    expect(result.resultCode).toBe('keyNotSet');
  });

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  it('notes persist across instances', async () => {
    const svc1 = await NoteEditService.create(noteCsvPath);
    svc1.updateNote('persistKey', 'persist note');

    // Create a new instance reading from the same file
    const svc2 = await NoteEditService.create(noteCsvPath);
    const result = svc2.getNotes();

    expect(result.notes.length).toBe(1);
    expect(result.notes[0].key).toBe('persistKey');
    expect(result.notes[0].note).toBe('persist note');
  });

  it('multiple notes maintain insertion order', async () => {
    const svc = await NoteEditService.create(noteCsvPath);
    svc.updateNote('c', 'note c');
    svc.updateNote('a', 'note a');
    svc.updateNote('b', 'note b');

    const result = svc.getNotes();
    expect(result.notes.length).toBe(3);
    // Order should be insertion order: c, a, b
    expect(result.notes[0].key).toBe('c');
    expect(result.notes[1].key).toBe('a');
    expect(result.notes[2].key).toBe('b');
  });
});
