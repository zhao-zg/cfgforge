import {useQuery} from "@tanstack/react-query";
import {readPrefAsyncOnce} from "@/store/storage";
import {CfgEditorApp} from "./CfgEditorApp";
import {queryKeys} from "@/services/queryKeys.ts";
import {readResInfosAsync} from "@/res/readResInfosAsync";
import {initEditor} from "@/api/apiClient.ts";
import {getMyStore, readStoreStateOnce} from "@/store/store";

export function AppLoader() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {isError, error: _error, data} = useQuery({
        queryKey: queryKeys.setting(),
        queryFn: readPrefAsyncOnce,
        staleTime: Infinity,
        retry: 0,
    })

    // readPrefAsyncOnce 完成后 localStorage 已有全部偏好值。
    // 立即同步读取 store 状态（含 dataDir），使后续 query 能并行启动而非串行等待 resInfo。
    // readResInfosAsync 内部也会调 readStoreStateOnce()，但它有自己的 alreadyRead 守卫，不会重复执行。
    if (data) {
        readStoreStateOnce();
    }

    // resInfo（递归扫描资源目录，慢 IPC）与 editorInit（全量建库，慢 IO）互相独立：
    // 原先 editorInit 的 enabled 依赖 !resInfoQuery.isPending（串行等待 resInfo 完成），
    // 现在 dataDir 已由 readStoreStateOnce 设置，两者可以并行启动。
    const resInfoQuery = useQuery({
        queryKey: queryKeys.resInfo(),
        queryFn: readResInfosAsync,
        enabled: !!data,
    })

    // editorInit 不再等 resInfo 完成——dataDir 在 readStoreStateOnce 后已就绪。
    // editorInit 失败时也放行渲染（CfgEditorApp 自身的 useQuery 会触发 fetchSchema 报错，显示错误提示）。
    const editorInitQuery = useQuery({
        queryKey: ['editor-init'],
        queryFn: async () => {
            const {dataDir} = getMyStore();
            if (dataDir) {
                try {
                    await initEditor(dataDir);
                } catch (err) {
                    console.error('[editorInit] initEditor failed:', err);
                    throw err;
                }
            }
            return true;
        },
        enabled: !!data,
        staleTime: Infinity,
        retry: 0,
    })

    // resInfo 完成前不渲染 CfgEditorApp：readResInfosAsync 会设置 resourceDir/resMap，
    // 提前渲染会让 findAllResInfos 用空 resourceDir 立即用空 resourceDir 算出错误路径，且高度少算的 layout 结果会被
    // React Query 缓存（queryKey 不含 resourceDir），导致节点重叠最长持续到 staleTime 过期
    if (isError || (data && !resInfoQuery.isPending && !editorInitQuery.isPending)) {
        return <CfgEditorApp/>
    }
}
