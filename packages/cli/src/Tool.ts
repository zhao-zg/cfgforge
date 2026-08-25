/**
 * Tool — TypeScript port of Java `configgen.gen.Tool`.
 *
 * Abstract base class for CLI tools (e.g. xmltocfg, bytesview).
 * Tools run before generators and don't require a Context.
 *
 * Differences from Java:
 * - `call()` is async (Promise<void>), not `throws IOException`
 */

import type { Parameter } from '@cfggen/gen';

export abstract class Tool {
  protected readonly parameter: Parameter;

  constructor(parameter: Parameter) {
    this.parameter = parameter;
  }

  abstract call(): Promise<void>;
}
