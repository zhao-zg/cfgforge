/**
 * MockTauriFileSystem — 模拟 Tauri WebView 环境的内存 CfgFileSystem 实现。
 *
 * 用途：在 vitest/jsdom 测试环境中模拟 TauriFileSystem 的行为差异，
 * 让被测代码（Context 异步路径、ExcelReader buffer 路径等）无需真实 Tauri IPC
 * 即可验证 Tauri 环境下的行为正确性。
 *
 * 模拟的关键行为差异：
 * - isSyncSupported = false（同步方法抛错）
 * - readFile 返回 Uint8Array（非 Buffer）
 * - readDir 返回 string[]（仅文件名，非 DirEntry[]）
 * - resolvePath 使用 PathUtil（分隔符无关，纯字符串操作）
 * - 路径统一使用 / 分隔符（Tauri WebView 行为）
 *
 * 注意：本类是测试辅助工具，不打包进生产 bundle（无生产代码导入）。
 */

import type { CfgFileSystem } from '@cfgforge/shared';
import {
  normalize as pathNormalize,
  join as pathJoin,
  dirname as pathDirname,
} from '@cfgforge/shared';

const SYNC_ERROR =
  'TauriFileSystem: synchronous operations are not available in WebView environment';

export class MockTauriFileSystem implements CfgFileSystem {
  readonly isSyncSupported = false;

  /** 文件内容存储（规范化路径 → 字节） */
  private files = new Map<string, Uint8Array>();

  /** 目录集合（规范化路径） */
  private dirs = new Set<string>();

  /** 根目录 */
  readonly rootDir: string;

  constructor(rootDir: string = '/test') {
    this.rootDir = pathNormalize(rootDir);
    this.dirs.add(this.rootDir);
  }

  // ---- 路径解析 ----

  resolvePath(...paths: string[]): string {
    return pathNormalize(pathJoin(...paths));
  }

  // ---- 异步方法 ----

  async readFile(filePath: string): Promise<Uint8Array> {
    const norm = pathNormalize(filePath);
    const data = this.files.get(norm);
    if (data === undefined) {
      throw new Error(`File not found: ${filePath}`);
    }
    // 返回副本，防止测试间数据污染
    return data.slice();
  }

  async writeFile(filePath: string, data: Uint8Array): Promise<void> {
    const norm = pathNormalize(filePath);
    this.ensureParent(norm);
    this.files.set(norm, data.slice());
  }

  async exists(filePath: string): Promise<boolean> {
    const norm = pathNormalize(filePath);
    return this.files.has(norm) || this.dirs.has(norm);
  }

  async isDirectory(filePath: string): Promise<boolean> {
    const norm = pathNormalize(filePath);
    if (this.dirs.has(norm)) return true;
    // 如果有子文件/子目录以该路径为前缀，也算目录
    const prefix = norm.endsWith('/') ? norm : norm + '/';
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) return true;
    }
    for (const d of this.dirs) {
      if (d.startsWith(prefix) && d !== norm) return true;
    }
    return false;
  }

  async isFile(filePath: string): Promise<boolean> {
    const norm = pathNormalize(filePath);
    return this.files.has(norm);
  }

  async readDir(dir: string): Promise<string[]> {
    const norm = pathNormalize(dir);
    const prefix = norm.endsWith('/') ? norm : norm + '/';
    const entries = new Set<string>();

    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.substring(prefix.length);
        const slashIdx = rest.indexOf('/');
        if (slashIdx < 0) {
          entries.add(rest);
        } else {
          entries.add(rest.substring(0, slashIdx));
        }
      }
    }

    for (const d of this.dirs) {
      if (d.startsWith(prefix) && d !== norm) {
        const rest = d.substring(prefix.length);
        const slashIdx = rest.indexOf('/');
        if (slashIdx < 0) {
          entries.add(rest);
        } else {
          entries.add(rest.substring(0, slashIdx));
        }
      }
    }

    return Array.from(entries);
  }

  async mkdirs(dir: string): Promise<void> {
    this.ensureDir(pathNormalize(dir));
  }

  async remove(target: string): Promise<void> {
    const norm = pathNormalize(target);
    this.files.delete(norm);
    this.dirs.delete(norm);
    // 递归删除子文件和子目录
    const prefix = norm.endsWith('/') ? norm : norm + '/';
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(prefix)) {
        this.files.delete(key);
      }
    }
    for (const d of [...this.dirs]) {
      if (d.startsWith(prefix)) {
        this.dirs.delete(d);
      }
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const oldNorm = pathNormalize(oldPath);
    const newNorm = pathNormalize(newPath);
    this.ensureParent(newNorm);

    const data = this.files.get(oldNorm);
    if (data !== undefined) {
      this.files.delete(oldNorm);
      this.files.set(newNorm, data);
    }
  }

  async fileSize(filePath: string): Promise<number> {
    const norm = pathNormalize(filePath);
    const data = this.files.get(norm);
    return data ? data.length : 0;
  }

  async listFilesRecursive(dir: string): Promise<string[]> {
    const norm = pathNormalize(dir);
    const prefix = norm.endsWith('/') ? norm : norm + '/';
    const result: string[] = [];

    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        result.push(key);
      }
    }

    return result.sort();
  }

  async lastModified(filePath: string): Promise<number> {
    const norm = pathNormalize(filePath);
    return this.files.has(norm) ? Date.now() : 0;
  }

  // ---- 同步方法（浏览器环境不可用，抛错） ----

  readTextFileSync(_filePath: string, _encoding: string): string {
    throw new Error(SYNC_ERROR);
  }
  readFileSync(_filePath: string): Uint8Array {
    throw new Error(SYNC_ERROR);
  }
  writeTextFileSync(_filePath: string, _text: string): void {
    throw new Error(SYNC_ERROR);
  }
  writeFileSync(_filePath: string, _data: Uint8Array): void {
    throw new Error(SYNC_ERROR);
  }
  existsSync(_filePath: string): boolean {
    throw new Error(SYNC_ERROR);
  }
  isDirectorySync(_filePath: string): boolean {
    throw new Error(SYNC_ERROR);
  }
  readDirSync(_dir: string): string[] {
    throw new Error(SYNC_ERROR);
  }
  mkdirsSync(_dir: string): void {
    throw new Error(SYNC_ERROR);
  }
  removeSync(_target: string): void {
    throw new Error(SYNC_ERROR);
  }
  renameSync(_oldPath: string, _newPath: string): void {
    throw new Error(SYNC_ERROR);
  }
  fileSizeSync(_filePath: string): number {
    throw new Error(SYNC_ERROR);
  }
  lastModifiedSync(_filePath: string): number {
    throw new Error(SYNC_ERROR);
  }

  // ---- 测试辅助方法（非 CfgFileSystem 接口） ----

  /**
   * 同步写入文本文件（测试 setup 专用，不走异步流程）。
   * 使用 TextEncoder 编码为 UTF-8 字节。
   */
  writeTextFile(filePath: string, text: string): void {
    const norm = pathNormalize(filePath);
    this.ensureParent(norm);
    // 用 new Uint8Array() 包裹确保跨 realm 一致性（jsdom 下 TextEncoder 可能返回不同 realm 的 Uint8Array）
    this.files.set(norm, new Uint8Array(new TextEncoder().encode(text)));
  }

  /**
   * 同步读取文本文件内容（测试断言专用）。
   * 使用 TextDecoder 解码 UTF-8 字节。
   */
  readTextFile(filePath: string): string {
    const norm = pathNormalize(filePath);
    const data = this.files.get(norm);
    if (data === undefined) {
      throw new Error(`File not found: ${filePath}`);
    }
    return new TextDecoder().decode(data);
  }

  /** 获取文件数量（测试辅助） */
  get fileCount(): number {
    return this.files.size;
  }

  /** 获取目录数量（测试辅助） */
  get dirCount(): number {
    return this.dirs.size;
  }

  // ---- 内部工具 ----

  private ensureParent(filePath: string): void {
    const parent = pathDirname(filePath);
    if (parent === '.' || parent === '/') return;
    this.ensureDir(parent);
  }

  private ensureDir(dir: string): void {
    const norm = pathNormalize(dir);
    if (this.dirs.has(norm)) return;
    this.dirs.add(norm);
    const parent = pathDirname(norm);
    if (parent !== norm && parent !== '.' && parent !== '/') {
      this.ensureDir(parent);
    }
  }
}
