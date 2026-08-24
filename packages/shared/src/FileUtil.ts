/**
 * 文件操作工具。
 * 原 Java: configgen.util.FileUtil
 *
 * 注意：Java 版的 copyFileIfNotExist 依赖 Generator.class.getResourceAsStream
 * 和源码路径查找，在 TS 版中不再需要（Tauri 直接用文件系统）。只保留基础文件操作。
 */

import * as fs from 'fs';
import * as path from 'path';

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

export function moveOneFile(from: string, to: string): void {
  if (fs.existsSync(to) && fs.statSync(to).isFile()) {
    fs.rmSync(to, { force: true });
  }

  if (fs.existsSync(from) && fs.statSync(from).isFile()) {
    fs.renameSync(from, to);
  }
}

export function hasFiles(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  if (!fs.statSync(dir).isDirectory()) return false;
  return fs.readdirSync(dir).length > 0;
}

export function assureFileExist(filePath: string | null | undefined): void {
  if (filePath != null) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`${filePath} not exist`);
    }
  }
}
