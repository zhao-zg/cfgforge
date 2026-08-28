/**
 * FindFieldIndex — TypeScript port of Java `configgen.schema.FindFieldIndex`.
 *
 * Finds field indices within a Structural's fields() array.
 */

import type { Structural } from './Structural.js';
import type { FieldSchema } from './FieldSchema.js';
import type { KeySchema } from './KeySchema.js';

export function findFieldIndices(structural: Structural, key: KeySchema): number[] {
  const fieldSchemas = key.fieldSchemas();
  if (!fieldSchemas) return [];
  return fieldSchemas.map((fs) => findFieldIndex(structural, fs));
}

export function findFieldIndex(structural: Structural, field: FieldSchema): number {
  let i = 0;
  for (const f of structural.fields()) {
    if (f === field) return i;
    i++;
  }
  return -1;
}

export function findFieldIndexByName(structural: Structural, fieldName: string): number {
  let i = 0;
  for (const f of structural.fields()) {
    if (f.name === fieldName) return i;
    i++;
  }
  return -1;
}
