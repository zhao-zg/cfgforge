import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {fileURLToPath, URL} from 'node:url'
import { reactDevtools } from 'agent-react-devtools/vite';


// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        // React DevTools 连接脚本，仅 CFG_RDT=1 时注入（profile 时 `CFG_RDT=1 pnpm dev`）
        ...(process.env.CFG_RDT ? [reactDevtools()] : []),
        react({
            babel: {
                plugins: [
                    ["babel-plugin-react-compiler"],
                ],
            },
        })],

    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            // 将 Node.js 'path' 模块映射到 path-browserify（纯 JS 实现），
            // 避免 Vite 错误地解析到 d3-path（SVG 路径库）。
            // path-browserify 支持 join/dirname/relative/normalize/resolve 等。
            // 必须使用绝对路径，否则 rolldown 报 "was not an absolute path" 警告并最终无法加载。
            path: fileURLToPath(new URL('./node_modules/path-browserify/index.js', import.meta.url)),
            // 将 Node.js 'buffer' 模块映射到 buffer@6 npm 包（浏览器 polyfill），
            // ExcelJS 内部使用 Buffer.allocUnsafe 等 API，Vite 默认外部化为空 stub 会导致运行时错误。
            buffer: fileURLToPath(new URL('./node_modules/buffer/index.js', import.meta.url)),
        },
    },

    // prevent vite from obscuring rust errors
    clearScreen: false,
    // Tauri expects a fixed port, fail if that port is not available
    server: {
        // 5173 落在 Windows Hyper-V/WSL2 动态保留端口范围 (5041–5240) 内，绑定会 EACCES；
        // 改用 Tauri 官方模板默认端口 1420，远离所有保留区间
        port: 1420,
        strictPort: true,
    },
    // to access the Tauri environment variables set by the CLI with information about the current target
    envPrefix: ['VITE_', 'TAURI_PLATFORM', 'TAURI_ARCH', 'TAURI_FAMILY', 'TAURI_PLATFORM_VERSION', 'TAURI_PLATFORM_TYPE', 'TAURI_DEBUG'],
    build: {
        // Tauri uses Chromium on Windows and WebKit on macOS and Linux
        target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
        // don't minify for debug builds
        minify: !process.env.TAURI_DEBUG ? 'oxc' : false,
        // produce sourcemaps for debug builds
        sourcemap: !!process.env.TAURI_DEBUG,
        chunkSizeWarningLimit: 7000,
        modulePreload: {
            polyfill: false
        },
        // 分割巨型的 store chunk（原 2.1MB 单包）为多个独立 chunk：
        // - antd-vendor: antd + @ant-design/icons + rc-* 组件（~1.5MB）
        // - react-vendor: react + react-dom + react-router + scheduler
        // @cfgforge/editor-core 通过 apiClient.ts 的动态 import() 自动分割为懒加载 chunk，
        // 不需要在此手动指定——Vite 会将动态导入的模块自动拆为独立 chunk。
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        if (id.includes('antd') || id.includes('@ant-design') || id.match(/[\\/]rc-/)) {
                            return 'antd-vendor';
                        }
                        if (id.includes('react-dom') || id.includes('react-router') || id.includes('scheduler') || id.includes('use-sync-external-store')) {
                            return 'react-vendor';
                        }
                    }
                },
            },
        },
    },

})
