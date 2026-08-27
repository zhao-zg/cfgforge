import {defineConfig} from 'vitest/config'

// Vitest 4 monorepo 配置：用 test.projects 取代已废弃的 vitest.workspace.ts。
//
// 两个 project 分工：
// 1) packages：纯 Node 环境，无别名、无 jsdom，inline config 即可
// 2) cfgeditor：直接引用 cfgeditor/vitest.config.ts，
//    该文件已包含 react 插件、@/ 别名、jsdom 环境、Tauri shim setup
//
// 这样从根目录 `npx vitest run` 能同时跑 packages + cfgeditor 的全部测试，
// 而在 cfgeditor/ 下 `npx vitest run` 仍使用其本地 vitest.config.ts。
export default defineConfig({
    test: {
        projects: [
            // ── packages：Node 环境，默认配置 ──
            {
                test: {
                    name: 'packages',
                    include: ['packages/**/*.{test,spec}.{ts,tsx}'],
                    environment: 'node',
                },
            },
            // ── cfgeditor：直接引用其独立配置文件 ──
            'cfgeditor/vitest.config.ts',
        ],
    },
})
