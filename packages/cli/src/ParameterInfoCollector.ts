/**
 * ParameterInfoCollector — TypeScript port of Java `configgen.gen.ParameterInfoCollector`.
 *
 * A pseudo-Parameter implementation that collects parameter contracts
 * (keys, defaults, flags, titles) from Tool/Generator constructors without
 * actually executing them. Used by Help to print usage information.
 *
 * How it works: the provider factory (e.g. `JavaCodeGenerator.constructor`)
 * calls `parameter.get(key, def)` / `parameter.has(key)` during construction.
 * In normal use, ParameterParser provides the real values. Here, we intercept
 * those calls to record what parameters each provider expects.
 */

import type { Parameter } from '@cfggen/gen';
import { Logger } from '@cfggen/shared';

export interface ParamInfo {
  def: string | null;
  isFlag: boolean;
  messageId: string | undefined;
}

export class ParameterInfoCollector implements Parameter {
  private readonly klass: string;
  private readonly id: string;
  private readonly infos: Map<string, ParamInfo>;
  private titleStr: string | undefined;
  private extraLines: string[] | undefined;

  constructor(klass: string, id: string) {
    this.klass = klass;
    this.id = id;
    this.infos = new Map();
  }

  get(key: string, def: string, messageId?: string): string {
    this.infos.set(key, { def, isFlag: false, messageId });
    return def;
  }

  has(key: string, messageId?: string): boolean {
    this.infos.set(key, { def: 'false', isFlag: true, messageId });
    return false;
  }

  getOrNull(key: string, messageId?: string): string | null {
    // For usage collection, treat getOrNull as a get with def=null
    this.infos.set(key, { def: null, isFlag: false, messageId });
    return null;
  }

  title(title: string): void {
    this.titleStr = title;
  }

  extra(extra: string[]): void {
    this.extraLines = extra;
  }

  getInfos(): Map<string, ParamInfo> {
    return this.infos;
  }

  print(): void {
    if (this.titleStr !== undefined && this.titleStr.trim().length > 0) {
      Logger.log('    -%-15s %s', this.klass + ' ' + this.id, this.titleStr);
    } else {
      Logger.log('    -%s %s', this.klass, this.id);
    }

    for (const [key, info] of this.infos) {
      if (info.isFlag) {
        Logger.log('        %-20s %s,%s', key, '', 'default false');
      } else {
        const def = info.def === null ? 'null' : info.def;
        Logger.log('        %-20s %s', key + '=' + def, '');
      }
    }

    if (this.extraLines !== undefined) {
      for (const s of this.extraLines) {
        Logger.log('            %s', s);
      }
    }
  }
}
