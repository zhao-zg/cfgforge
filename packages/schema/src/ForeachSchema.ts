/**
 * ForeachSchema — TypeScript port of Java `configgen.schema.ForeachSchema`.
 *
 * Traversal helpers for CfgSchema: foreachStructural, foreachNameable,
 * foreachFieldStructRef.
 */

import type { CfgSchema } from './CfgSchema.js';
import type { Nameable } from './Nameable.js';
import type { Fieldable } from './Fieldable.js';
import type { Structural } from './Structural.js';
import type { FieldSchema } from './FieldSchema.js';
import { isStructRef, isFList, isFMap } from './FieldType.js';
import { StructSchema } from './StructSchema.js';
import { InterfaceSchema } from './InterfaceSchema.js';
import { TableSchema } from './TableSchema.js';

// ---------------------------------------------------------------------------
// Visitor interfaces (using plain functions)
// ---------------------------------------------------------------------------

export type StructuralVisitor = (structural: Structural) => void;
export type NameableVisitor = (nameable: Nameable) => void;
export type FieldableVisitor = (fieldable: Fieldable | null) => void;

// ---------------------------------------------------------------------------
// foreachStructural — visits interface impls + standalone structs/tables
// ---------------------------------------------------------------------------

export function foreachStructural(visitor: StructuralVisitor, cfgSchema: CfgSchema): void {
  for (const item of cfgSchema.items()) {
    if (item instanceof InterfaceSchema) {
      for (const impl of item.impls()) {
        visitor(impl);
      }
    } else if (isStructural(item)) {
      visitor(item);
    }
  }
}

// ---------------------------------------------------------------------------
// foreachNameable — visits interface impls + interface itself + standalone
// ---------------------------------------------------------------------------

export function foreachNameable(visitor: NameableVisitor, cfgSchema: CfgSchema): void {
  for (const item of cfgSchema.items()) {
    if (item instanceof InterfaceSchema) {
      for (const impl of item.impls()) {
        visitor(impl);
      }
      visitor(item);
    } else if (isStructural(item)) {
      visitor(item);
    }
  }
}

// ---------------------------------------------------------------------------
// foreachFieldStructRef — expands field type's StructRef references
// ---------------------------------------------------------------------------

export function foreachFieldStructRef(field: FieldSchema, visitor: FieldableVisitor): void {
  const type = field.type;
  if (isStructRef(type)) {
    visitor(type.obj);
  } else if (isFList(type)) {
    if (isStructRef(type.item)) {
      visitor(type.item.obj);
    }
  } else if (isFMap(type)) {
    if (isStructRef(type.key)) {
      visitor(type.key.obj);
    }
    if (isStructRef(type.value)) {
      visitor(type.value.obj);
    }
  }
}

// ---------------------------------------------------------------------------
// Type guard helper
// ---------------------------------------------------------------------------

function isStructural(item: Nameable): item is Structural {
  return item instanceof StructSchema || item instanceof TableSchema;
}
