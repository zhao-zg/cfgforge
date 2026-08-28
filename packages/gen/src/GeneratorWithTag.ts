/**
 * GeneratorWithTag — TypeScript port of Java `configgen.gen.GeneratorWithTag`.
 *
 * Base class for generators that support the `own=<tag>` parameter
 * (e.g. json/bytes/i18n generators filter by tag).
 *
 * Differences from Java:
 * - Java's Parameter.get can return null (no own param → tag=null).
 *   TS Parameter.get returns string, so we use getOrNull() to distinguish
 *   "absent" (null) from "empty value" ('').
 */

import type { Parameter } from './Parameter.js';
import { Generator } from './Generator.js';

export abstract class GeneratorWithTag extends Generator {
  protected tag: string | null;

  constructor(parameter: Parameter) {
    super(parameter);
    this.tag = parameter.getOrNull('own');
  }
}