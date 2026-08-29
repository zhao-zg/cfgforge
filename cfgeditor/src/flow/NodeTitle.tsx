import {memo, useMemo} from "react";
import type {ReactNode} from "react";
import {Flex, Typography} from "antd";
import type {NodeProps} from "@xyflow/react";
import {EntityEdit} from "@/domain/entityModel";
import type {EntityNode} from "./FlowGraph.tsx";
import {Highlight} from "./Highlight.tsx";
import {NodeToolbar} from "./NodeToolbar.tsx";
import {getReadableTextColor} from "./layout/colors.ts";

const {Text} = Typography;
const titleStyle = { width: '100%' };
// 标题文本包裹层：占满剩余空间并允许收缩（flex-shrink），ellipsis 才可能生效——
// Flex 子项默认 flex-shrink:1 但 min-width:auto 会按内容撑宽，长表名/字段名会把节点撑爆。
const titleWrapStyle = { flex: 1, minWidth: 0 };
// 标题文本省略 + 完整名 tooltip：长标签不再撑破节点标题栏，悬停可见全名。
const titleEllipsis = { tooltip: true };

interface NodeTitleProps {
    foldButton: ReactNode;
    label: string;
    query: string;
    copyable: boolean;
    editNoteButton: ReactNode;
    resBriefButton: ReactNode;
    edit?: EntityEdit;
    nodeProps: NodeProps<EntityNode>;
    // 节点底色：标题文字按它自动反色（原硬编码 #fff 在浅底色上会糊掉）。
    nodeBgColor: string;
}

// 节点标题栏布局：fold 按钮 + 标题文本（含 query 高亮）+ note 触发按钮 + 资源摘要按钮 + 操作按钮组。
// 各子块由 FlowNode 计算后传入（fold/editNoteButton/resBriefButton），本组件只负责 Flex 布局与文本渲染。
export const NodeTitle = memo(function NodeTitle({
                                                     foldButton, label, query, copyable,
                                                     editNoteButton, resBriefButton, edit, nodeProps,
                                                     nodeBgColor,
                                                 }: NodeTitleProps) {
    const titleTextStyle = useMemo(() => ({
        fontSize: 14,
        color: getReadableTextColor(nodeBgColor),
    }), [nodeBgColor]);

    return <Flex justify="space-between" style={titleStyle}>
        {foldButton}
        <div style={titleWrapStyle}>
            <Text strong style={titleTextStyle} ellipsis={titleEllipsis} copyable={copyable}>
                {query ? <Highlight text={label} keyword={query} /> : label}
            </Text>
        </div>
        {editNoteButton}
        {resBriefButton}
        <NodeToolbar edit={edit} nodeProps={nodeProps} />
    </Flex>;
});
