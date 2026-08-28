/**
 * HasMap — TypeScript port of Java `configgen.schema.HasMap`.
 */

import type { CfgSchema } from './CfgSchema.js';
import type { CfgSchemaErrs } from './CfgSchemaErrs.js';
import type { Nameable } from './Nameable.js';
import { StructSchema } from './StructSchema.js';
import { TableSchema } from './TableSchema.js';
import type { Structural } from './Structural.js';
import { isFMap } from './FieldType.js';
import { isMetaInt } from './Metadata.js';
import { foreachNameable } from './ForeachSchema.js';
import { checkAnyOk, CheckResult } from './IncludedStructs.js';
import * as Errs from './CfgSchemaErrs.js';

export function preCalculateAllHasMap(schema: CfgSchema, errs: CfgSchemaErrs): void {
  foreachNameable((nameable) => calcHasMap(nameable, errs), schema);
}

function calcHasMap(nameable: Nameable, errs: CfgSchemaErrs): void {
  const hasMap = checkAnyOk(nameable, checkIfDirectFieldsHasMap);
  nameable.meta().putHasMap(hasMap);
  if (hasMap && nameable instanceof TableSchema && nameable.isJson()) {
    errs.addErr(Errs.jsonTableNotSupportMap(nameable.name()));
  }
}

function checkIfDirectFieldsHasMap(nameable: Nameable): CheckResult {
  const hasMapValue = nameable.meta().getHasMap();
  if (isMetaInt(hasMapValue)) {
    return hasMapValue.value === 1 ? CheckResult.Ok : CheckResult.Fail;
  }

  if (isStructural(nameable)) {
    for (const f of nameable.fields()) {
      if (isFMap(f.type)) {
        return CheckResult.Ok;
      }
    }
  }
  return CheckResult.Unknown;
}

export function hasMap(nameable: Nameable): boolean {
  const v = nameable.meta().getHasMap();
  if (isMetaInt(v)) return v.value === 1;
  throw new Error(`${nameable.fullName()} has no _hasMap meta value, schema not resolved!`);
}

function isStructural(item: Nameable): item is Structural {
  return item instanceof StructSchema || item instanceof TableSchema;
}
