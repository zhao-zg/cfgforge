/**
 * HasText — TypeScript port of Java `configgen.schema.HasText`.
 */

import type { CfgSchema } from './CfgSchema.js';
import type { Nameable } from './Nameable.js';
import { StructSchema } from './StructSchema.js';
import { TableSchema } from './TableSchema.js';
import type { Structural } from './Structural.js';
import { Primitive, isFList, isFMap, isPrimitive } from './FieldType.js';
import { isMetaInt } from './Metadata.js';
import { foreachNameable } from './ForeachSchema.js';
import { checkAnyOk, CheckResult } from './IncludedStructs.js';

export function preCalculateAllHasText(schema: CfgSchema): void {
  foreachNameable(calcHasText, schema);
}

function calcHasText(nameable: Nameable): void {
  const hasText = checkAnyOk(nameable, checkIfDirectFieldsHasText);
  nameable.meta().putHasText(hasText);
}

function checkIfDirectFieldsHasText(nameable: Nameable): CheckResult {
  const hasTextValue = nameable.meta().getHasText();
  if (isMetaInt(hasTextValue)) {
    return hasTextValue.value === 1 ? CheckResult.Ok : CheckResult.Fail;
  }

  if (isStructural(nameable)) {
    for (const f of nameable.fields()) {
      const type = f.type;
      if (isPrimitive(type)) {
        if (type === Primitive.TEXT) return CheckResult.Ok;
      } else if (isFList(type)) {
        if (type.item === Primitive.TEXT) return CheckResult.Ok;
      } else if (isFMap(type)) {
        if (type.key === Primitive.TEXT || type.value === Primitive.TEXT) return CheckResult.Ok;
      }
    }
  }
  return CheckResult.Unknown;
}

export function hasText(nameable: Nameable): boolean {
  const v = nameable.meta().getHasText();
  if (isMetaInt(v)) return v.value === 1;
  throw new Error(`${nameable.fullName()} has no _hasText meta value, schema not resolved!`);
}

function isStructural(item: Nameable): item is Structural {
  return item instanceof StructSchema || item instanceof TableSchema;
}
