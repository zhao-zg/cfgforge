/**
 * JsonGenerator — TypeScript port of Java `configgen.genjson.JsonGenerator`.
 *
 * Generates one JSON file per record of the tables listed in the `tables`
 * parameter (semicolon-separated), into `dst` directory (default ".").
 * Tables with map fields are skipped (JSON editor cannot represent maps).
 *
 * Differences from Java:
 * - `generate(ctx)` is async (Promise<void>)
 * - dst is used directly as the dataDir for VTableJsonStorage (same as Java
 *   Path.of(dst))
 */

import { Logger } from '@cfggen/shared';
import { hasMap } from '@cfggen/schema';
import type { Context } from '@cfggen/context';
import { VTableJsonStorage } from '@cfggen/write';
import type { CfgValue } from '@cfggen/value';
import type { Parameter } from './Parameter';
import { GeneratorWithTag } from './GeneratorWithTag';

export class JsonGenerator extends GeneratorWithTag {
  private readonly tables: string;
  private readonly dst: string;

  constructor(parameter: Parameter) {
    super(parameter);
    this.tables = parameter.get('tables', '');
    this.dst = parameter.get('dst', '.');
  }

  async generate(ctx: Context): Promise<void> {
    const tableNames = this.tables.split(';').filter((s) => s.length > 0);
    if (tableNames.length === 0) {
      return;
    }
    if (this.tag !== null) {
      Logger.log(`gen json with tag=${this.tag}, be careful!!!`);
    }

    const cfgValue: CfgValue = ctx.makeValueWithTag(this.tag);

    for (const table of tableNames) {
      const vTable = cfgValue.getTable(table);
      if (vTable === null || vTable === undefined) {
        Logger.log(`ignore gen json: table=${table} not found!`);
        continue;
      }

      if (hasMap(vTable.schema)) {
        Logger.log(`ignore gen json: table=${table} has map!`);
        continue;
      }

      for (const [pk, record] of vTable.primaryKeyMap) {
        VTableJsonStorage.addOrUpdateRecord(
          record,
          table,
          pk.packStr(),
          this.dst,
          ctx.sourceStructure(),
        );
      }
    }
  }
}