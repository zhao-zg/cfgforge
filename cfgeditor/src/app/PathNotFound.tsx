import {useLocationData} from "@/store/store.ts";
import {Alert, Flex} from "antd";
import {Link} from "react-router";
import {useTranslation} from "react-i18next";

export function PathNotFound() {
    const {pathname} = useLocationData();
    const {t} = useTranslation();

    return <Flex vertical style={{height: '100%'}} justify={'center'} align={'center'} gap={'large'}>
        {/* message 而非 title：title 会被 antd Alert 渲染为 tooltip，错误文字不可见 */}
        <Alert type="warning" message={t('pathNotFound', {path: pathname})}/>
        <Link to="/">
            {t('returnHome')}
        </Link>
    </Flex>
}
