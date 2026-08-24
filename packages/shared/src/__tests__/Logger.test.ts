import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Logger,
  type Printer,
  nullPrinter,
  createPrinter,
  createPrinterSeq,
} from '../Logger';

function makeMockPrinter(): Printer & { calls: any[][] } {
  const calls: any[][] = [];
  const printer: Printer = {
    printf(fmt: string, ...args: any[]): void {
      calls.push([fmt, ...args]);
    },
  };
  return Object.assign(printer, { calls });
}

describe('Logger', () => {
  let originalPrinter: Printer;

  beforeEach(() => {
    originalPrinter = Logger.getPrinter();
    Logger.setVerboseLevel(0);
    Logger.setWarningEnabled(true);
    Logger.setWeakWarningEnabled(false);
  });

  describe('verbose level', () => {
    it('verboseLevel starts at 0', () => {
      expect(Logger.verboseLevel()).toBe(0);
    });
    it('setVerboseLevel changes level', () => {
      Logger.setVerboseLevel(2);
      expect(Logger.verboseLevel()).toBe(2);
    });
  });

  describe('warning flags', () => {
    it('warningEnabled defaults true', () => {
      expect(Logger.isWarningEnabled()).toBe(true);
    });
    it('setWarningEnabled toggles', () => {
      Logger.setWarningEnabled(false);
      expect(Logger.isWarningEnabled()).toBe(false);
    });
    it('weakWarningEnabled defaults false', () => {
      expect(Logger.isWeakWarningEnabled()).toBe(false);
    });
    it('setWeakWarningEnabled toggles', () => {
      Logger.setWeakWarningEnabled(true);
      expect(Logger.isWeakWarningEnabled()).toBe(true);
    });
  });

  describe('verbose/verbose2', () => {
    it('verbose does not print when level is 0', () => {
      const mock = makeMockPrinter();
      Logger.setPrinter(mock);
      Logger.verbose('test');
      expect(mock.calls.length).toBe(0);
    });

    it('verbose prints when level > 0', () => {
      const mock = makeMockPrinter();
      Logger.setPrinter(mock);
      Logger.setVerboseLevel(1);
      Logger.verbose('hello %s', 'world');
      expect(mock.calls.length).toBe(1);
      expect(mock.calls[0][0]).toBe('hello %s\n');
      expect(mock.calls[0][1]).toBe('world');
    });

    it('verbose2 does not print when level is 1', () => {
      const mock = makeMockPrinter();
      Logger.setPrinter(mock);
      Logger.setVerboseLevel(1);
      Logger.verbose2('test');
      expect(mock.calls.length).toBe(0);
    });

    it('verbose2 prints when level > 1', () => {
      const mock = makeMockPrinter();
      Logger.setPrinter(mock);
      Logger.setVerboseLevel(2);
      Logger.verbose2('deep %s', 'info');
      expect(mock.calls.length).toBe(1);
      expect(mock.calls[0][0]).toBe('deep %s\n');
    });
  });

  describe('log', () => {
    it('always prints to current printer', () => {
      const mock = makeMockPrinter();
      Logger.setPrinter(mock);
      Logger.log('always %s', 'logs');
      expect(mock.calls.length).toBe(1);
      expect(mock.calls[0][0]).toBe('always %s\n');
      expect(mock.calls[0][1]).toBe('logs');
    });
  });

  describe('nullPrinter', () => {
    it('does nothing', () => {
      expect(() => nullPrinter.printf('test %s', 'arg')).not.toThrow();
    });
  });

  describe('createPrinterSeq', () => {
    it('calls all printers in sequence', () => {
      const calls: string[] = [];
      const p1: Printer = { printf: (fmt: string) => { calls.push('p1:' + fmt); } };
      const p2: Printer = { printf: (fmt: string) => { calls.push('p2:' + fmt); } };
      const seq = createPrinterSeq(p1, p2);
      seq.printf('fmt');
      expect(calls).toEqual(['p1:fmt', 'p2:fmt']);
    });
  });

  describe('profile', () => {
    it('does nothing when profile disabled', () => {
      const mock = makeMockPrinter();
      Logger.setPrinter(mock);
      Logger.profile('step1');
      expect(mock.calls.length).toBe(0);
    });

    it('prints timing info when profile enabled', () => {
      const mock = makeMockPrinter();
      Logger.setPrinter(mock);
      Logger.enableProfile();
      Logger.profile('step1');
      expect(mock.calls.length).toBe(1);
      Logger.profile('step2');
      expect(mock.calls.length).toBe(2);
    });
  });
});
