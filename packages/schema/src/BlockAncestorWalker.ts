/**
 * BlockAncestorWalker — TypeScript port of Java `configgen.schema.BlockAncestorWalker`.
 *
 * Walks a Structural's field tree, calling visitor on every Block-format
 * list/map field. Passes the set of outer ancestor block start columns.
 */

import type { Structural } from './Structural';
import type { FieldSchema } from './FieldSchema';
import type { Fieldable } from './Fieldable';
import type { SimpleType } from './FieldType';
import { isStructRef, isFList, isFMap, isPrimitive } from './FieldType';
import { AutoOrPack, isSep, isBlock } from './FieldFormat';
import { StructSchema } from './StructSchema';
import { InterfaceSchema } from './InterfaceSchema';
import { fieldSpan, simpleTypeSpan, span } from './Span';

export interface BlockFieldVisitor {
  onBlockField(structural: Structural, field: FieldSchema, startCol: number, outerAncestors: Set<number>): void;
}

export function walkBlockAncestors(root: Structural, visitor: BlockFieldVisitor): void {
  walkStructural(root, 0, new Set<number>(), visitor);
}

function walkStructural(
  structural: Structural,
  startCol: number,
  ancestors: Set<number>,
  visitor: BlockFieldVisitor,
): void {
  if (structural.fmt() === AutoOrPack.PACK || isSep(structural.fmt())) return;

  let col = startCol;
  for (const field of structural.fields()) {
    walkField(structural, field, col, ancestors, visitor);
    col += fieldSpan(field);
  }
}

function walkField(
  structural: Structural,
  field: FieldSchema,
  startCol: number,
  ancestors: Set<number>,
  visitor: BlockFieldVisitor,
): void {
  if (field.fmt === AutoOrPack.PACK || isSep(field.fmt)) return;

  if (isPrimitive(field.type)) {
    return;
  } else if (isStructRef(field.type)) {
    walkFieldable(field.type.obj!, startCol, ancestors, visitor);
  } else if (isFList(field.type)) {
    if (isBlock(field.fmt)) {
      visitor.onBlockField(structural, field, startCol, ancestors);
      const itemAncestors = concatSorted(ancestors, startCol);
      const itemSpan = simpleTypeSpan(field.type.item);
      for (let i = 0; i < field.fmt.fix; i++) {
        walkSimpleType(field.type.item, startCol + i * itemSpan, itemAncestors, visitor);
      }
    }
  } else if (isFMap(field.type)) {
    if (isBlock(field.fmt)) {
      visitor.onBlockField(structural, field, startCol, ancestors);
      const entryAncestors = concatSorted(ancestors, startCol);
      const keySpan = simpleTypeSpan(field.type.key);
      const entrySpan = keySpan + simpleTypeSpan(field.type.value);
      for (let i = 0; i < field.fmt.fix; i++) {
        const entryCol = startCol + i * entrySpan;
        walkSimpleType(field.type.key, entryCol, entryAncestors, visitor);
        walkSimpleType(field.type.value, entryCol + keySpan, entryAncestors, visitor);
      }
    }
  }
}

function walkFieldable(
  fieldable: Fieldable,
  startCol: number,
  ancestors: Set<number>,
  visitor: BlockFieldVisitor,
): void {
  if (fieldable instanceof StructSchema || fieldable instanceof InterfaceSchema) {
    if (fieldable instanceof StructSchema) {
      walkStructural(fieldable, startCol, ancestors, visitor);
    } else {
      // interface: first column is impl name, impls start at startCol+1
      for (const impl of fieldable.impls()) {
        walkStructural(impl, startCol + 1, ancestors, visitor);
      }
    }
  }
}

function walkSimpleType(
  st: SimpleType,
  startCol: number,
  ancestors: Set<number>,
  visitor: BlockFieldVisitor,
): void {
  if (isPrimitive(st)) return;
  if (isStructRef(st)) walkFieldable(st.obj!, startCol, ancestors, visitor);
}

function concatSorted(base: Set<number>, add: number): Set<number> {
  return new Set([...base, add]);
}

// Need span for walkFieldable
import type { Nameable } from './Nameable';
