import {CSSProperties, ReactNode} from "react";

/**
 * 设置分组卡片（Soft Nordic 设计系统，C 项 1）
 * 替代裸 Divider + 裸 Title：卡片底色 --color-bg-elevated、圆角 --radius-lg、
 * 1px 轻边框 --color-border-light、hover 阴影增强（class .settingCard）。
 * 结构：可选图标 + 标题 + 说明 + 内容区（含子表单）。
 */
const CARD_STYLE: CSSProperties = {
    background: 'var(--color-bg-elevated)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--color-border-light)',
    padding: '16px 20px',
    marginBottom: 12,
};

const HEADER_GAP: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
};

const ICON_STYLE: CSSProperties = {
    color: 'var(--color-accent)',
    fontSize: 16,
    display: 'inline-flex',
};

const TITLE_STYLE: CSSProperties = {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--color-text-bright)',
};

const DESC_STYLE: CSSProperties = {
    margin: '2px 0 0',
    fontSize: 12,
    color: 'var(--color-text-dim)',
};

export function SettingCard({icon, title, desc, children, style}: {
    icon?: ReactNode;
    title: ReactNode;
    desc?: ReactNode;
    children?: ReactNode;
    style?: CSSProperties;
}) {
    return <div className="settingCard" style={{...CARD_STYLE, ...style}}>
        <div style={HEADER_GAP}>
            {icon ? <span style={ICON_STYLE}>{icon}</span> : null}
            <span style={TITLE_STYLE}>{title}</span>
        </div>
        {desc ? <p style={DESC_STYLE}>{desc}</p> : null}
        {children}
    </div>;
}