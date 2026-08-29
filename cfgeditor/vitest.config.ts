import {defineConfig} from 'vitest/config'
import react from '@vitejs/plugin-react'
import {fileURLToPath, URL} from 'node:url'

// 仅用于单元测试的配置，与生产构建 (vite.config.ts) 解耦。
// - react 插件：编译被测的 .tsx（如 domain/schema.tsx）
// - jsdom：提供 window/document，让 antd / resso / @tauri-apps/api 等可在测试环境导入
// - setupFiles：补上 Tauri 运行时 shim（见 src/test/setup.ts）
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
        // 测试用显式 import { describe, it, expect } from 'vitest'，不开启 globals
        // editor-core 改为动态 import() 懒加载后，首次 beforeEach 加载整棵依赖树
        // 可能超过默认 10s（尤其 Windows 冷盘），放宽到 30s
        hookTimeout: 30_000,
    },
})
