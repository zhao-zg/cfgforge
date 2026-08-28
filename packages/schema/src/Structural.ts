/**
 * Structural — TypeScript port of Java `configgen.schema.Structural`.
 *
 * Java sealed interface: permits StructSchema, TableSchema.
 * Extends Nameable.
 *
 * Provides: fields(), foreignKeys(), findField(), findForeignKey(),
 *           fieldNameSet(), updateFieldType(), addForeignKey()
 */

import type { Nameable } from './Nameable.js';
import type { FieldSchema } from './FieldSchema.js';
import type { ForeignKeySchema } from './ForeignKeySchema.js';
import type { FieldType } from './FieldType.js';

export interface Structural extends Nameable {
  fields(): FieldSchema[];
  foreignKeys(): ForeignKeySchema[];
  findField(name: string): FieldSchema | null;
  findForeignKey(name: string): ForeignKeySchema | null;
  fieldNameSet(): Set<string>;
  updateFieldType(fieldName: string, newType: FieldType): void;
  addForeignKey(fk: ForeignKeySchema): void;
}
