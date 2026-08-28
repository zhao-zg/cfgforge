/**
 * BlockFirstColOverlapChecker — TypeScript port of Java
 * `configgen.schema.BlockFirstColOverlapChecker`.
 *
 * Detects block fields whose first column coincides with an outer ancestor
 * block's first column. Such overlap causes VTableParser.parseBlock to
 * silently lose data, so the schema stage rejects it.
 *
 * Column computation and recursion scope are handled by BlockAncestorWalker
 * (only Block-format list/map fields are expanded), matching exactly the
 * range where VTableBlockParser would trigger first-column overlap at parse time.
 */

import type { CfgSchema } from './CfgSchema.js';
import type { CfgSchemaErrs } from './CfgSchemaErrs.js';
import * as Errs from './CfgSchemaErrs.js';
import { walkBlockAncestors } from './BlockAncestorWalker.js';

export function checkBlockFirstColOverlap(cfgSchema: CfgSchema, errs: CfgSchemaErrs): void {
  const tableMap = cfgSchema.tableMap();
  if (!tableMap) return;

  for (const table of tableMap.values()) {
    if (table.isJson()) continue;

    walkBlockAncestors(table, {
      onBlockField(structural, field, startCol, ancestors) {
        if (ancestors.has(startCol)) {
          errs.addErr(Errs.blockFirstColOverlap(structural.fullName(), field.name));
        }
      },
    });
  }
}
