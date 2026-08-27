/**
 * 增量文件写入 + 目录清理。
 * 原 Java: configgen.util.CachedFiles
 *
 * 写入时：内容相同则跳过（减少磁盘写入），不同则覆盖。
 * 清理时：保留 keep 集合中的文件，删除其余。
 *
 * T12.0b: 同步方法保留（CLI/测试用）；新增异步版方法（writeFileAsync/deleteAsync/
 * finalExitAsync），底层走 CfgFileSystem 抽象，供 Tauri/WebView 环境使用。
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDefaultFileSystem } from './CfgFileSystem';
import { Logger } from './Logger';

const META_SUFFIXES = ['.meta', '.uid'];

class CachedFilesImpl {
  private filenameSet = new Set<string>();
  private deleteFiles: string[] = [];
  private deleteKeepMetaWithSuffixFiles: string[] = [];

  deleteOtherFiles(dir: string): void {
    this.deleteFiles.push(dir);
  }

  keepMetaAndDeleteOtherFiles(dir: string): void {
    this.deleteKeepMetaWithSuffixFiles.push(dir);
  }

  finalExit(): void {
    for (const f of this.deleteFiles) {
      if (fs.existsSync(f)) {
        this.doRemoveFile(f, false);
      }
    }
    for (const dir of this.deleteKeepMetaWithSuffixFiles) {
      this.doRemoveFile(dir, true);
    }
    this.deleteFiles = [];
    this.deleteKeepMetaWithSuffixFiles = [];
    this.filenameSet.clear();
  }

  /**
   * 异步版 finalExit（Tauri/WebView 环境可用），走 CfgFileSystem 抽象。
   * 与同步版语义一致：删除未 keep 的旧文件，然后清空状态。
   */
  async finalExitAsync(): Promise<void> {
    const dfs = getDefaultFileSystem();
    for (const f of this.deleteFiles) {
      if (await dfs.exists(f)) {
        await this.doRemoveFileAsync(f, false);
      }
    }
    for (const dir of this.deleteKeepMetaWithSuffixFiles) {
      await this.doRemoveFileAsync(dir, true);
    }
    this.deleteFiles = [];
    this.deleteKeepMetaWithSuffixFiles = [];
    this.filenameSet.clear();
  }

  writeFile(filePath: string, data: Buffer): void {
    this.keepFile(filePath);

    if (!fs.existsSync(filePath)) {
      Logger.log('create file: ' + filePath);
      this.mkdirs(path.dirname(filePath));
      fs.writeFileSync(filePath, data);
      return;
    }

    // Size differs -> content must have changed
    const existingSize = fs.statSync(filePath).size;
    if (existingSize !== data.length) {
      Logger.log('modify file: ' + filePath);
      fs.writeFileSync(filePath, data);
      return;
    }

    // Same size: compare bytes
    const existing = fs.readFileSync(filePath);
    if (!existing.equals(data)) {
      Logger.log('modify file: ' + filePath);
      fs.writeFileSync(filePath, data);
    }
  }

  /**
   * 异步增量写入（Tauri/WebView 环境可用），走 CfgFileSystem 抽象。
   * 与 writeFile 语义一致：内容相同跳过，不同则覆盖。
   * @param filePath 文件路径
   * @param data 字节内容（Buffer 或 Uint8Array）
   */
  async writeFileAsync(filePath: string, data: Uint8Array): Promise<void> {
    this.keepFile(filePath);
    const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const dsize = d.length;
    const dfs = getDefaultFileSystem();

    if (!(await dfs.exists(filePath))) {
      Logger.log('create file: ' + filePath);
      await dfs.mkdirs(path.dirname(filePath));
      await dfs.writeFile(filePath, d);
      return;
    }

    const existingSize = await dfs.fileSize(filePath);
    if (existingSize !== dsize) {
      Logger.log('modify file: ' + filePath);
      await dfs.writeFile(filePath, d);
      return;
    }

    const existing = await dfs.readFile(filePath);
    if (Buffer.compare(Buffer.from(existing), d) !== 0) {
      Logger.log('modify file: ' + filePath);
      await dfs.writeFile(filePath, d);
    }
  }

  keepFile(filePath: string): void {
    this.filenameSet.add(this.fileKey(filePath));
  }

  delete(file: string): boolean {
    const isDir = fs.existsSync(file) && fs.statSync(file).isDirectory();
    const deleteOk = fs.existsSync(file) && fs.rmSync(file, { recursive: true, force: true }) === undefined;
    const status = deleteOk ? '' : ' fail';
    Logger.log(`delete ${isDir ? 'dir' : 'file'}${status}: ${file}`);
    return deleteOk;
  }

  /**
   * 异步删除文件或目录（Tauri/WebView 环境可用），走 CfgFileSystem 抽象。
   * @param file 文件或目录路径
   * @returns 是否删除成功（不存在时返回 false，与同步 delete 一致）
   */
  async deleteAsync(file: string): Promise<boolean> {
    const d = getDefaultFileSystem();
    const isDir = await d.isDirectory(file);
    const existed = isDir || (await d.isFile(file));
    if (!existed) {
      Logger.log(`delete ${isDir ? 'dir' : 'file'} fail: ${file}`);
      return false;
    }
    try {
      await d.remove(file);
      Logger.log(`delete ${isDir ? 'dir' : 'file'}: ${file}`);
      return true;
    } catch {
      Logger.log(`delete ${isDir ? 'dir' : 'file'} fail: ${file}`);
      return false;
    }
  }

  private mkdirs(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private fileKey(filePath: string): string {
    return getDefaultFileSystem().resolvePath(filePath).toLowerCase();
  }

  private doRemoveFile(file: string, keepMeta: boolean): void {
    const key = this.fileKey(file);
    let keep = this.filenameSet.has(key);

    if (keep) return;

    if (keepMeta) {
      const noMetaKey = this.findNoMetaKey(key);
      if (noMetaKey !== null) {
        keep = this.filenameSet.has(noMetaKey);
        if (!keep && fs.existsSync(noMetaKey) && fs.statSync(noMetaKey).isDirectory()) {
          for (const f of this.filenameSet) {
            if (f.startsWith(noMetaKey)) {
              keep = true;
              break;
            }
          }
        }
      }
    }

    if (keep) return;

    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      const files = fs.readdirSync(file);
      for (const f of files) {
        this.doRemoveFile(path.join(file, f), keepMeta);
      }
      // Remove dir if empty
      const remaining = fs.readdirSync(file);
      if (remaining.length === 0) {
        this.delete(file);
      }
    } else {
      this.delete(file);
    }
  }

  private async doRemoveFileAsync(file: string, keepMeta: boolean): Promise<void> {
    const d = getDefaultFileSystem();
    const key = this.fileKey(file);
    let keep = this.filenameSet.has(key);

    if (keep) return;

    if (keepMeta) {
      const noMetaKey = this.findNoMetaKey(key);
      if (noMetaKey !== null) {
        keep = this.filenameSet.has(noMetaKey);
        if (!keep && (await d.isDirectory(noMetaKey))) {
          for (const f of this.filenameSet) {
            if (f.startsWith(noMetaKey)) {
              keep = true;
              break;
            }
          }
        }
      }
    }

    if (keep) return;

    if (await d.isDirectory(file)) {
      const files = await d.readDir(file);
      for (const f of files) {
        await this.doRemoveFileAsync(path.join(file, f), keepMeta);
      }
      // Remove dir if empty
      const remaining = await d.readDir(file);
      if (remaining.length === 0) {
        await this.deleteAsync(file);
      }
    } else {
      await this.deleteAsync(file);
    }
  }

  private findNoMetaKey(key: string): string | null {
    for (const metaSuffix of META_SUFFIXES) {
      if (key.endsWith(metaSuffix)) {
        return key.substring(0, key.length - metaSuffix.length);
      }
    }
    return null;
  }
}

export const CachedFiles = new CachedFilesImpl();