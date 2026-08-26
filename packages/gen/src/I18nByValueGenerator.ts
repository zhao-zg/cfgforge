/**
 * I18nByValueGenerator — TypeScript port of Java
 * `configgen.geni18n.I18nByValueGenerator`.
 *
 * Generates a CSV file with columns: table, original, translated.
 * Iterates all VText values in all tables that have text fields.
 *
 * Java source: configgen.geni18n.I18nByValueGenerator.java (49 lines)
 */

import { hasText } from '@cfggen/schema';
import type { Nameable } from '@cfggen/schema';
import type { Context } from '@cfggen/context';
import {
  type CfgValue,
  type Value,
  type PrimitiveValue,
  VText,
} from '@cfggen/value';
import { ForeachValue, ValueVisitorForSearch } from '@cfggen/value';
import { writeCSVToFileAsync, getDefaultFileSystem } from '@cfggen/shared';
import type { CSVRow } from '@cfggen/shared';
import type { Parameter } from './Parameter';
import { GeneratorWithTag } from './GeneratorWithTag';

export class I18nByValueGenerator extends GeneratorWithTag {
  private readonly file: string;
  protected data: CSVRow[] = [];

  /** Getter for ByValueVisitor (not a subclass) to append rows. */
  addRow(row: CSVRow): void {
    this.data.push(row);
  }

  constructor(parameter: Parameter) {
    super(parameter);
    this.file = parameter.get('file', '../i18n/en.csv');
  }

  async generate(ctx: Context): Promise<void> {
    const cfgValue: CfgValue = ctx.makeValueWithTag(this.tag);

    this.data = [];
    for (const vTable of cfgValue.sortedTables()) {
      if (hasText(vTable.schema as Nameable)) {
        ForeachValue.searchVTable(new ByValueVisitor(this), vTable);
      }
    }

    if (this.data.length === 0) {
      // Write empty file with BOM to match sync writeCSVToFile behavior
      const dfs = getDefaultFileSystem();
      await dfs.writeFile(this.file, Buffer.from('\uFEFF', 'utf8'));
    } else {
      await writeCSVToFileAsync(this.file, this.data);
    }
  }
}

class ByValueVisitor implements ValueVisitorForSearch {
  private readonly gen: I18nByValueGenerator;

  constructor(gen: I18nByValueGenerator) {
    this.gen = gen;
  }

  visit(pv: PrimitiveValue, table: string, _pk: Value, _fieldChain: string[]): void {
    if (pv instanceof VText) {
      const original = pv.original.trim();
      const translated = pv.translated;
      if (original.length > 0 || translated.length > 0) {
        this.gen.addRow([table, original, translated]);
      }
    }
  }
}
