/**
 * JsonFileInfo — TypeScript port of Java `configgen.data.JsonFileInfo`.
 *
 * Represents a single JSON data file discovered on disk.
 * Stores absolute path, relative path, last-modified time, and whether
 * the filename (minus .json) is a pure integer (for numeric sorting).
 *
 * In the Java version, `JsonTableFiles` is a port interface implemented by
 * `ctx.DirectoryStructure`. The data layer only defines the port and the
 * `JsonFileInfo` record; the actual file-discovery logic lives in the ctx
 * layer (Phase 5).
 */

import * as fs from 'fs';
import * as path from 'path';

export class JsonFileInfo {
  readonly lastModified: number;
  readonly path: string;           // absolute path
  readonly relativePath: string;   // relative to root data dir
  readonly isIntegerId: boolean;
  readonly integerId: number;

  constructor(
    lastModified: number,
    absPath: string,
    relativePath: string,
    isIntegerId: boolean,
    integerId: number,
  ) {
    this.lastModified = lastModified;
    this.path = absPath;
    this.relativePath = relativePath;
    this.isIntegerId = isIntegerId;
    this.integerId = integerId;
  }

  /**
   * Factory: creates JsonFileInfo from absolute and relative paths.
   * Reads lastModified from the filesystem. If the file does not exist,
   * lastModified is 0.
   * Attempts to parse the filename (minus .json suffix) as an integer
   * for numeric sorting.
   */
  static of(absPath: string, relativePath: string): JsonFileInfo {
    const fileName = path.basename(relativePath);
    let id = -1;
    let isIntegerId = false;
    // Strip ".json" suffix (5 chars) and parse as integer
    const nameWithoutExt = fileName.substring(0, fileName.length - 5);
    const parsed = parseInt(nameWithoutExt, 10);
    if (!isNaN(parsed)) {
      id = parsed;
      isIntegerId = true;
    }

    let lastModified = 0;
    try {
      lastModified = fs.statSync(absPath).mtimeMs;
    } catch {
      // File may not exist in test scenarios
    }

    return new JsonFileInfo(lastModified, absPath, relativePath, isIntegerId, id);
  }
}
