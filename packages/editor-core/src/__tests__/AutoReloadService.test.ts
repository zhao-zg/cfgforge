/**
 * AutoReloadService tests — P2-11 文件自动监视（轮询退化方案）
 *
 * 前置验证结论：WatchAndPostRun 依赖 Node fs.watch（Watcher）与同步
 * DirectoryStructure.reload()，在 Tauri WebView（无 Node 运行时）下不可用，
 * 故采用轮询 editor.reload() 的可靠退化方案。
 *
 * 测试验证轮询语义：start 后按间隔触发 reload、stop 后不再触发、
 * 重复 start 幂等。用 fake timers + 最小 reload 函数，不碰真实文件系统。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AutoReloadService } from '../AutoReloadService';

interface Reloadable {
  reload(): Promise<void>;
}

describe('AutoReloadService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('start 后按间隔触发 reload', () => {
    const reload = vi.fn(async () => {});
    const editor = {reload} as unknown as Reloadable;

    const svc = new AutoReloadService();
    svc.start(editor, 2000);

    expect(svc.isRunning).toBe(true);
    expect(reload).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2000);
    expect(reload).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    expect(reload).toHaveBeenCalledTimes(2);

    svc.stop();
  });

  it('stop 后不再触发', () => {
    const reload = vi.fn(async () => {});
    const editor = {reload} as unknown as Reloadable;

    const svc = new AutoReloadService();
    svc.start(editor, 2000);
    svc.stop();

    expect(svc.isRunning).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(reload).not.toHaveBeenCalled();
  });

  it('重复 start 幂等（不叠加定时器）', () => {
    const reload = vi.fn(async () => {});
    const editor = {reload} as unknown as Reloadable;

    const svc = new AutoReloadService();
    svc.start(editor, 2000);
    svc.start(editor, 2000);
    svc.start(editor, 2000);

    vi.advanceTimersByTime(2000);
    expect(reload).toHaveBeenCalledTimes(1);

    svc.stop();
  });
});