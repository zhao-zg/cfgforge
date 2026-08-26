import {memo, useCallback, useState} from "react";
import {Alert, Button, Flex, Input, Modal, Select, Space, Switch, Typography} from "antd";
import {PlusOutlined, MinusCircleOutlined} from "@ant-design/icons";
import {useTranslation} from "react-i18next";
import {createTable} from "@/api/apiClient.ts";
import type {TableCreateRequest, FieldRequest, EnumValueRequest} from "@/api/apiClient.ts";
import {useQueryClient} from "@tanstack/react-query";
import {queryKeys} from "@/services/queryKeys.ts";

const {Text} = Typography;

const FIELD_TYPES = ['bool', 'int', 'long', 'float', 'string', 'text'];

type ElementType = 'table' | 'struct' | 'enum';

export const CreateTableForm = memo(function CreateTableForm({open, onClose, onCreated}: {
    open: boolean;
    onClose: () => void;
    onCreated?: () => void;
}) {
    const {t} = useTranslation();
    const queryClient = useQueryClient();

    const [elementType, setElementType] = useState<ElementType>('table');
    const [name, setName] = useState('');
    const [fields, setFields] = useState<FieldRequest[]>([
        {name: 'id', type: 'int', comment: ''},
    ]);
    const [primaryKey, setPrimaryKey] = useState<string[]>(['id']);
    const [withDataFile, setWithDataFile] = useState(true);
    const [enumValues, setEnumValues] = useState<EnumValueRequest[]>([
        {name: '', comment: ''},
    ]);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);

    const resetForm = useCallback(() => {
        setElementType('table');
        setName('');
        setFields([{name: 'id', type: 'int', comment: ''}]);
        setPrimaryKey(['id']);
        setWithDataFile(true);
        setEnumValues([{name: '', comment: ''}]);
        setErrors([]);
    }, []);

    const handleClose = useCallback(() => {
        resetForm();
        onClose();
    }, [resetForm, onClose]);

    const handleAddField = useCallback(() => {
        setFields(prev => [...prev, {name: '', type: 'int', comment: ''}]);
    }, []);

    const handleRemoveField = useCallback((index: number) => {
        setFields(prev => {
            const next = prev.filter((_, i) => i !== index);
            // 同步更新主键：移除被删字段
            const removedName = prev[index].name;
            setPrimaryKey(pk => pk.filter(k => k !== removedName));
            return next;
        });
    }, []);

    const handleFieldChange = useCallback((index: number, key: keyof FieldRequest, value: string) => {
        setFields(prev => {
            const next = [...prev];
            const oldName = next[index].name;
            next[index] = {...next[index], [key]: value};
            // 如果改的是 name，同步更新主键
            if (key === 'name') {
                setPrimaryKey(pk => pk.map(k => k === oldName ? value : k));
            }
            return next;
        });
    }, []);

    const handleAddEnumValue = useCallback(() => {
        setEnumValues(prev => [...prev, {name: '', comment: ''}]);
    }, []);

    const handleRemoveEnumValue = useCallback((index: number) => {
        setEnumValues(prev => prev.filter((_, i) => i !== index));
    }, []);

    const handleEnumValueChange = useCallback((index: number, key: keyof EnumValueRequest, value: string) => {
        setEnumValues(prev => {
            const next = [...prev];
            next[index] = {...next[index], [key]: value};
            return next;
        });
    }, []);

    const handleSave = useCallback(async () => {
        setSaving(true);
        setErrors([]);

        const request: TableCreateRequest = {
            type: elementType,
            name: name.trim(),
        };

        if (elementType === 'table') {
            request.fields = fields.filter(f => f.name.trim());
            request.primaryKey = primaryKey;
            request.withDataFile = withDataFile;
        } else if (elementType === 'struct') {
            request.fields = fields.filter(f => f.name.trim());
        } else if (elementType === 'enum') {
            request.enumValues = enumValues.filter(v => v.name.trim());
        }

        try {
            const result = await createTable(request);
            if (result.ok) {
                // 刷新 schema 缓存让 UI 更新
                await queryClient.invalidateQueries({queryKey: queryKeys.schema()});
                resetForm();
                onCreated?.();
                onClose();
            } else {
                setErrors(result.errors);
            }
        } catch (err) {
            setErrors([err instanceof Error ? err.message : String(err)]);
        } finally {
            setSaving(false);
        }
    }, [elementType, name, fields, primaryKey, withDataFile, enumValues, queryClient, resetForm, onCreated, onClose]);

    // table 名必须全小写，struct/enum 名没有此限制（后端会校验）
    const namePlaceholder = elementType === 'table'
        ? t('createTableNamePlaceholder')
        : t('createStructNamePlaceholder');

    const showFields = elementType === 'table' || elementType === 'struct';
    const showEnumValues = elementType === 'enum';
    const showPrimaryKey = elementType === 'table';
    const showDataFile = elementType === 'table';

    return (
        <Modal
            title={t('createTableTitle')}
            open={open}
            onCancel={handleClose}
            width={600}
            centered
            destroyOnHidden
            footer={
                <Flex justify="space-between" align="center">
                    <Text type="secondary" style={{fontSize: 12}}>
                        {'config.cfg'}
                    </Text>
                    <Flex gap="small">
                        <Button onClick={handleClose}>{t('cancel')}</Button>
                        <Button type="primary" loading={saving} onClick={handleSave}
                                disabled={!name.trim()}>
                            {t('create')}
                        </Button>
                    </Flex>
                </Flex>
            }
        >
            <Flex vertical gap="middle">
                {/* 类型选择 */}
                <Space align="center">
                    <Text>{t('createTableType')}:</Text>
                    <Select
                        value={elementType}
                        onChange={(v: ElementType) => setElementType(v)}
                        style={{width: 140}}
                        options={[
                            {value: 'table', label: t('createTableTypeTable')},
                            {value: 'struct', label: t('createTableTypeStruct')},
                            {value: 'enum', label: t('createTableTypeEnum')},
                        ]}
                    />
                </Space>

                {/* 名称 */}
                <Space align="center" style={{width: '100%'}}>
                    <Text style={{flexShrink: 0}}>{t('createTableName')}:</Text>
                    <Input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder={namePlaceholder}
                        style={{flex: 1, minWidth: 200}}
                    />
                </Space>

                {/* 字段列表（table / struct） */}
                {showFields && (
                    <Flex vertical gap="small">
                        <Flex justify="space-between" align="center">
                            <Text strong>{t('createTableFields')}</Text>
                            <Button size="small" icon={<PlusOutlined/>} onClick={handleAddField}>
                                {t('createTableAddField')}
                            </Button>
                        </Flex>
                        {fields.map((field, i) => (
                            <Flex key={i} gap="small" align="center">
                                <Input
                                    placeholder={t('createTableFieldName')}
                                    value={field.name}
                                    onChange={e => handleFieldChange(i, 'name', e.target.value)}
                                    style={{flex: 1}}
                                />
                                <Select
                                    value={field.type}
                                    onChange={(v: string) => handleFieldChange(i, 'type', v)}
                                    style={{width: 100}}
                                    showSearch
                                    options={FIELD_TYPES.map(t => ({value: t, label: t}))}
                                />
                                <Input
                                    placeholder={t('createTableFieldComment')}
                                    value={field.comment || ''}
                                    onChange={e => handleFieldChange(i, 'comment', e.target.value)}
                                    style={{flex: 1}}
                                />
                                {fields.length > 1 && (
                                    <Button
                                        size="small"
                                        icon={<MinusCircleOutlined/>}
                                        onClick={() => handleRemoveField(i)}
                                        danger
                                    />
                                )}
                            </Flex>
                        ))}
                    </Flex>
                )}

                {/* 主键（table only） */}
                {showPrimaryKey && (
                    <Space align="center" style={{width: '100%'}}>
                        <Text style={{flexShrink: 0}}>{t('createTablePrimaryKey')}:</Text>
                        <Select
                            mode="multiple"
                            value={primaryKey}
                            onChange={(v: string[]) => setPrimaryKey(v)}
                            style={{flex: 1, minWidth: 200}}
                            placeholder={t('createTablePrimaryKeyHint')}
                            options={fields
                                .filter(f => f.name.trim())
                                .map(f => ({value: f.name, label: f.name}))}
                        />
                    </Space>
                )}

                {/* 数据文件开关（table only） */}
                {showDataFile && (
                    <Space align="center">
                        <Text>{t('createTableWithDataFile')}:</Text>
                        <Switch checked={withDataFile} onChange={setWithDataFile}/>
                        <Text type="secondary" style={{fontSize: 12}}>
                            {t('createTableWithDataFileHint')}
                        </Text>
                    </Space>
                )}

                {/* 枚举值列表（enum only） */}
                {showEnumValues && (
                    <Flex vertical gap="small">
                        <Flex justify="space-between" align="center">
                            <Text strong>{t('createTableEnumValues')}</Text>
                            <Button size="small" icon={<PlusOutlined/>} onClick={handleAddEnumValue}>
                                {t('createTableAddEnumValue')}
                            </Button>
                        </Flex>
                        {enumValues.map((ev, i) => (
                            <Flex key={i} gap="small" align="center">
                                <Input
                                    placeholder={t('createTableEnumValueName')}
                                    value={ev.name}
                                    onChange={e => handleEnumValueChange(i, 'name', e.target.value)}
                                    style={{flex: 1}}
                                />
                                <Input
                                    placeholder={t('createTableEnumValueComment')}
                                    value={ev.comment || ''}
                                    onChange={e => handleEnumValueChange(i, 'comment', e.target.value)}
                                    style={{flex: 1}}
                                />
                                {enumValues.length > 1 && (
                                    <Button
                                        size="small"
                                        icon={<MinusCircleOutlined/>}
                                        onClick={() => handleRemoveEnumValue(i)}
                                        danger
                                    />
                                )}
                            </Flex>
                        ))}
                    </Flex>
                )}

                {/* 错误信息 */}
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
            </Flex>
        </Modal>
    );
});
