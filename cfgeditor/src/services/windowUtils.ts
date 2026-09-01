import {getCurrentWebviewWindow} from "@tauri-apps/api/webviewWindow";
import {isTauri} from "@tauri-apps/api/core";

export async function toggleFullScreen() {
    if (isTauri()) {
        // 桌面端：通过 Tauri 窗口 API 切换全屏
        const appWindow = getCurrentWebviewWindow()
        const isFullScreen = await appWindow.isFullscreen();
        await appWindow.setFullscreen(!isFullScreen);
    } else {
        // Web 端（Docker 网页版 / 本地 dev）：用浏览器 Fullscreen API
        // document.fullscreenElement 非空表示当前处于全屏状态
        if (document.fullscreenElement) {
            await document.exitFullscreen();
        } else {
            await document.documentElement.requestFullscreen();
        }
    }
}
