/**
 * 日志工具：verbose 级别控制、profile 计时。
 * 原 Java: configgen.util.Logger
 */

export interface Printer {
  printf(fmt: string, ...args: any[]): void;
}

export const nullPrinter: Printer = {
  printf(_fmt: string, ..._args: any[]): void {
    // do nothing
  },
};

export function createPrinter(stream: { write: (s: string) => void }): Printer {
  return {
    printf(fmt: string, ...args: any[]): void {
      stream.write(args.length > 0 ? formatString(fmt, ...args) : fmt);
    },
  };
}

export function createPrinterSeq(...printers: Printer[]): Printer {
  return {
    printf(fmt: string, ...args: any[]): void {
      for (const p of printers) {
        p.printf(fmt, ...args);
      }
    },
  };
}

// Simple printf-like formatter (supports %s, %d, %f, %j)
function formatString(fmt: string, ...args: any[]): string {
  let result = '';
  let argIdx = 0;
  for (let i = 0; i < fmt.length; i++) {
    if (fmt[i] === '%' && i + 1 < fmt.length && argIdx < args.length) {
      const spec = fmt[i + 1];
      switch (spec) {
        case 's':
          result += String(args[argIdx++]);
          i++;
          break;
        case 'd':
          result += Math.trunc(args[argIdx++]);
          i++;
          break;
        case 'f': {
          const fmtSpec = fmt.match(/%\.?(\d*)f/);
          if (fmtSpec && fmtSpec[1]) {
            result += Number(args[argIdx++]).toFixed(parseInt(fmtSpec[1]));
            i += 1 + fmtSpec[1].length;
          } else {
            result += Number(args[argIdx++]);
            i++;
          }
          break;
        }
        case 'j':
          result += JSON.stringify(args[argIdx++]);
          i++;
          break;
        default:
          result += fmt[i];
      }
    } else {
      result += fmt[i];
    }
  }
  return result;
}

class LoggerImpl {
  private _verboseLevel = 0;
  private printer: Printer = {
    printf(fmt: string, ...args: any[]): void {
      process.stdout.write(args.length > 0 ? formatString(fmt, ...args) : fmt);
    },
  };
  private profileGcEnabled = false;
  private profileEnabled = false;
  private warningEnabled = true;
  private weakWarningEnabled = false;
  private time = 0;
  private firstTime = 0;

  enableProfileGc(): void {
    this.profileGcEnabled = true;
  }

  enableProfile(): void {
    this.profileEnabled = true;
  }

  isProfileEnabled(): boolean {
    return this.profileEnabled;
  }

  setVerboseLevel(lvl: number): void {
    this._verboseLevel = lvl;
  }

  verboseLevel(): number {
    return this._verboseLevel;
  }

  setWarningEnabled(enabled: boolean): void {
    this.warningEnabled = enabled;
  }

  isWarningEnabled(): boolean {
    return this.warningEnabled;
  }

  setWeakWarningEnabled(enabled: boolean): void {
    this.weakWarningEnabled = enabled;
  }

  isWeakWarningEnabled(): boolean {
    return this.weakWarningEnabled;
  }

  getPrinter(): Printer {
    return this.printer;
  }

  setPrinter(newPrinter: Printer): void {
    this.printer = newPrinter;
  }

  verbose(fmt: string, ...args: any[]): void {
    if (this._verboseLevel > 0) {
      this.log(fmt, ...args);
    }
  }

  verbose2(fmt: string, ...args: any[]): void {
    if (this._verboseLevel > 1) {
      this.log(fmt, ...args);
    }
  }

  log(fmt: string, ...args: any[]): void {
    this.printer.printf(fmt + '\n', ...args);
  }

  profile(step: string): void {
    if (!this.profileEnabled) return;

    if (this.profileGcEnabled) {
      // Node.js doesn't have System.gc(), but we can hint
      if (global.gc) global.gc();
    }

    const memUsage = process.memoryUsage();
    const memory = Math.round((memUsage.heapUsed) / 1024 / 1024);

    if (this.time === 0) {
      const now = new Date();
      const timeStr = `${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}.${pad3(now.getMilliseconds())}`;
      this.time = Date.now();
      this.firstTime = this.time;
      this.log('%30s: %4dm %s', step, memory, timeStr);
    } else {
      const old = this.time;
      this.time = Date.now();
      const elapse = `${((this.time - old) / 1000).toFixed(1)}/${((this.time - this.firstTime) / 1000).toFixed(1)} seconds`;
      this.log('%30s: %4dm %s', step, memory, elapse);
    }
  }
}

function pad(n: number): string {
  return n < 10 ? '0' + n : '' + n;
}

function pad3(n: number): string {
  if (n < 10) return '00' + n;
  if (n < 100) return '0' + n;
  return '' + n;
}

export const Logger = new LoggerImpl();
