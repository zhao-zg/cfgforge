/**
 * RefKey — TypeScript port of Java `configgen.schema.RefKey`.
 *
 * Java sealed interface:
 *   RefKey
 *     RefSimple (interface: nullable())
 *       RefPrimary (record: nullable)
 *       RefUniq (record: key, nullable)
 *     RefList (record: key)
 */

import { KeySchema } from './KeySchema.js';

// ---------------------------------------------------------------------------
// RefPrimary
// ---------------------------------------------------------------------------

export class RefPrimary {
  constructor(public readonly nullable: boolean) {}

  keyNames(): string[] {
    return [];
  }

  copy(): RefPrimary {
    return this; // immutable
  }

  equals(other: unknown): boolean {
    if (!(other instanceof RefPrimary)) return false;
    return this.nullable === other.nullable;
  }

  toString(): string {
    return `RefPrimary{nullable=${this.nullable}}`;
  }
}

// ---------------------------------------------------------------------------
// RefUniq
// ---------------------------------------------------------------------------

export class RefUniq {
  constructor(
    public readonly key: KeySchema,
    public readonly nullable: boolean,
  ) {
    if (key === null || key === undefined) {
      throw new Error('RefUniq key must not be null');
    }
  }

  keyNames(): string[] {
    return this.key.fields();
  }

  copy(): RefUniq {
    return new RefUniq(this.key.copy(), this.nullable);
  }

  equals(other: unknown): boolean {
    if (!(other instanceof RefUniq)) return false;
    return this.key.equals(other.key) && this.nullable === other.nullable;
  }

  toString(): string {
    return `RefUniq{key=${this.key}, nullable=${this.nullable}}`;
  }
}

// ---------------------------------------------------------------------------
// RefList
// ---------------------------------------------------------------------------

export class RefList {
  constructor(public readonly key: KeySchema) {
    if (key === null || key === undefined) {
      throw new Error('RefList key must not be null');
    }
  }

  keyNames(): string[] {
    return this.key.fields();
  }

  copy(): RefList {
    return new RefList(this.key.copy());
  }

  equals(other: unknown): boolean {
    if (!(other instanceof RefList)) return false;
    return this.key.equals(other.key);
  }

  toString(): string {
    return `RefList{key=${this.key}}`;
  }
}

// ---------------------------------------------------------------------------
// RefKey union
// ---------------------------------------------------------------------------

export type RefSimple = RefPrimary | RefUniq;
export type RefKey = RefPrimary | RefUniq | RefList;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isRefPrimary(rk: RefKey): rk is RefPrimary {
  return rk instanceof RefPrimary;
}

export function isRefUniq(rk: RefKey): rk is RefUniq {
  return rk instanceof RefUniq;
}

export function isRefList(rk: RefKey): rk is RefList {
  return rk instanceof RefList;
}
