/**
 * FieldEditModal — 表字段级编辑弹窗（增/删/改）。
 *
 * 列表 + 新增/编辑表单两种形态（与 RelationEditModal 同款 Modal 模式）：
 *   - 列表：字段名 / 类型 / 注释 / 操作（编辑、删除）
 *   - 表单：字段名（Input）、类型（AutoComplete：原始类型 + struct/union 名 + 可自由输入）、
 *           注释（Input）
 * 保存走 apiClient 字段 API（addField / updateField / removeField），成功 invalidate schema 缓存，
 * 由上层（Table 的 nodeMenuFunc / ToolsSetting）刷新图。失败展示后端 errors。
 */
import {memo, useCallback, useMemo, useState} from "react";
import {
    Alert, AutoComplete, Button, Flex, Input, Modal, Popconfirm, Space, Table as AntTable,
    Typography,
} from "antd";
import {DeleteOutlined, EditOutlined, PlusOutlined} from "@ant-design/icons";
import {useTranslation} from "react-i18next";
import {useQueryClient} from "@tanstack/react-query";
import {addField, removeField, updateField} from "@/api/apiClient.ts";
import type {FieldAddRequest} from "@/api/apiClient.ts";
import type {SField, STable} from "@/api/schemaModel.ts";
import {queryKeys} from "@/services/queryKeys.ts";
import {Schema} from "@/domain/schema.ts";

const {Text} = Typography;

/** 与 CreateTableForm 一致的基础类型候选 */
const FIELD_TYPES = ['bool', 'int', 'long', 'float', 'string', 'text'];

/** 当前表单编辑目标：null = 列表态；{oldName: ''} = 新增；{oldName: 原名} = 编辑该字段。 */
type EditingTarget = null | { oldName: string };

export const FieldEditModal = memo(function FieldEditModal({table, schema, open, onClose}: {
    table: STable;
    schema: Schema;
    open: boolean;
    onClose: () => void;
}) {
    const {t} = useTranslation();
    const queryClient = useQueryClient();

    const [editing, setEditing] = useState<EditingTarget>(null);
    const [draft, setDraft] = useState<FieldAddRequest>({name: '', type: 'string', comment: ''});
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);

    // 类型候选：原始类型 + 本 schema 全部 struct/interface 名（可自由输入自定义引用类型）
    const typeOptions = useMemo(() => {
        const names = new Set<string>(FIELD_TYPES);
        for (const item of schema.itemMap.values()) {
            if (item.type === 'struct' || item.type === 'interface') {
                names.add(item.name);
            }
        }
        return [...names].map(n => ({value: n, label: n}));
    }, [schema.itemMap]);

    const handleClose = useCallback(() => {
        setEditing(null);
        setErrors([]);
        onClose();
    }, [onClose]);

    const startAdd = useCallback(() => {
        setErrors([]);
        setDraft({name: '', type: 'string', comment: ''});
        setEditing({oldName: ''});
    }, []);

    const startEdit = useCallback((field: SField) => {
        setErrors([]);
        setDraft({name: field.name, type: field.type, comment: field.comment});
        setEditing({oldName: field.name});
    }, []);

    const handleDelete = useCallback(async (fieldName: string) => {
        setErrors([]);
        const result = await removeField(table.name, fieldName);
        if (result.ok) {
            await queryClient.invalidateQueries({queryKey: queryKeys.schema()});
        } else {
            setErrors(result.errors);
        }
    }, [table.name, queryClient]);

    const handleSave = useCallback(async () => {
        const name = draft.name.trim();
        if (!name) {
            setErrors([t('fieldNameRequired')]);
            return;
        }
        setSaving(true);
        setErrors([]);
        try {
            const result = editing?.oldName
                ? await updateField(table.name, editing.oldName, {...draft, name})
                : await addField(table.name, {...draft, name});
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
    }, [draft, editing, table.name, queryClient, handleClose, t]);

    const formVisible = editing !== null;

    return (
        <Modal
            title={t('fieldManageTitle')}
            open={open}
            onCancel={handleClose}
            width={680}
            centered
            destroyOnHidden
            footer={null}
        >
            <Flex vertical gap="middle">
                {formVisible ? (
                    // ---- 新增 / 编辑表单 ----
                    <Flex vertical gap="small">
                        <Space align="center" style={{width: '100%'}}>
                            <Text style={{flexShrink: 0}}>{t('fieldName')}:</Text>
                            <Input
                                value={draft.name}
                                onChange={e => setDraft(prev => ({...prev, name: e.target.value}))}
                                placeholder={t('fieldName')}
                                style={{flex: 1}}
                            />
                        </Space>
                        <Space align="center" style={{width: '100%'}}>
                            <Text style={{flexShrink: 0}}>{t('fieldType')}:</Text>
                            <AutoComplete
                                value={draft.type}
                                options={typeOptions}
                                onChange={v => setDraft(prev => ({...prev, type: v}))}
                                placeholder={t('fieldType')}
                                style={{flex: 1}}
                            />
                        </Space>
                        <Space align="center" style={{width: '100%'}}>
                            <Text style={{flexShrink: 0}}>{t('fieldComment')}:</Text>
                            <Input
                                value={draft.comment ?? ''}
                                onChange={e => setDraft(prev => ({...prev, comment: e.target.value}))}
                                placeholder={t('fieldComment')}
                                style={{flex: 1}}
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
                            <Button type="primary" loading={saving} onClick={handleSave}>
                                {t('save')}
                            </Button>
                        </Flex>
                    </Flex>
                ) : (
                    // 列表视图
                    <>
                        <Flex justify="space-between" align="center">
                            <Text strong>{t('fieldList')}（{table.fields.length}）</Text>
                            <Button size="small" icon={<PlusOutlined/>} onClick={startAdd}>
                                {t('fieldAdd')}
                            </Button>
                        </Flex>
                        <AntTable<SField>
                            rowKey="name"
                            size="small"
                            pagination={false}
                            dataSource={table.fields}
                            columns={[
                                {title: t('fieldName'), dataIndex: 'name'},
                                {title: t('fieldType'), dataIndex: 'type'},
                                {
                                    title: t('fieldComment'),
                                    dataIndex: 'comment',
                                    render: (c: string | undefined) => c || '-',
                                },
                                {
                                    title: '',
                                    key: 'actions',
                                    width: 110,
                                    render: (_, field) => (
                                        <Space>
                                            <Button
                                                size="small"
                                                icon={<EditOutlined/>}
                                                onClick={() => startEdit(field)}
                                            />
                                            <Popconfirm
                                                title={t('fieldDeleteConfirm', {name: field.name})}
                                                onConfirm={() => handleDelete(field.name)}
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