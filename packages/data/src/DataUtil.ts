/**
 * DataUtil — TypeScript port of Java `configgen.data.DataUtil`.
 *
 * File format detection, table name extraction, and JSON directory helpers.
 */

import * as path from 'path';
import { getCodeName } from '@cfggen/shared';

// ---------------------------------------------------------------------------
// FileFmt
// ---------------------------------------------------------------------------

export enum FileFmt {
  TXT_AS_TSV,
  CSV,
  EXCEL,
  CFG,
  JSON,
}

export function getFileFormat(filePath: string): FileFmt | null {
  const fileName = path.basename(filePath);
  const ext = path.extname(fileName).slice(1).toLowerCase();
  switch (ext) {
    case 'txt': return FileFmt.TXT_AS_TSV;
    case 'csv': return FileFmt.CSV;
    case 'xls':
    case 'xlsx': return FileFmt.EXCEL;
    case 'cfg': return FileFmt.CFG;
    case 'json': return FileFmt.JSON;
    default: return null;
  }
}

export function isFileIgnored(filePath: string): boolean {
  const fileName = path.basename(filePath);
  return fileName.startsWith('~') || fileName.startsWith('.');
}

// ---------------------------------------------------------------------------
// TableNameIndex
// ---------------------------------------------------------------------------

export class TableNameIndex {
  readonly tableName: string;
  readonly index: number;

  constructor(tableName: string, index: number) {
    this.tableName = tableName;
    this.index = index;
  }
}

/**
 * Extract table name and index from a relative file path (for CSV)
 * or from a file path + sheet name (for Excel).
 *
 * The path components are converted to code names via FileNameUtil.getCodeName.
 * A trailing "_N" suffix is parsed as an index for multi-file/multi-sheet tables.
 *
 * Returns null if any path component has an invalid code name.
 */
export function getTableNameIndex(filePath: string): TableNameIndex | null;
export function getTableNameIndex(filePath: string, sheetName: string): TableNameIndex | null;
export function getTableNameIndex(filePath: string, sheetName?: string): TableNameIndex | null {
  // If sheetName provided, resolve relative to filePath's parent
  let targetPath: string;
  if (sheetName !== undefined) {
    const dir = path.dirname(filePath);
    targetPath = path.join(dir, sheetName);
  } else {
    targetPath = filePath;
  }

  // Split path into components and convert each to code name
  const parts = targetPath.split(/[\\/]/).filter((p) => p.length > 0);
  const codeNames: string[] = [];
  for (const part of parts) {
    const codeName = getCodeName(part);
    if (codeName === null) {
      return null;
    }
    codeNames.push(codeName);
  }

  const fullName = codeNames.join('.');

  // Parse trailing _N as index
  const i = fullName.lastIndexOf('_');
  if (i < 0) {
    return new TableNameIndex(fullName.trim(), 0);
  } else {
    const postfix = fullName.slice(i + 1).trim();
    const parsed = parseInt(postfix, 10);
    if (!isNaN(parsed)) {
      return new TableNameIndex(fullName.slice(0, i).trim(), parsed);
    } else {
      return new TableNameIndex(fullName.trim(), 0);
    }
  }
}

// ---------------------------------------------------------------------------
// JSON directory helpers
// ---------------------------------------------------------------------------

export function getJsonTableDirName(tableName: string): string {
  return '_' + tableName.replace(/\./g, '_');
}

export function getTableNameIfTableDirForJson(dirName: string): string | null {
  const sub = subTableNameIfJsonDir(dirName);
  if (sub === null) return null;
  return sub.replace(/_/g, '.');
}

export function getSubTableNameIfJsonSubDir(subDirName: string): string | null {
  return subTableNameIfJsonDir(subDirName);
}

export function isTableDirForJson(dirName: string): boolean {
  return subTableNameIfJsonDir(dirName) !== null;
}

function subTableNameIfJsonDir(dirName: string): string | null {
  if (!dirName.startsWith('_')) {
    return null;
  }
  const sub = dirName.slice(1);
  if (sub.length === 0 || isFirstNotAzChar(sub)) {
    return null;
  }
  // Cannot contain Chinese characters
  const hanIdx = findFirstHanIndex(sub);
  if (hanIdx !== -1) {
    return null;
  }
  return sub;
}

// These are re-exported from shared, but DataUtil in Java had them inline.
// Importing directly from shared would create a circular dependency,
// so we re-implement the minimal check here.
import { isFirstNotAzChar, findFirstHanIndex } from '@cfggen/shared';
