/**
 * AppLoader 三阶段加载逻辑测试 — Task 7 [P2]
 *
 * AppLoader.tsx 编排三个 React Query（Phase 2/3 并行启动）：
 *   Phase 1: setting()  → readPrefAsyncOnce    （staleTime: Infinity, retry: 0）
 *   Phase 2: resInfo()  → readResInfosAsync    （enabled: !!data）
 *   Phase 3: editor-init → initEditor(dataDir)  （enabled: !!data）
 *
 * Phase 1 完成后 readStoreStateOnce() 同步设置 dataDir，Phase 2/3 不再串行等待。
 * 渲染门控：isError || (data && !resInfoQuery.isPending && !editorInitQuery.isPending)
 *
 * 项目无 @testing-library/react，不渲染 React 组件。
 * 测试策略：
 *   1. queryFn 行为：readPrefAsyncOnce / readResInfosAsync 在非 Tauri 环境返回 true
 *   2. enabled 条件：提取为纯函数，覆盖所有布尔组合
 *   3. 渲染门控：提取为纯函数，覆盖所有布尔组合
 */

import {describe, it, expect} from 'vitest';
import {queryKeys} from '@/services/queryKeys';
import {readPrefAsyncOnce} from '@/store/storage';
import {readResInfosAsync} from '@/res/readResInfosAsync';
import {getMyStore} from '@/store/store';

// ---------------------------------------------------------------------------
// 纯函数：复制 AppLoader.tsx 中的 enabled / 渲染门控条件，用于测试所有布尔组合。
// 这些函数镜像 AppLoader.tsx 的精确表达式（行号见注释），不是重新实现。
// ---------------------------------------------------------------------------

/** Phase 2 (resInfoQuery) enabled 条件 — AppLoader.tsx line 20: `enabled: !!data` */
function shouldEnableResInfo(data: unknown): boolean {
    return !!data;
}

/** Phase 3 (editorInitQuery) enabled 条件 — AppLoader.tsx line 36: `enabled: !!data`（并行化后不再等 resInfo） */
function shouldEnableEditorInit(data: unknown): boolean {
    return !!data;
}

/** 渲染门控 — AppLoader.tsx line 46: `isError || (data && !resInfoQuery.isPending && !editorInitQuery.isPending)` */
function shouldRenderCfgEditorApp(
    isError: boolean,
    data: unknown,
    resInfoIsPending: boolean,
    editorInitIsPending: boolean,
): boolean {
    return isError || (!!data && !resInfoIsPending && !editorInitIsPending);
}

// ---------------------------------------------------------------------------

describe('AppLoader 三阶段加载逻辑', () => {

    describe('queryKeys 启动期 key', () => {
        it('setting() 返回 ["setting"]', () => {
            expect(queryKeys.setting()).toEqual(['setting']);
        });

        it('resInfo() 返回 ["setting", "resInfo"]（挂在 setting 域下）', () => {
            expect(queryKeys.resInfo()).toEqual(['setting', 'resInfo']);
        });

        it('resInfo key 以 setting key 为前缀（invalidate setting 级联到 resInfo）', () => {
            const settingKey = queryKeys.setting();
            const resInfoKey = queryKeys.resInfo();
            // 前缀匹配：resInfoKey 的前 N 段与 settingKey 完全一致
            expect(resInfoKey.slice(0, settingKey.length)).toEqual(settingKey);
        });
    });

    // -----------------------------------------------------------------------
    // readPrefAsyncOnce / readResInfosAsync：非 Tauri 环境（jsdom）行为
    //
    // 测试环境中 isTauri() 返回 false（jsdom 无 Tauri IPC），两个函数都短路返回 true。
    // alreadyRead 是模块级 one-shot 守卫，无法从外部重置——
    // 但无论走「首次调用 + isTauri=false」还是「alreadyRead=true 短路」，返回值都是 true。
    // -----------------------------------------------------------------------

    describe('readPrefAsyncOnce（非 Tauri 环境）', () => {
        it('返回 true', async () => {
            // isTauri()=false → 短路 return true（或 alreadyRead=true → return true）
            const result = await readPrefAsyncOnce();
            expect(result).toBe(true);
        });

        it('重复调用仍返回 true（alreadyRead 守卫不影响返回值）', async () => {
            const r1 = await readPrefAsyncOnce();
            const r2 = await readPrefAsyncOnce();
            expect(r1).toBe(true);
            expect(r2).toBe(true);
        });

        it('不抛异常（非 Tauri 环境不触碰 fs.readFile）', async () => {
            await expect(readPrefAsyncOnce()).resolves.toBe(true);
        });
    });

    describe('readResInfosAsync（非 Tauri 环境）', () => {
        it('返回 true', async () => {
            // isTauri()=false → readStoreStateOnce() 后短路 return true
            const result = await readResInfosAsync();
            expect(result).toBe(true);
        });

        it('重复调用仍返回 true（alreadyRead 守卫不影响返回值）', async () => {
            const r1 = await readResInfosAsync();
            const r2 = await readResInfosAsync();
            expect(r1).toBe(true);
            expect(r2).toBe(true);
        });

        it('不抛异常（非 Tauri 环境不触碰 readDir / path.join）', async () => {
            await expect(readResInfosAsync()).resolves.toBe(true);
        });

        it('调用后 store 可正常访问（readStoreStateOnce 副作用不破坏 store）', async () => {
            await readResInfosAsync();
            const store = getMyStore();
            // readStoreStateOnce 读了 localStorage（空 → 保留默认值），store 字段应可正常访问
            expect(typeof store.dataDir).toBe('string');
            expect(store.tauriConf).toBeDefined();
            expect(store.tauriConf.resDirs).toBeDefined();
        });
    });

    // -----------------------------------------------------------------------
    // Phase 2 enabled: !!data
    // -----------------------------------------------------------------------

    describe('Phase 2 (resInfoQuery) enabled 条件', () => {
        it('data 为 true 时启用', () => {
            expect(shouldEnableResInfo(true)).toBe(true);
        });

        it('data 为 truthy 非布尔值时启用', () => {
            expect(shouldEnableResInfo(1)).toBe(true);
            expect(shouldEnableResInfo('hello')).toBe(true);
            expect(shouldEnableResInfo({})).toBe(true);
        });

        it('data 为 undefined 时禁用', () => {
            expect(shouldEnableResInfo(undefined)).toBe(false);
        });

        it('data 为 false 时禁用', () => {
            expect(shouldEnableResInfo(false)).toBe(false);
        });

        it('data 为 null 时禁用', () => {
            expect(shouldEnableResInfo(null)).toBe(false);
        });

        it('data 为 0 时禁用', () => {
            expect(shouldEnableResInfo(0)).toBe(false);
        });

        it('data 为空字符串时禁用', () => {
            expect(shouldEnableResInfo('')).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // Phase 3 enabled: !!data（并行化后与 Phase 2 相同条件，不再等 resInfo）
    // -----------------------------------------------------------------------

    describe('Phase 3 (editorInitQuery) enabled 条件', () => {
        it('data 为 true 时启用', () => {
            expect(shouldEnableEditorInit(true)).toBe(true);
        });

        it('data 为 truthy 非布尔值时启用', () => {
            expect(shouldEnableEditorInit(1)).toBe(true);
            expect(shouldEnableEditorInit('hello')).toBe(true);
            expect(shouldEnableEditorInit({})).toBe(true);
        });

        it('data 为 undefined 时禁用', () => {
            expect(shouldEnableEditorInit(undefined)).toBe(false);
        });

        it('data 为 false 时禁用', () => {
            expect(shouldEnableEditorInit(false)).toBe(false);
        });

        it('data 为 null 时禁用', () => {
            expect(shouldEnableEditorInit(null)).toBe(false);
        });

        it('data 为 0 时禁用', () => {
            expect(shouldEnableEditorInit(0)).toBe(false);
        });

        it('data 为空字符串时禁用', () => {
            expect(shouldEnableEditorInit('')).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // 渲染门控: isError || (data && !resInfoQuery.isPending && !editorInitQuery.isPending)
    // -----------------------------------------------------------------------

    describe('渲染门控条件', () => {
        it('三阶段全部完成时放行渲染', () => {
            // data=true, resInfo not pending, editorInit not pending
            expect(shouldRenderCfgEditorApp(false, true, false, false)).toBe(true);
        });

        it('setting 查询失败时放行渲染（isError 优先，显示错误提示）', () => {
            // isError=true → 直接渲染，CfgEditorApp 自身的 useQuery 会触发 fetchSchema 报错
            expect(shouldRenderCfgEditorApp(true, undefined, false, false)).toBe(true);
        });

        it('setting 失败 + resInfo 未完成时仍放行（isError 短路）', () => {
            expect(shouldRenderCfgEditorApp(true, undefined, true, true)).toBe(true);
        });

        it('setting 失败 + data 无值时仍放行（isError 短路）', () => {
            expect(shouldRenderCfgEditorApp(true, false, false, false)).toBe(true);
            expect(shouldRenderCfgEditorApp(true, null, true, true)).toBe(true);
        });

        it('setting 未完成（data 为 undefined）且无错误时阻止渲染', () => {
            expect(shouldRenderCfgEditorApp(false, undefined, false, false)).toBe(false);
            expect(shouldRenderCfgEditorApp(false, undefined, true, true)).toBe(false);
        });

        it('resInfo 仍在加载时阻止渲染', () => {
            // data=true 但 resInfoIsPending=true
            expect(shouldRenderCfgEditorApp(false, true, true, false)).toBe(false);
        });

        it('editorInit 仍在加载时阻止渲染', () => {
            // data=true, resInfo not pending, 但 editorInitIsPending=true
            expect(shouldRenderCfgEditorApp(false, true, false, true)).toBe(false);
        });

        it('resInfo 和 editorInit 都在加载时阻止渲染', () => {
            expect(shouldRenderCfgEditorApp(false, true, true, true)).toBe(false);
        });

        it('data 为 falsy（非 undefined）且无错误时阻止渲染', () => {
            // data=false/null/0/'' → !!data=false → 右侧分支 false
            expect(shouldRenderCfgEditorApp(false, false, false, false)).toBe(false);
            expect(shouldRenderCfgEditorApp(false, null, false, false)).toBe(false);
            expect(shouldRenderCfgEditorApp(false, 0, false, false)).toBe(false);
            expect(shouldRenderCfgEditorApp(false, '', false, false)).toBe(false);
        });

        it('isError=true 时无论其他状态都放行（完整短路覆盖）', () => {
            // 矩阵覆盖：isError=true × {data ∈ {truthy, falsy}} × {resInfoPending ∈ {true, false}} × {editorInitPending ∈ {true, false}}
            for (const data of [true, false, undefined, null, 'dir', 0, '']) {
                for (const resPending of [true, false]) {
                    for (const edPending of [true, false]) {
                        expect(shouldRenderCfgEditorApp(true, data, resPending, edPending)).toBe(true);
                    }
                }
            }
        });

        it('isError=false 时渲染条件 = data && !resInfoPending && !editorInitPending（完整矩阵）', () => {
            for (const data of [true, false, undefined, null, 'dir', 0, '']) {
                for (const resPending of [true, false]) {
                    for (const edPending of [true, false]) {
                        const expected = !!data && !resPending && !edPending;
                        expect(shouldRenderCfgEditorApp(false, data, resPending, edPending)).toBe(expected);
                    }
                }
            }
        });
    });

    // -----------------------------------------------------------------------
    // 三阶段依赖链：Phase N 依赖 Phase 1..N-1 全部完成
    // -----------------------------------------------------------------------

    describe('三阶段依赖链', () => {
        it('Phase 2 依赖 Phase 1：data 为真时 Phase 2 才启用', () => {
            // Phase 1 完成 → data = true → Phase 2 enabled
            expect(shouldEnableResInfo(true)).toBe(true);
            // Phase 1 未完成 → data = undefined → Phase 2 disabled
            expect(shouldEnableResInfo(undefined)).toBe(false);
        });

        it('Phase 3 依赖 Phase 1（不再等 Phase 2）：data 为真时 Phase 3 即启用', () => {
            // Phase 1 完成 → data = true → Phase 3 enabled（与 resInfo 是否完成无关）
            expect(shouldEnableEditorInit(true)).toBe(true);
            // Phase 1 未完成（data falsy）
            expect(shouldEnableEditorInit(false)).toBe(false);
            expect(shouldEnableEditorInit(undefined)).toBe(false);
        });

        it('渲染门控 = isError || (Phase1完成 && Phase2完成 && Phase3完成)', () => {
            // 全部完成
            expect(shouldRenderCfgEditorApp(false, true, false, false)).toBe(true);
            // 任一未完成 → 不渲染（除非 isError）
            expect(shouldRenderCfgEditorApp(false, true, true, false)).toBe(false);  // Phase 2 未完成
            expect(shouldRenderCfgEditorApp(false, true, false, true)).toBe(false);  // Phase 3 未完成
            expect(shouldRenderCfgEditorApp(false, undefined, false, false)).toBe(false); // Phase 1 未完成
            // isError 短路
            expect(shouldRenderCfgEditorApp(true, undefined, true, true)).toBe(true);
        });
    });
});
