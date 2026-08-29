import {Flex, Typography} from "antd";
import {useTranslation} from "react-i18next";
import {SettingCard} from "./SettingCard.tsx";

/**
 * 快捷键提示卡片（E 项 12）：列出全部全局快捷键。
 * 只读展示，不提供自定义（YAGNI）。
 */
export function ShortcutSetting() {
    const {t} = useTranslation();

    const rows: Array<[string, string]> = [
        [t('keyTable'), 'Alt+1'],
        [t('keyTableRef'), 'Alt+2'],
        [t('keyRecord'), 'Alt+3'],
        [t('keyRecordRef'), 'Alt+4'],
        [t('keyBack'), 'Alt+C'],
        [t('keyForward'), 'Alt+V'],
        [t('keySubmit'), 'Alt+S'],
        [t('keyFullScreen'), 'Alt+Enter'],
    ];

    return <SettingCard title={t('keySetting')}>
        <Flex vertical gap={6}>
            {rows.map(([label, key]) => (
                <Flex key={key} justify="space-between" align="center" style={{fontSize: 13}}>
                    <Typography.Text>{label}</Typography.Text>
                    <Typography.Text code style={{fontSize: 12}}>{key}</Typography.Text>
                </Flex>
            ))}
        </Flex>
    </SettingCard>;
}