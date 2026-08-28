import {describe, it, expect} from 'vitest'
import {autoFkName, fkToDraft, validateFkDraft} from './fkDraft'
import {fk, makeTable} from '@/test/fixtures'

// ---------------------------------------------------------------------------
// fkToDraft
// ---------------------------------------------------------------------------

describe('fkToDraft', () => {
    it('RefPrimary 反填：refKeys 为 undefined，nullable 按 refType', () => {
        const d = fkToDraft(fk('owner_user', ['owner'], 'user', {refType: 'rPrimary'}))
        expect(d).toStrictEqual({
            fkName: 'owner_user',
            keys: ['owner'],
            refTable: 'user',
            refKeys: undefined,
            nullable: false,
        })
    })

    it('RefUniq 反填：refKeys 保留', () => {
        const d = fkToDraft(fk('code_ref', ['code'], 'item', {
            refType: 'rUniq',
            refKeys: ['code'],
        }))
        expect(d.refKeys).toStrictEqual(['code'])
        expect(d.nullable).toBe(false)
    })

    it('rNullableUniq → nullable true', () => {
        const d = fkToDraft(fk('code_ref', ['code'], 'item', {
            refType: 'rNullableUniq',
            refKeys: ['code'],
        }))
        expect(d.nullable).toBe(true)
    })

    it('keys 复制而非引用共享', () => {
        const src = fk('k', ['a', 'b'], 't')
        const d = fkToDraft(src)
        d.keys.push('c')
        expect(src.keys).toStrictEqual(['a', 'b'])
    })
})

// ---------------------------------------------------------------------------
// autoFkName
// ---------------------------------------------------------------------------

describe('autoFkName', () => {
    it('生成 keys[0]_refTable', () => {
        expect(autoFkName(['owner'], 'user', [])).toBe('owner_user')
    })

    it('冲突时追加 _2/_3', () => {
        const existing = [
            fk('owner_user', ['owner'], 'user'),
            fk('owner_user_2', ['owner2'], 'user'),
        ]
        expect(autoFkName(['owner'], 'user', existing)).toBe('owner_user_3')
    })
})

// ---------------------------------------------------------------------------
// validateFkDraft
// ---------------------------------------------------------------------------

describe('validateFkDraft', () => {
    const user = makeTable('user', [
        {name: 'id', type: 'int', comment: ''},
        {name: 'name', type: 'str', comment: ''},
    ])
    const item = makeTable('item', [
        {name: 'id', type: 'int', comment: ''},
        {name: 'owner', type: 'int', comment: ''},
        {name: 'code', type: 'str', comment: ''},
    ], {
        uks: [['code']],
    })
    const getTable = (name: string) => {
        if (name === 'user') return user
        if (name === 'item') return item
        return null
    }

    it('合法草稿无错误', () => {
        expect(validateFkDraft({
            keys: ['owner'],
            refTable: 'user',
            nullable: false,
        }, item, getTable)).toStrictEqual([])
    })

    it('keys 为空报错', () => {
        const errs = validateFkDraft({keys: [], refTable: 'user', nullable: false}, item, getTable)
        expect(errs).toContain('keys 不能为空')
    })

    it('本地字段不存在报错', () => {
        const errs = validateFkDraft({keys: ['nope'], refTable: 'user', nullable: false}, item, getTable)
        expect(errs.some(e => e.includes('nope'))).toBe(true)
    })

    it('目标表不存在报错', () => {
        const errs = validateFkDraft({keys: ['owner'], refTable: 'ghost', nullable: false}, item, getTable)
        expect(errs).toContain('目标表不存在: ghost')
    })

    it('refKeys 必须是唯一键或主键', () => {
        const errs = validateFkDraft({
            keys: ['owner'],
            refTable: 'user',
            refKeys: ['name'],
            nullable: false,
        }, item, getTable)
        expect(errs.some(e => e.includes('唯一键或主键'))).toBe(true)
    })

    it('refKeys 为主键合法', () => {
        expect(validateFkDraft({
            keys: ['owner'],
            refTable: 'user',
            refKeys: ['id'],
            nullable: false,
        }, item, getTable)).toStrictEqual([])
    })

    it('refKeys 为声明唯一键合法', () => {
        expect(validateFkDraft({
            keys: ['code'],
            refTable: 'item',
            refKeys: ['code'],
            nullable: false,
        }, item, getTable)).toStrictEqual([])
    })

    it('fkName 与字段冲突报错', () => {
        const errs = validateFkDraft({
            fkName: 'owner',
            keys: ['owner'],
            refTable: 'user',
            nullable: false,
        }, item, getTable)
        expect(errs).toContain('外键名与字段冲突: owner')
    })
})