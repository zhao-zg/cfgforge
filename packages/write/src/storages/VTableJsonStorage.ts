/**
 * VTableJsonStorage — TypeScript port of Java `configgen.write.VTableJsonStorage`.
 *
 * Provides add/update/delete operations on JSON table record files.
 * Does NOT modify any in-memory data structures — only writes/deletes files.
 *
 * Because this class is stateless and only does file I/O, all methods are
 * synchronous (unlike VTableStorage which is async due to ExcelJS).
 *
 * Java source: configgen.write.VTableJsonStorage.java (123 lines)
 */

import * as fs from 'fs';
import * as path from 'path';
import type { VStruct } from '@cfgforge/value';
import { ValueToJson } from '@cfgforge/value';
import type { DirectoryStructure } from '@cfgforge/context';
import { getJsonTableDirName } from '@cfgforge/data';
import { getCodeName, CachedFiles, getDefaultFileSystem } from '@cfgforge/shared';
import { join as pathJoin } from '@cfgforge/shared';

export class VTableJsonStorage {
  /**
   * Add or update a JSON record file.
   *
   * @returns the relative path (from dataDir) of the record file.
   */
  static addOrUpdateRecord(
    record: VStruct,
    table: string,
    id: string,
    dataDir: string,
    directoryStructure: DirectoryStructure | null,
  ): string {
    VTableJsonStorage.validateId(id);

    let jsonDirRelPath: string | null = null;
    if (directoryStructure !== null) {
      jsonDirRelPath = directoryStructure.getJsonTableDir(table);
    }
    if (jsonDirRelPath === null) {
      jsonDirRelPath = VTableJsonStorage.resolveJsonDirRelativePath(table, dataDir);
    }

    const relativePath = path.join(jsonDirRelPath, id + '.json');
    const recordPath = path.join(dataDir, relativePath);

    const jsonString = ValueToJson.toJsonStr(record);
    CachedFiles.writeFile(recordPath, Buffer.from(jsonString, 'utf8'));

    return relativePath;
  }

  /**
   * Async variant of addOrUpdateRecord.
   * Uses CfgFileSystem abstraction for file I/O (Tauri/WebView compatible).
   *
   * @returns the relative path (from dataDir) of the record file.
   */
  static async addOrUpdateRecordAsync(
    record: VStruct,
    table: string,
    id: string,
    dataDir: string,
    directoryStructure: DirectoryStructure | null,
  ): Promise<string> {
    VTableJsonStorage.validateId(id);

    let jsonDirRelPath: string | null = null;
    if (directoryStructure !== null) {
      jsonDirRelPath = directoryStructure.getJsonTableDir(table);
    }
    if (jsonDirRelPath === null) {
      jsonDirRelPath = await VTableJsonStorage.resolveJsonDirRelativePathAsync(table, dataDir);
    }

    const relativePath = pathJoin(jsonDirRelPath, id + '.json');
    const recordPath = pathJoin(dataDir, relativePath);

    const jsonString = ValueToJson.toJsonStr(record);
    await CachedFiles.writeFileAsync(recordPath, Buffer.from(jsonString, 'utf8'));

    return relativePath;
  }

  /**
   * Delete a JSON record file.
   *
   * @returns the relative path (from dataDir) of the deleted record file.
   */
  static deleteRecord(
    table: string,
    id: string,
    dataDir: string,
    directoryStructure: DirectoryStructure | null,
  ): string {
    VTableJsonStorage.validateId(id);

    let jsonDirRelPath: string | null = null;
    if (directoryStructure !== null) {
      jsonDirRelPath = directoryStructure.getJsonTableDir(table);
    }
    if (jsonDirRelPath === null) {
      jsonDirRelPath = VTableJsonStorage.resolveJsonDirRelativePath(table, dataDir);
    }

    const relativePath = path.join(jsonDirRelPath, id + '.json');
    const recordPath = path.join(dataDir, relativePath);

    fs.unlinkSync(recordPath);

    return relativePath;
  }

  /**
   * Async variant of deleteRecord.
   * Uses CfgFileSystem abstraction for file I/O (Tauri/WebView compatible).
   *
   * @returns the relative path (from dataDir) of the deleted record file.
   */
  static async deleteRecordAsync(
    table: string,
    id: string,
    dataDir: string,
    directoryStructure: DirectoryStructure | null,
  ): Promise<string> {
    VTableJsonStorage.validateId(id);

    let jsonDirRelPath: string | null = null;
    if (directoryStructure !== null) {
      jsonDirRelPath = directoryStructure.getJsonTableDir(table);
    }
    if (jsonDirRelPath === null) {
      jsonDirRelPath = await VTableJsonStorage.resolveJsonDirRelativePathAsync(table, dataDir);
    }

    const relativePath = pathJoin(jsonDirRelPath, id + '.json');
    const recordPath = pathJoin(dataDir, relativePath);

    await getDefaultFileSystem().remove(recordPath);

    return relativePath;
  }

  /**
   * Validate that a record id does not contain path separators or "..",
   * preventing writes outside the table directory.
   */
  static validateId(id: string): void {
    if (id.includes('/') || id.includes('\\') || id.includes('..')) {
      throw new Error(`invalid record id (path separator or '..' not allowed): ${id}`);
    }
  }

  /**
   * Resolve the JSON table directory's relative path (from dataDir).
   *
   * Prefers nested paths (e.g., `buff/_skill` or `a/b/_c`), falls back to
   * the old flat format (e.g., `_buff_skill`).
   *
   * Recursively searches for module directories by codeName:
   * table `a.b.c` → find `a/` → within it find `b/` → append `_c`
   */
  static resolveJsonDirRelativePath(table: string, dataDir: string): string {
    const lastDotIdx = table.lastIndexOf('.');
    if (lastDotIdx >= 0) {
      const moduleParts = table.substring(0, lastDotIdx).split('.');
      const subPart = table.substring(lastDotIdx + 1);

      let currentDir = dataDir;
      let relativePath = '';
      let found = true;

      for (const modulePart of moduleParts) {
        const matchedDirName = VTableJsonStorage.findModuleDirName(currentDir, modulePart);
        if (matchedDirName === null) {
          found = false;
          break;
        }
        relativePath = path.join(relativePath, matchedDirName);
        currentDir = path.join(dataDir, relativePath);
      }

      if (found) {
        return path.join(relativePath, '_' + subPart);
      }
    }

    // Fallback: old flat format _module_sub
    return getJsonTableDirName(table);
  }

  /**
   * Async variant of resolveJsonDirRelativePath.
   * Uses CfgFileSystem abstraction for directory I/O (Tauri/WebView compatible).
   */
  static async resolveJsonDirRelativePathAsync(table: string, dataDir: string): Promise<string> {
    const lastDotIdx = table.lastIndexOf('.');
    if (lastDotIdx >= 0) {
      const moduleParts = table.substring(0, lastDotIdx).split('.');
      const subPart = table.substring(lastDotIdx + 1);

      let currentDir = dataDir;
      let relativePath = '';
      let found = true;

      for (const modulePart of moduleParts) {
        const matchedDirName = await VTableJsonStorage.findModuleDirNameAsync(currentDir, modulePart);
        if (matchedDirName === null) {
          found = false;
          break;
        }
        relativePath = pathJoin(relativePath, matchedDirName);
        currentDir = pathJoin(dataDir, relativePath);
      }

      if (found) {
        return pathJoin(relativePath, '_' + subPart);
      }
    }

    // Fallback: old flat format _module_sub
    return getJsonTableDirName(table);
  }

  /**
   * Find a subdirectory whose codeName matches `modulePart`.
   * Returns the actual directory name (may have Chinese suffix), or null.
   */
  private static findModuleDirName(dir: string, modulePart: string): string | null {
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        let stat: fs.Stats;
        try {
          stat = fs.statSync(fullPath);
        } catch {
          continue;
        }
        if (!stat.isDirectory()) {
          continue;
        }
        const codeName = getCodeName(entry);
        if (modulePart === codeName) {
          return entry;
        }
      }
    } catch {
      // ignore — directory not accessible
    }
    return null;
  }

  /**
   * Async variant of findModuleDirName.
   * Uses CfgFileSystem abstraction (Tauri/WebView compatible).
   */
  private static async findModuleDirNameAsync(dir: string, modulePart: string): Promise<string | null> {
    const dfs = getDefaultFileSystem();
    try {
      const entries = await dfs.readDir(dir);
      for (const entry of entries) {
        const fullPath = pathJoin(dir, entry);
        if (!(await dfs.isDirectory(fullPath))) {
          continue;
        }
        const codeName = getCodeName(entry);
        if (modulePart === codeName) {
          return entry;
        }
      }
    } catch {
      // ignore — directory not accessible
    }
    return null;
  }
}
