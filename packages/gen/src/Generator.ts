/**
 * Generator — TypeScript port of Java `configgen.gen.Generator`.
 *
 * Abstract base class for all generators. Generators read their parameters
 * in the constructor (so the parameter contract is written only once), and
 * implement `generate(ctx)`.
 *
 * Differences from Java:
 * - `generate(ctx)` is async (Promise<void>), not `throws IOException`
 * - Java's `invokeAllAndWait(ExecutorService, List<Callable<T>>)` becomes
 *   the exported `invokeAllAndWait(tasks)` — TS is single-threaded;
 *   concurrency is via Promise.all, and unboxing semantics (rethrow original
 *   Error) are preserved.
 */

import type { Context } from '@cfgforge/context';
import type { Parameter } from './Parameter';

/**
 * Runs all tasks concurrently (Promise.all) and returns results in
 * submission order. Errors propagate as-is.
 */
export async function invokeAllAndWait<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
  return Promise.all(tasks.map((t) => t()));
}

export abstract class Generator {
  protected readonly parameter: Parameter;

  constructor(parameter: Parameter) {
    this.parameter = parameter;
  }

  abstract generate(ctx: Context): Promise<void>;

  /** Concurrency helper (see module-level invokeAllAndWait). */
  protected static invokeAllAndWait<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
    return invokeAllAndWait(tasks);
  }
}