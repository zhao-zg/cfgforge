/**
 * AICfg — TypeScript port of Java `configgen.genbyai.AICfg`.
 *
 * Reads AI API configuration from a JSON file.
 */

import * as fs from 'fs';

export interface AICfg {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}

export function readAICfgFromFile(cfgFn: string): AICfg {
  if (!fs.existsSync(cfgFn)) {
    throw new Error(`${cfgFn} not exist!`);
  }

  const jsonStr = fs.readFileSync(cfgFn, 'utf-8');
  if (jsonStr.length === 0) {
    throw new Error(`${cfgFn} is empty!`);
  }

  return JSON.parse(jsonStr) as AICfg;
}
