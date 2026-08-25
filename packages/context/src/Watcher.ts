/**
 * Watcher — TypeScript port of Java `configgen.ctx.Watcher`.
 *
 * Monitors a directory tree for file changes and sets a flag (lastEvtMillis +
 * eventVersion) when relevant files are modified.
 *
 * Key differences from Java:
 * - Java uses WatchService (polling-based) + virtual thread; TS uses Node's
 *   built-in `fs.watch(rootDir, { recursive: true })` (event-driven, no
 *   polling needed for directory registration).
 * - Java has manual recursive registration fallback; Node v24 supports
 *   `recursive: true` natively on all platforms.
 * - Java uses volatile fields + AtomicInteger for thread safety; TS is
 *   single-threaded so plain fields suffice.
 *
 * Java source: configgen.ctx.Watcher.java (243 lines)
 */

import * as fs from 'fs';
import * as path from 'path';
import { getFileFormat, isFileIgnored, FileFmt, getTableNameIfTableDirForJson } from '@cfggen/data';
import type { ExplicitDir } from './ExplicitDir';

export class Watcher {
  private readonly _rootDir: string;
  private readonly _explicitDir: ExplicitDir | null;

  private _lastEvtMillis = 0;
  private _eventVersion = 0;
  private _watcher: fs.FSWatcher | null = null;
  private _stopped = false;

  constructor(rootDir: string, explicitDir: ExplicitDir | null) {
    if (!rootDir) throw new Error('rootDir must not be null');
    this._rootDir = rootDir;
    this._explicitDir = explicitDir;
  }

  start(): void {
    if (this._watcher !== null) return;

    try {
      this._watcher = fs.watch(this._rootDir, { recursive: true }, (eventType, filename) => {
        if (filename === null || this._stopped) return;
        this.handleFileEvent(filename);
      });
    } catch (e) {
      // Fallback: non-recursive watch (some platforms)
      this._watcher = fs.watch(this._rootDir, (eventType, filename) => {
        if (filename === null || this._stopped) return;
        this.handleFileEvent(filename);
      });
    }
  }

  stop(): void {
    this._stopped = true;
    if (this._watcher !== null) {
      this._watcher.close();
      this._watcher = null;
    }
  }

  getLastEventMillis(): number {
    return this._lastEvtMillis;
  }

  getEventVersion(): number {
    return this._eventVersion;
  }

  private trigger(): void {
    this._lastEvtMillis = Date.now();
    this._eventVersion++;
  }

  private handleFileEvent(relativePath: string): void {
    // Normalize to forward slashes
    const normalizedPath = relativePath.replace(/\\/g, '/');

    if (isFileIgnored(normalizedPath)) {
      return;
    }

    const fileName = path.basename(normalizedPath);
    const fmt = getFileFormat(fileName);
    if (fmt === null) {
      return;
    }

    switch (fmt) {
      case FileFmt.CSV:
      case FileFmt.EXCEL:
      case FileFmt.CFG: {
        if (this._explicitDir !== null) {
          const topDir = normalizedPath.split('/')[0];
          if (!this._explicitDir.excelFileDirs.has(topDir)) {
            return;
          }
        }
        break;
      }
      case FileFmt.JSON: {
        const parent = normalizedPath.includes('/')
          ? normalizedPath.substring(0, normalizedPath.lastIndexOf('/'))
          : '';
        if (!parent) return;
        const dirName = path.basename(parent);
        if (!getTableNameIfTableDirForJson(dirName)) {
          return;
        }
        if (this._explicitDir !== null && !this._explicitDir.jsonFileDirs.has(dirName)) {
          return;
        }
        break;
      }
      case FileFmt.TXT_AS_TSV: {
        if (this._explicitDir === null) return;
        const parent = normalizedPath.includes('/')
          ? normalizedPath.substring(0, normalizedPath.lastIndexOf('/'))
          : '';
        if (!parent) return;
        const dirName = path.basename(parent);
        if (!this._explicitDir.txtAsTsvFileInThisDirAsInRoot_To_AddTag_Map.has(dirName)) {
          return;
        }
        break;
      }
    }

    this.trigger();
  }
}
