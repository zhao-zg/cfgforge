import {describe, it, expect} from 'vitest';
import {groupByTable} from './errorsModel';
import type {ValueErrInfo} from '@cfgforge/editor-core';

function makeErr(table: string, field?: string, errType = 'Test'): ValueErrInfo {
    return {
        table,
        field,
        errType,
        msg: 'test error',
        sourceKind: 'cell',
        sourceDesc: '',
        level: 'err',
    };
}

describe('groupByTable', () => {
    it('returns empty array for empty input', () => {
        expect(groupByTable([])).toEqual([]);
    });

    it('groups errors by table name', () => {
        const errs = [
            makeErr('item', 'id'),
            makeErr('item', 'name'),
            makeErr('monster', 'id'),
        ];
        const result = groupByTable(errs);
        expect(result).toHaveLength(2);
        expect(result[0].table).toBe('item');
        expect(result[0].errors).toHaveLength(2);
        expect(result[1].table).toBe('monster');
        expect(result[1].errors).toHaveLength(1);
    });

    it('sorts tables alphabetically', () => {
        const errs = [
            makeErr('zombie'),
            makeErr('apple'),
            makeErr('monster'),
        ];
        const result = groupByTable(errs);
        expect(result.map(r => r.table)).toEqual(['apple', 'monster', 'zombie']);
    });

    it('puts empty-table errors last', () => {
        const errs = [
            makeErr('', 'field1'),
            makeErr('item', 'id'),
        ];
        const result = groupByTable(errs);
        expect(result).toHaveLength(2);
        expect(result[0].table).toBe('item');
        expect(result[1].table).toBe('');
        expect(result[1].key).toBe('__no_table__');
    });

    it('handles single error', () => {
        const errs = [makeErr('item', 'id')];
        const result = groupByTable(errs);
        expect(result).toHaveLength(1);
        expect(result[0].table).toBe('item');
        expect(result[0].errors).toHaveLength(1);
    });

    it('preserves all error fields', () => {
        const errs: ValueErrInfo[] = [{
            table: 'item',
            recordId: 'item-1',
            field: 'reward',
            errType: 'ForeignValueNotFound',
            msg: 'foreign value not found',
            sourceKind: 'cell',
            sourceDesc: 'item.csv!B3',
            level: 'err',
        }];
        const result = groupByTable(errs);
        expect(result[0].errors[0]).toEqual(errs[0]);
    });

    it('groups multiple errors from same table', () => {
        const errs = [
            makeErr('item', 'id', 'NotMatchFieldType'),
            makeErr('item', 'name', 'MustFillButCellEmpty'),
            makeErr('item', 'desc', 'PrimaryOrUniqueKeyDuplicated'),
        ];
        const result = groupByTable(errs);
        expect(result).toHaveLength(1);
        expect(result[0].errors).toHaveLength(3);
        expect(result[0].errors.map(e => e.field)).toEqual(['id', 'name', 'desc']);
    });

    it('handles all empty-table errors', () => {
        const errs = [
            makeErr('', 'field1'),
            makeErr('', 'field2'),
        ];
        const result = groupByTable(errs);
        expect(result).toHaveLength(1);
        expect(result[0].table).toBe('');
        expect(result[0].key).toBe('__no_table__');
        expect(result[0].errors).toHaveLength(2);
    });
});
