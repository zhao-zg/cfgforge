/**
 * CfgUtil — TypeScript port of Java `configgen.schema.cfg.CfgUtil`.
 *
 * Provides:
 * - separate(): split a CfgSchema by namespace into multiple CfgSchemas
 * - getCfgFilePathByNamespace(): map a namespace to a file path
 * - findConfigFilesRecursively(): recursively discover .cfg/.xml files
 * - isIdentifier(): check if a string is a valid identifier
 *
 * Key translations:
 * - Java Path → TS string (using Node path module)
 * - Java Files.list → fs.readdirSync
 * - Java Files.exists → fs.existsSync
 * - Java Files.isDirectory → fs.statSync().isDirectory()
 * - Java getCodeName → @cfgforge/shared FileNameUtil.getCodeName
 * - Java reads file from disk → TS reads content into CfgFileInfo for in-memory processing
 */

import * as fs from 'fs';
import * as path from 'path';
import { CfgSchema } from '../CfgSchema';
import { getCodeName, getDefaultFileSystem } from '@cfgforge/shared';
import { join as pathJoin, dirname as pathDirname, relative as pathRelative } from '@cfgforge/shared';
import type { CfgFileInfo } from '../CfgSchemas';

export class CfgUtil {

  // -------------------------------------------------------------------------
  // isIdentifier
  // -------------------------------------------------------------------------

  private static readonly identifierPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

  static isIdentifier(name: string): boolean {
    return CfgUtil.identifierPattern.test(name);
  }

  // -------------------------------------------------------------------------
  // separate — split CfgSchema by namespace
  // -------------------------------------------------------------------------

  /**
   * Split a root CfgSchema into multiple CfgSchemas, one per namespace.
   * Each separated CfgSchema contains only the items belonging to that namespace.
   * File end comments are transferred to the separated schemas (with empty key).
   */
  static separate(root: CfgSchema): Map<string, CfgSchema> {
    const cfgMap = new Map<string, CfgSchema>();

    for (const item of root.items()) {
      const ns = item.namespace();
      let cfg = cfgMap.get(ns);
      if (!cfg) {
        cfg = CfgSchema.of();
        cfgMap.set(ns, cfg);
      }
      cfg.add(item);
    }

    // Transfer fileEndComments to separated CfgSchemas.
    // After separation, each CfgSchema uses empty key (single-file scenario).
    for (const [ns, cfg] of cfgMap) {
      const fileEndComment = root.getFileEndComment(ns);
      if (fileEndComment.length > 0) {
        cfg.setFileEndComment('', fileEndComment);
      }
    }

    return cfgMap;
  }

  // -------------------------------------------------------------------------
  // getCfgFilePathByNamespace — map namespace to file path
  // -------------------------------------------------------------------------

  /**
   * Given a namespace and the root destination path, compute the .cfg file path.
   *
   * For empty namespace: returns absoluteTopDst itself (root config.cfg path).
   * For "equip": parent(equip) → /output/equip/equip.cfg
   * For "equip.weapon": /output/equip/weapon/weapon.cfg
   */
  static getCfgFilePathByNamespace(ns: string, absoluteTopDst: string): string {
    if (ns.length === 0) {
      return absoluteTopDst;
    }

    // Start from the parent directory of the root config path
    let cur = path.dirname(absoluteTopDst);

    let lastName = 'config';
    for (const name of ns.split('.')) {
      cur = CfgUtil.subDir(name, cur);
      lastName = name;
    }
    return path.join(cur, lastName + '.cfg');
  }

  /**
   * Find a subdirectory by name, or by matching getCodeName if exact name doesn't exist.
   * This allows Chinese-named directories (e.g. "ai_行为") to be matched by their
   * code name (e.g. "ai").
   */
  private static subDir(name: string, cur: string): string {
    const p = path.join(cur, name);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      return p;
    }

    // Try to find a directory whose getCodeName matches
    if (fs.existsSync(cur) && fs.statSync(cur).isDirectory()) {
      const entries = fs.readdirSync(cur);
      for (const fn of entries) {
        const fullPath = path.join(cur, fn);
        if (!fs.statSync(fullPath).isDirectory()) continue;
        const codeName = getCodeName(fn);
        if (codeName !== null && codeName === name) {
          return fullPath;
        }
      }
    }

    return p;
  }

  // -------------------------------------------------------------------------
  // findConfigFilesRecursively — discover .cfg/.xml files
  // -------------------------------------------------------------------------

  /**
   * Recursively find configuration files starting from a root file.
   *
   * Algorithm (ported from Java CfgUtil.findConfigFilesRecursively):
   * 1. If the source file exists, add it to cfgFiles with relativized path
   * 2. List the parent directory of source
   * 3. For each subdirectory:
   *    a. Skip if not a directory
   *    b. Skip if whiteListSubDirs is non-null and dir name not in it
   *    c. Convert dir name to codeName (handles Chinese suffixes)
   *    d. Skip if codeName is null (non-identifier first char)
   *    e. Look for {codeName}.{ext} inside the subdirectory
   *    f. Recurse with subPkgNameDot = pkgNameDot + codeName + "."
   *
   * TS addition: reads file content into CfgFileInfo.content (Java reads from disk).
   */
  static findConfigFilesRecursively(
    source: string,
    nullableWhiteListSubDirs: Set<string> | null,
    ext: string,
    pkgNameDot: string,
    rootDir: string,
    cfgFiles: Map<string, CfgFileInfo>,
  ): void {
    // Step 1: If source file exists, add it
    if (fs.existsSync(source) && fs.statSync(source).isFile()) {
      const relativizedSource = path.relative(rootDir, source);
      const content = fs.readFileSync(source, 'utf-8');
      const stat = fs.statSync(source);
      cfgFiles.set(relativizedSource, {
        lastModified: stat.mtimeMs,
        path: source,
        relativePath: relativizedSource,
        pkgNameDot: pkgNameDot,
        content: content,
      });
    }

    // Step 2: List parent directory and find subdirectories
    const parentDir = path.dirname(source);
    if (!fs.existsSync(parentDir) || !fs.statSync(parentDir).isDirectory()) {
      return;
    }

    const entries = fs.readdirSync(parentDir);
    for (const fn of entries) {
      const fullPath = path.join(parentDir, fn);

      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
        continue;
      }

      // WhiteListSubDirs filter (only for first level)
      if (nullableWhiteListSubDirs !== null &&
          !nullableWhiteListSubDirs.has(fn)) {
        continue;
      }

      // Get code name from directory name
      const lastDir = fn.toLowerCase();
      const subPkgName = getCodeName(lastDir);
      if (subPkgName === null) {
        continue;
      }

      // Look for {subPkgName}.{ext} inside the subdirectory
      const subSource = path.join(fullPath, subPkgName + '.' + ext);
      const subPkgNameDot = pkgNameDot + subPkgName + '.';

      // Recurse with null whiteListSubDirs (only first level uses filter)
      CfgUtil.findConfigFilesRecursively(
        subSource, null, ext, subPkgNameDot,
        rootDir, cfgFiles,
      );
    }
  }

  // -------------------------------------------------------------------------
  // findConfigFilesRecursivelyAsync — async variant via CfgFileSystem
  // -------------------------------------------------------------------------

  /**
   * Async version of findConfigFilesRecursively, using CfgFileSystem abstraction.
   * Used in Tauri WebView environment where fs is async-only.
   */
  static async findConfigFilesRecursivelyAsync(
    source: string,
    nullableWhiteListSubDirs: Set<string> | null,
    ext: string,
    pkgNameDot: string,
    rootDir: string,
    cfgFiles: Map<string, CfgFileInfo>,
  ): Promise<void> {
    const dfs = getDefaultFileSystem();

    // Step 1: If source file exists, add it
    if (await dfs.isFile(source)) {
      const relativizedSource = pathRelative(rootDir, source);
      const content = await dfs.readFile(source);
      const lastModified = await dfs.lastModified(source);
      cfgFiles.set(relativizedSource, {
        lastModified,
        path: source,
        relativePath: relativizedSource,
        pkgNameDot: pkgNameDot,
        content: new TextDecoder().decode(content),
      });
    }

    // Step 2: List parent directory and find subdirectories
    const parentDir = pathDirname(source);
    if (!(await dfs.isDirectory(parentDir))) {
      return;
    }

    const entries = await dfs.readDir(parentDir);
    for (const fn of entries) {
      const fullPath = pathJoin(parentDir, fn);

      if (!(await dfs.isDirectory(fullPath))) {
        continue;
      }

      // WhiteListSubDirs filter (only for first level)
      if (nullableWhiteListSubDirs !== null &&
          !nullableWhiteListSubDirs.has(fn)) {
        continue;
      }

      // Get code name from directory name
      const lastDir = fn.toLowerCase();
      const subPkgName = getCodeName(lastDir);
      if (subPkgName === null) {
        continue;
      }

      // Look for {subPkgName}.{ext} inside the subdirectory
      const subSource = pathJoin(fullPath, subPkgName + '.' + ext);
      const subPkgNameDot = pkgNameDot + subPkgName + '.';

      // Recurse with null whiteListSubDirs (only first level uses filter)
      await CfgUtil.findConfigFilesRecursivelyAsync(
        subSource, null, ext, subPkgNameDot,
        rootDir, cfgFiles,
      );
    }
  }
}
