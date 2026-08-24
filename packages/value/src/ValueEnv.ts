/**
 * ValueEnv — TypeScript port of Java `configgen.value.ValueEnv`.
 *
 * A parameter object holding all global state needed for value parsing.
 * Java original is a `record` (immutable); TS uses a class with readonly fields.
 *
 * Java source: configgen.value.ValueEnv.java (16 lines)
 */

import type { CfgSchema } from '@cfggen/schema';
import type { CfgData } from '@cfggen/data';
import type { HeadRow } from '@cfggen/data';
import type { JsonTableFiles } from '@cfggen/data';
import type { LangTextFinder } from './LangTextFinder';

export class ValueEnv {
  constructor(
    readonly fullSchema: CfgSchema,
    readonly cfgData: CfgData,
    readonly headRow: HeadRow,
    readonly nullableLangTextFinder: LangTextFinder | null,
    readonly jsonTableFiles: JsonTableFiles,
  ) {}
}
