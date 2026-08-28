import {CSSProperties, ReactNode} from "react";
import {Button, Flex, Typography} from "antd";

/**
 * 空态引导卡片（Soft Nordic 设计系统，B 项 3）
 * 结构：图标 + 标题 + 描述 + 主按钮（可选次按钮）
 * 用 tokens.css 变量：--color-bg-elevated 卡片底色、--radius-lg 圆角、--shadow-md 阴影
 */
const CARD_STYLE: CSSProperties = {
    background: 'var(--color-bg-elevated)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-md)',
    border: '1px solid var(--color-border-light)',
    padding: '48px 56px',
    maxWidth: 460,
    textAlign: 'center',
};

const ICON_WRAP_STYLE: CSSProperties = {
    width: 64,
    height: 64,
    borderRadius: '50%',
    background: 'var(--color-bg-hover)',
    color: 'var(--color-accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 28,
};

export function EmptyStateCard({icon, title, desc, primaryText, onPrimary, secondaryText, onSecondary, extra}: {
    icon: ReactNode;
    title: ReactNode;
    desc?: ReactNode;
    primaryText: string;
    onPrimary: () => void;
    secondaryText?: string;
    onSecondary?: () => void;
    extra?: ReactNode;
}) {
    return <div style={CARD_STYLE}>
        <Flex vertical align="center" gap={12}>
            <div style={ICON_WRAP_STYLE}>{icon}</div>
            <Typography.Title level={4} style={{marginBottom: 0}}>{title}</Typography.Title>
            {desc ? <Typography.Text type="secondary">{desc}</Typography.Text> : null}
            <Flex gap="small" style={{marginTop: 8}}>
                <Button type="primary" onClick={onPrimary}>{primaryText}</Button>
                {secondaryText && onSecondary
                    ? <Button onClick={onSecondary}>{secondaryText}</Button>
                    : null}
            </Flex>
            {extra}
        </Flex>
    </div>;
}