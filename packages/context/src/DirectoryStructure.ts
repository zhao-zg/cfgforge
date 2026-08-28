/**
 * DirectoryStructure — TypeScript port of Java `configgen.ctx.DirectoryStructure`.
 *
 * Scans a data directory and discovers:
 * - Configuration files (.cfg) via CfgUtil.findConfigFilesRecursively
 * - Excel/CSV files via recursive directory scanning
 * - JSON table files via nested (_subDir) and root-level (_table_name) formats
 *
 * Supports runtime file additions/removals with copy-on-write semantics.
 * In Java, fields are volatile + synchronized for thread safety.
 * In TS (single-threaded), copy-on-write is retained for reference consistency.
 *
 * Java source: configgen.ctx.DirectoryStructure.java (545 lines)
 */

import * as fs from 'fs';
import * as path from 'path';
import type { CfgFileInfo } from '@cfgforge/schema';
import { CfgUtil } from '@cfgforge/schema';
import {
  type ExcelFileInfo,
  JsonFileInfo,
  type JsonTableFiles,
  FileFmt,
  getFileFormat,
  isFileIgnored,
  getTableNameIfTableDirForJson,
  getSubTableNameIfJsonSubDir,
} from '@cfgforge/data';
import { getCodeName, getDefaultFileSystem } from '@cfgforge/shared';
import { join as pathJoin, relative as pathRelative, basename as pathBasename } from '@cfgforge/shared';
import type { ExplicitDir } from './ExplicitDir.js';

// ---------------------------------------------------------------------------
// JsonFileList — internal per-table JSON file collection
// ---------------------------------------------------------------------------

class JsonFileList {
  list: JsonFileInfo[] = [];
  map: Map<string, JsonFileInfo> = new Map();
  /** Relative path (from rootDir) of the directory where this table's JSON files were discovered. */
  tableDirRelativePath: string | null = null;

  sort(): void {
    this.list = Array.from(this.map.values());
    if (this.list.every((jf) => jf.isIntegerId)) {
      this.list.sort((a, b) => a.integerId - b.integerId);
    }
  }

  addFile(info: JsonFileInfo): void {
    this.map.set(info.relativePath, info);
  }

  copy(): JsonFileList {
    const c = new JsonFileList();
    c.map = new Map(this.map);
    c.list = [...this.list];
    c.tableDirRelativePath = this.tableDirRelativePath;
    return c;
  }

  removeFile(jsonFileRelativePath: string): JsonFileInfo | undefined {
    const removed = this.map.get(jsonFileRelativePath);
    if (removed !== undefined) {
      this.map.delete(jsonFileRelativePath);
    }
    return removed;
  }
}

// ---------------------------------------------------------------------------
// DirectoryStructure
// ---------------------------------------------------------------------------

export class DirectoryStructure implements JsonTableFiles {
  static readonly ROOT_CONFIG_FILENAME = 'config.cfg';
  static readonly CONFIG_EXT = 'cfg';

  private readonly rootDir: string;
  private readonly explicitDir: ExplicitDir | null;
  private cfgFiles: Map<string, CfgFileInfo> = new Map();
  private excelFiles: Map<string, ExcelFileInfo> = new Map();
  private jsonFiles: Map<string, JsonFileList> = new Map();

  constructor(rootDir: string, explicitDir: ExplicitDir | null = null, _skipScan = false) {
    this.rootDir = rootDir;
    this.explicitDir = explicitDir;

    if (_skipScan) return;

    // Phase 1: Discover config files
    CfgUtil.findConfigFilesRecursively(
      path.join(rootDir, DirectoryStructure.ROOT_CONFIG_FILENAME),
      explicitDir !== null ? explicitDir.excelFileDirs : null,
      DirectoryStructure.CONFIG_EXT,
      '',
      rootDir,
      this.cfgFiles,
    );

    // Phase 2: Discover excel/csv files
    if (explicitDir === null) {
      this.findExcelFilesRecursively(rootDir);
    } else {
      for (const [dirName, addTag] of explicitDir.txtAsTsvFileInThisDirAsInRoot_To_AddTag_Map) {
        const dir = path.join(rootDir, dirName);
        if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
          this.findTxtAsTsvFiles(dir, addTag);
        }
      }
      for (const p of explicitDir.excelFileDirs) {
        const dir = path.join(rootDir, p);
        if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
          this.findExcelFilesRecursively(dir);
        }
      }
    }

    // Phase 3: Discover JSON table files
    if (explicitDir === null) {
      this.findTableToJsonFiles();
    } else {
      for (const p of explicitDir.jsonFileDirs) {
        this.findOneTableJsonFilesInDir(path.join(rootDir, p));
      }
    }
  }

  reload(): DirectoryStructure {
    return new DirectoryStructure(this.rootDir, this.explicitDir);
  }

  // -------------------------------------------------------------------------
  // Async variants (via CfgFileSystem abstraction, for Tauri WebView)
  // -------------------------------------------------------------------------

  /**
   * Async factory: scans the directory tree via CfgFileSystem abstraction.
   * Produces the same result as `new DirectoryStructure()` but without
   * direct fs calls — suitable for Tauri WebView environment.
   */
  static async createAsync(rootDir: string, explicitDir: ExplicitDir | null = null): Promise<DirectoryStructure> {
    const ds = new DirectoryStructure(rootDir, explicitDir, true);

    // Phase 1: Discover config files (async)
    await CfgUtil.findConfigFilesRecursivelyAsync(
      pathJoin(rootDir, DirectoryStructure.ROOT_CONFIG_FILENAME),
      explicitDir !== null ? explicitDir.excelFileDirs : null,
      DirectoryStructure.CONFIG_EXT,
      '',
      rootDir,
      ds.cfgFiles,
    );

    // Phase 2: Discover excel/csv files (async)
    if (explicitDir === null) {
      await ds.findExcelFilesRecursivelyAsync(rootDir);
    } else {
      for (const [dirName, addTag] of explicitDir.txtAsTsvFileInThisDirAsInRoot_To_AddTag_Map) {
        const dir = pathJoin(rootDir, dirName);
        if (await ds.isDirectory(dir)) {
          await ds.findTxtAsTsvFilesAsync(dir, addTag);
        }
      }
      for (const p of explicitDir.excelFileDirs) {
        const dir = pathJoin(rootDir, p);
        if (await ds.isDirectory(dir)) {
          await ds.findExcelFilesRecursivelyAsync(dir);
        }
      }
    }

    // Phase 3: Discover JSON table files (async)
    if (explicitDir === null) {
      await ds.findTableToJsonFilesAsync();
    } else {
      for (const p of explicitDir.jsonFileDirs) {
        await ds.findOneTableJsonFilesInDirAsync(pathJoin(rootDir, p));
      }
    }

    return ds;
  }

  /** Async reload — same as reload() but uses CfgFileSystem abstraction. */
  async reloadAsync(): Promise<DirectoryStructure> {
    return DirectoryStructure.createAsync(this.rootDir, this.explicitDir);
  }

  /** Async updateExcelFileLastModified — uses CfgFileSystem.lastModified. */
  async updateExcelFileLastModifiedAsync(relativeExcelPath: string): Promise<void> {
    const key = relativeExcelPath;
    const oldInfo = this.excelFiles.get(key);
    if (oldInfo === undefined) {
      return;
    }
    const lastModified = await getDefaultFileSystem().lastModified(oldInfo.path);
    const newInfo: ExcelFileInfo = {
      lastModified,
      path: oldInfo.path,
      relativePath: relativeExcelPath,
      fmt: oldInfo.fmt,
      nullableAddTag: oldInfo.nullableAddTag,
    };
    const tmp = new Map(this.excelFiles);
    tmp.set(key, newInfo);
    this.excelFiles = tmp;
  }

  getRootDir(): string {
    return this.rootDir;
  }

  getExplicitDir(): ExplicitDir | null {
    return this.explicitDir;
  }

  getCfgFiles(): CfgFileInfo[] {
    return Array.from(this.cfgFiles.values())
      .sort((a, b) => a.pkgNameDot.localeCompare(b.pkgNameDot));
  }

  getCfgFilePathByPkgName(pkgName: string): string | null {
    const pkgNameDot = pkgName.length === 0 ? '' : pkgName + '.';
    for (const c of this.cfgFiles.values()) {
      if (c.pkgNameDot === pkgNameDot) {
        return c.path;
      }
    }
    return null;
  }

  getExcelFiles(): ExcelFileInfo[] {
    return Array.from(this.excelFiles.values());
  }

  // -- JsonTableFiles interface --

  jsonFilesOf(tableName: string): JsonFileInfo[] {
    return this.getJsonFilesByTable(tableName);
  }

  getJsonFilesByTable(tableName: string): JsonFileInfo[] {
    const list = this.jsonFiles.get(tableName);
    return list === undefined ? [] : list.list;
  }

  getJsonTableDir(tableName: string): string | null {
    const list = this.jsonFiles.get(tableName);
    return list === undefined ? null : list.tableDirRelativePath;
  }

  // ---- Private: File scanning methods ----

  private findExcelFilesRecursively(dir: string): void {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      if (isFileIgnored(fullPath)) {
        continue;
      }

      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const codeName = getCodeName(entry);
        if (codeName === null) {
          continue;
        }
        this.findExcelFilesRecursively(fullPath);
      } else if (stat.isFile()) {
        const fmt = getFileFormat(fullPath);
        if (fmt === null) {
          continue;
        }
        const relativePath = path.relative(this.rootDir, fullPath);
        const lastModified = stat.mtimeMs;
        switch (fmt) {
          case FileFmt.CSV: {
            const codeName = getCodeName(entry);
            if (codeName === null) {
              continue;
            }
            this.excelFiles.set(relativePath, {
              lastModified,
              path: fullPath,
              relativePath,
              fmt: FileFmt.CSV,
              nullableAddTag: null,
            });
            break;
          }
          case FileFmt.EXCEL: {
            this.excelFiles.set(relativePath, {
              lastModified,
              path: fullPath,
              relativePath,
              fmt: FileFmt.EXCEL,
              nullableAddTag: null,
            });
            break;
          }
          default:
            break;
        }
      }
    }
  }

  private findTxtAsTsvFiles(dir: string, nullableAddTag: string | null): void {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      if (isFileIgnored(fullPath)) {
        continue;
      }
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) {
        continue;
      }
      const fmt = getFileFormat(fullPath);
      if (fmt !== FileFmt.TXT_AS_TSV) {
        continue;
      }
      // For txt-as-tsv, relative path is just the filename (treated as rootDir)
      const relativePath = entry;
      const codeName = getCodeName(relativePath);
      if (codeName === null) {
        continue;
      }
      this.excelFiles.set(relativePath, {
        lastModified: stat.mtimeMs,
        path: fullPath,
        relativePath,
        fmt: FileFmt.TXT_AS_TSV,
        nullableAddTag,
      });
    }
  }

  private findTableToJsonFiles(): void {
    // tableName → absolute path, for conflict detection
    const discovered: Map<string, string> = new Map();

    const entries = fs.readdirSync(this.rootDir);
    for (const entry of entries) {
      const fullPath = path.join(this.rootDir, entry);
      if (isFileIgnored(fullPath)) {
        continue;
      }
      const stat = fs.statSync(fullPath);
      if (!stat.isDirectory()) {
        continue;
      }

      const dirName = entry;

      // 1. Old format: root-level _xxx directory (e.g., _skill_buff)
      const tableName = getTableNameIfTableDirForJson(dirName);
      if (tableName !== null) {
        const existing = discovered.get(tableName);
        if (existing !== undefined) {
          throw new Error(
            `JSON table directory conflict for table '${tableName}': both '${existing}' and '${fullPath}' exist`,
          );
        }
        discovered.set(tableName, fullPath);
        let list = this.jsonFiles.get(tableName);
        if (list === undefined) {
          list = new JsonFileList();
          this.jsonFiles.set(tableName, list);
        }
        this.findOneTableJsonFiles(fullPath, list);
        continue;
      }

      // 2. New format: module directory with _sub directories
      const codeName = getCodeName(dirName);
      if (codeName !== null) {
        this.findNestedJsonTableFiles(fullPath, codeName, discovered);
      }
    }
  }

  private findNestedJsonTableFiles(
    moduleDir: string,
    pkgNameDot: string,
    discovered: Map<string, string>,
  ): void {
    const entries = fs.readdirSync(moduleDir);
    for (const entry of entries) {
      const subPath = path.join(moduleDir, entry);
      if (isFileIgnored(subPath)) {
        continue;
      }
      const stat = fs.statSync(subPath);
      if (!stat.isDirectory()) {
        continue;
      }

      const subDirName = entry;

      // Check if it's a JSON table subdirectory (_ prefix)
      const subTableName = getSubTableNameIfJsonSubDir(subDirName);
      if (subTableName !== null) {
        const fullTableName = pkgNameDot + '.' + subTableName;
        const existing = discovered.get(fullTableName);
        if (existing !== undefined) {
          throw new Error(
            `JSON table directory conflict for table '${fullTableName}': both '${existing}' and '${subPath}' exist`,
          );
        }
        discovered.set(fullTableName, subPath);
        let list = this.jsonFiles.get(fullTableName);
        if (list === undefined) {
          list = new JsonFileList();
          this.jsonFiles.set(fullTableName, list);
        }
        this.findOneTableJsonFiles(subPath, list);
        continue;
      }

      // Recurse into deeper module directories
      const subCodeName = getCodeName(subDirName);
      if (subCodeName !== null) {
        this.findNestedJsonTableFiles(subPath, pkgNameDot + '.' + subCodeName, discovered);
      }
    }
  }

  private findOneTableJsonFilesInDir(dirPath: string): void {
    if (isFileIgnored(dirPath)) {
      return;
    }
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      return;
    }

    const dirName = path.basename(dirPath);
    const tableName = getTableNameIfTableDirForJson(dirName);
    if (tableName === null) {
      return;
    }

    let list = this.jsonFiles.get(tableName);
    if (list === undefined) {
      list = new JsonFileList();
      this.jsonFiles.set(tableName, list);
    }
    this.findOneTableJsonFiles(dirPath, list);
  }

  private findOneTableJsonFiles(tableDir: string, list: JsonFileList): void {
    list.tableDirRelativePath = path.relative(this.rootDir, tableDir);
    const entries = fs.readdirSync(tableDir);
    for (const entry of entries) {
      const fullPath = path.join(tableDir, entry);
      if (isFileIgnored(fullPath)) {
        continue;
      }
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) {
        continue;
      }

      if (!entry.endsWith('.json')) {
        continue;
      }

      const relativePath = path.relative(this.rootDir, fullPath);
      const absPath = getDefaultFileSystem().resolvePath(fullPath);
      list.addFile(JsonFileInfo.of(absPath, relativePath));
    }
    list.sort();
  }

  // ---- Async file scanning methods (via CfgFileSystem) ----

  private async isDirectory(dirPath: string): Promise<boolean> {
    return getDefaultFileSystem().isDirectory(dirPath);
  }

  private async findExcelFilesRecursivelyAsync(dir: string): Promise<void> {
    const dfs = getDefaultFileSystem();
    const entries = await dfs.readDir(dir);
    for (const entry of entries) {
      const fullPath = pathJoin(dir, entry);
      if (isFileIgnored(fullPath)) {
        continue;
      }

      if (await dfs.isDirectory(fullPath)) {
        const codeName = getCodeName(entry);
        if (codeName === null) {
          continue;
        }
        await this.findExcelFilesRecursivelyAsync(fullPath);
      } else if (await dfs.isFile(fullPath)) {
        const fmt = getFileFormat(fullPath);
        if (fmt === null) {
          continue;
        }
        const relativePath = pathRelative(this.rootDir, fullPath);
        const lastModified = await dfs.lastModified(fullPath);
        switch (fmt) {
          case FileFmt.CSV: {
            const codeName = getCodeName(entry);
            if (codeName === null) {
              continue;
            }
            this.excelFiles.set(relativePath, {
              lastModified,
              path: fullPath,
              relativePath,
              fmt: FileFmt.CSV,
              nullableAddTag: null,
            });
            break;
          }
          case FileFmt.EXCEL: {
            this.excelFiles.set(relativePath, {
              lastModified,
              path: fullPath,
              relativePath,
              fmt: FileFmt.EXCEL,
              nullableAddTag: null,
            });
            break;
          }
          default:
            break;
        }
      }
    }
  }

  private async findTxtAsTsvFilesAsync(dir: string, nullableAddTag: string | null): Promise<void> {
    const dfs = getDefaultFileSystem();
    const entries = await dfs.readDir(dir);
    for (const entry of entries) {
      const fullPath = pathJoin(dir, entry);
      if (isFileIgnored(fullPath)) {
        continue;
      }
      if (!(await dfs.isFile(fullPath))) {
        continue;
      }
      const fmt = getFileFormat(fullPath);
      if (fmt !== FileFmt.TXT_AS_TSV) {
        continue;
      }
      const relativePath = entry;
      const codeName = getCodeName(relativePath);
      if (codeName === null) {
        continue;
      }
      this.excelFiles.set(relativePath, {
        lastModified: await dfs.lastModified(fullPath),
        path: fullPath,
        relativePath,
        fmt: FileFmt.TXT_AS_TSV,
        nullableAddTag,
      });
    }
  }

  private async findTableToJsonFilesAsync(): Promise<void> {
    const dfs = getDefaultFileSystem();
    const discovered: Map<string, string> = new Map();

    const entries = await dfs.readDir(this.rootDir);
    for (const entry of entries) {
      const fullPath = pathJoin(this.rootDir, entry);
      if (isFileIgnored(fullPath)) {
        continue;
      }
      if (!(await dfs.isDirectory(fullPath))) {
        continue;
      }

      const dirName = entry;

      // 1. Old format: root-level _xxx directory
      const tableName = getTableNameIfTableDirForJson(dirName);
      if (tableName !== null) {
        const existing = discovered.get(tableName);
        if (existing !== undefined) {
          throw new Error(
            `JSON table directory conflict for table '${tableName}': both '${existing}' and '${fullPath}' exist`,
          );
        }
        discovered.set(tableName, fullPath);
        let list = this.jsonFiles.get(tableName);
        if (list === undefined) {
          list = new JsonFileList();
          this.jsonFiles.set(tableName, list);
        }
        await this.findOneTableJsonFilesAsync(fullPath, list);
        continue;
      }

      // 2. New format: module directory with _sub directories
      const codeName = getCodeName(dirName);
      if (codeName !== null) {
        await this.findNestedJsonTableFilesAsync(fullPath, codeName, discovered);
      }
    }
  }

  private async findNestedJsonTableFilesAsync(
    moduleDir: string,
    pkgNameDot: string,
    discovered: Map<string, string>,
  ): Promise<void> {
    const dfs = getDefaultFileSystem();
    const entries = await dfs.readDir(moduleDir);
    for (const entry of entries) {
      const subPath = pathJoin(moduleDir, entry);
      if (isFileIgnored(subPath)) {
        continue;
      }
      if (!(await dfs.isDirectory(subPath))) {
        continue;
      }

      const subDirName = entry;

      const subTableName = getSubTableNameIfJsonSubDir(subDirName);
      if (subTableName !== null) {
        const fullTableName = pkgNameDot + '.' + subTableName;
        const existing = discovered.get(fullTableName);
        if (existing !== undefined) {
          throw new Error(
            `JSON table directory conflict for table '${fullTableName}': both '${existing}' and '${subPath}' exist`,
          );
        }
        discovered.set(fullTableName, subPath);
        let list = this.jsonFiles.get(fullTableName);
        if (list === undefined) {
          list = new JsonFileList();
          this.jsonFiles.set(fullTableName, list);
        }
        await this.findOneTableJsonFilesAsync(subPath, list);
        continue;
      }

      const subCodeName = getCodeName(subDirName);
      if (subCodeName !== null) {
        await this.findNestedJsonTableFilesAsync(subPath, pkgNameDot + '.' + subCodeName, discovered);
      }
    }
  }

  private async findOneTableJsonFilesInDirAsync(dirPath: string): Promise<void> {
    const dfs = getDefaultFileSystem();
    if (isFileIgnored(dirPath)) {
      return;
    }
    if (!(await dfs.isDirectory(dirPath))) {
      return;
    }

    const dirName = pathBasename(dirPath);
    const tableName = getTableNameIfTableDirForJson(dirName);
    if (tableName === null) {
      return;
    }

    let list = this.jsonFiles.get(tableName);
    if (list === undefined) {
      list = new JsonFileList();
      this.jsonFiles.set(tableName, list);
    }
    await this.findOneTableJsonFilesAsync(dirPath, list);
  }

  private async findOneTableJsonFilesAsync(tableDir: string, list: JsonFileList): Promise<void> {
    const dfs = getDefaultFileSystem();
    list.tableDirRelativePath = pathRelative(this.rootDir, tableDir);
    const entries = await dfs.readDir(tableDir);
    for (const entry of entries) {
      const fullPath = pathJoin(tableDir, entry);
      if (isFileIgnored(fullPath)) {
        continue;
      }
      if (!(await dfs.isFile(fullPath))) {
        continue;
      }

      if (!entry.endsWith('.json')) {
        continue;
      }

      const relativePath = pathRelative(this.rootDir, fullPath);
      const absPath = getDefaultFileSystem().resolvePath(fullPath);
      list.addFile(await JsonFileInfo.ofAsync(absPath, relativePath));
    }
    list.sort();
  }

  addJsonFile(tableName: string, relativeJsonPath: string): JsonFileInfo {
    const tmp = this.copyJsonFiles(tableName);
    let list = tmp.get(tableName);
    if (list === undefined) {
      list = new JsonFileList();
      tmp.set(tableName, list);
    }
    const fullPath = getDefaultFileSystem().resolvePath(this.rootDir, relativeJsonPath);
    const jf = JsonFileInfo.of(fullPath, relativeJsonPath);
    list.addFile(jf);
    list.sort();
    this.jsonFiles = tmp;
    return jf;
  }

  removeJsonFile(tableName: string, relativeJsonPath: string): void {
    const tmp = this.copyJsonFiles(tableName);
    const list = tmp.get(tableName);
    if (list === undefined) {
      return;
    }
    const jf = list.removeFile(relativeJsonPath);
    if (jf === undefined) {
      return;
    }
    list.sort();
    this.jsonFiles = tmp;
  }

  updateExcelFileLastModified(relativeExcelPath: string): void {
    const key = relativeExcelPath;
    const oldInfo = this.excelFiles.get(key);
    if (oldInfo === undefined) {
      return;
    }
    const stat = fs.statSync(oldInfo.path);
    const newInfo: ExcelFileInfo = {
      lastModified: stat.mtimeMs,
      path: oldInfo.path,
      relativePath: relativeExcelPath,
      fmt: oldInfo.fmt,
      nullableAddTag: oldInfo.nullableAddTag,
    };
    const tmp = new Map(this.excelFiles);
    tmp.set(key, newInfo);
    this.excelFiles = tmp;
  }

  // ---- Private helpers ----

  private copyJsonFiles(changedTable: string): Map<string, JsonFileList> {
    const copy: Map<string, JsonFileList> = new Map();
    for (const [key, list] of this.jsonFiles) {
      copy.set(key, key === changedTable ? list.copy() : list);
    }
    return copy;
  }

  lastModifiedEquals(other: DirectoryStructure): boolean {
    if (other === null || other === undefined) {
      throw new Error('other must not be null');
    }

    if (this.cfgFiles.size !== other.cfgFiles.size) {
      return false;
    }
    if (this.excelFiles.size !== other.excelFiles.size) {
      return false;
    }
    if (this.jsonFiles.size !== other.jsonFiles.size) {
      return false;
    }

    // Compare json files
    for (const [tableName, list1] of this.jsonFiles) {
      const list2 = other.jsonFiles.get(tableName);
      if (list2 === undefined) {
        return false;
      }
      const j1 = list1.list;
      const j2 = list2.list;
      if (j1.length !== j2.length) {
        return false;
      }
      for (let i = 0; i < j1.length; i++) {
        if (j1[i].lastModified !== j2[i].lastModified) {
          return false;
        }
      }
    }

    // Compare cfg files
    for (const [key, f1] of this.cfgFiles) {
      const f2 = other.cfgFiles.get(key);
      if (f2 === undefined) {
        return false;
      }
      if (f1.lastModified !== f2.lastModified) {
        return false;
      }
    }

    // Compare excel files
    for (const [key, f1] of this.excelFiles) {
      const f2 = other.excelFiles.get(key);
      if (f2 === undefined) {
        return false;
      }
      if (f1.lastModified !== f2.lastModified) {
        return false;
      }
    }

    return true;
  }
}
