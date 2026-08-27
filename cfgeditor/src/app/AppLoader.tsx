import {useQuery} from "@tanstack/react-query";
import {readPrefAsyncOnce} from "@/store/storage";
import {CfgEditorApp} from "./CfgEditorApp";
import {queryKeys} from "@/services/queryKeys.ts";
import {readResInfosAsync} from "@/res/readResInfosAsync";
import {initEditor} from "@/api/apiClient.ts";
import {getMyStore} from "@/store/store";

export function AppLoader() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {isError, error: _error, data} = useQuery({
        queryKey: queryKeys.setting(),
        queryFn: readPrefAsyncOnce,
        staleTime: Infinity,
        retry: 0,
    })
    const resInfoQuery = useQuery({
        queryKey: queryKeys.resInfo(),
        queryFn: readResInfosAsync,
        enabled: !!data,
    })

    // readResInfosAsync 完成后 store 中已有 dataDir（readStoreStateOnce 在其内部调用）。
    // 如果 dataDir 非空，在渲染 CfgEditorApp 前初始化 EditorService，
    // 否则 CfgEditorApp 的 useQuery(enabled: !!dataDir) 会在 editor 为 null 时调 fetchSchema → 报错。
    // editorInitQuery 失败时也放行渲染（CfgEditorApp 自身的 useQuery 会触发 fetchSchema 报错，显示错误提示）。
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
        enabled: !!data && !resInfoQuery.isPending,
        staleTime: Infinity,
        retry: 0,
    })

    // console.log(isError, _error, data);

    // resInfo 完成前不渲染 CfgEditorApp：readResInfosAsync 会设置 resourceDir/resMap，
    // 提前渲染会让 findAllResInfos 用空 resourceDir 立即用空 resourceDir 算出错误路径，且高度少算的 layout 结果会被
    // React Query 缓存（queryKey 不含 resourceDir），导致节点重叠最长持续到 staleTime 过期
    if (isError || (data && !resInfoQuery.isPending && !editorInitQuery.isPending)) {
        return <CfgEditorApp/>
    }
}
