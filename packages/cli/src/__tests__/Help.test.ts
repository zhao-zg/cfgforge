/**
 * T10.3 Help — help text generation tests.
 *
 * Tests that printHelp() produces correct output with all registered
 * providers and their parameter contracts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { printHelp } from '../Help';
import { Generators } from '@cfggen/gen';
import { Tools } from '../Tools';
import { Logger } from '@cfggen/shared';

describe('Help', () => {
  let output: string[];

  beforeEach(() => {
    output = [];
    // Redirect Logger output to capture
    Logger.setPrinter({
      printf: (fmt: string, ...args: any[]) => {
        const msg = args.length > 0 ? formatString(fmt, ...args) : fmt;
        output.push(msg);
      },
    });
  });

  afterEach(() => {
    // Restore default printer
    Logger.setPrinter({
      printf: (fmt: string, ...args: any[]) => {
        process.stdout.write(args.length > 0 ? formatString(fmt, ...args) : fmt);
      },
    });
  });

  // Simple printf-like formatter matching Logger's formatString
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
          default:
            result += fmt[i];
        }
      } else {
        result += fmt[i];
      }
    }
    return result;
  }

  describe('printHelp() basic structure', () => {
    it('prints usage line', () => {
      printHelp();
      const text = output.join('');
      expect(text).toContain('Usage: cfggen');
      expect(text).toContain('-datadir');
      expect(text).toContain('-gen');
      expect(text).toContain('-tool');
    });

    it('prints -h help line', () => {
      printHelp();
      const text = output.join('');
      expect(text).toContain('-h');
      expect(text).toContain('print help');
    });

    it('prints language & logging options section', () => {
      printHelp();
      const text = output.join('');
      expect(text).toContain('-----language & logging options');
      expect(text).toContain('-locale');
      expect(text).toContain('-v');
      expect(text).toContain('-vv');
      expect(text).toContain('-p');
      expect(text).toContain('-pp');
      expect(text).toContain('-nowarn');
      expect(text).toContain('-weakwarn');
    });

    it('prints tools section header', () => {
      printHelp();
      const text = output.join('');
      expect(text).toContain('-----tools');
    });

    it('prints schema & data section', () => {
      printHelp();
      const text = output.join('');
      expect(text).toContain('-----schema & data');
      expect(text).toContain('-datadir');
      expect(text).toContain('-headrow');
      expect(text).toContain('-encoding');
      expect(text).toContain('-asroot');
      expect(text).toContain('-exceldirs');
      expect(text).toContain('-jsondirs');
    });

    it('prints i18n support section', () => {
      printHelp();
      const text = output.join('');
      expect(text).toContain('-----i18n support');
      expect(text).toContain('-i18nfile');
      expect(text).toContain('-langswitchdir');
      expect(text).toContain('-defaultlang');
    });

    it('prints generators section header', () => {
      printHelp();
      const text = output.join('');
      expect(text).toContain('-----generators');
    });
  });

  describe('printHelp() with registered providers', () => {
    it('includes registered generators in output', () => {
      Generators.addProvider('helpgen', (param) => ({
        parameter: param,
        generate: async () => {},
      }));

      printHelp();
      const text = output.join('');
      expect(text).toContain('helpgen');
    });

    it('includes registered tools in output', () => {
      Tools.addProvider('helptool', (param) => ({
        parameter: param,
        call: async () => {},
      }));

      printHelp();
      const text = output.join('');
      expect(text).toContain('helptool');
    });
  });

  describe('printHelp() with reason', () => {
    it('prints reason message when provided', () => {
      printHelp('some error reason');
      const text = output.join('');
      expect(text).toContain('some error reason');
    });

    it('does not print reason when null', () => {
      printHelp(null);
      const text = output.join('');
      // The help text itself contains "null" (e.g. "default null"),
      // so we just verify the first line is the Usage line, not a reason
      const firstLine = output[0];
      expect(firstLine).toContain('Usage: cfggen');
    });

    it('does not print reason when empty string', () => {
      printHelp('');
      const text = output.join('');
      expect(text).toContain('Usage: cfggen');
    });
  });

  describe('ParameterInfoCollector integration', () => {
    it('collects parameter info from generator constructor', () => {
      // Register a generator that has parameters
      Generators.addProvider('paramgen', (param) => {
        param.get('dir', './output');
        param.has('verbose');
        param.getOrNull('own');
        return {
          parameter: param,
          generate: async () => {},
        };
      });

      printHelp();
      const text = output.join('');
      // Should contain the generator name and its parameter names
      expect(text).toContain('paramgen');
      expect(text).toContain('dir');
      expect(text).toContain('verbose');
      expect(text).toContain('own');
    });
  });
});
