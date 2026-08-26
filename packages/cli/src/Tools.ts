/**
 * Tools — TypeScript port of Java `configgen.gen.Tools`.
 *
 * A provider registry for tools. Tools are registered by name and
 * created from a `-tool name,k=v` argument string.
 *
 * Differences from Java:
 * - `addProvider(name, provider)` takes a plain factory `(parameter) => Tool`
 * - `getAllProviders()` returns a snapshot copy (read-only view)
 * - ProviderRegistry is inlined (same as Generators.ts)
 */

import { ParameterParser } from '@cfgforge/gen';
import type { Parameter } from '@cfgforge/gen';
import { Logger } from '@cfgforge/shared';
import type { Tool } from './Tool';

export type ToolProvider = (parameter: Parameter) => Tool;

const providers = new Map<string, ToolProvider>();

/** Create a tool from a `-tool` argument string; null if id unknown. */
function create(arg: string): Tool | null {
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

function addProvider(name: string, provider: ToolProvider): void {
  providers.set(name, provider);
}

/** Read-only view of registered providers. */
function getAllProviders(): ReadonlyMap<string, ToolProvider> {
  return new Map(providers);
}

export const Tools = {
  create,
  addProvider,
  getAllProviders,
};
