/**
 * edgeToFk — 流图拖拽连线到外键请求的映射纯函数。
 *
 * 只做 handle 解析与校验（可 vitest 喂 fixture 断言），不碰 UI / API：
 *   - source handle 为字段名 → keys=[字段名]；为 @out → keys=主键
 *   - target node id = 表名（去掉 t- 前缀）
 *   - 校验：不能自引用、target 必须是 table、source/target 节点须存在
 */
import type {Connection} from '@xyflow/react';
import {Entity} from './entityModel';
import {Schema} from './schema';
import {HANDLE_OUT} from './handleIds';
import type {FKAddRequest} from '@cfgforge/editor-core';

/**
 * 从 ReactFlow onConnect 的 Connection 解析出 FKAddRequest。
 * 返回 null 表示校验失败（自引用 / target 非 table / 节点不存在 / handle 无效）。
 */
export function edgeToFkRequest(
    conn: Connection,
    entityMap: Map<string, Entity>,
    schema: Schema,
): FKAddRequest | null {
    const sourceId = conn.source;
    const targetId = conn.target;
    const sourceHandle = conn.sourceHandle;

    // source/target 节点须存在
    const sourceEntity = entityMap.get(sourceId);
    const targetEntity = entityMap.get(targetId);
    if (!sourceEntity || !targetEntity) return null;

    // source handle 须非空
    if (!sourceHandle) return null;

    // 解析 source 表名：去掉 Table 视图的 t- 前缀（TableRef 无前缀）
    const sourceTable = stripTablePrefix(sourceId);
    const targetTable = stripTablePrefix(targetId);

    // 不能自引用
    if (sourceTable === targetTable) return null;

    // target 必须是 table（非 struct/interface）
    const targetSTable = schema.getSTable(targetTable);
    if (!targetSTable) return null;

    // source 也必须是 table（FK 属于表）
    const sourceSTable = schema.getSTable(sourceTable);
    if (!sourceSTable) return null;

    // 解析 keys：字段名 handle → [字段名]；@out → 主键
    let keys: string[];
    if (sourceHandle === HANDLE_OUT) {
        keys = sourceSTable.pk ? [...sourceSTable.pk] : [];
    } else {
        keys = [sourceHandle];
    }
    if (keys.length === 0) return null;

    return {
        table: sourceTable,
        keys,
        refTable: targetTable,
    };
}

/** Table 视图 node id 带 t- 前缀，TableRef 视图无前缀。统一去掉。 */
function stripTablePrefix(nodeId: string): string {
    return nodeId.startsWith('t-') ? nodeId.substring(2) : nodeId;
}
