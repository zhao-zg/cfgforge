/**
 * GeneratorWithTag — TypeScript port of Java `configgen.gen.GeneratorWithTag`.
 *
 * Base class for generators that support the `own=<tag>` parameter
 * (e.g. json/bytes/i18n generators filter by tag).
 */

import type { Parameter } from './Parameter';
import { Generator } from './Generator';

export abstract class GeneratorWithTag extends Generator {
  protected tag: string | null;

  constructor(parameter: Parameter) {
    super(parameter);
    this.tag = parameter.get('own', null as unknown as string) as unknown as string | null;
  }
}