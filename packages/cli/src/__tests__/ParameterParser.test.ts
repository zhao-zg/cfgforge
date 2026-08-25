/**
 * T10.2 ParameterParser — CLI-layer tests.
 *
 * ParameterParser itself is already implemented in @cfggen/gen and well-tested
 * there. These tests verify the CLI-layer usage patterns: how the parser
 * is used within Tools/Generators.create() and how assureNoExtra works.
 */

import { describe, it, expect } from 'vitest';
import { ParameterParser } from '@cfggen/gen';
import { Generators } from '@cfggen/gen';
import { Tools } from '../Tools';

describe('ParameterParser (CLI layer)', () => {
  describe('basic parsing', () => {
    it('parses name only', () => {
      const p = new ParameterParser('java');
      expect(p.id()).toBe('java');
      p.assureNoExtra();
    });

    it('parses name with key=value', () => {
      const p = new ParameterParser('java,dir:src');
      expect(p.id()).toBe('java');
      expect(p.get('dir', '')).toBe('src');
      p.assureNoExtra();
    });

    it('parses name with multiple key=value pairs', () => {
      const p = new ParameterParser('java,dir:src,beautifulName');
      expect(p.id()).toBe('java');
      expect(p.get('dir', '')).toBe('src');
      expect(p.has('beautifulName')).toBe(true);
      p.assureNoExtra();
    });

    it('supports = separator', () => {
      const p = new ParameterParser('java,dir=src');
      expect(p.get('dir', '')).toBe('src');
      p.assureNoExtra();
    });

    it('supports : separator', () => {
      const p = new ParameterParser('java,dir:src');
      expect(p.get('dir', '')).toBe('src');
      p.assureNoExtra();
    });
  });

  describe('consumption', () => {
    it('get returns default for missing key', () => {
      const p = new ParameterParser('java');
      expect(p.get('dir', 'default')).toBe('default');
    });

    it('has returns false for missing key', () => {
      const p = new ParameterParser('java');
      expect(p.has('verbose')).toBe(false);
    });

    it('getOrNull returns null for missing key', () => {
      const p = new ParameterParser('java');
      expect(p.getOrNull('dir')).toBeNull();
    });

    it('get consumes the key (second call returns default)', () => {
      const p = new ParameterParser('java,dir:src');
      expect(p.get('dir', '')).toBe('src');
      expect(p.get('dir', 'fallback')).toBe('fallback');
    });
  });

  describe('boolean parsing', () => {
    it('has with true value returns true', () => {
      const p = new ParameterParser('java,verbose=true');
      expect(p.has('verbose')).toBe(true);
    });

    it('has with false value returns false', () => {
      const p = new ParameterParser('java,verbose=false');
      expect(p.has('verbose')).toBe(false);
    });

    it('has with no value (flag) returns true', () => {
      const p = new ParameterParser('java,verbose');
      expect(p.has('verbose')).toBe(true);
    });

    it('has with invalid boolean throws', () => {
      const p = new ParameterParser('java,verbose=yes');
      expect(() => p.has('verbose')).toThrow();
    });
  });

  describe('assureNoExtra', () => {
    it('passes when all params consumed', () => {
      const p = new ParameterParser('java,dir:src');
      p.get('dir', '');
      expect(() => p.assureNoExtra()).not.toThrow();
    });

    it('throws when unconsumed params remain', () => {
      const p = new ParameterParser('java,dir:src,extra:val');
      p.get('dir', '');
      expect(() => p.assureNoExtra()).toThrow();
    });
  });

  describe('integration with Generators.create()', () => {
    it('creates generator and calls assureNoExtra', () => {
      let receivedParam: ParameterParser | null = null;
      Generators.addProvider('testgen', (param) => {
        receivedParam = param as ParameterParser;
        // Consume the 'dir' param so assureNoExtra passes
        param.get('dir', '');
        return {
          parameter: param,
          generate: async () => {},
        };
      });

      const gen = Generators.create('testgen,dir:src');
      expect(gen).not.toBeNull();
      expect(receivedParam).not.toBeNull();
      // assureNoExtra was called by Generators.create, and dir was consumed
    });

    it('returns null for unknown generator', () => {
      const gen = Generators.create('unknowngen123');
      expect(gen).toBeNull();
    });

    it('throws on extra params via assureNoExtra in Generators.create', () => {
      Generators.addProvider('testgen2', (param) => {
        // Don't consume any params → assureNoExtra should throw
        return {
          parameter: param,
          generate: async () => {},
        };
      });

      expect(() => Generators.create('testgen2,dir:src')).toThrow();
    });
  });

  describe('integration with Tools.create()', () => {
    it('creates tool and calls assureNoExtra', () => {
      let receivedParam: ParameterParser | null = null;
      Tools.addProvider('testtool', (param) => {
        receivedParam = param as ParameterParser;
        // Consume the 'dir' param so assureNoExtra passes
        param.get('dir', '');
        return {
          parameter: param,
          call: async () => {},
        };
      });

      const tool = Tools.create('testtool,dir:src');
      expect(tool).not.toBeNull();
      expect(receivedParam).not.toBeNull();
    });

    it('returns null for unknown tool', () => {
      const tool = Tools.create('unknowntool123');
      expect(tool).toBeNull();
    });
  });

  describe('case insensitivity', () => {
    it('parameter keys are case-insensitive', () => {
      const p = new ParameterParser('java,DIR:src');
      expect(p.get('dir', '')).toBe('src');
      p.assureNoExtra();
    });

    it('flag names are case-insensitive', () => {
      const p = new ParameterParser('java,VERBOSE');
      expect(p.has('verbose')).toBe(true);
      p.assureNoExtra();
    });
  });
});
