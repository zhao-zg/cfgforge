/**
 * ParameterParser tests — T8.1
 *
 * Ported from Java ParameterParser behavior (configgen.gen.ParameterParser).
 *
 * Differences from Java:
 * - `assureNoExtra` throws Error with a `message` instead of Main.CliException
 * - `has` invalid boolean values throw Error (same strict behavior)
 */

import { describe, it, expect } from 'vitest';

import { ParameterParser } from '../ParameterParser';

describe('ParameterParser', () => {
  it('parses id and key=value params', () => {
    const p = new ParameterParser('json,tables=user;item,dst=out');
    expect(p.id()).toBe('json');
    expect(p.get('tables', '')).toBe('user;item');
    expect(p.get('dst', '.')).toBe('out');
  });

  it('supports colon separator and trims values', () => {
    const p = new ParameterParser('gen:java,key : value');
    expect(p.id()).toBe('gen:java');
    expect(p.get('key', '')).toBe('value');
  });

  it('returns default when key missing', () => {
    const p = new ParameterParser('java');
    expect(p.get('dst', 'defaultDir')).toBe('defaultDir');
    expect(p.has('beautiful')).toBe(false);
  });

  it('treats valueless flag as true', () => {
    const p = new ParameterParser('java,beautifulName');
    expect(p.has('beautifulName')).toBe(true);
  });

  it('parses true/false booleans strictly', () => {
    const p = new ParameterParser('java,opt=true,off=false');
    expect(p.has('opt')).toBe(true);
    expect(p.has('off')).toBe(false);
  });

  it('throws on invalid boolean value', () => {
    const p = new ParameterParser('java,opt=yes');
    expect(() => p.has('opt')).toThrow(/invalid boolean/);
  });

  it('throws on unsupported extra params', () => {
    const p = new ParameterParser('json,badkey=1');
    expect(() => p.assureNoExtra()).toThrow(/unsupported parameter/);
  });

  it('allows consuming all params then assureNoExtra passes', () => {
    const p = new ParameterParser('json,tables=a');
    p.get('tables', '');
    expect(() => p.assureNoExtra()).not.toThrow();
  });
});