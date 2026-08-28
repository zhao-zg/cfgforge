/**
 * 文件操作工具。
 * 原 Java: configgen.util.FileUtil
 *
 * 注意：Java 版的 copyFileIfNotExist 依赖 Generator.class.getResourceAsStream
 * 和源码路径查找，在 TS 版中不再需要（Tauri 直接用文件系统）。只保留基础文件操作。
 *
 * T12.0b: 新增异步版（moveDirFilesToAnotherDirAsync / moveOneFileAsync / hasFilesAsync /
 * assureFileExistAsync），走 CfgFileSystem 抽象，供 Tauri/WebView 环境使用。
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDefaultFileSystem } from './CfgFileSystem.js';

export function moveDirFilesToAnotherDir(from: string, to: string): void {
  if (fs.existsSync(to) && fs.statSync(to).isDirectory()) {
    for (const file of fs.readdirSync(to)) {
      fs.rmSync(path.join(to, file), { force: true });
    }
  } else {
    fs.mkdirSync(to, { recursive: true });
  }

  for (const file of fs.readdirSync(from)) {
    fs.renameSync(path.join(from, file), path.join(to, file));
  }
}

/**
 * 异步移动目录下所有文件到目标目录（先清空目标目录内容），走 CfgFileSystem 抽象。
 */
export async function moveDirFilesToAnotherDirAsync(from: string, to: string): Promise<void> {
  const d = getDefaultFileSystem();
  if ((await d.isDirectory(to)) && (await d.readDir(to)).length > 0) {
    for (const file of await d.readDir(to)) {
      await d.remove(path.join(to, file));
    }
  } else {
    await d.mkdirs(to);
  }

  for (const file of await d.readDir(from)) {
    await d.rename(path.join(from, file), path.join(to, file));
  }
}

export function moveOneFile(from: string, to: string): void {
  if (fs.existsSync(to) && fs.statSync(to).isFile()) {
    fs.rmSync(to, { force: true });
  }

  if (fs.existsSync(from) && fs.statSync(from).isFile()) {
    fs.renameSync(from, to);
  }
}

/**
 * 异步移动单个文件（目标已存在则先删除），走 CfgFileSystem 抽象。
 */
export async function moveOneFileAsync(from: string, to: string): Promise<void> {
  const d = getDefaultFileSystem();
  if (await d.isFile(to)) {
    await d.remove(to);
  }

  if (await d.isFile(from)) {
    await d.rename(from, to);
  }
}

export function hasFiles(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  if (!fs.statSync(dir).isDirectory()) return false;
  return fs.readdirSync(dir).length > 0;
}

/**
 * 异步判断目录是否包含文件，走 CfgFileSystem 抽象。
 */
export async function hasFilesAsync(dir: string): Promise<boolean> {
  const d = getDefaultFileSystem();
  if (!(await d.isDirectory(dir))) return false;
  return (await d.readDir(dir)).length > 0;
}

export function assureFileExist(filePath: string | null | undefined): void {
  if (filePath != null) {
    const resolved = getDefaultFileSystem().resolvePath(filePath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`${filePath} not exist`);
    }
  }
}

/**
 * 异步断言文件存在（不存在时抛错），走 CfgFileSystem 抽象。
 */
export async function assureFileExistAsync(filePath: string | null | undefined): Promise<void> {
  if (filePath != null) {
    const dfs = getDefaultFileSystem();
    const resolved = dfs.resolvePath(filePath);
    if (!(await dfs.exists(resolved))) {
      throw new Error(`${filePath} not exist`);
    }
  }
}