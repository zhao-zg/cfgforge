import {memo, RefObject, useCallback} from "react";
import {useNavigate} from "react-router";
import {useTranslation} from "react-i18next";
import {App, Button, Divider, Form, Input, InputNumber, Popconfirm, Radio, Space} from "antd";
import {
    setImageSizeScale,
    setExportFilePattern,
    useMyStore,
} from "@/store/store.ts";
import {invalidateAllQueries} from "@/services/queryClient.ts";
import {CloseOutlined} from "@ant-design/icons";
import {Schema} from "@/domain/schema.ts";
import {STable} from "@/api/schemaModel.ts";
import {useMutation} from "@tanstack/react-query";
import {RecordEditResult} from "@/api/recordModel.ts";
import {deleteRecord, exportTable, exportAllSql} from "@/api/apiClient.ts";
import type {ExportFormat} from '@cfgforge/editor-core';
import {toBlob} from "html-to-image";
import {saveAs} from "file-saver";
import {PageType, navTo, useLocationData} from "@/store/store.ts";
import {KeyShortcut} from "./KeyShortcut.tsx";
import {toggleFullScreen} from "@/services/windowUtils.ts";


export const ToolsSetting = memo(function ToolsSetting({schema, curTable, flowRef}: {
    schema: Schema | undefined;
    curTable: STable | null;
    flowRef: RefObject<HTMLDivElement | null>;
}) {
    const {t} = useTranslation();
    const {imageSizeScale, exportFilePattern} = useMyStore();

    const {curPage, curTableId, curId} = useLocationData();
    const {notification} = App.useApp();
    const navigate = useNavigate();

    const deleteRecordMutation = useMutation<RecordEditResult, Error>({
        mutationFn: () => deleteRecord(curTableId, curId),

        onError: (error) => {
            notification.error({
                title: `deleteRecord ${curTableId}/${curId} err: ${error.message}`,
                placement: 'topRight',
                duration: 4
            });
        },
        onSuccess: (editResult) => {
            if (editResult.resultCode == 'deleteOk') {
                notification.info({
                    title: `deleteRecord ${curTableId}/${curId} ${editResult.resultCode}`,
                    placement: 'topRight',
                    duration: 3
                });
                invalidateAllQueries();
            } else {
                notification.warning({
                    title: `deleteRecord ${curTableId}/${curId}  ${editResult.resultCode}`,
                    placement: 'topRight',
                    duration: 4
                });
            }
        },
    });

    const onToPng = useCallback(function () {
        const {current} = flowRef;
        if (current === null) {
            return
        }

        const w = current.offsetWidth * imageSizeScale;
        const h = current.offsetHeight * imageSizeScale;

        toBlob(current, {
            cacheBust: true, canvasWidth: w, canvasHeight: h, pixelRatio: 1,
            filter: ({classList}: HTMLElement) => {

                return (!classList) ||
                    (!classList.contains('react-flow__attribution') &&
                        !classList.contains('react-flow__controls') &&
                        !classList.contains('react-flow__background'));
            }
        }).then((blob) => {
            if (blob) {
                // record/recordRef 是记录级视图，文件名带 curId；table/tableRef/recordUnref 是表级视图，只带表名
                const isRecordLevel = curPage === 'record' || curPage === 'recordRef';
                const fn = isRecordLevel
                    ? `${curPage}_${curTableId}_${curId}.png`
                    : `${curPage}_${curTableId}.png`;
                saveAs(blob, fn);
                notification.info({title: "save png to " + fn, duration: 3});
            }
        }).catch(() => {
            notification.error({title: "save png failed: limit the max node count", duration: 3});
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps -- flowRef 在 body 中经解构使用（const {current} = flowRef），oxlint exhaustive-deps 未追踪解构引用而误报
    }, [flowRef, imageSizeScale, curPage, notification, curTableId, curId]);

    // 导出文件名模板：{table}=表名（全库导出用 *），{date}=yyyyMMdd。空=默认名（<table>.csv/sql、config.sql）
    const buildExportFilename = useCallback((format: ExportFormat, table: string): string => {
        const ext = format === 'csv' ? 'csv' : 'sql';
        const pattern = exportFilePattern.trim();
        if (pattern.length === 0) {
            return format === 'csv' || table !== '*'
                ? `${table}.${ext}`
                : `config.${ext}`;
        }
        const date = new Date();
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const name = pattern
            .replaceAll('{table}', table)
            .replaceAll('{date}', `${y}${m}${d}`);
        // 清掉模板里不合法的文件名字符；结果为空则回退默认名
        const safe = name.replace(/[\\/:*?"<>|]/g, '').trim();
        return safe.length > 0 ? (safe.includes('.') ? safe : `${safe}.${ext}`) : `${table}.${ext}`;
    }, [exportFilePattern]);

    const onExport = useCallback(async (format: ExportFormat) => {
        if (!curTableId) {
            notification.error({title: t('selectTableHint'), duration: 3});
            return;
        }
        try {
            const result = await exportTable(curTableId, format);
            if (result.resultCode === 'ok') {
                const filename = buildExportFilename(format, curTableId);
                const blob = new Blob([result.content], {type: 'text/plain;charset=utf-8'});
                saveAs(blob, filename);
                notification.info({
                    title: t('exportSuccess', {table: curTableId, file: filename}),
                    duration: 3,
                });
            } else {
                notification.error({title: t('exportFail', {error: result.resultCode}), duration: 4});
            }
        } catch (e) {
            notification.error({title: t('exportFail', {error: (e as Error).message}), duration: 4});
        }
    }, [curTableId, notification, t, buildExportFilename]);

    const onExportAllSql = useCallback(async () => {
        try {
            const result = await exportAllSql();
            const filename = buildExportFilename('sql', '*');
            const blob = new Blob([result.content], {type: 'text/plain;charset=utf-8'});
            saveAs(blob, filename);
            notification.info({
                title: t('exportSuccess', {table: '*', file: filename}),
                duration: 3,
            });
        } catch (e) {
            notification.error({title: t('exportFail', {error: (e as Error).message}), duration: 4});
        }
    }, [notification, t, buildExportFilename]);

    const options = [
        {label: t('table'), value: 'table'},
        {label: t('tableRef'), value: 'tableRef'},
        {label: t('record'), value: 'record'},
        {label: t('recordRef'), value: 'recordRef'},
        {label: t('unreferenced'), value: 'recordUnref'}
    ];

    const onChangeCurPage = useCallback((page: PageType) => {
        // recordUnref 路由为 recordUnref/:table/*（带 id 段），统一带 curId：切到 unref 再切回 record/table 等不丢上下文
        navigate(navTo(page, curTableId, curId));
    }, [curTableId, curId, navigate]);


    return <>
        <Radio.Group optionType="button"
                     value={curPage}
                     options={options}
                     onChange={(e) => onChangeCurPage(e.target.value)}/>
        <Divider/>

        <Form layout={'vertical'} initialValues={{imageSizeScale}}>
            <Form.Item name='imageSizeScale' label={t('imageSizeScale')}>
                <Space>
                    <InputNumber min={1} max={256} onChange={setImageSizeScale}/>
                    <Button type="primary" onClick={onToPng}>
                        {t('toPng')}
                    </Button>
                </Space>
            </Form.Item>
        </Form>

        <Divider/>
        <Form layout={'vertical'} initialValues={{exportFilePattern}}>
            <Form.Item name='exportFilePattern'
                       label={t('exportFilePattern')}
                       extra={t('exportFilePatternTip')}>
                <Input placeholder="{table}_{date}" allowClear
                       onChange={(e) => setExportFilePattern(e.target.value)}/>
            </Form.Item>
        </Form>
        <Space>
            <Button onClick={() => onExport('csv')}>{t('exportCsv')}</Button>
            <Button onClick={() => onExport('sql')}>{t('exportSql')}</Button>
            <Button onClick={onExportAllSql}>{t('exportAllSql')}</Button>
        </Space>

        {schema && curTable && schema.isEditable &&
            <Popconfirm title={t('deleteCurRecord')}
                        okText={t('delete')}
                        cancelText={t('cancel')}
                        okButtonProps={{danger: true}}
                        onConfirm={() => deleteRecordMutation.mutate()}>
                <Button type="primary" danger>
                    <CloseOutlined/>{t('deleteCurRecord')}
                </Button>
            </Popconfirm>
        }

        <Divider/>
        <Button onClick={toggleFullScreen}> {t('toggleFullScreen')}</Button>
        <Divider/>

        <KeyShortcut/>
    </>;
});
