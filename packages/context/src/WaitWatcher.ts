/**
 * WaitWatcher — TypeScript port of Java `configgen.ctx.WaitWatcher`.
 *
 * Polls a Watcher's event flag. When events stop arriving for
 * `waitMillisAfterWatchEvt`, triggers the listener (reloadData).
 *
 * Key differences from Java:
 * - Java uses a virtual thread + Thread.sleep; TS uses setInterval.
 * - Java interrupts thread to stop; TS clears the interval.
 *
 * Java source: configgen.ctx.WaitWatcher.java (100 lines)
 */

import type { Watcher } from './Watcher';

export class WaitWatcher {
  private readonly _watcher: Watcher;
  private readonly _listener: () => void;
  private readonly _waitMillisAfterWatchEvt: number;
  private readonly _sleepMillis: number;

  private _lastEvtMillis = 0;
  private _evtVersion = 0;
  private _timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    watcher: Watcher,
    listener: () => void,
    waitMillisAfterWatchEvt: number,
    sleepMillis: number = 100,
  ) {
    if (!watcher) throw new Error('watcher must not be null');
    if (!listener) throw new Error('listener must not be null');
    if (waitMillisAfterWatchEvt <= 0) {
      throw new Error('waitMillisAfterWatchEvt must > 0');
    }
    if (sleepMillis <= 0) {
      throw new Error('sleepMillis must > 0');
    }
    this._watcher = watcher;
    this._listener = listener;
    this._waitMillisAfterWatchEvt = waitMillisAfterWatchEvt;
    this._sleepMillis = sleepMillis;
  }

  start(): void {
    if (this._timer !== null) {
      throw new Error('already started');
    }
    this._evtVersion = this._watcher.getEventVersion();
    this._lastEvtMillis = this._watcher.getLastEventMillis();

    this._timer = setInterval(() => {
      this.tick();
    }, this._sleepMillis);
  }

  stop(): void {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  private tick(): void {
    const version = this._watcher.getEventVersion();
    if (version !== this._evtVersion) {
      this._evtVersion = version;
      this._lastEvtMillis = this._watcher.getLastEventMillis();
    } else if (this._lastEvtMillis > 0) {
      if (Date.now() - this._lastEvtMillis >= this._waitMillisAfterWatchEvt) {
        this._lastEvtMillis = 0;
        try {
          this._listener();
        } catch (e) {
          // listener exception must not kill the polling timer
          // (same behavior as Java: catch and log)
          // eslint-disable-next-line no-console
          console.error('WaitWatcher listener error:', e);
        }
      }
    }
  }
}
