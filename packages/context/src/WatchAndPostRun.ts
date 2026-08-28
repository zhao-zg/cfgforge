/**
 * WatchAndPostRun — TypeScript port of Java `configgen.gen.WatchAndPostRun`.
 *
 * Coordinates file watching with context reload and post-run hooks.
 * When files change, the WaitWatcher waits for quiet, then:
 * 1. Reloads DirectoryStructure
 * 2. If changed, creates a new Context (async)
 * 3. Notifies all registered PostRunCallbacks
 *
 * Key differences from Java:
 * - Java uses enum singleton; TS uses a class (can be instantiated).
 * - Java's `reloadData` calls `new Context(cfg, structure)` synchronously;
 *   TS must call `Context.createWithStructure(cfg, structure)` (async).
 * - Java spawns virtual threads for bat execution; TS uses setImmediate/
 *   process.nextTick for the async callback chain.
 * - Java's bat parsing (running -gen commands from .bat/.sh files) is
 *   omitted in TS — that logic belongs to the gen package, not context.
 *
 * Java source: configgen.gen.WatchAndPostRun.java (256 lines)
 */

import { Context } from './Context.js';
import { Watcher } from './Watcher.js';
import { WaitWatcher } from './WaitWatcher.js';

export interface PostRunCallback {
  onNewContextLoaded(newContext: Context): void;
}

export class WatchAndPostRun {
  private _started = false;
  private readonly _postRunCallbacks: PostRunCallback[] = [];
  private _context: Context | null = null;
  private _watcher: Watcher | null = null;
  private _waitWatcher: WaitWatcher | null = null;
  private _consecutiveAutoFixReloads = 0;
  private static readonly MAX_CONSECUTIVE_AUTO_FIX_RELOADS = 3;

  get context(): Context | null {
    return this._context;
  }

  get isStarted(): boolean {
    return this._started;
  }

  /**
   * Start watching for file changes.
   * Multiple calls with the same context are ignored (idempotent).
   */
  startWatch(context: Context, waitSecondsAfterWatchEvt: number): void {
    if (this._started) {
      return;
    }
    if (waitSecondsAfterWatchEvt < 0) {
      return;
    }
    this._context = context;
    this._started = true;
    this._consecutiveAutoFixReloads = 0;

    const ss = context.sourceStructure();
    this._watcher = new Watcher(ss.getRootDir(), ss.getExplicitDir());
    this._waitWatcher = new WaitWatcher(
      this._watcher,
      () => { this.reloadData(); },
      waitSecondsAfterWatchEvt * 1000,
    );
    this._waitWatcher.start();
    this._watcher.start();
  }

  stopWatch(): void {
    if (this._waitWatcher !== null) {
      this._waitWatcher.stop();
      this._waitWatcher = null;
    }
    if (this._watcher !== null) {
      this._watcher.stop();
      this._watcher = null;
    }
    this._started = false;
  }

  registerPostRunCallback(callback: PostRunCallback): void {
    if (callback === null) return;
    this._postRunCallbacks.push(callback);
  }

  /**
   * Reload data after file changes detected.
   * This is called from the WaitWatcher timer (synchronous entry, async body).
   */
  private reloadData(): void {
    const cur = this._context;
    if (cur === null) return;

    const newStructure = cur.sourceStructure().reload();
    if (newStructure.lastModifiedEquals(cur.sourceStructure())) {
      return;
    }

    // Async context creation — fire and forget
    Context.createWithStructure(cur.contextCfg(), newStructure)
      .then((newContext) => {
        if (newContext.lastLoadDidAutoFix()) {
          this._consecutiveAutoFixReloads++;
          if (this._consecutiveAutoFixReloads >= WatchAndPostRun.MAX_CONSECUTIVE_AUTO_FIX_RELOADS) {
            this.stopWatch();
            return;
          }
        } else {
          this._consecutiveAutoFixReloads = 0;
        }
        this._context = newContext;
        this.onNewContextReloaded();
      })
      .catch((e) => {
        // Reload failed — keep current context, log error
        // eslint-disable-next-line no-console
        console.error('reload context ignored:', e);
      });
  }

  private onNewContextReloaded(): void {
    for (const callback of this._postRunCallbacks) {
      try {
        callback.onNewContextLoaded(this._context!);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('failed to run post run task:', e);
      }
    }
  }
}
