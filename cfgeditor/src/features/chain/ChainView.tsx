import {memo, useCallback, useMemo} from "react";
import {Splitter, Typography} from "antd";
import {useNavigate} from "react-router";
import {useTranslation} from "react-i18next";
import {Entity} from "@/domain/entityModel.ts";
import {includeRefTables} from "@/features/table/tableRefEntity.ts";
import {fillHandles} from "@/flow/layout/entityToNodeAndEdge.ts";
import {navTo, useMyStore, useLocationData} from "@/store/store.ts";
import {useEntityToGraph} from "@/flow/useEntityToGraph.ts";
import {EntityNode} from "@/flow/FlowGraph.tsx";
import {MenuItem} from "@/flow/FlowContextMenu.tsx";
import {FlowGraph} from "@/flow/FlowGraph.tsx";
import {SItem} from "@/api/schemaModel.ts";
import {Schema, getDefaultIdInTable} from "@/domain/schema.ts";
import {ChainConf} from "@/domain/storageJson.ts";

// 单张表的画布面板：复用 TableRef 的 entityMap 构建与菜单逻辑，
// 但 pathname 隔离为 /chainTable/${table.name} 防止布局缓存冲突。
const ChainTablePanel = memo(function ChainTablePanel({schema, notes, tableName, refIn, refOutDepth, maxNode}: {
    schema: Schema;
    notes: Map<string, string> | undefined;
    tableName: string;
    refIn: boolean;
    refOutDepth: number;
    maxNode: number;
}) {
    const {t} = useTranslation();
    const curTable = schema.getSTable(tableName);
    // 表名在 chain 中配置但 schema 中不存在（如表已删除）：显示提示
    if (!curTable) {
        return <div style={{padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%'}}>
            <Typography.Text type="secondary">{tableName} — {t('tableNotFound')}</Typography.Text>
        </div>;
    }

    return <ChainTablePanelInner schema={schema} notes={notes} curTable={curTable}
                                refIn={refIn} refOutDepth={refOutDepth} maxNode={maxNode}/>;
});

// 拆出 inner 组件：确保 curTable 非 null（已由上层 guard），且 hooks 调用顺序稳定
const ChainTablePanelInner = memo(function ChainTablePanelInner({schema, notes, curTable, refIn, refOutDepth, maxNode}: {
    schema: Schema;
    notes: Map<string, string> | undefined;
    curTable: NonNullable<ReturnType<Schema['getSTable']>>;
    refIn: boolean;
    refOutDepth: number;
    maxNode: number;
}) {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const {curId} = useLocationData();

    // pathname 隔离：每张表用独立路径，避免与 TableRef/RecordRef 的 layout 缓存冲突
    const pathname = `/chainTable/${curTable.name}`;

    const getTableDefaultId = useCallback(
        (tableName: string) => getDefaultIdInTable(schema, tableName, curId), [schema, curId]);

    const entityMap = useMemo(() => {
        const map = new Map<string, Entity>();
        includeRefTables(map, curTable, schema, refIn, refOutDepth, maxNode);
        fillHandles(map);
        return map;
    }, [curTable, schema, refIn, refOutDepth, maxNode]);

    const paneMenu: MenuItem[] = useMemo(() => [{
        label: `${curTable.name}\n${t('table')}`,
        key: 'table',
        handler: () => navigate(navTo('table', curTable.name, getTableDefaultId(curTable.name)))
    }], [navigate, curTable, getTableDefaultId, t]);

    const nodeDoubleClickFunc = useCallback((entityNode: EntityNode): void => {
        const sItem = entityNode.data.entity.userData as SItem;
        navigate(navTo('table', sItem.name, getTableDefaultId(sItem.name)));
    }, [navigate, getTableDefaultId]);

    const nodeMenuFunc = useCallback((entityNode: EntityNode): MenuItem[] => {
        const sItem = entityNode.data.entity.userData as SItem;
        return [{
            label: `${sItem.name}\n${t('table')}`,
            key: 'entityTable',
            handler: () => navigate(navTo('table', sItem.name, getTableDefaultId(sItem.name)))
        }, {
            label: `${sItem.name}\n${t('tableRef')}`,
            key: 'entityTableRef',
            handler: () => navigate(navTo('tableRef', sItem.name, getTableDefaultId(sItem.name)))
        }];
    }, [navigate, getTableDefaultId, t]);

    return <FlowGraph>
        <ChainTableContent pathname={pathname} entityMap={entityMap} notes={notes}
                           paneMenu={paneMenu} nodeMenuFunc={nodeMenuFunc}
                           nodeDoubleClickFunc={nodeDoubleClickFunc}/>
    </FlowGraph>;
});

// useEntityToGraph 必须在 FlowGraphContext 内调用，拆为子组件
function ChainTableContent({pathname, entityMap, notes, paneMenu, nodeMenuFunc, nodeDoubleClickFunc}: {
    pathname: string;
    entityMap: Map<string, Entity>;
    notes?: Map<string, string>;
    paneMenu: MenuItem[];
    nodeMenuFunc: (entityNode: EntityNode) => MenuItem[];
    nodeDoubleClickFunc: (entityNode: EntityNode) => void;
}) {
    useEntityToGraph({
        type: 'tableRef',
        pathname,
        entityMap,
        notes,
        nodeMenuFunc,
        paneMenu,
        nodeDoubleClickFunc,
    });
    return null;
}

export const ChainView = memo(function ChainView({schema, notes}: {
    schema: Schema;
    notes: Map<string, string> | undefined;
}) {
    const {dragPanel, chainConfs, refIn, refOutDepth, maxNode} = useMyStore();

    // 从 chainConfs 中找到 dragPanel 对应的链
    const chain: ChainConf | undefined = useMemo(() => {
        return chainConfs.chains.find(c => c.label === dragPanel);
    }, [chainConfs.chains, dragPanel]);

    if (!chain || chain.tables.length === 0) {
        return null;
    }

    // 单表：占满整个区域
    if (chain.tables.length === 1) {
        return <div style={{width: '100%', height: '100%'}}>
            <ChainTablePanel schema={schema} notes={notes} tableName={chain.tables[0]}
                             refIn={refIn} refOutDepth={refOutDepth} maxNode={maxNode}/>
        </div>;
    }

    // 多表：Splitter 水平排列，每个 panel 等宽
    return <div style={{width: '100%', height: '100%'}}>
        <Splitter style={{height: '100%', width: '100%'}}>
            {chain.tables.map((tableName, idx) => (
                <Splitter.Panel key={`chain-${chain.label}-${idx}`} defaultSize={`${Math.floor(100 / chain.tables.length)}%`}>
                    <div style={{height: '100%', display: 'flex', flexDirection: 'column'}}>
                        <Typography.Text type="secondary" style={{padding: '4px 8px', flexShrink: 0}}>
                            {tableName}
                        </Typography.Text>
                        <div style={{flex: 1, minHeight: 0}}>
                            <ChainTablePanel schema={schema} notes={notes} tableName={tableName}
                                             refIn={refIn} refOutDepth={refOutDepth} maxNode={maxNode}/>
                        </div>
                    </div>
                </Splitter.Panel>
            ))}
        </Splitter>
    </div>;
});
