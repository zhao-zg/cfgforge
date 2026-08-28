import {memo, useCallback, useState} from "react";
import {Button, Form, Input, Space, App} from "antd";
import {CloudServerOutlined, RobotOutlined} from "@ant-design/icons";
import {useTranslation} from "react-i18next";
import {setDataDir, useMyStore} from "@/store/store.ts";
import {AiSetting} from "./AiSetting.tsx";
import {open} from "@tauri-apps/plugin-dialog";
import {isTauri} from "@tauri-apps/api/core";
import {setDefaultFileSystem} from "@cfgforge/shared";
import {saveDirHandle, ensurePermission, LocalFsApi} from "@/services/LocalFsApi.ts";
import {SettingCard} from "./SettingCard.tsx";

/**
 * "数据目录" tab：
 * - 桌面端：选择数据目录 → 自动初始化 editor-core（TauriFileSystem）
 * - Web 端：点「浏览…」调用 showDirectoryPicker() 选择本地目录 →
 *   注入 LocalFsApi（基于 File System Access API）→ 初始化 editor-core
 * - AI 服务配置（AiSetting，提交保存）。
 */
export const ConnectionSetting = memo(function ConnectionSetting() {
    const {t} = useTranslation();
    const {dataDir} = useMyStore();
    const {message} = App.useApp();
    const isDesktop = isTauri();
    const [connecting, setConnecting] = useState(false);

    const handleSelectDir = useCallback(async () => {
        try {
            if (isDesktop) {
                // 桌面端：打开系统目录选择器
                const selected = await open({
                    directory: true,
                    multiple: false,
                    title: t('selectDataDir'),
                });
                if (selected && typeof selected === 'string') {
                    await setDataDir(selected);
                    message.success(t('dataDirConnected'));
                }
            } else {
                // Web 端：调用 File System Access API 选择本地目录
                if (typeof (window as any).showDirectoryPicker !== 'function') {
                    message.error(t('fsApiNotSupported'));
                    return;
                }
                setConnecting(true);
                const handle = await (window as any).showDirectoryPicker({
                    mode: 'readwrite',
                });
                if (!handle) return;

                // 确保权限
                if (!(await ensurePermission(handle))) {
                    message.error(t('dataDirConnectFailed'));
                    return;
                }

                // 持久化句柄到 IndexedDB（刷新后可恢复）
                await saveDirHandle(handle);

                // 注入 LocalFsApi 到全局 CfgFileSystem
                const localFs = new LocalFsApi(handle);
                setDefaultFileSystem(localFs);

                // setDataDir 会调用 initEditor(dataDir)，
                // dataDir 值为目录名（handle.name）
                await setDataDir(localFs.displayDir);
                message.success(t('dataDirConnected'));
            }
        } catch (e) {
            // 用户取消选择器时会抛 AbortError，不需要报错
            if (e instanceof DOMException && e.name === 'AbortError') {
                return;
            }
            console.error('Directory selection failed:', e);
            message.error(`${t('dataDirConnectFailed')}: ${e}`);
        } finally {
            setConnecting(false);
        }
    }, [t, message, isDesktop]);

    return <>
        <SettingCard icon={<CloudServerOutlined/>} title={t('connection')}
                     desc={t('dataDirTip')}>
            <Form layout="vertical" size="small">
                <Form.Item label={t('dataDir')} style={{marginBottom: 0}}>
                    <Space.Compact style={{width: '100%'}}>
                        <Input
                            value={dataDir}
                            readOnly
                            placeholder={t('selectDataDirHint')}
                            style={{flex: 1}}
                        />
                        <Button onClick={handleSelectDir} loading={connecting}>
                            {t('browse')}
                        </Button>
                    </Space.Compact>
                </Form.Item>
            </Form>
        </SettingCard>

        <SettingCard icon={<RobotOutlined/>} title={t('aiConf')}>
            <AiSetting/>
        </SettingCard>
    </>;
});