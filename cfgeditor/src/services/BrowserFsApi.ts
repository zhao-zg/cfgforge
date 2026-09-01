/**
 * BrowserFsApi — 基于 HTTP 的 CfgFileSystem 实现（Docker 网页版）。
 *
 * 背景：Docker 部署时，前端是纯浏览器（非 Tauri WebView），没有本地文件系统。
 * 文件读写全部委托给同源 Node 后端（server/server.mjs）提供的 REST API
 * （/api/fs/*），数据目录通过 Docker volume 挂载进容器。
 *
 * 设计要点（与 TauriFileSystem 一致）：
 * - `isSyncSupported = false`：Context 走异步路径（DirectoryStructure.createAsync、
 *   readCSVAsync、writeToDirAsync 等）。
 * - 同步方法抛错（浏览器无同步 fs）。
 * - 路径处理复用 PathUtil（纯字符串操作，替代浏览器不可用的 Node path 模块）。
 *   resolvePath 只是规范化+拼接，实际校验与绝对化由服务端 toAbs() 完成。
 *
 * 与 TauriFileSystem 的差异：
 * - TauriFileSystem 直接调 plugin-fs（本机路径）；本实现通过 fetch 调后端 API，
 *   路径最终解析到挂载卷 DATA_ROOT 内。
 */

import type { CfgFileSystem } from '@cfgforge/shared';
import { normalize as pathNormalize, join as pathJoin } from '@cfgforge/shared';

// ---- Docker 后端检测 ----

/** Docker 后端健康检查结果。 */
export interface DockerBackendInfo {
  /** 后端数据根目录（如 /data），用作 store.dataDir 的值。 */
  dataRoot: string;
}

/**
 * Docker 模式同步标志：detectDockerBackend() 返回正面结果后置 true。
 *
 * 使用场景：EntityCard（图片 URL）、storage.ts（偏好持久化）、themeService（主题加载）
 * 等处需要同步判断是否在 Docker 模式，以选择 convertFileSrc/Tauri fs 还是 getDefaultFileSystem。
 *
 * 时序保证：main.tsx 顶层 await detectDockerBackend() → 设置标志 → React 渲染 AppLoader
 * → readPrefAsyncOnce 等查询。标志在首次 React 渲染前已就绪。
 */
let dockerModeEnabled = false;

/** 同步检查：当前是否在 Docker 模式？detectDockerBackend() 返回正面结果后为 true。 */
export function isDockerMode(): boolean {
  return dockerModeEnabled;
}

/**
 * 检测当前页面是否由 Docker 后端托管（同源 /api/health 可达）。
 *
 * Docker 网页版部署时，server.mjs 托管前端静态文件并提供 /api/health 端点。
 * 非 Docker 环境（Tauri 桌面端、本地 dev server）调用 /api/health 会 404 或网络错误，
 * 返回 null 即可。
 *
 * 使用 fetch 的信号超时（2 秒）避免本地 dev 环境长时间等待。
 * 检测成功后缓存正面结果到 dockerModeEnabled，供 isDockerMode() 同步查询。
 */
export async function detectDockerBackend(): Promise<DockerBackendInfo | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch('/api/health', { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const body = await resp.json();
    if (body.ok !== true || !body.dataRoot) return null;
    dockerModeEnabled = true;
    return { dataRoot: body.dataRoot as string };
  } catch {
    // 网络错误、超时、非 JSON 响应等：非 Docker 环境
    return null;
  }
}

// ---- 纯字符串路径工具（与 TauriFileSystem 相同的思路） ----

function joinPath(...paths: string[]): string {
  return pathJoin(...paths);
}

// ---- HTTP 工具 ----

/** 构造后端 API URL。 */
function apiUrl(op: string, params: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    q.set(k, v);
  }
  const qs = q.toString();
  return '/api/fs/' + op + (qs ? '?' + qs : '');
}

/** 调用返回 JSON 的 API，统一解析 { ok, result|error }。 */
async function callJson<T>(op: string, params: Record<string, string> = {}): Promise<T> {
  const resp = await fetch(apiUrl(op, params));
  const body = await resp.json();
  if (!resp.ok || body.ok === false) {
    throw new Error(body.error || `API ${op} failed with status ${resp.status}`);
  }
  return body.result as T;
}

/** 读取原始字节（GET 返回 octet-stream）。 */
async function callBytes(path: string): Promise<Uint8Array> {
  const resp = await fetch(apiUrl('readFile', { path }));
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`readFile failed: ${path} — ${text || resp.statusText}`);
  }
  return new Uint8Array(await resp.arrayBuffer());
}

/** 写入原始字节（POST，body 为原始字节）。 */
async function callWrite(path: string, data: Uint8Array): Promise<void> {
  const resp = await fetch(apiUrl('writeFile', { path }), {
    method: 'POST',
    body: data as BodyInit,
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => null);
    throw new Error(body?.error || `writeFile failed with status ${resp.status}`);
  }
}

export class BrowserFsApi implements CfgFileSystem {
  // ---- 环境检测 ----

  readonly isSyncSupported = false;

  // ---- 路径解析 ----

  resolvePath(...paths: string[]): string {
    // 纯字符串拼接+规范化；真实绝对化与边界校验由后端 toAbs() 完成
    return pathNormalize(joinPath(...paths));
  }

  // ---- 异步方法（全部委托后端 /api/fs/*） ----

  async readFile(filePath: string): Promise<Uint8Array> {
    return callBytes(filePath);
  }

  async writeFile(filePath: string, data: Uint8Array): Promise<void> {
    await callWrite(filePath, data);
  }

  async exists(filePath: string): Promise<boolean> {
    return callJson<boolean>('exists', { path: filePath });
  }

  async isDirectory(filePath: string): Promise<boolean> {
    return callJson<boolean>('isDirectory', { path: filePath });
  }

  async isFile(filePath: string): Promise<boolean> {
    return callJson<boolean>('isFile', { path: filePath });
  }

  async readDir(dir: string): Promise<string[]> {
    return callJson<string[]>('readDir', { path: dir });
  }

  async mkdirs(dir: string): Promise<void> {
    await callJson('mkdirs', { path: dir });
  }

  async remove(target: string): Promise<void> {
    await callJson('remove', { path: target });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await callJson('rename', { from: oldPath, to: newPath });
  }

  async fileSize(filePath: string): Promise<number> {
    return callJson<number>('fileSize', { path: filePath });
  }

  async listFilesRecursive(dir: string): Promise<string[]> {
    return callJson<string[]>('listFilesRecursive', { path: dir });
  }

  async lastModified(filePath: string): Promise<number> {
    return callJson<number>('lastModified', { path: filePath });
  }

  // ---- 同步方法（浏览器环境不可用，抛错） ----

  readTextFileSync(_filePath: string, _encoding: string): string {
    throw new Error('BrowserFsApi: synchronous operations are not available in browser environment');
  }

  readFileSync(_filePath: string): Uint8Array {
    throw new Error('BrowserFsApi: synchronous operations are not available in browser environment');
  }

  writeTextFileSync(_filePath: string, _text: string): void {
    throw new Error('BrowserFsApi: synchronous operations are not available in browser environment');
  }

  writeFileSync(_filePath: string, _data: Uint8Array): void {
    throw new Error('BrowserFsApi: synchronous operations are not available in browser environment');
  }

  existsSync(_filePath: string): boolean {
    throw new Error('BrowserFsApi: synchronous operations are not available in browser environment');
  }

  isDirectorySync(_filePath: string): boolean {
    throw new Error('BrowserFsApi: synchronous operations are not available in browser environment');
  }

  readDirSync(_dir: string): string[] {
    throw new Error('BrowserFsApi: synchronous operations are not available in browser environment');
  }

  mkdirsSync(_dir: string): void {
    throw new Error('BrowserFsApi: synchronous operations are not available in browser environment');
  }

  removeSync(_target: string): void {
    throw new Error('BrowserFsApi: synchronous operations are not available in browser environment');
  }

  renameSync(_oldPath: string, _newPath: string): void {
    throw new Error('BrowserFsApi: synchronous operations are not available in browser environment');
  }

  fileSizeSync(_filePath: string): number {
    throw new Error('BrowserFsApi: synchronous operations are not available in browser environment');
  }

  lastModifiedSync(_filePath: string): number {
    throw new Error('BrowserFsApi: synchronous operations are not available in browser environment');
  }
}