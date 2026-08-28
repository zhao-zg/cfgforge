/**
 * AutoReloadService — P2-11 文件自动监视（轮询退化方案）。
 *
 * 前置验证：WatchAndPostRun（packages/context）依赖 Node 的 fs.watch
 * （Watcher.start）与同步 DirectoryStructure.reload()，在 Tauri WebView
 * （无 Node 运行时，文件 I/O 走异步 CfgFileSystem）下不可用。因此本服务
 * 退化为「定时轮询 editor.reload()」：简单、可靠、跨环境一致。
 *
 * start(editor, intervalMs)：启动轮询，每次触发 editor.reload() 全量重建。
 * stop()：停止轮询。重复 start 幂等（不叠加定时器）。
 */

import type { EditorService } from './EditorService.js';

export class AutoReloadService {
  private _timer: ReturnType<typeof setInterval> | null = null;

  get isRunning(): boolean {
    return this._timer !== null;
  }

  /** 启动轮询。已在运行则忽略（幂等）。intervalMs 默认 2000ms。 */
  start(editor: EditorService, intervalMs = 2000): void {
    if (this._timer !== null) {
      return;
    }
    this._timer = setInterval(() => {
      editor.reload().catch((e: unknown) => {
        // eslint-disable-next-line no-console
        console.error('auto reload failed:', e);
      });
    }, intervalMs);
  }

  /** 停止轮询。未运行时调用无副作用。 */
  stop(): void {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}