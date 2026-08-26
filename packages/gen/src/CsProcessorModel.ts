/**
 * CsProcessorModel — TypeScript port of Java `configgen.gencs.ProcessorModel`.
 *
 * Java source: configgen.gencs.ProcessorModel.java (31 lines)
 */

import type { TableSchema } from '@cfgforge/schema';
import { isEEnum } from '@cfgforge/schema';
import type { CsCodeGenerator } from './CsCodeGenerator';
import { CsName } from './CsName';

export class CsProcessorModel {
  readonly topPkg: string;
  readonly tableSchemas: Iterable<TableSchema>;
  readonly unity: boolean;
  private readonly gen: CsCodeGenerator;

  constructor(gen: CsCodeGenerator, tableSchemas: Iterable<TableSchema>) {
    this.gen = gen;
    this.topPkg = gen.pkg;
    this.tableSchemas = tableSchemas;
    this.unity = gen.unity;
  }

  fullName(tableSchema: TableSchema): string {
    const v = new CsName(this.gen.pkg, this.gen.prefix, tableSchema).fullName;
    if (isEEnum(tableSchema.entry)) {
      return v + 'Info';
    }
    return v;
  }

  nsLine(): string {
    return this.unity ? 'namespace ' + this.topPkg + '\n{' : 'namespace ' + this.topPkg + ';';
  }
}
