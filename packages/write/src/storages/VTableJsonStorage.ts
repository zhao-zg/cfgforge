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
import type { VStruct } from '@cfggen/value';
import { ValueToJson } from '@cfggen/value';
import type { DirectoryStructure } from '@cfggen/context';
import { getJsonTableDirName } from '@cfggen/data';
import { getCodeName, CachedFiles } from '@cfggen/shared';

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
}
