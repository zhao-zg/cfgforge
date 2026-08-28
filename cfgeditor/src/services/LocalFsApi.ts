/**
 * LocalFsApi — 基于 File System Access API 的 CfgFileSystem 实现。
 *
 * 用于纯浏览器环境（非 Tauri WebView）：用户通过 showDirectoryPicker()
 * 选择本地数据目录，拿到 FileSystemDirectoryHandle 后，浏览器可直接
 * 读写该目录下的文件，无需后端 HTTP API。
 *
 * 设计要点（与 TauriFileSystem / BrowserFsApi 一致）：
 * - `isSyncSupported = false`：Context 走异步路径。
 * - 同步方法抛错（浏览器无同步 fs）。
 * - 路径处理复用 PathUtil（纯字符串操作）。
 *   resolvePath 只是规范化+拼接；实际文件访问通过 handle 链完成。
 * - 句柄持久化到 IndexedDB（key='rootDirHandle'），刷新页面后可恢复，
 *   避免每次刷新都要求用户重新选择目录。
 *
 * 浏览器兼容性：Chrome/Edge 86+ 支持，Firefox/Safari 不支持。
 */

import type { CfgFileSystem } from '@cfgforge/shared';
import { normalize as pathNormalize, join as pathJoin, dirname as pathDirname } from '@cfgforge/shared';

// ---- IndexedDB 句柄持久化 ----

const IDB_NAME = 'cfgforge-fs';
const IDB_STORE = 'handles';
const IDB_KEY = 'rootDirHandle';

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 将 rootDirHandle 持久化到 IndexedDB。 */
export async function saveDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await idbOpen();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** 从 IndexedDB 读取持久化的 rootDirHandle。不存在时返回 null。 */
export async function loadDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await idbOpen();
  const result = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

/** 从 IndexedDB 删除持久化的 rootDirHandle。 */
export async function clearDirHandle(): Promise<void> {
  const db = await idbOpen();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// ---- 句柄解析工具 ----

/**
 * 请求句柄权限（read 或 readwrite）。
 * 浏览器在首次访问句柄时需要用户授权；后续刷新页面后，
 * 需调用 queryPermission/requestPermission 重新获取。
 */
export async function ensurePermission(handle: FileSystemDirectoryHandle, mode: 'read' | 'readwrite' = 'readwrite'): Promise<boolean> {
  // queryPermission/requestPermission 是 File System Access API 扩展
  // 不支持的浏览器直接返回 true，后续 getFileHandle/getDirectoryHandle 会触发授权弹窗
  const h = handle as any;
  if (!h.queryPermission || !h.requestPermission) return true;
  let perm = await h.queryPermission({ mode });
  if (perm === 'granted') return true;
  perm = await h.requestPermission({ mode });
  return perm === 'granted';
}

/**
 * 将相对路径（如 "subdir/file.csv"）解析为 FileSystemDirectoryHandle（父目录）
 * 和文件名。逐层 getDirectoryHandle 遍历子目录。
 * 路径为空或只含根目录时返回 [rootHandle, '']。
 */
async function resolveDirHandle(rootHandle: FileSystemDirectoryHandle, relativePath: string): Promise<FileSystemDirectoryHandle> {
  if (!relativePath || relativePath === '.' || relativePath === '/') {
    return rootHandle;
  }
  const norm = pathNormalize(relativePath);
  const parts = norm.split('/').filter(p => p && p !== '.');
  let handle = rootHandle;
  for (const part of parts) {
    handle = await handle.getDirectoryHandle(part);
  }
  return handle;
}

/**
 * 将相对路径解析为 [父目录 handle, 文件名]。
 * 例如 "a/b/c.csv" → [handle for a/b, "c.csv"]
 */
async function resolveParentAndName(rootHandle: FileSystemDirectoryHandle, filePath: string): Promise<[FileSystemDirectoryHandle, string]> {
  const parent = pathDirname(filePath);
  const name = filePath.split('/').filter(p => p && p !== '.').pop() || '';
  if (!name) throw new Error(`Invalid file path: ${filePath}`);
  const parentHandle = await resolveDirHandle(rootHandle, parent);
  return [parentHandle, name];
}

// ---- CfgFileSystem 实现 ----

export class LocalFsApi implements CfgFileSystem {
  private readonly rootHandle: FileSystemDirectoryHandle;
  /** 用户选择的目录名，作为 displayDir（store.dataDir 的值）。 */
  readonly displayDir: string;

  constructor(rootHandle: FileSystemDirectoryHandle) {
    this.rootHandle = rootHandle;
    this.displayDir = rootHandle.name;
  }

  // ---- 环境检测 ----

  readonly isSyncSupported = false;

  // ---- 路径解析 ----

  resolvePath(...paths: string[]): string {
    // 纯字符串拼接+规范化；实际文件访问通过 handle 链完成
    return pathNormalize(pathJoin(this.displayDir, ...paths));
  }

  // ---- 异步方法 ----

  async readFile(filePath: string): Promise<Uint8Array> {
    const [parentHandle, name] = await resolveParentAndName(this.rootHandle, this.toRelative(filePath));
    const fileHandle = await parentHandle.getFileHandle(name);
    const file = await fileHandle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  async writeFile(filePath: string, data: Uint8Array): Promise<void> {
    await this.mkdirs(pathDirname(filePath));
    const [parentHandle, name] = await resolveParentAndName(this.rootHandle, this.toRelative(filePath));
    const fileHandle = await parentHandle.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data.buffer as ArrayBuffer);
    await writable.close();
  }

  async exists(filePath: string): Promise<boolean> {
    const relative = this.toRelative(filePath);
    const parent = pathDirname(relative);
    const name = relative.split('/').filter(p => p && p !== '.').pop() || '';
    if (!name) return false;
    try {
      const parentHandle = await resolveDirHandle(this.rootHandle, parent);
      // 先尝试作为文件
      try {
        await parentHandle.getFileHandle(name);
        return true;
      } catch {
        // 不是文件，尝试作为目录
        try {
          await parentHandle.getDirectoryHandle(name);
          return true;
        } catch {
          return false;
        }
      }
    } catch {
      return false;
    }
  }

  async isDirectory(filePath: string): Promise<boolean> {
    const relative = this.toRelative(filePath);
    const parent = pathDirname(relative);
    const name = relative.split('/').filter(p => p && p !== '.').pop() || '';
    if (!name) return false;
    try {
      const parentHandle = await resolveDirHandle(this.rootHandle, parent);
      await parentHandle.getDirectoryHandle(name);
      return true;
    } catch {
      return false;
    }
  }

  async isFile(filePath: string): Promise<boolean> {
    const relative = this.toRelative(filePath);
    const parent = pathDirname(relative);
    const name = relative.split('/').filter(p => p && p !== '.').pop() || '';
    if (!name) return false;
    try {
      const parentHandle = await resolveDirHandle(this.rootHandle, parent);
      await parentHandle.getFileHandle(name);
      return true;
    } catch {
      return false;
    }
  }

  async readDir(dir: string): Promise<string[]> {
    try {
      const handle = await resolveDirHandle(this.rootHandle, this.toRelative(dir));
      const names: string[] = [];
      for await (const [name] of (handle as any).entries()) {
        names.push(name);
      }
      return names;
    } catch {
      return [];
    }
  }

  async mkdirs(dir: string): Promise<void> {
    // getDirectoryHandle({ create: true }) 逐层创建
    const relative = this.toRelative(dir);
    if (!relative || relative === '.' || relative === '/') return;
    const parts = relative.split('/').filter(p => p && p !== '.');
    let handle = this.rootHandle;
    for (const part of parts) {
      handle = await handle.getDirectoryHandle(part, { create: true });
    }
  }

  async remove(target: string): Promise<void> {
    const relative = this.toRelative(target);
    const parent = pathDirname(relative);
    const name = relative.split('/').filter(p => p && p !== '.').pop() || '';
    if (!name) return;
    try {
      const parentHandle = await resolveDirHandle(this.rootHandle, parent);
      // 先尝试删除文件，再尝试删除目录
      try {
        await parentHandle.removeEntry(name);
      } catch {
        // 不存在时静默成功
      }
    } catch {
      // 父目录不存在时静默成功
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    // File System Access API 无直接 rename；通过复制+删除实现
    const oldRelative = this.toRelative(oldPath);
    const newRelative = this.toRelative(newPath);

    // 判断是文件还是目录
    const isDir = await this.isDirectory(oldRelative);
    if (isDir) {
      // 目录递归复制
      await this.copyDir(oldRelative, newRelative);
    } else {
      // 文件复制
      const data = await this.readFile(oldRelative);
      await this.writeFile(newRelative, data);
    }
    // 删除源
    await this.remove(oldRelative);
  }

  private async copyDir(srcRelative: string, dstRelative: string): Promise<void> {
    await this.mkdirs(dstRelative);
    const entries = await this.readDir(srcRelative);
    for (const entry of entries) {
      const srcPath = pathJoin(srcRelative, entry);
      const dstPath = pathJoin(dstRelative, entry);
      if (await this.isDirectory(srcPath)) {
        await this.copyDir(srcPath, dstPath);
      } else {
        const data = await this.readFile(srcPath);
        await this.writeFile(dstPath, data);
      }
    }
  }

  async fileSize(filePath: string): Promise<number> {
    try {
      const [parentHandle, name] = await resolveParentAndName(this.rootHandle, this.toRelative(filePath));
      const fileHandle = await parentHandle.getFileHandle(name);
      const file = await fileHandle.getFile();
      return file.size;
    } catch {
      return 0;
    }
  }

  async listFilesRecursive(dir: string): Promise<string[]> {
    const result: string[] = [];
    const walk = async (relativeDir: string): Promise<void> => {
      try {
        const handle = await resolveDirHandle(this.rootHandle, relativeDir);
        for await (const [name, entryHandle] of (handle as any).entries()) {
          const fullPath = pathJoin(relativeDir, name);
          if (entryHandle.kind === 'directory') {
            await walk(fullPath);
          } else {
            result.push(fullPath);
          }
        }
      } catch {
        // 目录不存在时静默返回
      }
    };
    await walk(this.toRelative(dir));
    return result;
  }

  async lastModified(filePath: string): Promise<number> {
    try {
      const [parentHandle, name] = await resolveParentAndName(this.rootHandle, this.toRelative(filePath));
      const fileHandle = await parentHandle.getFileHandle(name);
      const file = await fileHandle.getFile();
      return file.lastModified;
    } catch {
      return 0;
    }
  }

  // ---- 同步方法（浏览器环境不可用，抛错） ----

  readTextFileSync(_filePath: string, _encoding: string): string {
    throw new Error('LocalFsApi: synchronous operations are not available in browser environment');
  }
  readFileSync(_filePath: string): Uint8Array {
    throw new Error('LocalFsApi: synchronous operations are not available in browser environment');
  }
  writeTextFileSync(_filePath: string, _text: string): void {
    throw new Error('LocalFsApi: synchronous operations are not available in browser environment');
  }
  writeFileSync(_filePath: string, _data: Uint8Array): void {
    throw new Error('LocalFsApi: synchronous operations are not available in browser environment');
  }
  existsSync(_filePath: string): boolean {
    throw new Error('LocalFsApi: synchronous operations are not available in browser environment');
  }
  isDirectorySync(_filePath: string): boolean {
    throw new Error('LocalFsApi: synchronous operations are not available in browser environment');
  }
  readDirSync(_dir: string): string[] {
    throw new Error('LocalFsApi: synchronous operations are not available in browser environment');
  }
  mkdirsSync(_dir: string): void {
    throw new Error('LocalFsApi: synchronous operations are not available in browser environment');
  }
  removeSync(_target: string): void {
    throw new Error('LocalFsApi: synchronous operations are not available in browser environment');
  }
  renameSync(_oldPath: string, _newPath: string): void {
    throw new Error('LocalFsApi: synchronous operations are not available in browser environment');
  }
  fileSizeSync(_filePath: string): number {
    throw new Error('LocalFsApi: synchronous operations are not available in browser environment');
  }
  lastModifiedSync(_filePath: string): number {
    throw new Error('LocalFsApi: synchronous operations are not available in browser environment');
  }

  // ---- 内部工具 ----

  /**
   * 将传入路径转换为相对于 rootHandle 的相对路径。
   * store.dataDir 存的是 displayDir（目录名），所有传入的路径
   * 可能以 displayDir 开头，也可能已经是相对路径。
   */
  private toRelative(filePath: string): string {
    if (!filePath || filePath === '.' || filePath === '/') return '';
    // 如果路径以 displayDir 开头，去掉前缀
    const norm = pathNormalize(filePath);
    const prefix = this.displayDir + '/';
    if (norm === this.displayDir) return '';
    if (norm.startsWith(prefix)) {
      const rest = norm.substring(prefix.length);
      return rest || '';
    }
    // 已经是相对路径
    return norm;
  }
}
