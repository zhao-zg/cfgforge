import {ReadOnlyEntity} from "@/domain/entityModel.ts";
import {TableEntityCreator, UserData} from "./tableEntityCreator.ts";
import {navTo, useLocationData, useMyStore} from "@/store/store.ts";
import {useNavigate, useOutletContext} from "react-router";
import {MenuItem} from "@/flow/FlowContextMenu.tsx";
import {useTranslation} from "react-i18next";
import {fillHandles} from "@/flow/layout/entityToNodeAndEdge.ts";
import {getDefaultIdInTable, SchemaTableType} from "@/domain/schema.ts";
import {useEntityToGraph} from "@/flow/useEntityToGraph.ts";
import {EntityNode} from "@/flow/FlowGraph.tsx";
import {edgeToFkRequest} from "@/domain/edgeToFk.ts";
import {addForeignKey} from "@/api/apiClient.ts";
import {invalidateAllQueries} from "@/services/queryClient.ts";
import {memo, useCallback, useMemo, useState} from "react";
import {RelationEditModal} from "./RelationEditModal.tsx";
import {FieldEditModal} from "./FieldEditModal.tsx";


export const Table = memo(function Table() {
    const {schema, notes, curTable} = useOutletContext<SchemaTableType>();
    const {maxImpl} = useMyStore();
    const {pathname, curId} = useLocationData();
    const {t} = useTranslation();
    const navigate = useNavigate();
    const [relationTable, setRelationTable] = useState<string | null>(null);
    const [fieldTable, setFieldTable] = useState<string | null>(null);

    const getTableDefaultId = useCallback((tableName: string) =>
        getDefaultIdInTable(schema, tableName, curId), [schema, curId]);

    // entityMap 构建含 fillHandles 副作用，React Compiler 不会 memo，需手动 useMemo
    // 以免每次 render 新建 Map 触发 useEntityToGraph 全量重算。
    const entityMap = useMemo(() => {
        const map = new Map<string, ReadOnlyEntity<UserData>>();
        const creator = new TableEntityCreator(map, schema, curTable, maxImpl);
        creator.includeSubStructs();
        creator.includeRefTables();
        fillHandles(map);
        return map;
    }, [schema, curTable, maxImpl]);

    const paneMenu = useMemo<MenuItem[]>(() => [
        {
            label: `${curTable.name}\n${t('tableRef')}`,
            key: 'tableRef',
            handler: () => navigate(navTo('tableRef', curTable.name, getTableDefaultId(curTable.name)))
        }
    ], [curTable.name, t, navigate, getTableDefaultId]);

    const nodeMenuFunc = useCallback((entityNode: EntityNode): MenuItem[] => {
        const userData = entityNode.data.entity.userData as UserData;
        const menuItems: MenuItem[] = [];
        if (userData.table !== curTable.name) {
            menuItems.push({
                label: `${userData.table}\n${t('table')}`,
                key: 'entityTable',
                handler: () => navigate(navTo('table', userData.table, getTableDefaultId(userData.table)))
            });
        }
        menuItems.push({
            label: `${userData.table}\n${t('tableRef')}`,
            key: 'entityTableRef',
            handler: () => navigate(navTo('tableRef', userData.table, getTableDefaultId(userData.table)))
        });
        menuItems.push({
            label: `${userData.table}\n${t('editRelations')}`,
            key: 'editRelations',
            handler: () => setRelationTable(userData.table)
        });
        // 当前表节点：字段级编辑入口（增/删/改）
        if (userData.table === curTable.name) {
            menuItems.push({
                label: `${userData.table}\n${t('fieldManage')}`,
                key: 'editFields',
                handler: () => setFieldTable(userData.table)
            });
        }
        return menuItems;
    }, [curTable.name, t, navigate, getTableDefaultId]);

    const onConnectFunc = useCallback((connection: import('@xyflow/react').Connection) => {
        const req = edgeToFkRequest(connection, entityMap, schema);
        if (!req) return;
        void addForeignKey(req).then((result) => {
            if (result.ok) {
                invalidateAllQueries();
            }
        });
    }, [entityMap, schema]);

    useEntityToGraph({type: 'table', pathname, entityMap, notes, nodeMenuFunc, paneMenu, onConnectFunc});
    return (
        <>
            {relationTable !== null && (
                <RelationEditModal
                    key={relationTable}
                    table={schema.getSTable(relationTable)!}
                    schema={schema}
                    open
                    onClose={() => setRelationTable(null)}
                />
            )}
            {fieldTable !== null && (
                <FieldEditModal
                    key={fieldTable}
                    table={schema.getSTable(fieldTable)!}
                    schema={schema}
                    open
                    onClose={() => setFieldTable(null)}
                />
            )}
        </>
    );
});


