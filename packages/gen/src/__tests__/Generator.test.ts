/**
 * Generator tests — T8.1
 *
 * Ported from Java configgen.gen.Generator.
 *
 * Differences from Java:
 * - `generate(ctx)` is async (returns Promise<void>), not throws IOException
 * - `invokeAllAndWait(pool, tasks)` maps to `invokeAllAndWait(tasks)` — TS is
 *   single-threaded, so parallel execution is achieved via Promise.all; the
 *   unboxing semantics (RuntimeException/Error rethrow) are preserved.
 */

import { describe, it, expect } from 'vitest';

import { invokeAllAndWait } from '../Generator';

describe('Generator.invokeAllAndWait', () => {
  it('returns results in task order', async () => {
    const results = await invokeAllAndWait([
      async () => 1,
      async () => 2,
      async () => 3,
    ]);
    expect(results).toEqual([1, 2, 3]);
  });

  it('runs tasks concurrently', async () => {
    const order: number[] = [];
    await invokeAllAndWait([
      async () => {
        await new Promise((r) => setTimeout(r, 30));
        order.push(1);
        return 1;
      },
      async () => {
        order.push(2);
        return 2;
      },
    ]);
    // Second task (fast) should complete before first (slow) finishes
    expect(order).toEqual([2, 1]);
  });

  it('rethrows Error from a failed task', async () => {
    const boom = new Error('boom');
    await expect(
      invokeAllAndWait([
        async () => 1,
        async () => {
          throw boom;
        },
      ]),
    ).rejects.toThrow('boom');
  });

  it('rethrows the original Error instance', async () => {
    const boom = new Error('boom');
    try {
      await invokeAllAndWait([
        async () => {
          throw boom;
        },
      ]);
      expect.unreachable();
    } catch (e) {
      expect(e).toBe(boom);
    }
  });
});