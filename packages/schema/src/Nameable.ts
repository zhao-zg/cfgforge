/**
 * Nameable — TypeScript port of Java `configgen.schema.Nameable`.
 *
 * Java sealed interface: permits Fieldable, Structural, StructSchema, InterfaceSchema, TableSchema.
 *
 * Provides: name(), fmt(), meta(), namespace(), lastName(), fullName(), comment(), copy()
 */

import type { FieldFormat } from './FieldFormat';
import type { Metadata } from './Metadata';
import type { CommentData } from './CommentData';

export interface Nameable {
  name(): string;
  fmt(): FieldFormat;
  meta(): Metadata;
  copy(): Nameable;

  /** Encoded comment string, or empty string if no comment. */
  comment(): string;

  /** Namespace prefix (everything before the last dot in name()). */
  namespace(): string;

  /** Last segment of name (everything after the last dot, or whole name). */
  lastName(): string;

  /**
   * Generally equals name().
   * For structs inside an interface, includes the interface name as namespace prefix.
   */
  fullName(): string;
}

/** Utility: make a dotted name from namespace + lastName */
export function makeName(namespace: string, lastName: string): string {
  return namespace + '.' + lastName;
}

// ---------------------------------------------------------------------------
// Default implementations (as helper functions for use in concrete classes)
// ---------------------------------------------------------------------------

export function defaultNamespace(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx === -1 ? '' : name.substring(0, idx);
}

export function defaultLastName(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx === -1 ? name : name.substring(idx + 1);
}

export function defaultFullName(name: string): string {
  return name;
}
