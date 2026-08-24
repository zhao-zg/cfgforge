/**
 * Fieldable — TypeScript port of Java `configgen.schema.Fieldable`.
 *
 * Java sealed interface: permits StructSchema, InterfaceSchema.
 * Extends Nameable.
 *
 * This is a forward declaration / minimal interface — the full Nameable
 * interface and implementing classes will be implemented in T2.9.
 */

import type { FieldFormat } from './FieldFormat';
import type { Metadata } from './Metadata';

export interface Fieldable {
  name(): string;
  fmt(): FieldFormat;
  meta(): Metadata;
  namespace(): string;
  lastName(): string;
  fullName(): string;
}
