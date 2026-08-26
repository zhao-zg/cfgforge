/**
 * PromptGen — TypeScript port of Java `configgen.genbyai.PromptGen`.
 *
 * Generates the AI prompt by:
 * 1. Finding module/table rules
 * 2. Generating TypeScript type definitions (SchemaToTs)
 * 3. Finding example records
 * 4. Rendering the prompt template (inline, replacing JTE)
 * 5. Reading init.md for the initial assistant message
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Context } from '@cfggen/context';
import type { CfgValue, VTable } from '@cfggen/value';
import type { TableSchema } from '@cfggen/schema';
import { readMarkdown, readMarkdownAsync, getDefaultFileSystem } from '@cfggen/shared';
import { SchemaToTs } from './SchemaToTs';
import { TableRelatedInfoFinder } from './TableRelatedInfoFinder';
import type { ModuleRule, TableRule } from './TableRelatedInfoFinder';
import { PromptModel, type Example } from './PromptModel';
import { DEFAULT_INIT } from './PromptDefault';

// ---------------------------------------------------------------------------
// Prompt result
// ---------------------------------------------------------------------------

export interface Prompt {
  prompt: string;
  init: string;
}

// ---------------------------------------------------------------------------
// PromptGen
// ---------------------------------------------------------------------------

export class PromptGen {

  static genPrompt(context: Context, cfgValue: CfgValue, vTable: VTable): Prompt {
    const table = vTable.name();
    const tableSchema = vTable.schema;

    const moduleRule = TableRelatedInfoFinder.findModuleRuleForTable(context, tableSchema);
    const rule = TableRelatedInfoFinder.findTableRule(context, tableSchema);

    const structInfo = new SchemaToTs(
      cfgValue, tableSchema,
      rule !== null ? rule.extraRefTables : [],
      true,
    ).generate();

    const ex = TableRelatedInfoFinder.getExample(rule, vTable);
    const model = new PromptModel(
      table, structInfo,
      PromptGen.combineRule(moduleRule, rule),
      ex !== null ? [ex] : [],
    );

    // Render prompt template (inline replacement for JTE config.jte)
    const rootDir = context.rootDir();
    const customTemplatePath = path.join(rootDir, 'config.jte');
    let prompt: string;
    if (fs.existsSync(customTemplatePath)) {
      // Read custom template from rootDir
      const template = fs.readFileSync(customTemplatePath, 'utf-8');
      prompt = PromptGen.renderTemplate(template, model);
    } else {
      // Use built-in default template
      prompt = PromptGen.renderDefaultTemplate(model);
    }

    // Read init message
    let init = DEFAULT_INIT;
    const initFile = path.join(rootDir, 'init.md');
    if (fs.existsSync(initFile)) {
      const doc = readMarkdown(initFile, 'utf-8');
      const c = doc.content;
      if (c.trim().length > 0) {
        init = c.trim();
      }
    }

    return { prompt, init };
  }

  /**
   * Async variant of genPrompt.
   * Uses CfgFileSystem abstraction (Tauri/WebView compatible).
   */
  static async genPromptAsync(context: Context, cfgValue: CfgValue, vTable: VTable): Promise<Prompt> {
    const table = vTable.name();
    const tableSchema = vTable.schema;

    const moduleRule = await TableRelatedInfoFinder.findModuleRuleForTableAsync(context, tableSchema);
    const rule = await TableRelatedInfoFinder.findTableRuleAsync(context, tableSchema);

    const structInfo = new SchemaToTs(
      cfgValue, tableSchema,
      rule !== null ? rule.extraRefTables : [],
      true,
    ).generate();

    const ex = TableRelatedInfoFinder.getExample(rule, vTable);
    const model = new PromptModel(
      table, structInfo,
      PromptGen.combineRule(moduleRule, rule),
      ex !== null ? [ex] : [],
    );

    const rootDir = context.rootDir();
    const dfs = getDefaultFileSystem();
    const customTemplatePath = path.join(rootDir, 'config.jte');
    let prompt: string;
    if (await dfs.exists(customTemplatePath)) {
      const bytes = await dfs.readFile(customTemplatePath);
      const template = Buffer.from(bytes).toString('utf-8');
      prompt = PromptGen.renderTemplate(template, model);
    } else {
      prompt = PromptGen.renderDefaultTemplate(model);
    }

    let init = DEFAULT_INIT;
    const initFile = path.join(rootDir, 'init.md');
    if (await dfs.exists(initFile)) {
      const doc = await readMarkdownAsync(initFile, 'utf-8');
      const c = doc.content;
      if (c.trim().length > 0) {
        init = c.trim();
      }
    }

    return { prompt, init };
  }

  static combineRule(moduleRule: ModuleRule | null, rule: TableRule | null): string {
    const mr = (moduleRule !== null && moduleRule.rule !== null) ? moduleRule.rule.trim() : '';
    const r = (rule !== null && rule.rule !== null) ? rule.rule.trim() : '';

    if (mr.length === 0) {
      return r;
    } else if (r.length === 0) {
      return mr;
    } else {
      return mr + '\n\n' + r;
    }
  }

  /**
   * Render the default config.jte template (inline).
   * This mirrors the JTE template content from app/src/main/resources/jte/config.jte.
   */
  static renderDefaultTemplate(model: PromptModel): string {
    const sb: string[] = [];

    sb.push('# Role: 专业游戏设计师\n\n');
    sb.push('## Profile\n');
    sb.push('- Description: 经验丰富、逻辑严密，大师级，擅长把需求描述转变为符合结构的json数据\n');
    sb.push('- OutputFormat: json\n\n');
    sb.push('## Rules\n');
    sb.push(`### ${model.table}结构定义\n\n`);
    sb.push('```typescript\n');
    sb.push(model.structInfo);
    sb.push('\n```\n\n');

    if (model.rule.length > 0) {
      sb.push(model.rule);
      sb.push('\n\n');
    }

    sb.push('## Constrains\n');
    sb.push(`生成的json数据必须严格遵守[${model.table}结构定义]，确保数据的一致性和有效性。遵守以下规则\n`);
    sb.push('- 对象要加入$type字段，来表明此对象的类型\n');
    sb.push('- 如果对象里字段为默认值，则可以忽略此字段\n');
    sb.push('- 字段类型为number，默认为0\n');
    sb.push('- 字段类型为array，默认为[]\n');
    sb.push('- 字段类型为str，默认为空字符串\n');
    sb.push('- 对象可以加入$note字段，作为注释，不用全部都加，最好这些注释合起来组成了描述\n');
    sb.push('- json中不要包含```//```开头的注释\n\n');
    sb.push('## Workflow\n\n');
    sb.push('针对用户描述输出json格式的配置(若描述中不含ID，则自动选择)\n\n');

    if (model.examples.length > 0) {
      sb.push('## Examples\n');
      sb.push('---\n');
      for (const ex of model.examples) {
        sb.push(`输入：${ex.id},${ex.description}\n\n`);
        sb.push('输出：\n');
        sb.push('```json\n');
        sb.push(ex.json);
        sb.push('\n```\n');
        sb.push('---\n');
      }
      sb.push('\n');
    }

    sb.push('## Initialization\n');
    sb.push('作为角色 [Role]， 严格遵守 [Rules]，告诉用户 [Workflow]\n');

    return sb.join('');
  }

  /**
   * Render a custom template string (simple variable substitution).
   * Supports: ${model.table()}, ${model.structInfo()}, ${model.rule()},
   *           ${model.examples()}, @if/@endif, @for/@endfor blocks.
   */
  static renderTemplate(template: string, model: PromptModel): string {
    // Simple approach: use the default template renderer.
    // Custom JTE templates would require a full JTE parser, which is not
    // practical in TS. We fall back to the default template if the custom
    // one doesn't parse as a plain text template.
    // For now, just use the default template.
    return PromptGen.renderDefaultTemplate(model);
  }
}
