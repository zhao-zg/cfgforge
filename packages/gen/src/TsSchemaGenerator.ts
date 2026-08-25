/**
 * TsSchemaGenerator — TypeScript port of Java `configgen.genbyai.TsSchemaGenerator`.
 *
 * Exports TableSchema as a TypeScript .ts type definition file using SchemaToTs.
 * Supports the `table` parameter with semicolon-separated refTables:
 *   table=mainTable;refTable1;refTable2
 */

import * as path from 'path';
import type { Context } from '@cfggen/context';
import type { Parameter } from './Parameter';
import { GeneratorWithTag } from './GeneratorWithTag';
import { CachedIndentPrinter } from '@cfggen/shared';
import { SchemaToTs } from './SchemaToTs';

export class TsSchemaGenerator extends GeneratorWithTag {
  private readonly table: string;
  private readonly refTables: string[];
  private readonly dstPath: string;
  private readonly encoding: string;

  constructor(parameter: Parameter) {
    super(parameter);
    const tableStr = parameter.get('table', '');
    const dstDir = parameter.get('dst', '.');
    this.encoding = parameter.get('encoding', 'UTF-8');
    this.dstPath = dstDir;

    const split = tableStr.split(';');
    this.table = split.length > 0 ? split[0] : '';
    this.refTables = [];
    if (split.length > 1) {
      this.refTables.push(...split.slice(1));
    }
  }

  async generate(ctx: Context): Promise<void> {
    if (this.table.length === 0) {
      return;
    }
    if (this.tag !== null) {
      // eslint-disable-next-line no-console
      console.log(`gen ts with tag=${this.tag}, be careful!!!`);
    }

    const cfgValue = ctx.makeValueWithTag(this.tag);

    const vTable = cfgValue.vTableMap.get(this.table);
    if (!vTable) {
      // eslint-disable-next-line no-console
      console.log(`ignore gen ts: table=${this.table} not found!`);
      return;
    }

    const printer = new CachedIndentPrinter(path.join(this.dstPath, this.table + '.ts'), this.encoding);
    const generated = new SchemaToTs(cfgValue, vTable.schema, this.refTables, false).generate();
    printer.println(generated);
    printer.close();
  }
}
