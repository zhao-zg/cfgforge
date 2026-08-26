/**
 * ParameterParser — TypeScript port of Java `configgen.gen.ParameterParser`.
 *
 * Parses a `-gen` argument string of the form `name,k=v,k2=v2` into an id
 * and a consumed-on-read parameter map.
 *
 * Differences from Java:
 * - Throws Error (with message) instead of Main.CliException
 * - `get`/`has` consume the parameter (removes it from the map); leftovers
 *   trigger `assureNoExtra()` failure.
 */

import { parseToIdAndMap } from '@cfggen/shared';
import type { Parameter } from './Parameter';

export class ParameterParser implements Parameter {
  private readonly arg: string;
  private readonly idValue: string;
  private readonly params: Map<string, string | null>;

  constructor(arg: string) {
    this.arg = arg;
    const im = parseToIdAndMap(arg);
    this.idValue = im.id;
    this.params = im.map;
  }

  get(key: string, def: string, _messageId?: string): string {
    const v = this.params.get(key.toLowerCase());
    if (v === undefined) {
      return def;
    }
    this.params.delete(key.toLowerCase());
    return v ?? def;
  }

  has(key: string, _messageId?: string): boolean {
    const lowered = key.toLowerCase();
    if (!this.params.has(lowered)) {
      return false;
    }
    const v = this.params.get(lowered)!;
    this.params.delete(lowered);
    // Valueless flag (e.g. `-gen java,beautifulName`) is stored as null → true
    if (v === null || v.length === 0) {
      return true;
    }
    // Strict boolean parsing: garbage values (yes/ok/ture) throw instead of
    // silently returning false.
    if (v.toLowerCase() === 'true') {
      return true;
    }
    if (v.toLowerCase() === 'false') {
      return false;
    }
    throw new Error(
      `invalid boolean value for parameter '${key}': ${v} (expect true/false), arg: ${this.arg}`,
    );
  }

  getOrNull(key: string, _messageId?: string): string | null {
    const lowered = key.toLowerCase();
    const v = this.params.get(lowered);
    if (v === undefined) {
      return null;
    }
    this.params.delete(lowered);
    return v;
  }

  id(): string {
    return this.idValue;
  }

  assureNoExtra(): void {
    if (this.params.size > 0) {
      throw new Error(
        `unsupported parameter(s) for '${this.idValue}': ${[...this.params.keys()]}, arg: ${this.arg}`,
      );
    }
  }

  toString(): string {
    return this.arg;
  }
}