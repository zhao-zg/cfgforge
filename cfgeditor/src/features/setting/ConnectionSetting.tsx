import {memo, useState, useCallback} from "react";
import {Button, Divider, Form, Input, Radio, Space, Typography, App} from "antd";
import {useTranslation} from "react-i18next";
import {setServer, setBackendMode, setLocalDataDir, useMyStore} from "@/store/store.ts";
import {AiSetting} from "./AiSetting.tsx";
import {invoke} from "@tauri-apps/api/core";
import {open} from "@tauri-apps/plugin-dialog";
import {isTauri} from "@tauri-apps/api/core";

const {Title, Text} = Typography;

/**
 * "连接" tab：
 * - 桌面端：本机部署（选数据目录→自动启动内置后端） / 远程服务器（手动填地址）
 * - Web 端：仅远程服务器地址
 * + AI 服务配置（AiSetting，提交保存）。
 */
export const ConnectionSetting = memo(function ConnectionSetting() {
    const {t} = useTranslation();
    const {server, backendMode, localDataDir} = useMyStore();
    const {message} = App.useApp();
    const [starting, setStarting] = useState(false);

    const handleSelectDir = useCallback(async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: t('selectDataDir'),
            });
            if (selected && typeof selected === 'string') {
                setLocalDataDir(selected);
            }
        } catch (e) {
            console.error('Directory selection failed:', e);
        }
    }, [t]);

    const handleStartLocal = useCallback(async () => {
        if (!localDataDir) {
            message.warning(t('selectDataDirFirst'));
            return;
        }
        setStarting(true);
        try {
            const url = await invoke<string>('start_local_backend', {datadir: localDataDir});
            setServer(url);
            message.success(t('localBackendStarted'));
        } catch (e) {
            message.error(`${t('localBackendStartFailed')}: ${e}`);
        } finally {
            setStarting(false);
        }
    }, [localDataDir, t, message]);

    const handleModeChange = useCallback((mode: 'local' | 'remote') => {
        setBackendMode(mode);
        if (mode === 'remote') {
            // 切到远程时停止本机后端（如果在 Tauri 环境）
            if (isTauri()) {
                invoke('stop_local_backend').catch(() => {});
            }
        }
    }, []);

    const isDesktop = isTauri();

    return <>
        <Title level={4} style={{marginTop: -4}}>{t('connection')}</Title>
        <Form layout="vertical" size="small">
            {isDesktop && (
                <Form.Item label={t('backendMode')}>
                    <Radio.Group
                        value={backendMode}
                        onChange={e => handleModeChange(e.target.value)}
                    >
                        <Radio value="local">{t('localBackend')}</Radio>
                        <Radio value="remote">{t('remoteBackend')}</Radio>
                    </Radio.Group>
                </Form.Item>
            )}

            {isDesktop && backendMode === 'local' ? (
                <>
                    <Form.Item label={t('dataDir')}>
                        <Space.Compact style={{width: '100%'}}>
                            <Input
                                value={localDataDir}
                                readOnly
                                placeholder={t('selectDataDirHint')}
                                style={{flex: 1}}
                            />
                            <Button onClick={handleSelectDir}>{t('browse')}</Button>
                        </Space.Compact>
                    </Form.Item>
                    <Form.Item>
                        <Button
                            type="primary"
                            loading={starting}
                            onClick={handleStartLocal}
                            disabled={!localDataDir}
                        >
                            {t('startLocalBackend')}
                        </Button>
                    </Form.Item>
                    <Form.Item>
                        <Text type="secondary">{t('localBackendTip')}</Text>
                    </Form.Item>
                </>
            ) : (
                <>
                    <Form.Item label={t('curServer')}>{server || '(跟随当前页面域名)'}</Form.Item>
                    <Form.Item label={t('newServer')}>
                        <Input.Search
                            enterButton={t('connect')}
                            onSearch={(value: string) => setServer(value)}
                        />
                    </Form.Item>
                </>
            )}
        </Form>

        <Divider/>
        <AiSetting/>
    </>;
});
