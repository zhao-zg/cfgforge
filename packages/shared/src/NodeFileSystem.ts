/**
 * NodeFileSystem — 基于 Node.js `fs` 的 CfgFileSystem 实现。
 * 用于 Node 环境（CLI / MCP / sidecar / 测试）。
 *
 * 同步方法直接映射 fs 同步 API；异步方法用 fs.promises（或同步封装）。
 */

import * as fs from 'fs';
import * as path from 'path';
import type { CfgFileSystem } from './CfgFileSystem.js';

export class NodeFileSystem implements CfgFileSystem {
  // ---- 环境检测 ----

  readonly isSyncSupported = true;

  // ---- 路径解析 ----

  resolvePath(...paths: string[]): string {
    return path.resolve(...paths);
  }

  // ---- 异步方法 ----

  async readFile(filePath: string): Promise<Uint8Array> {
    return fs.promises.readFile(filePath);
  }

  async writeFile(filePath: string, data: Uint8Array): Promise<void> {
    await this.mkdirs(path.dirname(filePath));
    await fs.promises.writeFile(filePath, data);
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async isDirectory(filePath: string): Promise<boolean> {
    try {
      return (await fs.promises.stat(filePath)).isDirectory();
    } catch {
      return false;
    }
  }

  async isFile(filePath: string): Promise<boolean> {
    try {
      return (await fs.promises.stat(filePath)).isFile();
    } catch {
      return false;
    }
  }

  async readDir(dir: string): Promise<string[]> {
    try {
      return await fs.promises.readdir(dir);
    } catch {
      return [];
    }
  }

  async mkdirs(dir: string): Promise<void> {
    await fs.promises.mkdir(dir, { recursive: true });
  }

  async remove(target: string): Promise<void> {
    await fs.promises.rm(target, { recursive: true, force: true });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.mkdirs(path.dirname(newPath));
    await fs.promises.rename(oldPath, newPath);
  }

  async fileSize(filePath: string): Promise<number> {
    try {
      return (await fs.promises.stat(filePath)).size;
    } catch {
      return 0;
    }
  }

  async listFilesRecursive(dir: string): Promise<string[]> {
    const result: string[] = [];
    const walk = async (d: string): Promise<void> => {
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile()) {
          result.push(full);
        }
      }
    };
    await walk(dir);
    return result;
  }

  async lastModified(filePath: string): Promise<number> {
    try {
      return (await fs.promises.stat(filePath)).mtimeMs;
    } catch {
      return 0;
    }
  }

  // ---- 同步方法 ----

  readTextFileSync(filePath: string, encoding: string): string {
    return fs.readFileSync(filePath, encoding as BufferEncoding);
  }

  readFileSync(filePath: string): Uint8Array {
    return fs.readFileSync(filePath);
  }

  writeTextFileSync(filePath: string, text: string): void {
    this.mkdirsSync(path.dirname(filePath));
    fs.writeFileSync(filePath, text, 'utf8');
  }

  writeFileSync(filePath: string, data: Uint8Array): void {
    this.mkdirsSync(path.dirname(filePath));
    fs.writeFileSync(filePath, data);
  }

  existsSync(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  isDirectorySync(filePath: string): boolean {
    try {
      return fs.statSync(filePath).isDirectory();
    } catch {
      return false;
    }
  }

  readDirSync(dir: string): string[] {
    try {
      return fs.readdirSync(dir);
    } catch {
      return [];
    }
  }

  mkdirsSync(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
  }

  removeSync(target: string): void {
    fs.rmSync(target, { recursive: true, force: true });
  }

  renameSync(oldPath: string, newPath: string): void {
    this.mkdirsSync(path.dirname(newPath));
    fs.renameSync(oldPath, newPath);
  }

  fileSizeSync(filePath: string): number {
    try {
      return fs.statSync(filePath).size;
    } catch {
      return 0;
    }
  }

  lastModifiedSync(filePath: string): number {
    try {
      return fs.statSync(filePath).mtimeMs;
    } catch {
      return 0;
    }
  }
}