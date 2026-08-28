// Buffer polyfill: editor-core 服务层和 ExcelJS 使用 Node.js Buffer API（from/allocUnsafe/alloc 等），
// 浏览器环境无此全局变量。Vite/rolldown 可能注入简化版 Buffer（仅有 from/isBuffer/concat），
// 缺少 allocUnsafe/alloc 等 ExcelJS 需要的方法，因此必须强制覆盖为完整的 buffer@6 polyfill。
import { Buffer as FullBuffer } from 'buffer';
(globalThis as any).Buffer = FullBuffer;

// Tauri 环境下注入 TauriFileSystem 作为 CfgFileSystem 默认实现。
// 必须在 EditorService.create 被调用之前完成（AppLoader/selectDataDir 时才调用，这里足够早）。
import { setDefaultFileSystem, Logger, createPrinter } from '@cfgforge/shared';
import { isTauri } from '@tauri-apps/api/core';
if (isTauri()) {
    // Logger 默认 printer 使用 process.stdout.write，Tauri WebView 无 process 全局变量。
    // 替换为 console.log 版本，避免 ReferenceError: process is not defined。
    Logger.setPrinter(createPrinter({ write: (s: string) => console.log(s) }));
    // 动态导入避免非 Tauri 环境（纯 web dev）加载 plugin-fs
    const { TauriFileSystem } = await import('./services/TauriFileSystem.ts');
    setDefaultFileSystem(new TauriFileSystem());
} else {
    // 纯浏览器环境（Docker 网页版 / 本地 dev）：
    // 尝试从 IndexedDB 恢复上次选择的目录句柄。
    // 成功则注入 LocalFsApi（基于 File System Access API 直接读写本地文件）；
    // 失败则不初始化，由 ConnectionSetting 引导用户选择目录。
    Logger.setPrinter(createPrinter({ write: (s: string) => console.log(s) }));
    try {
        const { loadDirHandle, ensurePermission, LocalFsApi } = await import('./services/LocalFsApi.ts');
        const savedHandle = await loadDirHandle();
        if (savedHandle && await ensurePermission(savedHandle)) {
            setDefaultFileSystem(new LocalFsApi(savedHandle));
        }
    } catch (e) {
        // IndexedDB 或权限获取失败：保持未初始化，由 UI 引导用户重新选择
        console.warn('[main] Failed to restore directory handle:', e);
    }
}

import React, {useEffect, useMemo, useState} from 'react'
import ReactDOM from 'react-dom/client'
import {QueryClientProvider} from '@tanstack/react-query'
import {queryClient} from "./services/queryClient.ts";

import '@xyflow/react/dist/style.css';
import './styles/tokens.css'
import './style.css'
import {App, Button, ConfigProvider, Result, theme} from "antd";
import './app/i18n.js'
import {createBrowserRouter} from "react-router";
import {RouterProvider} from "react-router/dom";
import {AppLoader} from "./app/AppLoader.tsx";
import {flushAllPrefsAsync} from "./store/storage.ts";
import {Window} from "@tauri-apps/api/window";
import {useMyStore} from "./store/store.ts";
import {loadTheme, AntdThemeConfig} from "./services/themeService.ts";
// import {ReactQueryDevtools} from "@tanstack/react-query-devtools";


const router = createBrowserRouter([
    {
        path: "/",
        Component: AppLoader,
        children: [
            {
                path: "table/:table/*",
                lazy: () => import("@/features/table/Table.tsx").then(m => ({Component: m.Table})),
            },
            {
                path: "tableRef/:table/*",
                lazy: () => import("@/features/table/TableRef.tsx").then(m => ({Component: m.TableRef})),
            },
            {
                path: "edit?/record/:table/*",
                lazy: () => import("@/features/record/Record.tsx").then(m => ({Component: m.Record})),
            },
            {
                path: "recordRef/:table/:id",
                lazy: () => import("@/features/record/RecordRef.tsx").then(m => ({Component: m.RecordRefRoute})),
            },
            {
                path: "recordUnref/:table/*",  // 未引用记录页面路由：/* 承载 id 段（保留上次 record 的 curId，切回不丢），兼容空 id 进入
                lazy: () => import("@/features/record/RecordRef.tsx").then(m => ({Component: m.RecordRefRoute})),   // 复用RecordRefRoute组件
            },
            {
                path: "*",
                lazy: () => import("./app/PathNotFound.tsx").then(m => ({Component: m.PathNotFound})),
            }
        ]
    }
]);

// 默认主题配置（Soft Nordic 暖调浅色）
const defaultTheme = {
    token: {
        colorPrimary: '#7B9E89',
        colorBgLayout: '#F7F4EE',
        colorBgContainer: '#FFFFFF',
        colorText: '#3D3935',
        colorBorder: '#E2DCD0',
        colorBorderSecondary: '#EEE9DE',
        colorTextSecondary: '#8B8479',
        colorBgTextHover: '#F0EBE0',
        borderRadius: 6,
        fontFamily: 'Inter, "Noto Sans SC", -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
        fontSize: 14,
    },
    components: {
        Tabs: {
            horizontalMargin: '0,0,0,0'
        },
    },
}

// 深色主题配置（Refined Dark，与 tokens.css 的 [data-theme="dark"] 变量保持一致）
const darkTheme = {
    algorithm: theme.darkAlgorithm,
    token: {
        colorPrimary: '#7DBA9E',
        colorBgLayout: '#1C1B1A',
        colorBgContainer: '#252423',
        colorText: '#D0CCC8',
        colorBorder: '#3A3835',
        colorBorderSecondary: '#333130',
        colorTextSecondary: '#8A847E',
        colorBgTextHover: '#363330',
        borderRadius: 6,
        fontFamily: 'Inter, "Noto Sans SC", -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
        fontSize: 14,
    },
    components: {
        Tabs: {
            horizontalMargin: '0,0,0,0'
        },
    },
}
if (isTauri()) {
    // onCloseRequested 返回 Promise<UnlistenFn>（监听器注册）；在 app 顶层注册、随窗口生命周期常驻，
    // 无需持有 unlisten。void 显式标记该 Promise 有意 fire-and-forget，消除 floating-promise 警告。
    void Window.getCurrent().onCloseRequested(async (event) => {
        // preventDefault 后等个人 + 共享偏好都写盘完成再销毁窗口，避免 fire-and-forget 在写入完成前关窗丢失会话态
        event.preventDefault();
        try {
            await flushAllPrefsAsync();
        } catch {
            // 写盘失败也不能阻止用户关窗
        }
        await Window.getCurrent().destroy();
    });
}


// 动态主题提供者组件
function ThemeProvider({ children }: { children: React.ReactNode }) {
    const { themeConfig, themeMode } = useMyStore();
    // 自定义主题文件（异步加载，冷路径）与明暗基座分离：明暗切换是同步派生，不触发额外渲染
    const [customTheme, setCustomTheme] = useState<AntdThemeConfig | null>(null);

    // 明暗基座（同步派生，themeMode 变化立即生效；同时同步 data-theme 驱动 tokens.css 变量）
    const baseTheme = useMemo(() => themeMode === 'dark' ? darkTheme : defaultTheme, [themeMode]);

    useEffect(() => {
        document.documentElement.dataset.theme = themeMode;
    }, [themeMode]);

    // 自定义主题文件加载：themeFile 或明暗切换时重新加载/清除，结果异步合并进 currentTheme
    useEffect(() => {
        let cancelled = false;
        const applyTheme = async () => {
            if (themeConfig.themeFile) {
                try {
                    const theme = await loadTheme(themeConfig.themeFile);
                    if (!cancelled) {
                        setCustomTheme(theme || null);
                    }
                } catch (error) {
                    console.error('加载主题失败:', error);
                    if (!cancelled) {
                        setCustomTheme(null);
                    }
                }
            } else {
                setCustomTheme(null);
            }
        };

        void applyTheme();
        return () => {
            cancelled = true;
        };
    }, [themeConfig.themeFile, themeMode]);

    // 合并当前生效主题：自定义主题 token/components 浅合并进明暗基座，
    // 保证自定义文件只覆盖个别 token 时仍保留基座的完整明暗配色
    const currentTheme = useMemo(() => {
        if (!customTheme) {
            return baseTheme;
        }
        return {
            ...baseTheme,
            ...customTheme,
            token: {
                ...baseTheme.token,
                ...(customTheme.token || {}),
            },
            components: {
                ...baseTheme.components,
                ...(customTheme.components || {})
            }
        };
    }, [baseTheme, customTheme]);

    return (
        <ConfigProvider theme={currentTheme}>
            {children}
        </ConfigProvider>
    );
}

// 渲染期异常兜底：任何 render throw（如脏数据解引用）此前会直接白屏整个 app。
// 注意 error boundary 只兜渲染路径，捕获不到事件处理器 / query 回调里的异常。
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
    state: { error: Error | null } = {error: null};

    static getDerivedStateFromError(error: Error) {
        return {error};
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('render error:', error, info.componentStack);
    }

    render() {
        if (this.state.error) {
            return <Result
                status="error"
                title="Something went wrong"
                subTitle={String(this.state.error)}
                extra={<Button onClick={() => window.location.reload()}>Reload</Button>}
            />;
        }
        return this.props.children;
    }
}

function MyApp() {

    return (
        <App>
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router}/>
                {/*<ReactQueryDevtools initialIsOpen={false} />*/}
            </QueryClientProvider>
        </App>
    );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ThemeProvider>
            <ErrorBoundary>
                <MyApp/>
            </ErrorBoundary>
        </ThemeProvider>
    </React.StrictMode>
);
