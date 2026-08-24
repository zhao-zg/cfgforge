/**
 * 增量文件写入 + 目录清理。
 * 原 Java: configgen.util.CachedFiles
 *
 * 写入时：内容相同则跳过（减少磁盘写入），不同则覆盖。
 * 清理时：保留 keep 集合中的文件，删除其余。
 */

import * as fs from 'fs';
import * as path from 'path';
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

  private mkdirs(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private fileKey(filePath: string): string {
    return path.resolve(filePath).toLowerCase();
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
