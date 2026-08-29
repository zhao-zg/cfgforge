/**
 * editor-core 懒加载器。
 *
 * 将 @cfgforge/editor-core（含 @cfgforge/context、@cfgforge/data 等重型包）从首屏静态导入
 * 改为动态导入：Vite 会自动将动态 import() 拆为独立 chunk，使 editor-core 整棵依赖树
 * 不进入首屏 bundle（预估减少 ~500KB+ 首屏体积）。
 *
 * 模块级 Promise 缓存：首次 loadEditorCore() 触发网络请求拉取 chunk，
 * 后续调用直接返回同一个 Promise（不会重复加载）。
 */

/** editor-core 模块的类型：所有运行时导出的类/函数。 */
export type EditorCoreModule = typeof import('@cfgforge/editor-core');

let corePromise: Promise<EditorCoreModule> | null = null;

/**
 * 动态加载 @cfgforge/editor-core 模块（首次调用发起网络请求，后续返回缓存 Promise）。
 * apiClient.ts 的所有 async 函数通过 await getCore() 获取模块。
 */
export function loadEditorCore(): Promise<EditorCoreModule> {
    if (!corePromise) {
        corePromise = import('@cfgforge/editor-core');
    }
    return corePromise;
}

/**
 * 同步获取已加载的 editor-core 模块（如果已加载完成）。
 * 用于 startAutoReload 等同步函数——调用方需确保 initEditor 已完成（模块已加载）。
 * 若模块尚未加载完成，抛出错误（调用方应先 await initEditor）。
 */
let coreModule: EditorCoreModule | null = null;

export async function loadAndCacheCore(): Promise<EditorCoreModule> {
    const mod = await loadEditorCore();
    coreModule = mod;
    return mod;
}

export function getCachedCore(): EditorCoreModule {
    if (!coreModule) {
        throw new Error('editor-core not loaded yet. Call initEditor() first.');
    }
    return coreModule;
}
