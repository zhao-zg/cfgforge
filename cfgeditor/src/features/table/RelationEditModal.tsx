/**
 * RelationEditModal — 表外键（FK）关系编辑弹窗。
 *
 * 列表 + 新增/编辑表单两种形态（与 CreateTableForm 同款 Modal 模式）：
 *   - 列表：FK 名 / 本地键 / 目标表 / 引用键 / 类型 / 操作（编辑、删除）
 *   - 表单：fkName（可选，留空自动生成）、keys（本地字段多选）、refTable（schema 表下拉）、
 *           refKeys（目标表唯一键/主键，留空引用主键）、nullable（Switch）
 * 保存走 apiClient FK API（addForeignKey / updateForeignKey），成功 invalidate schema 缓存，
 * 由上层（Table/TableRef 的 nodeMenuFunc）刷新图。失败展示后端 errors。
 */
import {memo, useCallback, useEffect, useMemo, useState} from "react";
import {
    Alert, Button, Checkbox, Flex, Input, Modal, Popconfirm, Select, Space, Table as AntTable,
    Typography,
} from "antd";
import {DeleteOutlined, EditOutlined, PlusOutlined} from "@ant-design/icons";
import {useTranslation} from "react-i18next";
import {useQueryClient} from "@tanstack/react-query";
import {
    addForeignKey,
    fetchTableFks,
    removeForeignKey,
    updateForeignKey,
} from "@/api/apiClient.ts";
import type {FKAddRequest} from "@cfgforge/editor-core";
import type {SForeignKey, STable} from "@/api/schemaModel.ts";
import {queryKeys} from "@/services/queryKeys.ts";
import {fkToDraft, FkDraft, validateFkDraft} from "@/domain/fkDraft.ts";
import {Schema} from "@/domain/schema.ts";

const {Text} = Typography;

const REF_TYPE_LABELS: Record<SForeignKey['refType'], string> = {
    rPrimary: 'PK',
    rUniq: 'UK',
    rList: 'List',
    rNullablePrimary: 'PK?',
    rNullableUniq: 'UK?',
};

/** 当前表单编辑目标：null = 列表态；{fkName: ''} = 新增；{fkName: 原名} = 编辑该 FK。
 *  用 fkName 是否为空区分新增/编辑（编辑时原名传给 validateFkDraft 豁免内联冲突）。 */
type EditingTarget = null | { fkName: string };

export const RelationEditModal = memo(function RelationEditModal({table, schema, open, onClose}: {
    table: STable;
    schema: Schema;
    open: boolean;
    onClose: () => void;
}) {
    const {t} = useTranslation();
    const queryClient = useQueryClient();

    const [fks, setFks] = useState<SForeignKey[]>([]);
    const [loadError, setLoadError] = useState<string[]>([]);
    const [editing, setEditing] = useState<EditingTarget>(null);
    const [draft, setDraft] = useState<FkDraft>({keys: [], refTable: '', nullable: false});
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);

    // 打开/切换表时重置：Modal destroyOnHidden + key 重挂载（父组件传 key=table.name）
    // 保证每次打开都是干净状态（无需在 effect 内同步 setState）。
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        fetchTableFks(table.name)
            .then(res => {
                if (!cancelled) setFks(res);
            })
            .catch((err: unknown) => {
                if (!cancelled) setLoadError([err instanceof Error ? err.message : String(err)]);
            });
        return () => {
            cancelled = true;
        };
    }, [open, table.name]);

    // 候选目标表：schema 全部表（除自己），供 refTable 下拉
    const refTableOptions = useMemo(
        () => [...schema.itemMap.values()]
            .filter((item): item is STable => item.type === 'table' && item.name !== table.name)
            .map(item => ({value: item.name, label: item.name})),
        [schema.itemMap, table.name],
    );

    // 目标表的字段（本地字段下拉的候选；keys 只能是本地字段）
    const localFieldOptions = useMemo(
        () => table.fields.map(f => ({value: f.name, label: f.name})),
        [table.fields],
    );

    // 目标表的唯一键候选（主键 + 声明 UK），供 refKeys 选择
    const refKeyOptions = useMemo(() => {
        const ref = schema.getSTable(draft.refTable);
        if (!ref) return [];
        const ukSets = [ref.pk, ...ref.uks];
        const seen = new Set<string>();
        const options: {value: string; label: string}[] = [];
        for (const uk of ukSets) {
            const key = uk.join(',');
            if (seen.has(key)) continue;
            seen.add(key);
            options.push({value: key, label: key});
        }
        return options;
    }, [schema, draft.refTable]);

    const handleClose = useCallback(() => {
        setEditing(null);
        setErrors([]);
        onClose();
    }, [onClose]);

    const startAdd = useCallback(() => {
        setErrors([]);
        setDraft({keys: [], refTable: '', nullable: false});
        setEditing({fkName: ''});
    }, []);

    const startEdit = useCallback((fk: SForeignKey) => {
        setErrors([]);
        setDraft({...fkToDraft(fk)});
        setEditing({fkName: fk.name});
    }, []);

    const handleDelete = useCallback(async (fkName: string) => {
        setErrors([]);
        const result = await removeForeignKey(table.name, fkName);
        if (result.ok) {
            setFks(prev => prev.filter(fk => fk.name !== fkName));
            await queryClient.invalidateQueries({queryKey: queryKeys.schema()});
        } else {
            setErrors(result.errors);
        }
    }, [table.name, queryClient]);

    const handleSaveDraft = useCallback(async () => {
        const validation = validateFkDraft(
            draft,
            table,
            name => schema.getSTable(name),
            editing?.fkName,
        );
        if (validation.length > 0) {
            setErrors(validation);
            return;
        }
        setSaving(true);
        setErrors([]);
        const req: FKAddRequest = {
            table: table.name,
            keys: draft.keys,
            refTable: draft.refTable,
            nullable: draft.nullable,
        };
        if (draft.fkName && draft.fkName.trim()) {
            req.fkName = draft.fkName.trim();
        }
        if (draft.refKeys && draft.refKeys.length > 0) {
            req.refKeys = [...draft.refKeys];
        }
        try {
            const result = editing?.fkName
                ? await updateForeignKey(table.name, editing.fkName, req)
                : await addForeignKey(req);
            if (result.ok) {
                await queryClient.invalidateQueries({queryKey: queryKeys.schema()});
                handleClose();
            } else {
                setErrors(result.errors);
            }
        } catch (err) {
            setErrors([err instanceof Error ? err.message : String(err)]);
        } finally {
            setSaving(false);
        }
    }, [draft, table, schema, editing, queryClient, handleClose]);

    const formVisible = editing !== null;

    return (
        <Modal
            title={t('relationEditTitle')}
            open={open}
            onCancel={handleClose}
            width={720}
            centered
            destroyOnHidden
            footer={null}
        >
            <Flex vertical gap="middle">
                {loadError.length > 0 && (
                    <Alert type="error" message={t('fkLoadFail')} description={loadError.join('; ')}/>
                )}

                {formVisible ? (
                    // ---- 新增 / 编辑表单 ----
                    <Flex vertical gap="small">
                        <Space align="center" style={{width: '100%'}}>
                            <Text style={{flexShrink: 0}}>{t('fkName')}:</Text>
                            <Input
                                value={draft.fkName ?? ''}
                                onChange={e => setDraft(prev => ({...prev, fkName: e.target.value}))}
                                placeholder={t('fkNamePlaceholder')}
                                style={{flex: 1}}
                            />
                        </Space>
                        <Space align="center" style={{width: '100%'}}>
                            <Text style={{flexShrink: 0}}>{t('fkKeys')}:</Text>
                            <Select
                                mode="multiple"
                                value={draft.keys}
                                onChange={v => setDraft(prev => ({...prev, keys: v}))}
                                style={{flex: 1}}
                                options={localFieldOptions}
                                placeholder={t('fkKeys')}
                            />
                        </Space>
                        <Space align="center" style={{width: '100%'}}>
                            <Text style={{flexShrink: 0}}>{t('fkRefTable')}:</Text>
                            <Select
                                value={draft.refTable || undefined}
                                onChange={v => setDraft(prev => ({...prev, refTable: v, refKeys: undefined}))}
                                style={{flex: 1}}
                                options={refTableOptions}
                                placeholder={t('fkRefTable')}
                                showSearch
                            />
                        </Space>
                        <Space align="center" style={{width: '100%'}}>
                            <Text style={{flexShrink: 0}}>{t('fkRefKeys')}:</Text>
                            <Select
                                mode="multiple"
                                value={draft.refKeys}
                                onChange={v => setDraft(prev => ({...prev, refKeys: v}))}
                                style={{flex: 1}}
                                options={refKeyOptions}
                                placeholder={t('fkRefKeysHint')}
                            />
                        </Space>
                        <Space align="center">
                            <Text>{t('fkNullable')}:</Text>
                            <Checkbox
                                checked={draft.nullable}
                                onChange={e => setDraft(prev => ({...prev, nullable: e.target.checked}))}
                            />
                        </Space>
                        {errors.length > 0 && (
                            <Alert
                                type="error"
                                message={t('cfgEditorErrors')}
                                description={
                                    <ul style={{margin: 0, paddingLeft: 20, maxHeight: 150, overflow: 'auto'}}>
                                        {errors.map((err, i) => <li key={i}>{err}</li>)}
                                    </ul>
                                }
                            />
                        )}
                        <Flex justify="flex-end" gap="small">
                            <Button onClick={() => setEditing(null)}>{t('cancel')}</Button>
                            <Button type="primary" loading={saving} onClick={handleSaveDraft}>
                                {t('fkSave')}
                            </Button>
                        </Flex>
                    </Flex>
                ) : (
                    // 列表视图
                    <>
                        <Flex justify="space-between" align="center">
                            <Text strong>{t('fkList')}（{fks.length}）</Text>
                            <Button size="small" icon={<PlusOutlined/>} onClick={startAdd}>
                                {t('fkAdd')}
                            </Button>
                        </Flex>
                        {fks.length === 0 && !loadError.length && (
                            <Text type="secondary">{t('fkEmpty')}</Text>
                        )}
                        <AntTable<SForeignKey>
                            rowKey="name"
                            size="small"
                            pagination={false}
                            dataSource={fks}
                            columns={[
                                {title: t('fkName'), dataIndex: 'name'},
                                {title: t('fkKeys'), dataIndex: 'keys', render: (keys: string[]) => keys.join(', ')},
                                {title: t('fkRefTable'), dataIndex: 'refTable'},
                                {
                                    title: t('fkRefKeys'),
                                    dataIndex: 'refKeys',
                                    render: (refKeys: string[] | undefined) => refKeys?.join(', ') ?? '-',
                                },
                                {
                                    title: t('fkRefType'),
                                    dataIndex: 'refType',
                                    render: (refType: SForeignKey['refType']) => REF_TYPE_LABELS[refType],
                                },
                                {
                                    title: '',
                                    key: 'actions',
                                    width: 110,
                                    render: (_, fk) => (
                                        <Space>
                                            <Button
                                                size="small"
                                                icon={<EditOutlined/>}
                                                onClick={() => startEdit(fk)}
                                            />
                                            <Popconfirm
                                                title={t('fkDeleteConfirm', {name: fk.name})}
                                                onConfirm={() => handleDelete(fk.name)}
                                            >
                                                <Button size="small" danger icon={<DeleteOutlined/>}/>
                                            </Popconfirm>
                                        </Space>
                                    ),
                                },
                            ]}
                        />
                        {errors.length > 0 && (
                            <Alert
                                type="error"
                                message={t('cfgEditorErrors')}
                                description={
                                    <ul style={{margin: 0, paddingLeft: 20, maxHeight: 150, overflow: 'auto'}}>
                                        {errors.map((err, i) => <li key={i}>{err}</li>)}
                                    </ul>
                                }
                            />
                        )}
                    </>
                )}
            </Flex>
        </Modal>
    );
});