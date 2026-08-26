/**
 * Fieldable — TypeScript port of Java `configgen.schema.Fieldable`.
 *
 * Java sealed interface: permits StructSchema, InterfaceSchema.
 * Extends Nameable.
 *
 * This is a forward declaration / minimal interface — the full Nameable
 * interface and implementing classes will be implemented in T2.9.
 */

import type { Nameable } from './Nameable';

/**
 * Fieldable — TypeScript port of Java `configgen.schema.Fieldable`.
 *
 * Java sealed interface: permits StructSchema, InterfaceSchema.
 * Extends Nameable.
 */
export interface Fieldable extends Nameable {
}
