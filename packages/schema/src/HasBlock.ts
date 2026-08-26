/**
 * HasBlock — TypeScript port of Java `configgen.schema.HasBlock`.
 */

import type { CfgSchema } from './CfgSchema';
import type { CfgSchemaErrs } from './CfgSchemaErrs';
import type { Nameable } from './Nameable';
import { StructSchema } from './StructSchema';
import { TableSchema } from './TableSchema';
import type { Structural } from './Structural';
import { isBlock } from './FieldFormat';
import { isMetaInt } from './Metadata';
import { foreachNameable } from './ForeachSchema';
import { checkAnyOk, CheckResult } from './IncludedStructs';
import * as Errs from './CfgSchemaErrs';

export function preCalculateAllHasBlock(schema: CfgSchema, errs: CfgSchemaErrs): void {
  foreachNameable((nameable) => calcHasBlock(nameable, errs), schema);
}

function calcHasBlock(nameable: Nameable, errs: CfgSchemaErrs): void {
  const hasBlock = checkAnyOk(nameable, checkIfDirectFieldsHasBlock);
  nameable.meta().putHasBlock(hasBlock);
  if (hasBlock && nameable instanceof TableSchema) {
    const firstField = nameable.fields()[0].name;
    if (!nameable.primaryKey.fields().includes(firstField)) {
      errs.addErr(Errs.blockTableFirstFieldNotInPrimaryKey(nameable.name()));
    }
  }
}

function checkIfDirectFieldsHasBlock(nameable: Nameable): CheckResult {
  const meta = nameable.meta();
  const hasBlockValue = meta.getHasBlock();
  if (isMetaInt(hasBlockValue)) {
    return hasBlockValue.value === 1 ? CheckResult.Ok : CheckResult.Fail;
  }

  if (isStructural(nameable)) {
    for (const f of nameable.fields()) {
      if (isBlock(f.fmt)) {
        return CheckResult.Ok;
      }
    }
  }
  return CheckResult.Unknown;
}

export function hasBlock(nameable: Nameable): boolean {
  const v = nameable.meta().getHasBlock();
  if (isMetaInt(v)) return v.value === 1;
  throw new Error(`${nameable.fullName()} has no _hasBlock meta value, schema not resolved!`);
}

function isStructural(item: Nameable): item is Structural {
  return item instanceof StructSchema || item instanceof TableSchema;
}
