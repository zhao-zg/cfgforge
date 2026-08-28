/**
 * ContextCfg — TypeScript port of Java `configgen.ctx.Context.ContextCfg`.
 *
 * Configuration parameters for the Context (data directory, head row,
 * encoding, i18n settings, etc.).
 *
 * Java source: configgen.ctx.Context.java (ContextCfg record, L18-38)
 */

import type { HeadRow } from '@cfgforge/data';
import { HeadRows } from '@cfgforge/data';
import type { ExplicitDir } from './ExplicitDir.js';

export class ContextCfg {
  readonly dataDir: string;
  readonly explicitDir: ExplicitDir | null;
  readonly headRow: HeadRow;
  readonly csvOrTsvDefaultEncoding: string;
  readonly i18nFilename: string | null;
  readonly langSwitchDir: string | null;
  readonly langSwitchDefaultLang: string | null;
  readonly allowValueErr: boolean;

  constructor(
    dataDir: string,
    explicitDir: ExplicitDir | null,
    headRow: HeadRow,
    csvOrTsvDefaultEncoding: string,
    i18nFilename: string | null,
    langSwitchDir: string | null,
    langSwitchDefaultLang: string | null,
    allowValueErr: boolean,
  ) {
    if (dataDir === null || dataDir === undefined) {
      throw new Error('dataDir must not be null');
    }
    if (headRow === null || headRow === undefined) {
      throw new Error('headRow must not be null');
    }
    if (csvOrTsvDefaultEncoding === null || csvOrTsvDefaultEncoding === undefined) {
      throw new Error('csvOrTsvDefaultEncoding must not be null');
    }
    this.dataDir = dataDir;
    this.explicitDir = explicitDir;
    this.headRow = headRow;
    this.csvOrTsvDefaultEncoding = csvOrTsvDefaultEncoding;
    this.i18nFilename = i18nFilename;
    this.langSwitchDir = langSwitchDir;
    this.langSwitchDefaultLang = langSwitchDefaultLang;
    this.allowValueErr = allowValueErr;
  }

  /**
   * Create a default ContextCfg with standard settings.
   * - headRow = A2_Default (2 rows)
   * - encoding = UTF-8
   * - no i18n, no langSwitch, no explicitDir, allowValueErr = false
   */
  static of(dataDir: string): ContextCfg {
    return new ContextCfg(
      dataDir,
      null,
      HeadRows.A2_Default,
      'UTF-8',
      null,
      null,
      null,
      false,
    );
  }
}
