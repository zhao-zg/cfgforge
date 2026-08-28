import {memo, useState, useEffect} from "react";
import {App, Button, Form, Input, Radio, Space, Typography} from "antd";
import {BgColorsOutlined, MoonOutlined} from "@ant-design/icons";
import {useTranslation} from "react-i18next";
import {useMyStore, setThemeConfig, setThemeMode, ThemeMode} from "@/store/store.ts";
import {loadTheme, themeExists as themeFileExists} from "@/services/themeService.ts";
import {SettingCard} from "./SettingCard.tsx";
const {Text} = Typography;

export const ThemeSetting = memo(function ThemeSetting() {
    const {t} = useTranslation();
    const {message} = App.useApp();
    const {themeConfig, themeMode} = useMyStore();
    const [loading, setLoading] = useState(false);
    const [themeExists, setThemeExists] = useState<boolean | null>(null);

    // 明暗切换
    const handleModeChange = (mode: ThemeMode) => {
        setThemeMode(mode);
        message.success(t('themeModeSaved'));
    };

    // 检查当前主题文件是否存在
    useEffect(() => {
        // cancelled 防两类问题：themeFile 快速变化时旧请求后返回覆盖新结果（stale race）；
        // Tabs destroyOnHidden 切 tab 卸载后 pending setState
        let cancelled = false;
        const checkThemeFile = async () => {
            if (themeConfig.themeFile) {
                const exists = await themeFileExists(themeConfig.themeFile)
                    // 检查失败视为不存在（提示用户文件不可用），并兜底 unhandled rejection
                    .catch(() => false);
                if (!cancelled) {
                    setThemeExists(exists);
                }
            } else {
                setThemeExists(null);
            }
        };

        checkThemeFile();
        return () => {
            cancelled = true;
        };
    }, [themeConfig.themeFile]);

    const handleThemeChange = async (values: { themeFile: string }) => {
        setLoading(true);
        try {
            const newThemeConfig = {
                ...themeConfig,
                themeFile: values.themeFile.trim() || '',
            };

            // 如果设置了主题文件，验证文件是否存在
            if (newThemeConfig.themeFile) {
                const exists = await themeFileExists(newThemeConfig.themeFile);
                if (!exists) {
                    message.warning(t('themeFileNotFound'));
                    setThemeExists(false);
                    setLoading(false);
                    return;
                }
                setThemeExists(true);
            } else {
                setThemeExists(null);
            }

            // 保存主题配置
            setThemeConfig(newThemeConfig);
            message.success(t('themeSettingSaved'));

            // 提示用户可能需要刷新页面
            message.info(t('themeChangeHint'));
        } catch (error) {
            console.error('设置主题失败:', error);
            message.error(t('themeSettingFailed'));
        } finally {
            setLoading(false);
        }
    };

    const testTheme = async () => {
        if (!themeConfig.themeFile) {
            message.warning(t('pleaseSetThemeFile'));
            return;
        }

        setLoading(true);
        try {
            const theme = await loadTheme(themeConfig.themeFile);
            if (theme) {
                message.success(t('themeFileValid'));
            } else {
                message.error(t('themeFileInvalid'));
            }
        } catch (error) {
            console.error('测试主题失败:', error);
            message.error(t('themeTestFailed'));
        } finally {
            setLoading(false);
        }
    };

    return <>
        <SettingCard icon={<MoonOutlined/>} title={t('themeMode')}>
            <Radio.Group
                value={themeMode}
                onChange={(e) => handleModeChange(e.target.value as ThemeMode)}
                optionType="button"
                buttonStyle="solid"
            >
                <Radio.Button value="light">{t('themeModeLight')}</Radio.Button>
                <Radio.Button value="dark">{t('themeModeDark')}</Radio.Button>
            </Radio.Group>
        </SettingCard>

        <SettingCard icon={<BgColorsOutlined/>} title={t('themeSetting')}>
            <Form layout="vertical" size={"small"}
                  initialValues={themeConfig}
                  onFinish={handleThemeChange}>

                <Form.Item label={t('themeFile')}
                           name="themeFile"
                           help={
                               themeExists === false ? (
                                   <Text type="danger">{t('themeFileNotFound')}</Text>
                               ) : themeExists === true ? (
                                   <Text type="success">{t('themeFileExists')}</Text>
                               ) : (
                                   t('themeFileHelp')
                               )
                           }>
                    <Input placeholder="colourpurple.json" allowClear/>
                </Form.Item>

                <Form.Item style={{marginBottom: 0}}>
                    <Space>
                        <Button type="primary" htmlType="submit" loading={loading}>
                            {t('save')}
                        </Button>
                        <Button onClick={testTheme} loading={loading} disabled={!themeConfig.themeFile}>
                            {t('testTheme')}
                        </Button>
                    </Space>
                </Form.Item>
            </Form>
        </SettingCard>
    </>;
});