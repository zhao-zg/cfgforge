/**
 * apiClient — 直接调用 @cfgforge/editor-core 的服务层。
 *
 * 通过 initEditor(dataDir) 初始化后，所有调用走 editor-core → CfgFileSystem
 * → NodeFileSystem / TauriFileSystem。Tauri IPC 发生在更底层
 * （@tauri-apps/plugin-fs），而非此层。
 *
 * AbortSignal 参数保留但不使用（直接调用无法中途取消）。
 */

// editor-core 运行时类通过懒加载器动态获取，使整个 @cfgforge/editor-core 依赖树
// 不进入首屏 bundle（Vite 自动将动态 import() 拆为独立 chunk）。
import {loadAndCacheCore, getCachedCore} from './editorCoreLoader';
import type {EditorCoreModule} from './editorCoreLoader';

import type {
    RawSchema,
    RecordResult,
    RecordRefsResult,
    UnreferencedRecordsResult,
    RecordRefIdsResult,
    RecordEditResult,
    SchemaTextResult,
    SchemaWriteResult,
    FKAddRequest,
    FKMutateResult,
    FieldAddRequest,
    FieldUpdateRequest,
    FieldMutateResult,
    CreateResult,
    TableCreateRequest,
    CheckJsonResult,
    PromptResult,
    SearchResult,
    ExportResult,
    ExportAllResult,
    ExportFormat,
    SingleTableReloadResult,
    ValueErrInfo,
} from '@cfgforge/editor-core';

// Re-export types needed by UI components ( CreateTableForm 等)
export type {
    TableCreateRequest,
    FieldRequest,
    EnumValueRequest,
    CreateResult,
    FieldAddRequest,
    FieldUpdateRequest,
    FieldMutateResult,
} from '@cfgforge/editor-core';

import type {Notes, NoteEditResult as LocalNoteEditResult} from './noteModel';
import type {JSONObject} from './recordModel';
import type {SForeignKey} from './schemaModel';

// ---------------------------------------------------------------------------
// EditorService instance management
// ---------------------------------------------------------------------------

// editor 实例类型从 EditorService.create 的返回值推断（EditorService 构造函数是 private，
// InstanceType 无法使用）。Awaited<> 提取 Promise 的值类型。
type EditorInstance = Awaited<ReturnType<EditorCoreModule['EditorService']['create']>>;
let editor: EditorInstance | null = null;
// initEditor 失败时保存原始错误，让后续 getEditor() 抛出的信息包含真正原因，
// 而非笼统的 "Editor not initialized"（那是次生错误，用户看不到 initEditor 的真正报错）。
let initError: Error | null = null;

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
    try {
        const core = await loadAndCacheCore();
        editor = await core.EditorService.create(dataDir);
        initError = null;
    } catch (e) {
        editor = null;
        initError = e instanceof Error ? e : new Error(String(e));
        throw e;
    }
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
function getEditor(): NonNullable<typeof editor> {
    if (editor === null) {
        if (initError !== null) {
            throw new Error(`Editor initialization failed: ${initError.message}`);
        }
        throw new Error('Editor not initialized. Call initEditor(dataDir) first.');
    }
    return editor;
}

// ---------------------------------------------------------------------------
// Schema API
// ---------------------------------------------------------------------------

export async function fetchSchema(_signal?: AbortSignal): Promise<RawSchema> {
    const {SchemaService} = getCachedCore();
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
    const {RecordService} = getCachedCore();
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
    const {RecordRefIdsService} = getCachedCore();
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
    const {RecordService} = getCachedCore();
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
    const {RecordService} = getCachedCore();
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
    const {RecordEditService} = getCachedCore();
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
    const {RecordEditService} = getCachedCore();
    const editor = getEditor();
    return RecordEditService.deleteRecord(editor, tableId, id);
}

// ---------------------------------------------------------------------------
// Notes API
// ---------------------------------------------------------------------------

export async function fetchNotes(_signal?: AbortSignal): Promise<Notes> {
    const {NoteEditService} = getCachedCore();
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
    const {NoteEditService} = getCachedCore();
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
    const {PromptService} = getCachedCore();
    return PromptService.genAsync(getEditor(), table);
}

// ---------------------------------------------------------------------------
// JSON Check API
// ---------------------------------------------------------------------------

export async function checkJson(
    tableId: string,
    raw: string,
    _signal?: AbortSignal,
): Promise<CheckJsonResult> {
    const {CheckJsonService} = getCachedCore();
    return CheckJsonService.checkJson(getEditor(), tableId, raw);
}

// ---------------------------------------------------------------------------
// Search API
// ---------------------------------------------------------------------------

export async function searchConfig(
    q: string,
    max: number,
    _signal?: AbortSignal,
): Promise<SearchResult> {
    const {SearchService} = getCachedCore();
    return SearchService.search(getEditor(), q, max);
}

// ---------------------------------------------------------------------------
// Schema Text API
// ---------------------------------------------------------------------------

export async function fetchSchemaText(_signal?: AbortSignal): Promise<SchemaTextResult> {
    const {SchemaWriteService} = getCachedCore();
    return SchemaWriteService.readSchemaTextAsync(getEditor());
}

export async function writeSchemaText(
    cfgText: string,
    _signal?: AbortSignal,
): Promise<SchemaWriteResult> {
    const {SchemaWriteService} = getCachedCore();
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
    const {TableCreateService} = getCachedCore();
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
    const {TableCreateService} = getCachedCore();
    const editor = getEditor();
    return TableCreateService.createDataFileAsync(editor, tableName);
}

// ---------------------------------------------------------------------------
// Relation (FK) API
// ---------------------------------------------------------------------------

/** 列出 table 的全部外键。失败（表不存在/读 cfg 失败）时 throw。 */
export async function fetchTableFks(
    table: string,
    _signal?: AbortSignal,
): Promise<SForeignKey[]> {
    const {SchemaRelationService} = getCachedCore();
    const editor = getEditor();
    const res = SchemaRelationService.listFks(editor, table);
    if (!res.ok) {
        throw new Error(res.errors.join('; '));
    }
    return res.fks;
}

/** 新增外键：写回 config.cfg 后 reload（与 createTable 一致）。 */
export async function addForeignKey(
    req: FKAddRequest,
    _signal?: AbortSignal,
): Promise<FKMutateResult> {
    const {SchemaRelationService} = getCachedCore();
    const editor = getEditor();
    const result = await SchemaRelationService.addForeignKeyAsync(editor, req);
    if (result.ok) {
        await editor.reload();
    }
    return result;
}

/** 更新（含改名）外键：写回 config.cfg 后 reload。 */
export async function updateForeignKey(
    table: string,
    fkName: string,
    req: FKAddRequest,
    _signal?: AbortSignal,
): Promise<FKMutateResult> {
    const {SchemaRelationService} = getCachedCore();
    const editor = getEditor();
    const result = await SchemaRelationService.updateForeignKeyAsync(editor, table, fkName, req);
    if (result.ok) {
        await editor.reload();
    }
    return result;
}

/** 删除外键：写回 config.cfg 后 reload。 */
export async function removeForeignKey(
    table: string,
    fkName: string,
    _signal?: AbortSignal,
): Promise<FKMutateResult> {
    const {SchemaRelationService} = getCachedCore();
    const editor = getEditor();
    const result = await SchemaRelationService.removeForeignKeyAsync(editor, table, fkName);
    if (result.ok) {
        await editor.reload();
    }
    return result;
}

// ---------------------------------------------------------------------------
// Field (Schema Field) API
// ---------------------------------------------------------------------------

/** 新增字段：写回 config.cfg 后 reload（与 createTable 一致）。 */
export async function addField(
    table: string,
    req: FieldAddRequest,
    _signal?: AbortSignal,
): Promise<FieldMutateResult> {
    const {SchemaFieldService} = getCachedCore();
    const editor = getEditor();
    const result = await SchemaFieldService.addFieldAsync(editor, table, req);
    if (result.ok) {
        await editor.reload();
    }
    return result;
}

/** 更新字段（含改名/改类型/改注释）：写回 config.cfg 后 reload。 */
export async function updateField(
    table: string,
    oldName: string,
    req: FieldUpdateRequest,
    _signal?: AbortSignal,
): Promise<FieldMutateResult> {
    const {SchemaFieldService} = getCachedCore();
    const editor = getEditor();
    const result = await SchemaFieldService.updateFieldAsync(editor, table, oldName, req);
    if (result.ok) {
        await editor.reload();
    }
    return result;
}

/** 删除字段：写回 config.cfg 后 reload。 */
export async function removeField(
    table: string,
    fieldName: string,
    _signal?: AbortSignal,
): Promise<FieldMutateResult> {
    const {SchemaFieldService} = getCachedCore();
    const editor = getEditor();
    const result = await SchemaFieldService.removeFieldAsync(editor, table, fieldName);
    if (result.ok) {
        await editor.reload();
    }
    return result;
}

// ---------------------------------------------------------------------------
// Export API
// ---------------------------------------------------------------------------

export async function exportTable(
    tableId: string,
    format: ExportFormat,
    _signal?: AbortSignal,
): Promise<ExportResult> {
    const {ExportService} = getCachedCore();
    return ExportService.export(getEditor(), tableId, format);
}

export async function exportAllSql(_signal?: AbortSignal): Promise<ExportAllResult> {
    const {ExportService} = getCachedCore();
    return ExportService.exportAllSql(getEditor());
}

// ---------------------------------------------------------------------------
// Single Table Reload API (P1-5)
// ---------------------------------------------------------------------------

/**
 * 单表数据重载：重新读取该表的源文件（CSV/Excel），刷新该表数据。
 * 成功后 CfgValue 快照已由服务内部更新，无需 editor.reload()。
 */
export async function reloadTable(
    tableName: string,
    _signal?: AbortSignal,
): Promise<SingleTableReloadResult> {
    const {SingleTableReloadService} = getCachedCore();
    return SingleTableReloadService.reloadTable(getEditor(), tableName);
}

// ---------------------------------------------------------------------------
// Auto Reload API (P2-11)
// ---------------------------------------------------------------------------

// AutoReloadService 实例类型从 create 的返回值推断
type AutoReloadInstance = InstanceType<EditorCoreModule['AutoReloadService']>;
let autoReloadService: AutoReloadInstance | null = null;

/** 启动自动刷新轮询（默认 2s 间隔）。已运行则忽略。 */
export function startAutoReload(intervalMs = 2000): void {
    if (autoReloadService === null) {
        const {AutoReloadService} = getCachedCore();
        autoReloadService = new AutoReloadService();
    }
    autoReloadService.start(getEditor(), intervalMs);
}

/** 停止自动刷新轮询。 */
export function stopAutoReload(): void {
    if (autoReloadService !== null) {
        autoReloadService.stop();
    }
}

/** 查询自动刷新是否在运行。 */
export function isAutoReloadRunning(): boolean {
    return autoReloadService !== null && autoReloadService.isRunning;
}

// ---------------------------------------------------------------------------
// Value Errors API (Error List Panel)
// ---------------------------------------------------------------------------

/** 收集全部校验错误（VErr + VWarn），返回扁平数组供 UI 按表分组展示。 */
export async function fetchValueErrs(_signal?: AbortSignal): Promise<ValueErrInfo[]> {
    const {ValueErrsService} = getCachedCore();
    return ValueErrsService.collectValueErrs(getEditor());
}
