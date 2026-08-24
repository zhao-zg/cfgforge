/**
 * HasText — TypeScript port of Java `configgen.schema.HasText`.
 */

import type { CfgSchema } from './CfgSchema';
import type { Nameable } from './Nameable';
import { StructSchema } from './StructSchema';
import { TableSchema } from './TableSchema';
import type { Structural } from './Structural';
import { Primitive, isFList, isFMap, isPrimitive, isStructRef } from './FieldType';
import type { SimpleType } from './FieldType';
import { isMetaInt } from './Metadata';
import { foreachNameable } from './ForeachSchema';
import { checkAnyOk, CheckResult } from './IncludedStructs';

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
