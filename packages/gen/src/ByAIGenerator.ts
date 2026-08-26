/**
 * ByAIGenerator — TypeScript port of Java `configgen.genbyai.ByAIGenerator`.
 *
 * AI-assisted configuration generator. Reads user prompts from ask.txt,
 * generates structured prompts using schema information, calls an LLM
 * API (OpenAI-compatible), parses JSON responses, and writes records back
 * to data files.
 *
 * Key differences from Java:
 * - Uses fetch() instead of SimpleOpenAI SDK
 * - Single-threaded (no concurrency)
 * - No backup/temp/overwrite file logic
 */

import type { Context } from '@cfgforge/context';
import { getDefaultFileSystem } from '@cfgforge/shared';
import type { Parameter } from './Parameter';
import { Generator } from './Generator';
import type { VTable } from '@cfgforge/value';
import { ValueJsonParser } from '@cfgforge/value';
import { CfgValueErrs } from '@cfgforge/value';
import { ValueUtil } from '@cfgforge/value';
import { VTableStorage } from '@cfgforge/write';
import { VTableJsonStorage } from '@cfgforge/write';
import { readAICfgFromFileAsync, type AICfg } from './AICfg';
import { PromptGen } from './PromptGen';
import { FIX_ERROR } from './PromptDefault';

// ---------------------------------------------------------------------------
// AskStat — statistics for AI generation
// ---------------------------------------------------------------------------

class AskStat {
  ask = 0;
  ok = 0;
  retry = 0;
  noJson = 0;
  err = 0;
  warn = 0;

  toString(): string {
    return `ask=${this.ask}, ok=${this.ok}, retry=${this.retry}, noJson=${this.noJson}, err=${this.err}, warn=${this.warn}`;
  }
}

// ---------------------------------------------------------------------------
// ByAIGenerator
// ---------------------------------------------------------------------------

export class ByAIGenerator extends Generator {
  private readonly cfgFn: string;
  private readonly askFn: string;
  private readonly table: string;
  private readonly retryTimes: number;

  constructor(parameter: Parameter) {
    super(parameter);
    this.cfgFn = parameter.get('cfg', 'ai.json');
    this.askFn = parameter.get('ask', 'ask.txt');
    this.table = parameter.get('table', 'skill.buff');
    this.retryTimes = parseInt(parameter.get('retry', '1'), 10);
  }

  async generate(ctx: Context): Promise<void> {
    if (this.retryTimes <= 0) {
      throw new Error('retry must > 0');
    }

    const aiCfg = await readAICfgFromFileAsync(this.cfgFn);
    const dfs = getDefaultFileSystem();
    if (!await dfs.exists(this.askFn)) {
      throw new Error(`${this.askFn} not exist!`);
    }
    const askBytes = await dfs.readFile(this.askFn);
    const asks = Buffer.from(askBytes).toString('utf-8').split('\n');

    const cfgValue = ctx.makeValue();
    const vTable = cfgValue.getTable(this.table);
    if (!vTable) {
      throw new Error(`table=${this.table} not found!`);
    }

    const prompt = await PromptGen.genPromptAsync(ctx, cfgValue, vTable);
    // eslint-disable-next-line no-console
    console.log(prompt.prompt);
    // eslint-disable-next-line no-console
    console.log(prompt.init);

    const stat = new AskStat();
    for (const ask of asks) {
      if (ask.trim().length === 0) {
        continue;
      }

      // eslint-disable-next-line no-console
      console.log();
      // eslint-disable-next-line no-console
      console.log(`## ${ask}`);

      const messages = [
        { role: 'user', content: prompt.prompt },
        { role: 'assistant', content: prompt.init },
        { role: 'user', content: ask },
      ];

      await this.askWithRetry(messages, this.retryTimes, stat, ctx, vTable, aiCfg);
    }
    // eslint-disable-next-line no-console
    console.log(stat.toString());
  }

  private async askWithRetry(
    messages: Array<{ role: string; content: string }>,
    retryTimes: number,
    stat: AskStat,
    context: Context,
    vTable: VTable,
    aiCfg: AICfg,
  ): Promise<void> {
    stat.ask++;
    const tableSchema = vTable.schema;

    for (let i = 0; i < retryTimes; i++) {
      const jsonResult = await this.ask(messages, aiCfg);
      if (i > 0) {
        stat.retry++;
      }

      if (jsonResult === null) {
        stat.noJson++;
        return;
      } else {
        const parseErrs = CfgValueErrs.of();
        const record = new ValueJsonParser(tableSchema, parseErrs).fromJson(jsonResult);
        parseErrs.checkErrors('check json', true, true);

        if (parseErrs.warns.length > 0) {
          stat.warn++;
        }
        if (parseErrs.errs.length === 0) {
          stat.ok++;

          const pkValue = ValueUtil.extractPrimaryKeyValue(record, tableSchema);
          const id = pkValue.packStr();
          try {
            if (tableSchema.isJson()) {
              VTableJsonStorage.addOrUpdateRecord(
                record, tableSchema.name(), id,
                context.rootDir(), context.sourceStructure(),
              );
            } else {
              const dTable = context.cfgData().getDTable(this.table)!;
              await VTableStorage.addOrUpdateRecord(context, vTable, dTable, pkValue, record);
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.log(`save ${id} err: ${(e as Error).message}`);
          }
          return;
        } else {
          messages = [...messages, { role: 'user', content: FIX_ERROR.replace('%s', parseErrs.errs.map(e => e.msg()).join(', ')) }];
          stat.err++;
        }
      }
    }
  }

  private async ask(
    messages: Array<{ role: string; content: string }>,
    aiCfg: AICfg,
  ): Promise<string | null> {
    const response = await fetch(`${aiCfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiCfg.apiKey}`,
      },
      body: JSON.stringify({
        model: aiCfg.model,
        messages,
        temperature: 0.0,
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: unknown;
    };
    const result = data.choices[0].message.content;
    // eslint-disable-next-line no-console
    console.log(result);
    if (data.usage) {
      // eslint-disable-next-line no-console
      console.log(data.usage);
    }

    return ByAIGenerator.extractJson(result);
  }

  static extractJson(input: string): string | null {
    const pattern = /```json\s*([^`]+)\s*```/g;
    let lastJson: string | null = null;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(input)) !== null) {
      lastJson = match[1].trim();
    }
    return lastJson;
  }
}
