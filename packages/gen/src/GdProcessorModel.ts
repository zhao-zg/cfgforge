/**
 * GdProcessorModel — TypeScript port of Java `configgen.gengd.ProcessorModel`.
 *
 * Model used by Processor template to generate ConfigProcessor.gd.
 */

import type { Nameable, TableSchema } from '@cfgforge/schema';
import { GdName } from './GdName';
import type { GdCodeGenerator } from './GdCodeGenerator';

export class GdProcessorModel {
  readonly tableSchemas: Iterable<TableSchema>;
  private readonly gen: GdCodeGenerator;

  constructor(gen: GdCodeGenerator, tableSchemas: Iterable<TableSchema>) {
    this.gen = gen;
    this.tableSchemas = tableSchemas;
  }

  fullName(nameable: Nameable): string {
    return new GdName(this.gen.prefix, nameable).className;
  }
}
