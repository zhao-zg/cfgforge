/**
 * CfgFileSystem — 文件系统抽象层。
 *
 * 目的：让 cfggen 的 TS 包（shared/context/data/write/gen/editor-core）
 * 不直接依赖 Node.js `fs`，从而可以同时运行在：
 *   - Node.js 环境（CLI / MCP / sidecar）：NodeFileSystem（基于 fs）
 *   - Tauri WebView 浏览器环境：TauriFileSystem（基于 @tauri-apps/plugin-fs）
 *
 * 设计要点：
 * - 接口同时提供异步（Promise）与同步方法。异步方法在浏览器可用
 *   （plugin-fs 是异步 API）；同步方法只在 Node 下可用，浏览器实现抛错。
 * - 字节类型统一用 Uint8Array（Node Buffer 是其子类，可互相传递）。
 * - 通过全局单例注入（setDefaultFileSystem/getDefaultFileSystem）。
 *   各包无需感知具体实现；Node 下未显式设置时由 index.ts 自动设为 NodeFileSystem。
 *
 * 原 Java: 无对应类（Java 直接使用 java.nio.file）
 */

/** 文件系统抽象接口。 */
export interface CfgFileSystem {
  // ---- 异步方法（所有环境可用） ----

  /** 读取整个文件为字节（文件不存在时 reject）。 */
  readFile(path: string): Promise<Uint8Array>;

  /** 写入整个文件（覆盖），自动创建父目录。 */
  writeFile(path: string, data: Uint8Array): Promise<void>;

  /** 判断路径是否存在。 */
  exists(path: string): Promise<boolean>;

  /** 判断路径是否为目录。 */
  isDirectory(path: string): Promise<boolean>;

  /** 判断路径是否为普通文件。 */
  isFile(path: string): Promise<boolean>;

  /** 列出目录内容（仅一层，不含递归）。目录不存在时返回空数组。 */
  readDir(path: string): Promise<string[]>;

  /** 递归创建目录（等价 mkdirSync recursive: true）。 */
  mkdirs(path: string): Promise<void>;

  /** 删除文件或目录（递归）。不存在时静默成功。 */
  remove(path: string): Promise<void>;

  /** 重命名/移动文件或目录。 */
  rename(oldPath: string, newPath: string): Promise<void>;

  /** 获取文件大小（字节）。文件不存在时返回 0。 */
  fileSize(path: string): Promise<number>;

  /** 递归列出目录下所有文件的绝对路径。目录不存在时返回空数组。 */
  listFilesRecursive(dir: string): Promise<string[]>;

  /** 获取文件最后修改时间（毫秒 epoch）。文件不存在时返回 0。 */
  lastModified(path: string): Promise<number>;

  // ---- 同步方法（仅 Node 环境可用；浏览器实现抛错） ----

  /** 读取整个文件为文本（使用指定编码，不做 BOM 检测）。 */
  readTextFileSync(path: string, encoding: string): string;

  /** 读取整个文件为字节。 */
  readFileSync(path: string): Uint8Array;

  /** 写入文本文件。 */
  writeTextFileSync(path: string, text: string): void;

  /** 写入字节文件。 */
  writeFileSync(path: string, data: Uint8Array): void;

  /** 同步判断路径是否存在。 */
  existsSync(path: string): boolean;

  /** 同步判断路径是否为目录。 */
  isDirectorySync(path: string): boolean;

  /** 同步列出目录内容。 */
  readDirSync(path: string): string[];

  /** 同步递归创建目录。 */
  mkdirsSync(path: string): void;

  /** 同步删除文件或目录（递归）。 */
  removeSync(path: string): void;

  /** 同步重命名/移动。 */
  renameSync(oldPath: string, newPath: string): void;

  /** 同步获取文件大小。 */
  fileSizeSync(path: string): number;

  /** 同步获取文件最后修改时间（毫秒 epoch）。文件不存在时返回 0。 */
  lastModifiedSync(path: string): number;
}

/** 全局默认文件系统实例。 */
let defaultFileSystem: CfgFileSystem | null = null;

/** 获取全局默认文件系统。若未设置则抛错（Node 入口应显式调用 setDefaultFileSystem）。 */
export function getDefaultFileSystem(): CfgFileSystem {
  if (defaultFileSystem === null) {
    throw new Error(
      'CfgFileSystem not initialized. Call setDefaultFileSystem() first (e.g. with NodeFileSystem in Node, TauriFileSystem in WebView).'
    );
  }
  return defaultFileSystem;
}

/** 设置全局默认文件系统（Tauri 初始化时调用；Node 入口也可显式设置）。 */
export function setDefaultFileSystem(fs: CfgFileSystem): void {
  defaultFileSystem = fs;
}

/** 是否已初始化。 */
export function hasDefaultFileSystem(): boolean {
  return defaultFileSystem !== null;
}

/**
 * 确保默认文件系统已初始化。
 * 在 Node 环境（CLI/MCP/测试）下调用，将默认文件系统设为 NodeFileSystem；
 * 在 Tauri WebView 环境下会跳过（由 Tauri 入口显式 setDefaultFileSystem）。
 *
 * 注意：这里静态导入 NodeFileSystem，Node 构建（tsc / vitest）可正常解析；
 * 打包浏览器 bundle 时，构建工具按打包目标 tree-shake 或忽略 node:fs 导入
 * （Tauri 前端不应把 shared 包打进浏览器 bundle，而是由 Tauri 侧运行）。
 */
import { NodeFileSystem } from './NodeFileSystem';

export function ensureDefaultFileSystem(): void {
  if (defaultFileSystem !== null) return;
  try {
    defaultFileSystem = new NodeFileSystem();
  } catch {
    // 非 Node 环境：保持未初始化，由 Tauri 入口 setDefaultFileSystem
  }
}