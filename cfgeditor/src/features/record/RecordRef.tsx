import { STable } from "@/api/schemaModel.ts";
import { Entity, EditingObjectRes, EFitView } from "@/domain/entityModel.ts";
import { RecordRefsResult, RefId, UnreferencedRecordsResult } from "@/api/recordModel.ts";
import { createRefEntities } from "./recordRefUtils.ts";
import { useTranslation } from "react-i18next";
import {Schema, SchemaTableType} from "@/domain/schema.ts";
import { NodeShowType } from "@/domain/storageJson.ts";
import { navTo, useMyStore, useLocationData, PageType, setDragPanel } from "@/store/store.ts";
import { Navigate, useNavigate, useOutletContext } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchRecordRefs, fetchUnreferencedRecords } from "@/api/apiClient.ts";
import { queryKeys } from "@/services/queryKeys.ts";
import { MenuItem } from "@/flow/FlowContextMenu.tsx";
import { fillHandles } from "@/flow/layout/entityToNodeAndEdge.ts";

import { useCallback, useMemo, useState } from "react";
import { useEntityToGraph } from "@/flow/useEntityToGraph.ts";
import { EntityNode } from "@/flow/FlowGraph.tsx";
import { QueryGate } from "@/app/QueryGate.tsx";
import {App, Button, Popconfirm, Space} from "antd";
import {DeleteOutlined} from "@ant-design/icons";
import {useMutation} from "@tanstack/react-query";
import {deleteRecord} from "@/api/apiClient.ts";
import {invalidateAllQueries} from "@/services/queryClient.ts";


export function RecordRefWithResult({ schema, notes, curTable, curId, nodeShow, recordRefResult, inDragPanelAndFix, isUnrefMode }: {
    schema: Schema;
    notes: Map<string, string> | undefined;
    curTable: STable;
    curId?: string;
    nodeShow: NodeShowType;
    recordRefResult: RecordRefsResult | UnreferencedRecordsResult;
    inDragPanelAndFix: boolean;
    isUnrefMode: boolean;
}) {
    const [t] = useTranslation();
    const navigate = useNavigate();
    const { recordRefInShowLinkMaxNode, tauriConf, resourceDir, resMap, isEditMode, chainConfs } = useMyStore();
    const { notification } = App.useApp();

    // 未引用模式：批量删除全部未引用记录（串行 for...of，收集失败数）
    const deleteAllUnrefMutation = useMutation({
        mutationFn: async () => {
            const refs = isUnrefMode ? (recordRefResult.refs ?? []) : [];
            let ok = 0;
            let fail = 0;
            for (const ref of refs) {
                const r = await deleteRecord(ref.table, ref.id);
                if (r.resultCode === 'deleteOk') {
                    ok++;
                } else {
                    fail++;
                }
            }
            return { ok, fail };
        },
        onError: (error: Error) => {
            notification.error({title: `deleteAllUnref err: ${error.message}`, placement: 'topRight', duration: 4});
        },
        onSuccess: ({ok, fail}) => {
            notification.info({title: t('deleteAllUnrefDone', {ok, fail}), placement: 'topRight', duration: 3});
            invalidateAllQueries();
        },
    });

    // Memoize checkTable function
    const checkTable = useMemo(() => {
        if (!nodeShow.refContainEnum && !nodeShow.refTableHides.length) return undefined;

        return (tableName: string) => {
            if (!nodeShow.refContainEnum) {
                const sT = schema.getSTable(tableName);
                if (!sT || sT.entryType === 'eEnum') return false;
            }
            return !nodeShow.refTableHides.some(t => tableName.includes(t));
        };
    }, [nodeShow.refContainEnum, nodeShow.refTableHides, schema]);

    // Memoize entityMap creation
    const entityMap = useMemo(() => {
        const map = new Map<string, Entity>();
        createRefEntities({
            entityMap: map,
            schema,
            briefRecordRefs: recordRefResult.refs ?? [],
            isCreateRefs: !isUnrefMode,  // 未引用模式不创建引用关系
            checkTable,
            recordRefInShowLinkMaxNode,
            tauriConf,
            resourceDir,
            resMap
        });
        fillHandles(map);
        return map;
    }, [schema, recordRefResult.refs, checkTable, recordRefInShowLinkMaxNode, tauriConf, resourceDir, resMap, isUnrefMode]);

    // Extract menu creation functions
    const createPaneMenu = useCallback((): MenuItem[] => {
        const menuItem: MenuItem = {
            label: isUnrefMode
                ? `${t('unreferencedRecords')}: ${curTable.name}`
                : t('record') + curId,
            key: 'pane',
            handler: isUnrefMode || !curId
                ? () => {
                    // 未引用模式或没有id时不做任何操作
                }
                : () => navigate(navTo('record', curTable.name, curId))
        };

        return [menuItem];
    }, [t, curId, curTable.name, navigate, isUnrefMode]);

    const createNodeMenu = useCallback((entityNode: EntityNode): MenuItem[] => {
        const refId = entityNode.data.entity.userData as RefId;
        const isEntityEditable = schema.isEditable;

        const menuItems: MenuItem[] = [{
            label: t('record') + refId.id,
            key: 'entityRecord',
            handler: () => navigate(navTo('record', refId.table, refId.id))
        }];

        if (isEntityEditable) {
            menuItems.push({
                label: t('edit') + refId.id,
                key: 'entityEdit',
                handler: () => navigate(navTo('record', refId.table, refId.id, true))
            });
        }

        // 对于未引用模式，或者在单个record模式下的其他record，显示recordRef选项
        if (isUnrefMode || (refId.table !== recordRefResult.table || refId.id !== (recordRefResult as RecordRefsResult).id)) {
            menuItems.push({
                label: t('recordRef') + refId.id,
                key: 'entityRecordRef',
                handler: () => navigate(navTo('recordRef', refId.table, refId.id))
            });
        }

        // 链入口：包含该节点所属表的链 → 打开链视图
        for (const chain of chainConfs.chains) {
            if (chain.tables.includes(refId.table)) {
                menuItems.push({
                    label: `${t('chainOpenFromRecord')}: ${chain.label}`,
                    key: `chain-${chain.label}`,
                    handler: () => setDragPanel(chain.label)
                });
            }
        }

        return menuItems;
    }, [t, schema, navigate, recordRefResult, isUnrefMode, chainConfs]);

    const nodeDoubleClickFunc = useCallback((entityNode: EntityNode): void => {
        const refId = entityNode.data.entity.userData as RefId;
        navigate(navTo('record', refId.table, refId.id, isEditMode));
    }, [navigate, isEditMode]);

    // 固定面板「首次 FitFull 后保持视口」：fittedPathname 记录已适配过的 pathname。
    // useEntityToGraph 在 FitFull 分支回调 setFitViewForPathname 写入；再次进入同 pathname → fitNone 不跳。
    // 写入与比较用同一个 pathname（FitFull 后再次进入同 pathname 则保持视口不动）。
    const [fittedPathname, setFittedPathname] = useState<string | undefined>(undefined);
    const pathname = isUnrefMode
        ? `/recordUnref/${curTable.name}`
        : `/recordRef/${curTable.name}/${curId}`;
    let editingObjectRes;
    if (inDragPanelAndFix && fittedPathname === pathname) {
        editingObjectRes = keepViewport;
    }

    const setFitViewForPathname = useCallback((pn: string) => {
        setFittedPathname(pn);
    }, []);


    const paneMenu = useMemo(() => createPaneMenu(), [createPaneMenu]);

    useEntityToGraph({
        type: 'ref',
        pathname, entityMap, notes, nodeMenuFunc: createNodeMenu, paneMenu, nodeDoubleClickFunc, editingObjectRes,
        setFitViewForPathname: (inDragPanelAndFix ? setFitViewForPathname : undefined),
        nodeShow,
    });

    return isUnrefMode
        ? <div style={{position: 'absolute', top: 8, right: 8, zIndex: 10}}>
            <Space>
                <Popconfirm
                    title={t('deleteAllUnrefConfirm', {count: (recordRefResult.refs ?? []).length})}
                    okText={t('delete')}
                    cancelText={t('cancel')}
                    okButtonProps={{danger: true}}
                    onConfirm={() => deleteAllUnrefMutation.mutate()}
                >
                    <Button type="primary" danger icon={<DeleteOutlined/>}>
                        {t('deleteAllUnref')}
                    </Button>
                </Popconfirm>
            </Space>
        </div>
        : null;
}

const keepViewport: EditingObjectRes = { fitView: EFitView.NoChange, isEdited: false }

export function RecordRef({ schema, notes, curTable, curTableId, curPage, curId, refIn, refOutDepth, maxNode, nodeShow, inDragPanelAndFix }: {
    schema: Schema;
    notes: Map<string, string> | undefined;
    curTable: STable;
    curTableId: string;
    curPage: PageType;
    curId?: string;  // unref 模式下仅作「切回 record 的上下文记忆」，组件不消费
    refIn: boolean;
    refOutDepth: number;
    maxNode: number;
    nodeShow: NodeShowType;
    inDragPanelAndFix: boolean;
}) {
    // 用 curPage 判定模式（唯一标识页面），而非 curId 是否为空——
    // 这样 recordUnref 页可携带上次 record 的 curId 用于切回，不会被误判成 recordRef 模式
    const isUnrefMode = curPage === 'recordUnref';
    const { t } = useTranslation();

    // 根据模式选择不同的API
    const recordRefQuery = useQuery({
        queryKey: isUnrefMode
            ? queryKeys.unreferenced(curTableId, maxNode)
            : queryKeys.recordRef(curTableId, curId!, refOutDepth, maxNode, refIn),
        queryFn: ({ signal }) => {
            if (isUnrefMode) {
                return fetchUnreferencedRecords(curTable.name, maxNode, signal);
            } else {
                return fetchRecordRefs(curTable.name, curId!, refOutDepth, maxNode, refIn, signal);
            }
        },
        staleTime: 1000 * 10,
        enabled: !!curId || isUnrefMode,
    })


    return <QueryGate query={recordRefQuery} loading={null} emptyTitle={t('refIdListEmpty')}>
        {(recordRefResult) => <RecordRefWithResult schema={schema} notes={notes} curTable={curTable} curId={curId}
            nodeShow={nodeShow} recordRefResult={recordRefResult}
            inDragPanelAndFix={inDragPanelAndFix}
            isUnrefMode={isUnrefMode} />}
    </QueryGate>;

}

export function RecordRefRoute() {
    const { schema, notes } = useOutletContext<SchemaTableType>();
    // recordUnref 路由为 recordUnref/:table/*，id 段无名（落在 * 里），useParams 取不到；
    // 用 useLocationData 统一解析 curTableId/curId/curPage（对 recordRef/:table/:id 同样正确）
    const { curTableId, curId, curPage } = useLocationData();
    const { recordRefIn, recordRefOutDepth, recordMaxNode, nodeShow } = useMyStore();

    const curTable = schema ? schema.getSTable(curTableId) : null;

    // table 不存在时声明式跳转（render 期 navigate 是副作用，StrictMode 下会触发两次）
    if (!curTable) {
        return <Navigate to="/PathNotFound" replace />;
    }

    // curId 在 unref 模式下可能是上次 record 的 id（仅作切回记忆，组件内由 isUnrefMode 短路不消费）
    return <RecordRef schema={schema} notes={notes} curTable={curTable} curTableId={curTableId} curPage={curPage} curId={curId}
        refIn={recordRefIn} refOutDepth={recordRefOutDepth} maxNode={recordMaxNode}
        nodeShow={nodeShow}
        inDragPanelAndFix={false} />
}
