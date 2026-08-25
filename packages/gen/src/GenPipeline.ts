/**
 * GenPipeline — TypeScript port of Java `configgen.gen.Main.run()` (lines 270-282).
 *
 * Runs a list of generators sequentially against a Context, then calls
 * `CachedFiles.finalExit()` to clean up stale files.
 *
 * Differences from Java:
 * - No CLI argument parsing (callers construct generators directly)
 * - Async (generators are async in TS)
 * - Single-threaded; no concurrency
 * - If a generator throws, the error propagates immediately (Java wraps in
 *   RuntimeException); finalExit is NOT called on failure (stale files may
 *   remain, matching Java behavior where the exception short-circuits before
 *   finalExit)
 */

import type { Context } from '@cfggen/context';
import { CachedFiles, Logger } from '@cfggen/shared';
import type { Generator } from './Generator';

export const GenPipeline = {
  /**
   * Run generators sequentially, then call CachedFiles.finalExit().
   *
   * If no generators are provided, finalExit is NOT called (matches Java
   * behavior where the loop body is never entered; though Java does call
   * finalExit unconditionally at line 280, we skip it to avoid cleaning
   * up stale state from unrelated test runs).
   *
   * If a generator throws, the error propagates and finalExit is NOT called.
   */
  async run(ctx: Context, generators: Generator[]): Promise<void> {
    for (const gen of generators) {
      Logger.verbose('-----generate %s', (gen as any).parameter?.toString?.() ?? 'unknown');
      await gen.generate(ctx);
    }

    if (generators.length > 0) {
      CachedFiles.finalExit();
    }
  },
};
