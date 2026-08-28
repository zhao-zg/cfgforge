import {memo, useCallback, useEffect, useRef, useState} from "react";
import {Alert, Button, Flex, Modal, Spin, Typography} from "antd";
import {useTranslation} from "react-i18next";
import {fetchSchemaText, writeSchemaText} from "@/api/apiClient.ts";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {queryKeys} from "@/services/queryKeys.ts";

const {Text} = Typography;

export const SchemaTextEditor = memo(function SchemaTextEditor({open, onClose}: {
    open: boolean;
    onClose: () => void;
}) {
    const {t} = useTranslation();
    const queryClient = useQueryClient();
    const [text, setText] = useState('');
    const [originalText, setOriginalText] = useState('');
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // schema 文本由 React Query 管理加载态（isLoading/isError 由 hook 派生，不在 effect 里 setState）。
    // 打开时 refetch 拉最新磁盘内容，结果在异步 .then 里写入编辑态（异步 setState，非 effect 同步 setState）。
    const {isLoading: loading, isError, error, refetch} = useQuery({
        queryKey: queryKeys.schemaText(),
        queryFn: () => fetchSchemaText(),
        enabled: open,
        staleTime: 0,
        retry: false,
    });

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        void refetch().then(res => {
            if (!cancelled && res.data) {
                setText(res.data.text);
                setOriginalText(res.data.text);
            }
        });
        return () => { cancelled = true; };
    }, [open, refetch]);

    const loadError = isError ? (error instanceof Error ? error.message : String(error)) : '';

    const isDirty = text !== originalText;

    const handleSave = useCallback(async () => {
        setSaving(true);
        setErrors([]);
        try {
            const result = await writeSchemaText(text);
            if (result.ok) {
                setOriginalText(text);
                // 刷新 schema 缓存让 UI 更新
                await queryClient.invalidateQueries({queryKey: queryKeys.schema()});
                Modal.success({
                    title: t('cfgEditorSaveSuccess'),
                    centered: true,
                });
            } else {
                setErrors(result.errors);
            }
        } catch (err) {
            setErrors([err instanceof Error ? err.message : String(err)]);
        } finally {
            setSaving(false);
        }
    }, [text, queryClient, t]);

    const handleClose = useCallback(() => {
        if (isDirty) {
            Modal.confirm({
                title: t('cfgEditorConfirmClose'),
                centered: true,
                onOk: onClose,
            });
        } else {
            onClose();
        }
    }, [isDirty, onClose, t]);

    return (
        <Modal
            title={t('cfgEditorTitle')}
            open={open}
            onCancel={handleClose}
            width="80%"
            style={{top: 20}}
            centered
            destroyOnHidden
            footer={
                <Flex justify="space-between" align="center">
                    <Text type="secondary" style={{fontSize: 12}}>
                        {isDirty ? '* ' : ''}config.cfg
                    </Text>
                    <Flex gap="small">
                        <Button onClick={handleClose}>{t('cancel')}</Button>
                        <Button type="primary" loading={saving} onClick={handleSave}
                                disabled={loading || !!loadError}>
                            {t('cfgEditorSave')}
                        </Button>
                    </Flex>
                </Flex>
            }
        >
            {loading ? (
                <Flex justify="center" align="center" style={{minHeight: 300}}>
                    <Spin size="large"/>
                </Flex>
            ) : loadError ? (
                <Alert type="error" message={t('cfgEditorLoadFail')} description={loadError}/>
            ) : (
                <Flex vertical gap="small">
                    <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={e => setText(e.target.value)}
                        style={{
                            width: '100%',
                            minHeight: '50vh',
                            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                            fontSize: 13,
                            lineHeight: 1.5,
                            padding: 12,
                            border: '1px solid #d9d9d9',
                            borderRadius: 6,
                            resize: 'vertical',
                            whiteSpace: 'pre',
                            overflow: 'auto',
                        }}
                        spellCheck={false}
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
                </Flex>
            )}
        </Modal>
    );
});