/**
 * CfgSchemas — TypeScript port of Java `configgen.schema.CfgSchemas`.
 *
 * Static utility class for reading multiple .cfg files and merging them
 * into a single CfgSchema, and writing a CfgSchema back to multiple files.
 *
 * In Java, reading uses a work-stealing thread pool for parallel parsing.
 * In TypeScript, parsing is synchronous (CPU-bound string processing),
 * so we parse sequentially. Worker threads can be added later if needed.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CfgSchema } from './CfgSchema';
import { CfgReader } from './cfg/CfgReader';
import { CfgWriter } from './cfg/CfgWriter';
import { CfgUtil } from './cfg/CfgUtil';
import { CachedFiles } from '@cfggen/shared';
import type { Nameable } from './Nameable';

// ---------------------------------------------------------------------------
// CfgFileInfo — TypeScript port of Java record CfgFileInfo
// ---------------------------------------------------------------------------

export interface CfgFileInfo {
  readonly lastModified: number;
  readonly path: string;
  readonly relativePath: string;
  readonly pkgNameDot: string;
  /** File content (added for TS: Java reads from disk, we pass content) */
  readonly content: string;
}

// ---------------------------------------------------------------------------
// CfgSchemas
// ---------------------------------------------------------------------------

export class CfgSchemas {

  /**
   * Read multiple .cfg files and merge into a single CfgSchema.
   *
   * Each file is parsed independently, then items and fileEndComments
   * are merged into the destination schema.
   *
   * Order is preserved: items are added in the order files are provided.
   */
  static readFromDir(cfgFiles: CfgFileInfo[]): CfgSchema {
    const destination = CfgSchema.of();
    const reader = new CfgReader();

    for (const c of cfgFiles) {
      const one = reader.read(c.content, c.pkgNameDot, c.path);
      for (const n of one.items()) {
        destination.add(n);
      }
      for (const [key, value] of one.fileEndComments()) {
        destination.setFileEndComment(key, value);
      }
    }

    return destination;
  }

  /**
   * Write a CfgSchema to a directory, splitting by namespace.
   *
   * Each namespace is written to its own .cfg file, with the directory
   * structure mirroring the namespace hierarchy.
   *
   * Java uses CachedFiles.writeFile for incremental writes (skip if content
   * unchanged). TS uses the same CachedFiles mechanism.
   */
  static writeToDir(destination: string, root: CfgSchema): void {
    const absoluteDst = path.resolve(destination);
    const modules = CfgUtil.separate(root);
    for (const [ns, cfg] of modules) {
      const dst = CfgUtil.getCfgFilePathByNamespace(ns, absoluteDst);
      CfgSchemas.writeToOneFile(dst, cfg);
    }
  }

  private static writeToOneFile(dst: string, cfg: CfgSchema): void {
    const content = CfgWriter.stringifyWithOptions(cfg, true, false);
    const data = Buffer.from(content, 'utf-8');
    CachedFiles.writeFile(dst, data);
  }

}
