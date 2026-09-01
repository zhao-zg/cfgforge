import {memo, useCallback, useEffect, useMemo} from "react";
import {useTranslation} from "react-i18next";
import {Button, Form, Input, Select, Space} from "antd";
import {CloseOutlined, PlusOutlined} from "@ant-design/icons";
import {Schema} from "@/domain/schema.ts";
import {ChainConf} from "@/domain/storageJson.ts";
import {setChainConfs, useMyStore} from "@/store/store.ts";

export const ChainSetting = memo(function ({schema}: {
    schema: Schema | undefined;
}) {
    const {t} = useTranslation();
    const {chainConfs} = useMyStore();
    const [form] = Form.useForm();

    // 所有可选表名（仅 table 类型）
    const tableOptions = useMemo(() => {
        if (!schema) return [];
        const opts: {label: string; value: string}[] = [];
        for (const item of schema.itemMap.values()) {
            if (item.type === 'table') {
                opts.push({label: item.name, value: item.name});
            }
        }
        return opts;
    }, [schema]);

    const onSubmit = useCallback(function (values: { chains: ChainConf[] }) {
        // 去重 label：同 label 只保留最后一个
        const unique = new Map<string, ChainConf>();
        for (const chain of values.chains ?? []) {
            if (chain.label && chain.tables && chain.tables.length > 0) {
                unique.set(chain.label, chain);
            }
        }
        setChainConfs({chains: Array.from(unique.values())});
    }, []);

    // 保持引用稳定，避免 effect 反复重置表单
    const chains = useMemo(() => chainConfs.chains, [chainConfs]);

    useEffect(() => {
        form.setFieldsValue({chains});
    }, [chains, form]);

    return <Form form={form} name="chainConfs"
                 onFinish={onSubmit} layout={"vertical"}
                 autoComplete="off">
        <Form.Item label={t('chains')}>
            <Form.List name="chains">
                {(fields, {add, remove}) => (
                    <div style={{display: 'flex', flexDirection: 'column', rowGap: 12}}>
                        {fields.map(({key, name}) => (
                            <Space key={key} align="center" wrap>
                                <Form.Item name={[name, 'label']} noStyle
                                   rules={[{required: true, message: t('chainLabel')}]}>
                                    <Input placeholder={t('chainLabelPlaceholder')} style={{width: 160}}/>
                                </Form.Item>
                                <Form.Item name={[name, 'tables']} noStyle
                                   rules={[{required: true, message: t('chainTables')}]}>
                                    <Select mode="multiple" style={{minWidth: 280}}
                                            placeholder={t('chainTablesPlaceholder')}
                                            options={tableOptions}
                                            showSearch
                                            filterOption={(input, option) =>
                                                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                            }/>
                                </Form.Item>
                                <CloseOutlined onClick={() => remove(name)}/>
                            </Space>
                        ))}
                        <Button type="dashed" icon={<PlusOutlined/>} onClick={() => add()} style={{width: 'fit-content'}}>
                            {t('addChain')}
                        </Button>
                    </div>
                )}
            </Form.List>
        </Form.Item>

        <Form.Item>
            <Button type="primary" htmlType="submit">
                {t('setChainConfs')}
            </Button>
        </Form.Item>
    </Form>
});
