/**
 * TauriFileSystem — 基于 @tauri-apps/plugin-fs 的 CfgFileSystem 实现。
 * 用于 Tauri WebView 环境（cfgeditor 桌面应用）。
 *
 * 异步方法映射 plugin-fs API；同步方法抛错（浏览器无同步 fs）。
 *
 * 注意：plugin-fs 的 readDir 返回 DirEntry[]（含 name/isDirectory/isFile），
 * 而非 Node 的 string[]。本实现将其转换为 string[]（仅返回 name）。
 *
 * 注意：浏览器环境中 Vite 对 Node 'path' 模块的 polyfill 不完整（join/resolve/
 * normalize/dirname 均不可用），因此本文件用纯字符串操作实现路径处理。
 */

import {
  readFile as tauriReadFile,
  writeFile as tauriWriteFile,
  exists as tauriExists,
  readDir as tauriReadDir,
  mkdir as tauriMkdir,
  remove as tauriRemove,
  rename as tauriRename,
  stat as tauriStat,
} from '@tauri-apps/plugin-fs';
import type { CfgFileSystem } from '@cfgforge/shared';
import { normalize as pathNormalize } from '@cfgforge/shared';

// ---- 纯字符串路径工具（替代浏览器不可用的 path 模块） ----

/** 获取路径的目录部分（等价 path.dirname）。 */
function dirname(p: string): string {
  // 统一斜杠后取最后一个分隔符之前的部分
  const norm = p.replace(/\\/g, '/');
  const idx = norm.lastIndexOf('/');
  if (idx < 0) return '.';
  // Windows drive: 'C:'
  if (idx === 2 && norm.length === 3 && norm[1] === ':') return norm + '/';
  if (idx === 0) return '/';
  return p.substring(0, idx).replace(/\/$/, '');
}

/** 拼接路径（等价 path.join）。 */
function joinPath(...paths: string[]): string {
  let result = '';
  for (const p of paths) {
    if (!p) continue;
    if (p.startsWith('/') || (p.length > 1 && p[1] === ':')) {
      result = p;
    } else if (result) {
      result = result.replace(/[\\/]+$/, '') + '/' + p;
    } else {
      result = p;
    }
  }
  return result;
}

export class TauriFileSystem implements CfgFileSystem {
  // ---- 环境检测 ----

  readonly isSyncSupported = false;

  // ---- 路径解析 ----

  resolvePath(...paths: string[]): string {
    // 浏览器环境中 path.join/normalize 不可用（Vite polyfill 不完整），
    // 用纯字符串操作实现：将多段路径拼接为绝对路径并规范化。
    // 直接使用 PathUtil.normalize（分隔符无关，已正确处理 drive letter）
    return pathNormalize(joinPath(...paths));
  }

  // ---- 异步方法 ----

  async readFile(filePath: string): Promise<Uint8Array> {
    return tauriReadFile(filePath);
  }

  async writeFile(filePath: string, data: Uint8Array): Promise<void> {
    await this.mkdirs(dirname(filePath));
    await tauriWriteFile(filePath, data);
  }

  async exists(filePath: string): Promise<boolean> {
    return tauriExists(filePath);
  }

  async isDirectory(filePath: string): Promise<boolean> {
    try {
      const info = await tauriStat(filePath);
      return info.isDirectory;
    } catch {
      return false;
    }
  }

  async isFile(filePath: string): Promise<boolean> {
    try {
      const info = await tauriStat(filePath);
      return info.isFile;
    } catch {
      return false;
    }
  }

  async readDir(dir: string): Promise<string[]> {
    try {
      const entries = await tauriReadDir(dir);
      return entries.map((e) => e.name);
    } catch {
      return [];
    }
  }

  async mkdirs(dir: string): Promise<void> {
    await tauriMkdir(dir, { recursive: true });
  }

  async remove(target: string): Promise<void> {
    try {
      await tauriRemove(target, { recursive: true });
    } catch {
      // 不存在时静默成功（与 NodeFileSystem 一致）
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.mkdirs(dirname(newPath));
    await tauriRename(oldPath, newPath);
  }

  async fileSize(filePath: string): Promise<number> {
    try {
      const info = await tauriStat(filePath);
      return info.size;
    } catch {
      return 0;
    }
  }

  async listFilesRecursive(dir: string): Promise<string[]> {
    const result: string[] = [];
    const walk = async (d: string): Promise<void> => {
      let entries: Awaited<ReturnType<typeof tauriReadDir>>;
      try {
        entries = await tauriReadDir(d);
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = joinPath(d, entry.name);
        if (entry.isDirectory) {
          await walk(full);
        } else if (entry.isFile) {
          result.push(full);
        }
      }
    };
    await walk(dir);
    return result;
  }

  async lastModified(filePath: string): Promise<number> {
    try {
      const info = await tauriStat(filePath);
      return info.mtime?.getTime() ?? 0;
    } catch {
      return 0;
    }
  }

  // ---- 同步方法（浏览器环境不可用，抛错） ----

  readTextFileSync(_filePath: string, _encoding: string): string {
    throw new Error('TauriFileSystem: synchronous operations are not available in WebView environment');
  }

  readFileSync(_filePath: string): Uint8Array {
    throw new Error('TauriFileSystem: synchronous operations are not available in WebView environment');
  }

  writeTextFileSync(_filePath: string, _text: string): void {
    throw new Error('TauriFileSystem: synchronous operations are not available in WebView environment');
  }

  writeFileSync(_filePath: string, _data: Uint8Array): void {
    throw new Error('TauriFileSystem: synchronous operations are not available in WebView environment');
  }

  existsSync(_filePath: string): boolean {
    throw new Error('TauriFileSystem: synchronous operations are not available in WebView environment');
  }

  isDirectorySync(_filePath: string): boolean {
    throw new Error('TauriFileSystem: synchronous operations are not available in WebView environment');
  }

  readDirSync(_dir: string): string[] {
    throw new Error('TauriFileSystem: synchronous operations are not available in WebView environment');
  }

  mkdirsSync(_dir: string): void {
    throw new Error('TauriFileSystem: synchronous operations are not available in WebView environment');
  }

  removeSync(_target: string): void {
    throw new Error('TauriFileSystem: synchronous operations are not available in WebView environment');
  }

  renameSync(_oldPath: string, _newPath: string): void {
    throw new Error('TauriFileSystem: synchronous operations are not available in WebView environment');
  }

  fileSizeSync(_filePath: string): number {
    throw new Error('TauriFileSystem: synchronous operations are not available in WebView environment');
  }

  lastModifiedSync(_filePath: string): number {
    throw new Error('TauriFileSystem: synchronous operations are not available in WebView environment');
  }
}
