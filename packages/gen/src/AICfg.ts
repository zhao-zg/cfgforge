/**
 * AICfg — TypeScript port of Java `configgen.genbyai.AICfg`.
 *
 * Reads AI API configuration from a JSON file.
 */

import * as fs from 'fs';
import { getDefaultFileSystem } from '@cfgforge/shared';

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

export async function readAICfgFromFileAsync(cfgFn: string): Promise<AICfg> {
  const dfs = getDefaultFileSystem();
  if (!await dfs.exists(cfgFn)) {
    throw new Error(`${cfgFn} not exist!`);
  }

  const bytes = await dfs.readFile(cfgFn);
  const jsonStr = Buffer.from(bytes).toString('utf-8');
  if (jsonStr.length === 0) {
    throw new Error(`${cfgFn} is empty!`);
  }

  return JSON.parse(jsonStr) as AICfg;
}
