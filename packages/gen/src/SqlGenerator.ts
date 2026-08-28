/**
 * SqlGenerator — MySQL DDL/DML generator (`-gen sql`).
 *
 * Generates SQL files from CfgValue:
 * - `mode=single` (default): one `<tableName>.sql` file per table
 * - `mode=all`: one `<output>.sql` file containing all tables
 *
 * Parameters (all read in constructor):
 * - dir: output directory (default '.')
 * - tables: semicolon-separated table names; empty = all tables (default '')
 * - mode: 'single' (file per table) | 'all' (one file, default 'single')
 * - output: filename for mode=all (default 'config.sql')
 * - prefix: table name prefix (default 'cfg_')
 * - batch: rows per INSERT statement (default 100)
 * - noDrop: flag, omit DROP TABLE IF EXISTS
 */

import * as path from 'path';
import { Logger, CachedFiles } from '@cfgforge/shared';
import type { Context } from '@cfgforge/context';
import type { CfgValue } from '@cfgforge/value';
import type { Parameter } from './Parameter.js';
import { GeneratorWithTag } from './GeneratorWithTag.js';
import {
  renderTableSql,
  renderTablesSql,
  sqlTableName,
  type SqlRenderOptions,
} from './SqlRender.js';

export class SqlGenerator extends GeneratorWithTag {
  private readonly dir: string;
  private readonly tables: string;
  private readonly mode: string;
  private readonly output: string;
  private readonly renderOptions: Pick<SqlRenderOptions, 'dropIfExists' | 'insertBatchSize' | 'tablePrefix'>;

  constructor(parameter: Parameter) {
    super(parameter);
    this.dir = parameter.get('dir', '.');
    this.tables = parameter.get('tables', '');
    this.mode = parameter.get('mode', 'single');
    this.output = parameter.get('output', 'config.sql');
    const prefix = parameter.get('prefix', 'cfg_');
    const batch = parseInt(parameter.get('batch', '100'), 10);
    this.renderOptions = {
      dropIfExists: !parameter.has('noDrop'),
      insertBatchSize: Number.isNaN(batch) || batch < 1 ? 100 : batch,
      tablePrefix: prefix,
    };
  }

  async generate(ctx: Context): Promise<void> {
    if (this.mode !== 'single' && this.mode !== 'all') {
      throw new Error(`sql generator: unknown mode '${this.mode}' (expected 'single' or 'all')`);
    }

    const cfgValue: CfgValue = ctx.makeValueWithTag(this.tag);

    // Resolve target tables (listed names, or all sorted tables)
    let targets;
    const listed = this.tables.split(';').filter((s) => s.length > 0);
    if (listed.length > 0) {
      targets = [];
      for (const name of listed) {
        const vTable = cfgValue.getTable(name);
        if (vTable === undefined) {
          Logger.log(`ignore gen sql: table=${name} not found!`);
          continue;
        }
        targets.push(vTable);
      }
    } else {
      targets = cfgValue.sortedTables();
    }
    if (targets.length === 0) {
      Logger.log('gen sql: no tables to generate');
      return;
    }

    if (this.mode === 'all') {
      const content = renderTablesSql(targets, cfgValue, this.renderOptions);
      const filePath = path.join(this.dir, this.output);
      CachedFiles.writeFile(path.resolve(filePath), Buffer.from(content, 'utf-8'));
      Logger.log(`create file: ${filePath} (${targets.length} tables)`);
    } else {
      for (const vTable of targets) {
        const content = renderTableSql(vTable, cfgValue, this.renderOptions);
        const fileName = sqlTableName(vTable.schema.name(), this.renderOptions.tablePrefix) + '.sql';
        const filePath = path.join(this.dir, fileName);
        CachedFiles.writeFile(path.resolve(filePath), Buffer.from(content, 'utf-8'));
        Logger.log(`create file: ${filePath}`);
      }
    }
  }
}
