/**
 * fkDraft — 外键（FK）编辑表单的纯逻辑层。
 *
 * 只做数据变换与校验（可 vitest 喂 fixture 断言），不碰 UI / API：
 *   - fkToDraft:      SForeignKey → 表单草稿（含 refKeys 反填）
 *   - autoFkName:     自动生成 FK 名（keys[0]_refTable，冲突追加 _2/_3…）
 *   - validateFkDraft: 校验草稿（字段存在 / 目标表存在 / refKeys 是目标表唯一键 / fkName 不冲突）
 */
import {getField} from './schema';
import {SForeignKey, STable} from '@/api/schemaModel';

/** 外键编辑表单草稿（与 FKAddRequest 对齐，nullable 恒有值）。 */
export interface FkDraft {
    fkName?: string;      // 缺省自动生成
    keys: string[];
    refTable: string;
    refKeys?: string[];
    nullable: boolean;
}

/**
 * 从 SForeignKey 反填草稿。
 * - RefUniq（rUniq/rNullableUniq）：refKeys 有值 → 保留到 draft；用户清除后按"引用主键"保存
 * - RefPrimary（rPrimary/rNullablePrimary）：refKeys 空 → 反填 undefined
 * - rList 无 nullable 语义 → 反填 false
 */
export function fkToDraft(fk: SForeignKey): FkDraft {
    return {
        fkName: fk.name,
        keys: [...fk.keys],
        refTable: fk.refTable,
        refKeys: fk.refKeys ? [...fk.refKeys] : undefined,
        nullable:
            fk.refType === 'rNullablePrimary' || fk.refType === 'rNullableUniq',
    };
}

/**
 * 自动生成 FK 名：keys[0]_refTable；与已有 FK 冲突时追加 _2/_3…
 * 与后端 SchemaRelationService.pickFkName 的自动命名规则保持一致。
 */
export function autoFkName(
    keys: string[],
    refTable: string,
    existingFks: SForeignKey[],
): string {
    const base = `${keys[0]}_${refTable}`;
    let candidate = base;
    let i = 2;
    while (existingFks.some(fk => fk.name === candidate)) {
        candidate = `${base}_${i}`;
        i++;
    }
    return candidate;
}

/**
 * 校验草稿（纯逻辑，不查 API）。
 * 错误文案为开发者可读（不含 i18n），UI 层负责翻译展示。
 */
export function validateFkDraft(
    draft: FkDraft,
    table: STable,
    getTable: (name: string) => STable | null,
    editingFkName?: string,
): string[] {
    const errors: string[] = [];

    if (draft.keys.length === 0) {
        errors.push('keys 不能为空');
    }
    for (const k of draft.keys) {
        if (getField(table, k) === null) {
            errors.push(`字段不存在: ${k}`);
        }
    }

    if (!draft.refTable) {
        errors.push('目标表不能为空');
        return errors;
    }
    const ref = getTable(draft.refTable);
    if (ref === null) {
        errors.push(`目标表不存在: ${draft.refTable}`);
        return errors;
    }

    if (draft.refKeys && draft.refKeys.length > 0) {
        for (const rk of draft.refKeys) {
            if (getField(ref, rk) === null) {
                errors.push(`目标表字段不存在: ${draft.refTable}.${rk}`);
            }
        }
        // 后端校验 RefTableKeyNotUniq：refKeys 必须是目标表唯一键或主键
        const ukSets = [ref.pk, ...ref.uks];
        const isUniq = ukSets.some(uk => {
            if (uk.length !== draft.refKeys!.length) return false;
            return draft.refKeys!.every(rk => uk.includes(rk));
        });
        if (!isUniq) {
            errors.push(`引用键必须为目标表唯一键或主键: ${draft.refKeys.join(',')}`);
        }
    }

    if (draft.fkName && draft.fkName.trim().length > 0) {
        // 编辑态豁免：FK 名 == 编辑前的 FK 名时（如内联 FK：FK 名 == 字段名）
        // 不视为字段冲突（与后端 pickFkName 的 exemptName 语义一致）
        if (draft.fkName !== editingFkName && getField(table, draft.fkName) !== null) {
            errors.push(`外键名与字段冲突: ${draft.fkName}`);
        }
    }

    return errors;
}