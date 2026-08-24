/**
 * EntryType — TypeScript port of Java `configgen.schema.EntryType`.
 *
 * Java sealed interface: ENo (singleton NO) / EEntry / EEnum
 *
 * Design: table entry point — either none (internal), entry (code-accessible
 * by name), or enum (generates enum for switch).
 */

import type { FieldSchema } from './FieldSchema';

// ---------------------------------------------------------------------------
// ENo (singleton)
// ---------------------------------------------------------------------------

class ENoImpl {
  private static _instance: ENoImpl | null = null;
  static get NO(): ENoImpl {
    if (!ENoImpl._instance) ENoImpl._instance = new ENoImpl();
    return ENoImpl._instance;
  }
  private constructor() {}
  copy(): ENoImpl { return this; }
  equals(other: unknown): boolean { return other instanceof ENoImpl; }
  toString(): string { return 'ENo.NO'; }
}

export const ENo = {
  NO: ENoImpl.NO,
} as const;

// Use a symbol brand for instanceof checks
export type ENo = ENoImpl;

// ---------------------------------------------------------------------------
// EntryBase (shared by EEntry and EEnum)
// ---------------------------------------------------------------------------

abstract class EntryBase {
  public fieldSchema: FieldSchema | null = null;

  constructor(public readonly field: string) {}

  setFieldSchema(fs: FieldSchema): void {
    this.fieldSchema = fs;
  }

  equals(other: unknown): boolean {
    if (!(other instanceof EntryBase)) return false;
    return this.field === other.field;
  }

  abstract copy(): EntryBase;
  abstract toString(): string;
}

// ---------------------------------------------------------------------------
// EEntry
// ---------------------------------------------------------------------------

export class EEntry extends EntryBase {
  constructor(field: string) {
    super(field);
  }

  copy(): EEntry {
    return new EEntry(this.field);
  }

  toString(): string {
    return `EEntry{field='${this.field}'}`;
  }
}

// ---------------------------------------------------------------------------
// EEnum
// ---------------------------------------------------------------------------

export class EEnum extends EntryBase {
  constructor(field: string) {
    super(field);
  }

  copy(): EEnum {
    return new EEnum(this.field);
  }

  toString(): string {
    return `EEnum{field='${this.field}'}`;
  }
}

// ---------------------------------------------------------------------------
// EntryType union
// ---------------------------------------------------------------------------

export type EntryType = ENo | EEntry | EEnum;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isENo(e: EntryType): e is ENo {
  return e instanceof ENoImpl;
}

export function isEEntry(e: EntryType): e is EEntry {
  return e instanceof EEntry;
}

export function isEEnum(e: EntryType): e is EEnum {
  return e instanceof EEnum;
}
