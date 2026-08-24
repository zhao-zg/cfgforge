/**
 * CfgSchemas — TypeScript port of Java `configgen.schema.CfgSchemas`.
 *
 * Static utility class for reading multiple .cfg files and merging them
 * into a single CfgSchema.
 *
 * In Java, this uses a work-stealing thread pool for parallel parsing.
 * In TypeScript, parsing is synchronous (CPU-bound string processing),
 * so we parse sequentially. Worker threads can be added later if needed.
 *
 * writeToDir is deferred to T2.23 (depends on CfgUtil.separate).
 */

import { CfgSchema } from './CfgSchema';
import { CfgReader } from './cfg/CfgReader';
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

}
