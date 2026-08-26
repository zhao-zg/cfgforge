/**
 * apiClient — 直接调用 @cfggen/editor-core 的服务层。
 *
 * 改造前：通过 axios HTTP 调用 Java 后端（-gen server）。
 * 改造后：直接 import 并调用 editor-core 的 TypeScript 服务类。
 *
 * Tauri IPC 发生在更底层（@tauri-apps/plugin-fs），而非此层。
 * apiClient 层只需 initEditor(dataDir) 初始化，之后所有调用
 * 走 editor-core → CfgFileSystem → NodeFileSystem / TauriFileSystem。
 *
 * 函数签名尽量保持与旧 axios 版本一致（参数名/返回值类型），
 * 但 server: string 参数被替换为 dataDir（通过 initEditor 设置）。
 * AbortSignal 参数保留但不使用（直接调用无法中途取消）。
 */

import {
    EditorService,
    SchemaService,
    RecordService,
    RecordEditService,
    RecordRefIdsService,
    SchemaWriteService,
    TableCreateService,
    CheckJsonService,
    PromptService,
    NoteEditService,
    SearchService,
} from '@cfggen/editor-core';

import type {
    RawSchema,
    RecordResult,
    RecordRefsResult,
    UnreferencedRecordsResult,
    RecordRefIdsResult,
    RecordEditResult,
    SchemaTextResult,
    SchemaWriteResult,
    CreateResult,
    TableCreateRequest,
    CheckJsonResult,
    PromptResult,
    SearchResult,
} from '@cfggen/editor-core';

// Re-export types needed by UI components ( CreateTableForm 等)
export type {
    TableCreateRequest,
    FieldRequest,
    EnumValueRequest,
    CreateResult,
} from '@cfggen/editor-core';

import type {Notes, NoteEditResult as LocalNoteEditResult} from './noteModel';
import type {JSONObject} from './recordModel';

// ---------------------------------------------------------------------------
// EditorService instance management
// ---------------------------------------------------------------------------

let editor: EditorService | null = null;

/** Join path segments using the OS-appropriate separator. */
function joinPath(base: string, file: string): string {
    const sep = base.includes('/') && !base.includes('\\') ? '/' : '\\';
    return base + sep + file;
}

/**
 * Initialize the EditorService with a data directory.
 * Must be called before any API function.
 */
export async function initEditor(dataDir: string): Promise<void> {
    editor = await EditorService.create(dataDir);
}

/**
 * Reload the EditorService from disk (pick up file changes).
 */
export async function reloadEditor(): Promise<void> {
    if (editor === null) {
        throw new Error('Editor not initialized. Call initEditor(dataDir) first.');
    }
    await editor.reload();
}

/**
 * Shutdown the EditorService (clear the cached instance).
 */
export function shutdownEditor(): void {
    editor = null;
}

/**
 * Get the current EditorService instance (internal).
 */
function getEditor(): EditorService {
    if (editor === null) {
        throw new Error('Editor not initialized. Call initEditor(dataDir) first.');
    }
    return editor;
}

// ---------------------------------------------------------------------------
// Schema API
// ---------------------------------------------------------------------------

export async function fetchSchema(_signal?: AbortSignal): Promise<RawSchema> {
    return SchemaService.fromCfgValue(getEditor().cfgValue());
}

// ---------------------------------------------------------------------------
// Record API
// ---------------------------------------------------------------------------

export async function fetchRecord(
    tableId: string,
    id: string,
    _signal?: AbortSignal,
): Promise<RecordResult> {
    const editor = getEditor();
    const svc = new RecordService(
        editor.cfgValue(),
        editor.graph(),
        tableId,
        id,
        1,      // depth
        false,  // in
        1000,   // maxObjs
        'requestRecord',
    );
    return svc.retrieve() as RecordResult;
}

export async function fetchRecordRefIds(
    tableId: string,
    id: string,
    refInDepth: number,
    refOutDepth: number,
    maxIds: number,
    _signal?: AbortSignal,
): Promise<RecordRefIdsResult> {
    const editor = getEditor();
    const svc = new RecordRefIdsService(
        editor.cfgValue(),
        editor.graph(),
        tableId,
        id,
        refInDepth,
        refOutDepth,
        maxIds,
    );
    return svc.retrieve();
}

export async function fetchRecordRefs(
    tableId: string,
    id: string,
    refOutDepth: number,
    maxNode: number,
    refIn: boolean,
    _signal?: AbortSignal,
): Promise<RecordRefsResult> {
    const editor = getEditor();
    const svc = new RecordService(
        editor.cfgValue(),
        editor.graph(),
        tableId,
        id,
        refOutDepth,
        refIn,
        maxNode,
        'requestRefs',
    );
    return svc.retrieve() as RecordRefsResult;
}

export async function fetchUnreferencedRecords(
    tableId: string,
    maxNode: number,
    _signal?: AbortSignal,
): Promise<UnreferencedRecordsResult> {
    const editor = getEditor();
    const svc = new RecordService(
        editor.cfgValue(),
        editor.graph(),
        tableId,
        null,
        0,
        false,
        maxNode,
        'requestUnreferenced',
    );
    return svc.retrieve() as UnreferencedRecordsResult;
}

// ---------------------------------------------------------------------------
// Record Edit API
// ---------------------------------------------------------------------------

export async function addOrUpdateRecord(
    tableId: string,
    editingObject: JSONObject,
    _signal?: AbortSignal,
): Promise<RecordEditResult> {
    const editor = getEditor();
    return RecordEditService.addOrUpdateRecord(
        editor,
        tableId,
        JSON.stringify(editingObject),
    );
}

export async function deleteRecord(
    tableId: string,
    id: string,
    _signal?: AbortSignal,
): Promise<RecordEditResult> {
    const editor = getEditor();
    return RecordEditService.deleteRecord(editor, tableId, id);
}

// ---------------------------------------------------------------------------
// Notes API
// ---------------------------------------------------------------------------

export async function fetchNotes(_signal?: AbortSignal): Promise<Notes> {
    const editor = getEditor();
    const notePath = joinPath(editor.rootDir(), 'note.csv');
    const svc = await NoteEditService.create(notePath);
    return svc.getNotes();
}

export async function updateNote(
    key: string,
    note: string,
    _signal?: AbortSignal,
): Promise<LocalNoteEditResult> {
    const editor = getEditor();
    const notePath = joinPath(editor.rootDir(), 'note.csv');
    const svc = await NoteEditService.create(notePath);
    const result = await svc.updateNoteAsync(key, note);
    // editor-core NoteEditResult.notes is Note[] (flat), wrap to local Notes type
    // for setNotesCache() compatibility ({notes: NoteModel[]}).
    return {
        resultCode: result.resultCode,
        notes: {notes: result.notes},
    };
}

// ---------------------------------------------------------------------------
// AI Prompt API
// ---------------------------------------------------------------------------

export async function getPrompt(
    table: string,
    _signal?: AbortSignal,
): Promise<PromptResult> {
    return PromptService.gen(getEditor(), table);
}

// ---------------------------------------------------------------------------
// JSON Check API
// ---------------------------------------------------------------------------

export async function checkJson(
    tableId: string,
    raw: string,
    _signal?: AbortSignal,
): Promise<CheckJsonResult> {
    return CheckJsonService.checkJson(getEditor(), tableId, raw);
}

// ---------------------------------------------------------------------------
// Search API
// ---------------------------------------------------------------------------

export async function searchServer(
    q: string,
    max: number,
    _signal?: AbortSignal,
): Promise<SearchResult> {
    return SearchService.search(getEditor(), q, max);
}

// ---------------------------------------------------------------------------
// Schema Text API
// ---------------------------------------------------------------------------

export async function fetchSchemaText(_signal?: AbortSignal): Promise<SchemaTextResult> {
    return SchemaWriteService.readSchemaTextAsync(getEditor());
}

export async function writeSchemaText(
    cfgText: string,
    _signal?: AbortSignal,
): Promise<SchemaWriteResult> {
    const editor = getEditor();
    const result = await SchemaWriteService.writeSchemaTextAsync(editor, cfgText);
    if (result.ok) {
        await editor.reload();
    }
    return result;
}

// ---------------------------------------------------------------------------
// Table Creation API
// ---------------------------------------------------------------------------

export async function createTable(
    request: TableCreateRequest,
    _signal?: AbortSignal,
): Promise<CreateResult> {
    const editor = getEditor();
    const result = await TableCreateService.createTableAsync(editor, request);
    if (result.ok) {
        await editor.reload();
    }
    return result;
}

export async function createDataFile(
    tableName: string,
    _signal?: AbortSignal,
): Promise<CreateResult> {
    const editor = getEditor();
    return TableCreateService.createDataFileAsync(editor, tableName);
}
