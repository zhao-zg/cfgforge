import {memo, useCallback} from "react";
import {Button, Divider, Form, Input, Space, Typography, App} from "antd";
import {useTranslation} from "react-i18next";
import {setDataDir, useMyStore} from "@/store/store.ts";
import {AiSetting} from "./AiSetting.tsx";
import {open} from "@tauri-apps/plugin-dialog";
import {isTauri} from "@tauri-apps/api/core";

const {Title, Text} = Typography;

/**
 * "数据目录" tab：
 * - 桌面端：选择数据目录 → 自动初始化 editor-core
 * - Web 端：输入数据目录路径
 * + AI 服务配置（AiSetting，提交保存）。
 */
export const ConnectionSetting = memo(function ConnectionSetting() {
    const {t} = useTranslation();
    const {dataDir} = useMyStore();
    const {message} = App.useApp();

    const handleSelectDir = useCallback(async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: t('selectDataDir'),
            });
            if (selected && typeof selected === 'string') {
                await setDataDir(selected);
                message.success(t('dataDirConnected'));
            }
        } catch (e) {
            console.error('Directory selection failed:', e);
            message.error(`${t('dataDirConnectFailed')}: ${e}`);
        }
    }, [t, message]);

    const isDesktop = isTauri();

    return <>
        <Title level={4} style={{marginTop: -4}}>{t('connection')}</Title>
        <Form layout="vertical" size="small">
            <Form.Item label={t('dataDir')}>
                <Space.Compact style={{width: '100%'}}>
                    <Input
                        value={dataDir}
                        readOnly
                        placeholder={t('selectDataDirHint')}
                        style={{flex: 1}}
                    />
                    {isDesktop && <Button onClick={handleSelectDir}>{t('browse')}</Button>}
                </Space.Compact>
            </Form.Item>
            {!isDesktop && (
                <Form.Item>
                    <Button
                        type="primary"
                        onClick={handleSelectDir}
                        disabled={!dataDir}
                    >
                        {t('connect')}
                    </Button>
                </Form.Item>
            )}
            <Form.Item>
                <Text type="secondary">{t('dataDirTip')}</Text>
            </Form.Item>
        </Form>

        <Divider/>
        <AiSetting/>
    </>;
});
