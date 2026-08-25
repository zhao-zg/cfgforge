/**
 * Parameter — TypeScript port of Java `configgen.gen.Parameter`.
 *
 * The Parameter interface has two implementations:
 * - ParameterParser: used for actual argument parsing
 * - (in Java) a usage-collecting implementation used by GUI/Help
 *
 * Generators read their parameters only in their constructor.
 */

export interface Parameter {
  /** Get a parameter value with a default; also consumes the key. */
  get(key: string, def: string, messageId?: string): string;

  /** Whether a flag/value exists; also consumes the key. */
  has(key: string, messageId?: string): boolean;

  /** Optional UI title (no-op for CLI parsing). */
  title?(title: string): void;

  /** Optional extra UI info (no-op for CLI parsing). */
  extra?(extra: string[]): void;
}