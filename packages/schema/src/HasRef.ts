/**
 * HasRef — TypeScript port of Java `configgen.schema.HasRef`.
 *
 * Pre-calculates whether each Nameable has foreign key references.
 */

import type { CfgSchema } from './CfgSchema.js';
import type { Nameable } from './Nameable.js';
import type { FieldType, SimpleType } from './FieldType.js';
import { isStructRef, isFList, isFMap, isPrimitive } from './FieldType.js';
import { StructSchema } from './StructSchema.js';
import { TableSchema } from './TableSchema.js';
import type { Structural } from './Structural.js';
import { isMetaInt } from './Metadata.js';
import { foreachNameable } from './ForeachSchema.js';
import { checkAnyOk, CheckResult } from './IncludedStructs.js';

export function preCalculateAllHasRef(schema: CfgSchema): void {
  foreachNameable(calcHasRef, schema);
}

function calcHasRef(nameable: Nameable): void {
  const hasRef = checkAnyOk(nameable, checkIfDirectFieldsHasRef);
  nameable.meta().putHasRef(hasRef);
}

function checkIfDirectFieldsHasRef(nameable: Nameable): CheckResult {
  const hasRefValue = nameable.meta().getHasRef();
  if (isMetaInt(hasRefValue)) {
    return hasRefValue.value === 1 ? CheckResult.Ok : CheckResult.Fail;
  }

  if (isStructural(nameable) && nameable.foreignKeys().length > 0) {
    return CheckResult.Ok;
  }
  return CheckResult.Unknown;
}

export function hasRefFieldType(type: FieldType): boolean {
  if (isPrimitive(type)) return false;
  if (isStructRef(type)) return hasRef(type.obj!);
  if (isFList(type)) return hasRefSimpleType(type.item);
  if (isFMap(type)) return hasRefSimpleType(type.key) || hasRefSimpleType(type.value);
  return false;
}

function hasRefSimpleType(type: SimpleType): boolean {
  if (isPrimitive(type)) return false;
  if (isStructRef(type)) return hasRef(type.obj!);
  return false;
}

export function hasRef(nameable: Nameable): boolean {
  const v = nameable.meta().getHasRef();
  if (isMetaInt(v)) return v.value === 1;
  throw new Error(`${nameable.fullName()} has no _hasRef meta value, schema not resolved!`);
}

function isStructural(item: Nameable): item is Structural {
  return item instanceof StructSchema || item instanceof TableSchema;
}
