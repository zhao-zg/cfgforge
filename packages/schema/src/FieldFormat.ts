/**
 * FieldFormat — TypeScript port of Java `configgen.schema.FieldFormat`.
 *
 * Java sealed interface hierarchy:
 *   FieldFormat
 *     AutoOrPack (enum: AUTO, PACK)
 *     Sep (record: sep: char)
 *     Fix (record: count: int) — count >= 1
 *     Block (record: fix: int) — fix >= 1
 */

// ---------------------------------------------------------------------------
// AutoOrPack
// ---------------------------------------------------------------------------

export const AutoOrPack = {
  AUTO: 'auto',
  PACK: 'pack',
} as const;

export type AutoOrPack = (typeof AutoOrPack)[keyof typeof AutoOrPack];

// ---------------------------------------------------------------------------
// Sep
// ---------------------------------------------------------------------------

export class Sep {
  constructor(public readonly sep: string) {}

  equals(other: unknown): boolean {
    if (!(other instanceof Sep)) return false;
    return this.sep === other.sep;
  }

  toString(): string {
    return `Sep(sep=${this.sep})`;
  }
}

// ---------------------------------------------------------------------------
// Fix
// ---------------------------------------------------------------------------

export class Fix {
  constructor(public readonly count: number) {
    if (count < 1) {
      throw new Error(`fixed count must >= 1, count=${count}`);
    }
  }

  equals(other: unknown): boolean {
    if (!(other instanceof Fix)) return false;
    return this.count === other.count;
  }

  toString(): string {
    return `Fix(count=${this.count})`;
  }
}

// ---------------------------------------------------------------------------
// Block
// ---------------------------------------------------------------------------

export class Block {
  constructor(public readonly fix: number) {
    if (fix < 1) {
      throw new Error(`block fixedCount must >= 1, fix=${fix}`);
    }
  }

  equals(other: unknown): boolean {
    if (!(other instanceof Block)) return false;
    return this.fix === other.fix;
  }

  toString(): string {
    return `Block(fix=${this.fix})`;
  }
}

// ---------------------------------------------------------------------------
// FieldFormat union
// ---------------------------------------------------------------------------

export type FieldFormat = AutoOrPack | Sep | Fix | Block;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isAutoOrPack(fmt: FieldFormat): fmt is AutoOrPack {
  return typeof fmt === 'string';
}

export function isSep(fmt: FieldFormat): fmt is Sep {
  return fmt instanceof Sep;
}

export function isFix(fmt: FieldFormat): fmt is Fix {
  return fmt instanceof Fix;
}

export function isBlock(fmt: FieldFormat): fmt is Block {
  return fmt instanceof Block;
}
