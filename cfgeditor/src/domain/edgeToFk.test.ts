import {describe, it, expect} from 'vitest'
import {edgeToFkRequest} from './edgeToFk.ts'
import {Schema} from '@/domain/schema.ts'
import {field, makeRawSchema, makeStruct, makeTable} from '@/test/fixtures.ts'
import {HANDLE_OUT, HANDLE_IN} from '@/domain/handleIds.ts'
import type {Entity} from '@/domain/entityModel.ts'
import {makeReadOnly} from '@/test/fixtures.ts'

// 辅助：构造 Connection（ReactFlow onConnect 参数类型）
function makeConnection(source: string, sourceHandle: string | null,
                         target: string, targetHandle: string | null) {
    return {source, sourceHandle, target, targetHandle}
}

describe('edgeToFkRequest', () => {
    // Schema: Hero(有 weaponId 字段) → Weapon 表
    const weapon = makeTable('Weapon', [field('id', 'int')], {recordIds: [{id: '1'}]})
    const hero = makeTable('Hero', [field('id', 'int'), field('weaponId', 'int')], {})
    const schema = new Schema(makeRawSchema([weapon, hero]))

    // EntityMap: Hero 和 Weapon 的 ReadOnlyEntity
    const heroEntity = makeReadOnly({id: 'Hero', label: 'Hero', fields: [
        {key: 'id', name: 'id', value: '1'},
        {key: 'weaponId', name: 'weaponId', value: '10'},
    ]})
    const weaponEntity = makeReadOnly({id: 'Weapon', label: 'Weapon', fields: [
        {key: 'id', name: 'id', value: '1'},
    ]})
    const entityMap = new Map<string, Entity>([
        ['Hero', heroEntity],
        ['Weapon', weaponEntity],
    ])

    it('字段 handle 连线 → keys=[字段名]', () => {
        // 从 Hero.weaponId handle 拖到 Weapon @in
        const conn = makeConnection('Hero', 'weaponId', 'Weapon', HANDLE_IN)
        const result = edgeToFkRequest(conn, entityMap, schema)
        expect(result).not.toBeNull()
        expect(result!.table).toBe('Hero')
        expect(result!.keys).toEqual(['weaponId'])
        expect(result!.refTable).toBe('Weapon')
    })

    it('@out handle 连线 → keys=主键', () => {
        // 从 Hero @out 拖到 Weapon @in
        const conn = makeConnection('Hero', HANDLE_OUT, 'Weapon', HANDLE_IN)
        const result = edgeToFkRequest(conn, entityMap, schema)
        expect(result).not.toBeNull()
        expect(result!.keys).toEqual(['id']) // Hero 的主键
        expect(result!.refTable).toBe('Weapon')
    })

    it('自引用（source table === target table）返回 null', () => {
        const conn = makeConnection('Hero', 'weaponId', 'Hero', HANDLE_IN)
        const result = edgeToFkRequest(conn, entityMap, schema)
        expect(result).toBeNull()
    })

    it('target 是 struct（非 table）返回 null', () => {
        const otherStruct = makeStruct('Cost', [field('v', 'int')])
        const schemaWithStruct = new Schema(makeRawSchema([otherStruct, hero]))
        const costEntity = makeReadOnly({id: 'Cost', label: 'Cost', fields: [
            {key: 'v', name: 'v', value: '1'},
        ]})
        const mapWithStruct = new Map<string, Entity>([
            ['Hero', heroEntity],
            ['Cost', costEntity],
        ])
        const conn = makeConnection('Hero', 'weaponId', 'Cost', HANDLE_IN)
        const result = edgeToFkRequest(conn, mapWithStruct, schemaWithStruct)
        expect(result).toBeNull()
    })

    it('sourceHandle 为 null 返回 null', () => {
        const conn = makeConnection('Hero', null, 'Weapon', HANDLE_IN)
        const result = edgeToFkRequest(conn, entityMap, schema)
        expect(result).toBeNull()
    })

    it('source 节点不在 entityMap 中返回 null', () => {
        const conn = makeConnection('Ghost', 'weaponId', 'Weapon', HANDLE_IN)
        const result = edgeToFkRequest(conn, entityMap, schema)
        expect(result).toBeNull()
    })

    it('target 节点不在 entityMap 中返回 null', () => {
        const conn = makeConnection('Hero', 'weaponId', 'Ghost', HANDLE_IN)
        const result = edgeToFkRequest(conn, entityMap, schema)
        expect(result).toBeNull()
    })

    it('fkName 缺省（由后端自动生成）', () => {
        const conn = makeConnection('Hero', 'weaponId', 'Weapon', HANDLE_IN)
        const result = edgeToFkRequest(conn, entityMap, schema)
        expect(result!.fkName).toBeUndefined()
    })
})
