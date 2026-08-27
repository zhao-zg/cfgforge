/**
 * TauriFileSystem tests — Task 5
 *
 * 验证 TauriFileSystem 的纯字符串方法（不涉及 Tauri IPC）：
 * 1. isSyncSupported = false
 * 2. resolvePath: 路径拼接与规范化（内部调用 joinPath + pathNormalize）
 * 3. 同步方法全部抛错
 *
 * 注意：异步方法（readFile/writeFile 等）依赖 Tauri IPC，不在此测试范围。
 * 遵循项目约定"不 mock"——不 mock @tauri-apps/plugin-fs。
 * TauriFileSystem 构造函数无参数，创建实例不触发 Tauri IPC 调用。
 */

import {describe, it, expect, beforeEach} from 'vitest';
import {TauriFileSystem} from './TauriFileSystem';

describe('TauriFileSystem', () => {
  let fs: TauriFileSystem;

  beforeEach(() => {
    fs = new TauriFileSystem();
  });

  // -----------------------------------------------------------------
  // 环境检测
  // -----------------------------------------------------------------
  describe('environment', () => {
    it('isSyncSupported is false', () => {
      expect(fs.isSyncSupported).toBe(false);
    });
  });

  // -----------------------------------------------------------------
  // resolvePath（内部调用 joinPath + pathNormalize）
  // -----------------------------------------------------------------
  describe('resolvePath', () => {
    // ---- 基本拼接 ----
    it('joins simple paths with / separator', () => {
      expect(fs.resolvePath('/root', 'sub', 'file.csv')).toBe('/root/sub/file.csv');
    });

    it('returns root when single path given', () => {
      expect(fs.resolvePath('/root')).toBe('/root');
    });

    it('handles single file name (relative)', () => {
      expect(fs.resolvePath('file.csv')).toBe('file.csv');
    });

    it('joins relative paths without root', () => {
      expect(fs.resolvePath('relative', 'path', 'file.csv')).toBe('relative/path/file.csv');
    });

    // ---- 反斜杠处理（Tauri on Windows）----
    it('handles backslash in later segments', () => {
      expect(fs.resolvePath('/root', 'sub\\file.csv')).toBe('/root/sub/file.csv');
    });

    it('handles all-backslash paths', () => {
      expect(fs.resolvePath('C:\\Users\\data\\config.cfg')).toBe('C:/Users/data/config.cfg');
    });

    it('handles mixed / and \\ separators', () => {
      expect(fs.resolvePath('C:\\Users\\data', 'config\\file.cfg')).toBe('C:/Users/data/config/file.cfg');
    });

    it('handles backslash in drive letter path', () => {
      expect(fs.resolvePath('C:\\Users', 'data', 'config.cfg')).toBe('C:/Users/data/config.cfg');
    });

    // ---- drive letter ----
    it('handles drive letter with / separator', () => {
      expect(fs.resolvePath('C:/Users', 'data', 'config.cfg')).toBe('C:/Users/data/config.cfg');
    });

    it('handles drive letter root C:/', () => {
      expect(fs.resolvePath('C:/', 'Users', 'file.txt')).toBe('C:/Users/file.txt');
    });

    // ---- 绝对路径覆盖 ----
    it('absolute path in later segment overrides earlier', () => {
      expect(fs.resolvePath('/root', '/absolute/path')).toBe('/absolute/path');
    });

    it('drive letter path in later segment overrides earlier', () => {
      expect(fs.resolvePath('/root', 'C:/Users')).toBe('C:/Users');
    });

    // ---- . 和 .. 规范化 ----
    it('normalizes . segments', () => {
      expect(fs.resolvePath('/root', './sub', 'file.csv')).toBe('/root/sub/file.csv');
    });

    it('normalizes .. segments', () => {
      expect(fs.resolvePath('/root', 'sub/../other', './file.csv')).toBe('/root/other/file.csv');
    });

    it('normalizes .. at root level', () => {
      expect(fs.resolvePath('/root', '..', 'other')).toBe('/other');
    });

    it('normalizes multiple .. segments', () => {
      expect(fs.resolvePath('/root/a/b', '../../c')).toBe('/root/c');
    });

    // ---- 多余分隔符 ----
    it('normalizes multiple consecutive / separators', () => {
      expect(fs.resolvePath('/root//sub///file.csv')).toBe('/root/sub/file.csv');
    });

    it('normalizes trailing separators', () => {
      expect(fs.resolvePath('/root/sub/', 'file.csv')).toBe('/root/sub/file.csv');
    });

    it('normalizes mixed trailing / and \\', () => {
      expect(fs.resolvePath('/root/sub\\', 'file.csv')).toBe('/root/sub/file.csv');
    });

    // ---- 空参数 ----
    it('returns . for no arguments', () => {
      expect(fs.resolvePath()).toBe('.');
    });

    it('returns . for empty string argument', () => {
      expect(fs.resolvePath('')).toBe('.');
    });

    it('skips empty middle segments', () => {
      expect(fs.resolvePath('/root', '', 'file.csv')).toBe('/root/file.csv');
    });
  });

  // -----------------------------------------------------------------
  // 同步方法抛错
  // -----------------------------------------------------------------
  describe('sync methods throw', () => {
    const syncMethods = [
      'readTextFileSync',
      'readFileSync',
      'writeTextFileSync',
      'writeFileSync',
      'existsSync',
      'isDirectorySync',
      'readDirSync',
      'mkdirsSync',
      'removeSync',
      'renameSync',
      'fileSizeSync',
      'lastModifiedSync',
    ] as const;

    for (const method of syncMethods) {
      it(`${method}() throws "not available in WebView environment"`, () => {
        const fn = (fs as unknown as Record<string, (...args: unknown[]) => unknown>)[method];
        expect(() => {
          // 传 dummy 参数避免 arity 问题
          fn.call(fs, '/dummy', '/dummy2', 'utf-8', new Uint8Array(0));
        }).toThrow('TauriFileSystem: synchronous operations are not available in WebView environment');
      });
    }
  });

  // -----------------------------------------------------------------
  // 异步方法存在性验证（不调用 Tauri IPC，仅验证接口存在）
  // -----------------------------------------------------------------
  describe('async method existence', () => {
    const asyncMethods = [
      'readFile',
      'writeFile',
      'exists',
      'isDirectory',
      'isFile',
      'readDir',
      'mkdirs',
      'remove',
      'rename',
      'fileSize',
      'listFilesRecursive',
      'lastModified',
    ] as const;

    for (const method of asyncMethods) {
      it(`${method}() is defined as function`, () => {
        const fn = (fs as unknown as Record<string, unknown>)[method];
        expect(typeof fn).toBe('function');
      });
    }
  });

  // -----------------------------------------------------------------
  // 与 MockTauriFileSystem 行为一致性验证
  // -----------------------------------------------------------------
  describe('behavioral consistency with MockTauriFileSystem', () => {
    it('resolvePath produces same results as MockTauriFileSystem for standard cases', async () => {
      const {MockTauriFileSystem} = await import('./MockTauriFileSystem');
      const mockFs = new MockTauriFileSystem('/test');

      const cases: [string, ...string[]][] = [
        ['/root', 'sub', 'file.csv'],
        ['C:/Users', 'data', 'config.cfg'],
        ['/root', 'sub/../other', './file.csv'],
        ['/root//sub///file.csv'],
        ['C:\\Users\\data\\config.cfg'],
      ];

      for (const [first, ...rest] of cases) {
        expect(fs.resolvePath(first, ...rest)).toBe(mockFs.resolvePath(first, ...rest));
      }
    });
  });
});
