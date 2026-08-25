/**
 * Generators — TypeScript port of Java `configgen.gen.Generators`.
 *
 * A provider registry for generators. Generators are registered by name and
 * created from a `-gen name,k=v` argument string.
 *
 * Differences from Java:
 * - `addProvider(name, provider)` takes a plain factory `(parameter) => Generator`
 * - `getAllProviders()` returns a read-only Map (readonly view, mutating
 *   throws at runtime via a frozen copy).
 */

import { ParameterParser } from './ParameterParser';
import type { Parameter } from './Parameter';
import type { Generator } from './Generator';
import { Logger } from '@cfggen/shared';

export type GeneratorProvider = (parameter: Parameter) => Generator;

const providers = new Map<string, GeneratorProvider>();

/** Create a generator from a `-gen` argument string; null if id unknown. */
function create(arg: string): Generator | null {
  const parameter = new ParameterParser(arg);
  const provider = providers.get(parameter.id());
  if (provider === undefined) {
    Logger.log(parameter.id() + ' not support');
    return null;
  }
  const result = provider(parameter);
  parameter.assureNoExtra();
  return result;
}

function addProvider(name: string, provider: GeneratorProvider): void {
  providers.set(name, provider);
}

/** Read-only view of registered providers. */
function getAllProviders(): ReadonlyMap<string, GeneratorProvider> {
  // TS has no native unmodifiable Map (Object.freeze does not freeze Map
  // internals); return a snapshot copy so callers cannot mutate the registry.
  return new Map(providers);
}

/** Namespace object mirroring Java's static Generators class. */
export const Generators = {
  create,
  addProvider,
  getAllProviders,
};