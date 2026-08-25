/**
 * PromptModel — TypeScript port of Java `configgen.genbyai.PromptModel`.
 *
 * Data structure passed to the prompt template renderer.
 */

export interface Example {
  readonly id: string;
  readonly description: string;
  readonly json: string;
}

export function example(id: string, description: string, json: string): Example {
  return { id, description, json };
}

export function exampleToPrompt(ex: Example): string {
  return `ID: ${ex.id}\n` +
    `Description: ${ex.description}\n` +
    `Data:\n` +
    '```json\n' +
    `${ex.json}\n` +
    '```\n';
}

export class PromptModel {
  constructor(
    public readonly table: string,
    public readonly structInfo: string,
    public readonly rule: string,
    public readonly examples: Example[],
  ) {
    if (table === null || table === undefined) throw new Error('table must not be null');
    if (structInfo === null || structInfo === undefined) throw new Error('structInfo must not be null');
    if (rule === null || rule === undefined) throw new Error('rule must not be null');
    if (examples === null || examples === undefined) throw new Error('examples must not be null');
  }
}
