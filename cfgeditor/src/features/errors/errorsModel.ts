import type {ValueErrInfo} from '@cfgforge/editor-core';

/**
 * 按表分组校验错误，返回 Collapse items 兼容结构。
 * table 为空字符串的错误归入 '__no_table__' 组。
 */
export interface GroupedErrors {
    key: string;
    table: string;
    errors: ValueErrInfo[];
}

export function groupByTable(errs: ValueErrInfo[]): GroupedErrors[] {
    const map = new Map<string, ValueErrInfo[]>();
    for (const err of errs) {
        const key = err.table || '__no_table__';
        const list = map.get(key);
        if (list) {
            list.push(err);
        } else {
            map.set(key, [err]);
        }
    }
    const result: GroupedErrors[] = [];
    for (const [key, list] of map) {
        result.push({key, table: key === '__no_table__' ? '' : key, errors: list});
    }
    // 按表名排序，空表名排最后
    result.sort((a, b) => {
        if (a.key === '__no_table__') return 1;
        if (b.key === '__no_table__') return -1;
        return a.table.localeCompare(b.table);
    });
    return result;
}
