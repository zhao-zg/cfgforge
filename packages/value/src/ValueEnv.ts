/**
 * ValueEnv — TypeScript port of Java `configgen.value.ValueEnv`.
 *
 * A parameter object holding all global state needed for value parsing.
 * Java original is a `record` (immutable); TS uses a class with readonly fields.
 *
 * Java source: configgen.value.ValueEnv.java (16 lines)
 */

import type { CfgSchema } from '@cfgforge/schema';
import type { CfgData } from '@cfgforge/data';
import type { HeadRow } from '@cfgforge/data';
import type { JsonTableFiles } from '@cfgforge/data';
import type { LangTextFinder } from './LangTextFinder.js';

export class ValueEnv {
  constructor(
    readonly fullSchema: CfgSchema,
    readonly cfgData: CfgData,
    readonly headRow: HeadRow,
    readonly nullableLangTextFinder: LangTextFinder | null,
    readonly jsonTableFiles: JsonTableFiles,
  ) {}
}
