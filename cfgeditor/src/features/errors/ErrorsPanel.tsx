import {memo, useMemo} from 'react';
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
 * ForeignValueNotFound 的 recordId 是 "table-id" 复合格式（如 "item-1"），
 * 需要去掉 "table-" 前缀才能用于 navTo。
 * 其他错误的 recordId 可能已经是纯 id。
 */
function extractId(recordId: string | undefined, table: string): string {
    if (!recordId) return '';
    const prefix = table + '-';
    if (recordId.startsWith(prefix)) {
        return recordId.substring(prefix.length);
    }
    return recordId;
}

const tagColors: Record<string, string> = {
    err: 'red',
    warn: 'orange',
};

export const ErrorsPanel = memo(function ErrorsPanel() {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const {data: errs, isFetching} = useQuery({
        queryKey: queryKeys.valueErrs(),
        queryFn: ({signal}) => fetchValueErrs(signal),
        retry: false,
    });

    const groups = useMemo(() => groupByTable(errs ?? []), [errs]);

    const handleRecheck = () => {
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
                      <List.Item style={{cursor: 'pointer', paddingInline: 8}}
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
