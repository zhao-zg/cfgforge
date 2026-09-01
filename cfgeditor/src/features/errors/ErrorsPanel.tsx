import {memo, useMemo, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {useNavigate} from 'react-router';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {Button, Collapse, CollapseProps, Empty, List, Tag, Tooltip, Typography} from 'antd';
import {ReloadOutlined} from '@ant-design/icons';
import type {ValueErrInfo} from '@cfgforge/editor-core';
import {fetchValueErrs} from '@/api/apiClient';
import {queryKeys} from '@/services/queryKeys';
import {navTo} from '@/store/navigation';
import {SidePanelShell} from '@/app/SidePanelShell';
import {groupByTable} from './errorsModel';

/**
 * 从 ValueErrInfo.recordId 中提取纯 id。
 * recordId 是 "table-id" 复合格式（如 "item-1"），
 * 需要去掉 "table-" 前缀才能用于 navTo。
 * 其他错误的 recordId 可能已经是纯 id（如 PrimaryOrUniqueKeyDuplicated
 * 直接用 table-pkPackStr 构造，同样符合前缀剥离规则）。
 */
function extractId(recordId: string | undefined, table: string): string {
    if (!recordId) return '';
    const prefix = table + '-';
    if (recordId.startsWith(prefix)) {
        return recordId.substring(prefix.length);
    }
    return recordId;
}

/** 判断该错误是否可跳转到记录页（有 table 且有 recordId）。 */
function isNavigable(err: ValueErrInfo): boolean {
    return !!(err.table && extractId(err.recordId, err.table));
}

const tagColors: Record<string, string> = {
    err: 'red',
    warn: 'orange',
};

export const ErrorsPanel = memo(function ErrorsPanel() {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // 与 HeaderBar 的 Badge 共享同一 queryKey。不需要 enabled 守卫：
    // ErrorsPanel 只在用户切到 errors 面板时才挂载（dragPanel === 'errors'），
    // 此时 schema 必已加载（CfgEditorApp 的渲染前提），全库校验可直接执行。
    // re-check 按钮需要强制重新解析（绕过缓存）；用 ref 传递 force 标志，
    // 在 queryFn 消费后立即重置，避免后续非 re-check 的 refetch 也触发 force。
    const forceRef = useRef(false);

    const {data: errs, isFetching} = useQuery({
        queryKey: queryKeys.valueErrs(),
        queryFn: ({signal}) => {
            const force = forceRef.current;
            forceRef.current = false;
            return fetchValueErrs(signal, force);
        },
        retry: false,
    });

    const groups = useMemo(() => groupByTable(errs ?? []), [errs]);

    const handleRecheck = () => {
        forceRef.current = true;
        queryClient.invalidateQueries({queryKey: queryKeys.valueErrs()});
    };

    const handleClick = (err: ValueErrInfo) => {
        const id = extractId(err.recordId, err.table);
        if (err.table && id) {
            navigate(navTo('record', err.table, id, true));
        }
    };
    const header = (
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px'}}>
            <Typography.Text strong>{t('errors')}</Typography.Text>
            <Tooltip title={t('recheck')}>
                <Button type="text" size="small" icon={<ReloadOutlined/>} loading={isFetching}
                        aria-label={t('recheck')} onClick={handleRecheck}/>
            </Tooltip>
        </div>
    );

    if (!errs || errs.length === 0) {
        return (
            <SidePanelShell>
                {header}
                <div style={{padding: '12px'}}>
                    <Empty description={t('errorsEmpty')} image={Empty.PRESENTED_IMAGE_SIMPLE}/>
                </div>
            </SidePanelShell>
        );
    }

    const items: CollapseProps['items'] = groups.map(g => ({
        key: g.key,
        label: (
            <span>
                {g.table || '(unknown)'}
                <Tag style={{marginLeft: 8}}>{g.errors.length}</Tag>
            </span>
        ),
        children: (
            <List size="small" split dataSource={g.errors}
                  rowKey={(item) => `${item.errType}-${item.sourceDesc}-${item.msg}`}
                  renderItem={(err) => (
                      <List.Item style={{cursor: isNavigable(err) ? 'pointer' : 'default', paddingInline: 8}}
                                  onClick={() => handleClick(err)}>
                          <div style={{flex: 1, minWidth: 0}}>
                              <div>
                                  <Tag color={tagColors[err.level] ?? 'default'}>
                                      {err.level === 'warn' ? 'WARN' : 'ERR'}
                                  </Tag>
                                  <Typography.Text type="secondary" style={{fontSize: 12}}>
                                      {err.errType}
                                  </Typography.Text>
                              </div>
                              <Typography.Paragraph style={{marginBottom: 0, fontSize: 13}}
                                                    ellipsis={{rows: 2, tooltip: err.msg}}>
                                  {err.msg}
                              </Typography.Paragraph>
                              {err.sourceDesc && (
                                  <Typography.Text type="secondary" style={{fontSize: 11}}>
                                      {err.sourceDesc}
                                  </Typography.Text>
                              )}
                          </div>
                      </List.Item>
                  )}/>
        ),
    }));

    return (
        <SidePanelShell>
            {header}
            <Collapse defaultActiveKey={groups.map(g => g.key)} size="small" items={items}/>
        </SidePanelShell>
    );
});
