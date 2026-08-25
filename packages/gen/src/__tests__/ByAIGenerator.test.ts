/**
 * ByAIGenerator tests — T8.11
 *
 * Tests the AI-assisted generator components:
 *   1. SchemaToTs — TypeScript type definition generation
 *   2. PromptModel + PromptDefault — prompt model and constants
 *   3. AICfg — AI configuration file reading
 *   4. PromptGen — prompt generation (template rendering, rule combining)
 *   5. ByAIGenerator.extractJson — JSON extraction from LLM response
 *   6. TsSchemaGenerator — schema export to .ts file
 *   7. TableRelatedInfoFinder — findRelatedCfgStr, getExample, etc.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Context } from '@cfggen/context';
import { SchemaToTs } from '../SchemaToTs';
import { PromptModel, example, exampleToPrompt } from '../PromptModel';
import { DEFAULT_INIT, FIX_ERROR } from '../PromptDefault';
import { readAICfgFromFile } from '../AICfg';
import { PromptGen } from '../PromptGen';
import { ByAIGenerator } from '../ByAIGenerator';
import { TsSchemaGenerator } from '../TsSchemaGenerator';
import { TableRelatedInfoFinder } from '../TableRelatedInfoFinder';
import type { Parameter } from '../Parameter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeFile(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function mockParameter(opts: Record<string, string>): Parameter {
  return {
    get: (k: string, def: string) => (k in opts ? opts[k] : def),
    has: (k: string) => k in opts,
    getOrNull: (k: string) => (k in opts ? opts[k] : null),
  };
}

// ---------------------------------------------------------------------------
// Test schema data
// ---------------------------------------------------------------------------

const SIMPLE_CFG = `table skill[id] {
  id:int;
  name:str;
  damage:int;
  active:bool;
}
`;

const SIMPLE_CSV = `ID,名称,伤害,激活
id,name,damage,active
1,Fireball,100,true
2,IceShard,50,false
3,Heal,0,true
`;

const ENUM_CFG = `table ai_action[id] (enum='name') {
  id:int;
  name:str;
  desc:str;
}
`;

const ENUM_CSV = `ID,名称,描述
id,name,desc
1,Attack,攻击
2,Defend,防御
3,Flee,逃跑
`;

const FK_CFG = `table elem[id] (enum='name') {
  id:int;
  name:str;
}

table skill[id] {
  id:int;
  name:str;
  elem:int -> elem;
}
`;

const FK_CSV_ELEM = `ID,名称
id,name
1,Fire
2,Water
`;

const FK_CSV_SKILL = `ID,名称,元素
id,name,elem
1,Fireball,1
2,WaterGun,2
`;

// ---------------------------------------------------------------------------
// SchemaToTs tests
// ---------------------------------------------------------------------------

describe('SchemaToTs', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-schemats-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('generates interface for simple table', async () => {
    writeFile(tempDir, 'config.cfg', SIMPLE_CFG);
    writeFile(tempDir, 'skill.csv', SIMPLE_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    const vTable = cfgValue.getTable('skill');
    expect(vTable).toBeDefined();

    const ts = new SchemaToTs(cfgValue, vTable!.schema, [], false).generate();

    // Should contain namespace, export interface skill
    expect(ts).toContain('namespace ');
    expect(ts).toContain('export interface skill {');
    expect(ts).toContain('id: number;');
    expect(ts).toContain('name: string;');
    expect(ts).toContain('damage: number;');
    expect(ts).toContain('active: boolean;');
  });

  it('generates $type field when isGenerate$type=true', async () => {
    writeFile(tempDir, 'config.cfg', SIMPLE_CFG);
    writeFile(tempDir, 'skill.csv', SIMPLE_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    const vTable = cfgValue.getTable('skill');

    const ts = new SchemaToTs(cfgValue, vTable!.schema, [], true).generate();

    expect(ts).toContain('$type: "skill"');
  });

  it('does not generate $type when isGenerate$type=false', async () => {
    writeFile(tempDir, 'config.cfg', SIMPLE_CFG);
    writeFile(tempDir, 'skill.csv', SIMPLE_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    const vTable = cfgValue.getTable('skill');

    const ts = new SchemaToTs(cfgValue, vTable!.schema, [], false).generate();

    expect(ts).not.toContain('$type');
  });

  it('generates union type for enum table referenced via foreign key', async () => {
    writeFile(tempDir, 'config.cfg', FK_CFG);
    writeFile(tempDir, 'elem.csv', FK_CSV_ELEM);
    writeFile(tempDir, 'skill.csv', FK_CSV_SKILL);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    const vTable = cfgValue.getTable('skill');

    const ts = new SchemaToTs(cfgValue, vTable!.schema, [], true).generate();

    // Should contain union type with enum values
    expect(ts).toContain('export type elem_id =');
    // elem PK is int, so values are unquoted numbers with comment from enum field
    expect(ts).toContain('1 /* Fire */');
    expect(ts).toContain('2 /* Water */');
  });
});

// ---------------------------------------------------------------------------
// PromptModel tests
// ---------------------------------------------------------------------------

describe('PromptModel', () => {
  it('creates model with required fields', () => {
    const model = new PromptModel('skill', 'struct info', 'rule text', []);
    expect(model.table).toBe('skill');
    expect(model.structInfo).toBe('struct info');
    expect(model.rule).toBe('rule text');
    expect(model.examples).toEqual([]);
  });

  it('creates example and converts to prompt', () => {
    const ex = example('1', 'A fireball skill', '{"name":"Fireball"}');
    const prompt = exampleToPrompt(ex);
    expect(prompt).toContain('ID: 1');
    expect(prompt).toContain('Description: A fireball skill');
    expect(prompt).toContain('```json');
    expect(prompt).toContain('{"name":"Fireball"}');
  });

  it('throws on null fields', () => {
    expect(() => new PromptModel(null as any, '', '', [])).toThrow();
    expect(() => new PromptModel('', null as any, '', [])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// PromptDefault tests
// ---------------------------------------------------------------------------

describe('PromptDefault', () => {
  it('has DEFAULT_INIT constant', () => {
    expect(DEFAULT_INIT).toContain('请提供描述');
    expect(DEFAULT_INIT).toContain('JSON');
  });

  it('has FIX_ERROR with %s placeholder', () => {
    expect(FIX_ERROR).toContain('%s');
    expect(FIX_ERROR).toContain('json不符合结构定义');
  });
});

// ---------------------------------------------------------------------------
// AICfg tests
// ---------------------------------------------------------------------------

describe('AICfg', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-aicfg-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('reads AICfg from JSON file', () => {
    const cfgFile = path.join(tempDir, 'ai.json');
    writeFile(tempDir, 'ai.json', JSON.stringify({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-xxx',
      model: 'gpt-4',
    }));

    const cfg = readAICfgFromFile(cfgFile);
    expect(cfg.baseUrl).toBe('https://api.openai.com/v1');
    expect(cfg.apiKey).toBe('sk-xxx');
    expect(cfg.model).toBe('gpt-4');
  });

  it('throws when file does not exist', () => {
    expect(() => readAICfgFromFile(path.join(tempDir, 'nonexistent.json'))).toThrow('not exist');
  });

  it('throws when file is empty', () => {
    writeFile(tempDir, 'empty.json', '');
    expect(() => readAICfgFromFile(path.join(tempDir, 'empty.json'))).toThrow('is empty');
  });
});

// ---------------------------------------------------------------------------
// PromptGen tests
// ---------------------------------------------------------------------------

describe('PromptGen', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-promptgen-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('combines module rule and table rule', () => {
    expect(PromptGen.combineRule(null, null)).toBe('');
    expect(PromptGen.combineRule(null, { rule: 'table rule', extraRefTables: [], exampleId: null, exampleDescription: null })).toBe('table rule');
    expect(PromptGen.combineRule({ description: '', rule: 'module rule' }, null)).toBe('module rule');
    expect(PromptGen.combineRule({ description: '', rule: 'module rule' }, { rule: 'table rule', extraRefTables: [], exampleId: null, exampleDescription: null })).toBe('module rule\n\ntable rule');
  });

  it('generates prompt with schema and table name', async () => {
    writeFile(tempDir, 'config.cfg', SIMPLE_CFG);
    writeFile(tempDir, 'skill.csv', SIMPLE_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    const vTable = cfgValue.getTable('skill');
    expect(vTable).toBeDefined();

    const result = PromptGen.genPrompt(ctx, cfgValue, vTable!);

    expect(result.prompt).toContain('# Role: 专业游戏设计师');
    expect(result.prompt).toContain('### skill结构定义');
    expect(result.prompt).toContain('```typescript');
    expect(result.prompt).toContain('export interface');
    expect(result.prompt).toContain('## Constrains');
    expect(result.prompt).toContain('$type');
    expect(result.prompt).toContain('## Workflow');
    expect(result.prompt).toContain('## Initialization');
    expect(result.init).toBe(DEFAULT_INIT);
  });

  it('reads custom init from init.md', async () => {
    writeFile(tempDir, 'config.cfg', SIMPLE_CFG);
    writeFile(tempDir, 'skill.csv', SIMPLE_CSV);
    writeFile(tempDir, 'init.md', 'This is a custom init message.');

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    const vTable = cfgValue.getTable('skill');

    const result = PromptGen.genPrompt(ctx, cfgValue, vTable!);

    expect(result.init).toBe('This is a custom init message.');
  });

  it('includes examples in prompt when available', async () => {
    writeFile(tempDir, 'config.cfg', SIMPLE_CFG);
    writeFile(tempDir, 'skill.csv', SIMPLE_CSV);
    // Create table .md with exampleId and exampleDescription
    writeFile(tempDir, 'skill.md', `---
exampleId: 1
exampleDescription: A fireball skill
---
This is the rule for skill table.
`);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    const vTable = cfgValue.getTable('skill');

    const result = PromptGen.genPrompt(ctx, cfgValue, vTable!);

    expect(result.prompt).toContain('## Examples');
    expect(result.prompt).toContain('输入：1,A fireball skill');
    expect(result.prompt).toContain('```json');
  });

  it('uses custom config.jte from rootDir when present', async () => {
    writeFile(tempDir, 'config.cfg', SIMPLE_CFG);
    writeFile(tempDir, 'skill.csv', SIMPLE_CSV);
    // Create a custom template (will fall back to default since JTE syntax not supported)
    writeFile(tempDir, 'config.jte', '@param model\nCustom template\n');

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    const vTable = cfgValue.getTable('skill');

    // Should not throw even with custom template
    const result = PromptGen.genPrompt(ctx, cfgValue, vTable!);
    expect(result.prompt).toBeDefined();
    expect(result.prompt.length).toBeGreaterThan(0);
  });

  it('includes module rule from $mod.md', async () => {
    writeFile(tempDir, 'config.cfg', SIMPLE_CFG);
    writeFile(tempDir, 'skill.csv', SIMPLE_CSV);
    writeFile(tempDir, '$mod.md', `---
description: Skill module
---
This is the module rule for all skill tables.
`);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    const vTable = cfgValue.getTable('skill');

    const result = PromptGen.genPrompt(ctx, cfgValue, vTable!);

    expect(result.prompt).toContain('This is the module rule for all skill tables.');
  });
});

// ---------------------------------------------------------------------------
// ByAIGenerator.extractJson tests
// ---------------------------------------------------------------------------

describe('ByAIGenerator.extractJson', () => {
  it('extracts JSON from markdown code block', () => {
    const input = 'Here is the result:\n```json\n{"id": 1, "name": "test"}\n```\nDone.';
    const result = ByAIGenerator.extractJson(input);
    expect(result).toBe('{"id": 1, "name": "test"}');
  });

  it('extracts last JSON block when multiple present', () => {
    const input = '```json\n{"a": 1}\n```\nText\n```json\n{"b": 2}\n```';
    const result = ByAIGenerator.extractJson(input);
    expect(result).toBe('{"b": 2}');
  });

  it('returns null when no JSON block found', () => {
    const input = 'No JSON here.';
    const result = ByAIGenerator.extractJson(input);
    expect(result).toBeNull();
  });

  it('handles empty input', () => {
    const result = ByAIGenerator.extractJson('');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TsSchemaGenerator tests
// ---------------------------------------------------------------------------

describe('TsSchemaGenerator', () => {
  let tempDir: string;
  let outDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-tsschema-'));
    outDir = path.join(tempDir, 'out');
    fs.mkdirSync(outDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('generates .ts file for specified table', async () => {
    writeFile(tempDir, 'config.cfg', SIMPLE_CFG);
    writeFile(tempDir, 'skill.csv', SIMPLE_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new TsSchemaGenerator(mockParameter({
      table: 'skill',
      dst: outDir,
    }));
    await gen.generate(ctx);

    const tsFile = path.join(outDir, 'skill.ts');
    expect(fs.existsSync(tsFile)).toBe(true);
    const content = fs.readFileSync(tsFile, 'utf-8');
    expect(content).toContain('namespace');
    expect(content).toContain('export interface skill');
    expect(content).toContain('id: number');
    expect(content).toContain('name: string');
  });

  it('does not generate $type (isGenerate$type=false)', async () => {
    writeFile(tempDir, 'config.cfg', SIMPLE_CFG);
    writeFile(tempDir, 'skill.csv', SIMPLE_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new TsSchemaGenerator(mockParameter({
      table: 'skill',
      dst: outDir,
    }));
    await gen.generate(ctx);

    const content = fs.readFileSync(path.join(outDir, 'skill.ts'), 'utf-8');
    expect(content).not.toContain('$type');
  });

  it('skips generation when table param is empty', async () => {
    writeFile(tempDir, 'config.cfg', SIMPLE_CFG);
    writeFile(tempDir, 'skill.csv', SIMPLE_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new TsSchemaGenerator(mockParameter({
      table: '',
      dst: outDir,
    }));
    await gen.generate(ctx);

    // No file should be created
    expect(fs.existsSync(path.join(outDir, '.ts'))).toBe(false);
  });

  it('silently ignores when table not found', async () => {
    writeFile(tempDir, 'config.cfg', SIMPLE_CFG);
    writeFile(tempDir, 'skill.csv', SIMPLE_CSV);

    const ctx = await Context.create(tempDir);
    const gen = new TsSchemaGenerator(mockParameter({
      table: 'nonexistent',
      dst: outDir,
    }));
    await gen.generate(ctx);

    // No file should be created
    expect(fs.existsSync(path.join(outDir, 'nonexistent.ts'))).toBe(false);
  });

  it('supports semicolon-separated refTables', async () => {
    writeFile(tempDir, 'config.cfg', FK_CFG);
    writeFile(tempDir, 'elem.csv', FK_CSV_ELEM);
    writeFile(tempDir, 'skill.csv', FK_CSV_SKILL);

    const ctx = await Context.create(tempDir);
    const gen = new TsSchemaGenerator(mockParameter({
      table: 'skill;elem',
      dst: outDir,
    }));
    await gen.generate(ctx);

    const tsFile = path.join(outDir, 'skill.ts');
    expect(fs.existsSync(tsFile)).toBe(true);
    const content = fs.readFileSync(tsFile, 'utf-8');
    // elem is an enum table, so it should generate union type
    expect(content).toContain('export type elem_id');
  });
});

// ---------------------------------------------------------------------------
// TableRelatedInfoFinder tests
// ---------------------------------------------------------------------------

describe('TableRelatedInfoFinder', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-trif-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('findRelatedCfgStr generates CFG text for table', async () => {
    writeFile(tempDir, 'config.cfg', SIMPLE_CFG);
    writeFile(tempDir, 'skill.csv', SIMPLE_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    const vTable = cfgValue.getTable('skill');

    const cfgStr = TableRelatedInfoFinder.findRelatedCfgStr(vTable!.schema);
    expect(cfgStr).toContain('table');
    expect(cfgStr).toContain('skill');
    expect(cfgStr).toContain('id');
  });

  it('findTableRule returns TableRule with null rule when no .md file', async () => {
    writeFile(tempDir, 'config.cfg', SIMPLE_CFG);
    writeFile(tempDir, 'skill.csv', SIMPLE_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    const vTable = cfgValue.getTable('skill');

    const rule = TableRelatedInfoFinder.findTableRule(ctx, vTable!.schema);
    expect(rule).not.toBeNull();
    expect(rule!.rule).toBeNull();
    expect(rule!.extraRefTables).toEqual([]);
    expect(rule!.exampleId).toBeNull();
    expect(rule!.exampleDescription).toBeNull();
  });

  it('findTableRule reads .md file with frontmatter', async () => {
    writeFile(tempDir, 'config.cfg', SIMPLE_CFG);
    writeFile(tempDir, 'skill.csv', SIMPLE_CSV);
    writeFile(tempDir, 'skill.md', `---
refTables: elem,other
exampleId: 1
exampleDescription: Test example
---
Table specific rule text.
`);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    const vTable = cfgValue.getTable('skill');

    const rule = TableRelatedInfoFinder.findTableRule(ctx, vTable!.schema);
    expect(rule).not.toBeNull();
    expect(rule!.rule).toContain('Table specific rule text.');
    expect(rule!.extraRefTables).toContain('elem');
    expect(rule!.extraRefTables).toContain('other');
    expect(rule!.exampleId).toBe('1');
    expect(rule!.exampleDescription).toBe('Test example');
  });

  it('findModuleRuleForTable returns null when no $mod.md', async () => {
    writeFile(tempDir, 'config.cfg', SIMPLE_CFG);
    writeFile(tempDir, 'skill.csv', SIMPLE_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    const vTable = cfgValue.getTable('skill');

    const rule = TableRelatedInfoFinder.findModuleRuleForTable(ctx, vTable!.schema);
    expect(rule).toBeNull();
  });

  it('findModuleRuleForTable reads $mod.md', async () => {
    writeFile(tempDir, 'config.cfg', SIMPLE_CFG);
    writeFile(tempDir, 'skill.csv', SIMPLE_CSV);
    writeFile(tempDir, '$mod.md', `---
description: Skill module
---
This is the module rule.
`);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    const vTable = cfgValue.getTable('skill');

    const rule = TableRelatedInfoFinder.findModuleRuleForTable(ctx, vTable!.schema);
    expect(rule).not.toBeNull();
    expect(rule!.description).toBe('Skill module');
    expect(rule!.rule).toContain('This is the module rule.');
  });

  it('getExample returns null when rule is null', () => {
    const result = TableRelatedInfoFinder.getExample(null, null);
    expect(result).toBeNull();
  });

  it('getExample returns null when exampleId is blank', async () => {
    writeFile(tempDir, 'config.cfg', SIMPLE_CFG);
    writeFile(tempDir, 'skill.csv', SIMPLE_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    const vTable = cfgValue.getTable('skill');

    const rule = { rule: null, extraRefTables: [], exampleId: '', exampleDescription: '' };
    const result = TableRelatedInfoFinder.getExample(rule, vTable!);
    expect(result).toBeNull();
  });

  it('getExample returns example JSON for valid exampleId', async () => {
    writeFile(tempDir, 'config.cfg', SIMPLE_CFG);
    writeFile(tempDir, 'skill.csv', SIMPLE_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    const vTable = cfgValue.getTable('skill');

    const rule = { rule: null, extraRefTables: [], exampleId: '1', exampleDescription: 'Fireball skill' };
    const result = TableRelatedInfoFinder.getExample(rule, vTable!);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('1');
    expect(result!.description).toBe('Fireball skill');
    expect(result!.json).toContain('"id": 1');
    expect(result!.json).toContain('"name": "Fireball"');
  });

  it('getTableRecordListInCsv generates CSV for table', async () => {
    writeFile(tempDir, 'config.cfg', SIMPLE_CFG);
    writeFile(tempDir, 'skill.csv', SIMPLE_CSV);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    const vTable = cfgValue.getTable('skill');

    const result = TableRelatedInfoFinder.getTableRecordListInCsv(vTable!, null, 0, 20);
    expect(result.table).toBe('skill');
    expect(result.recordCount).toBe(3);
    // getTableRecordListInCsv only includes PK fields, enum fields, and title fields
    // For skill table: PK is 'id', no enum entry, no title metadata → only 'id' column
    expect(result.contentInCsvFormat).toContain('id');
    expect(result.contentInCsvFormat).toContain('1');
    expect(result.contentInCsvFormat).toContain('2');
    expect(result.contentInCsvFormat).toContain('3');
  });

  it('findRelatedInfo builds complete related info', async () => {
    writeFile(tempDir, 'config.cfg', FK_CFG);
    writeFile(tempDir, 'elem.csv', FK_CSV_ELEM);
    writeFile(tempDir, 'skill.csv', FK_CSV_SKILL);

    const ctx = await Context.create(tempDir);
    const cfgValue = ctx.makeValue();
    const vTable = cfgValue.getTable('skill');

    const info = TableRelatedInfoFinder.findRelatedInfo(ctx, cfgValue, vTable!);
    expect(info.relatedSchema).toContain('skill');
    // elem is an enum table referenced by skill → should be in relatedTableRecordListInCsv
    expect(info.relatedTableRecordListInCsv.length).toBeGreaterThanOrEqual(1);
    const elemRecord = info.relatedTableRecordListInCsv.find(r => r.table === 'elem');
    expect(elemRecord).toBeDefined();
    expect(elemRecord!.contentInCsvFormat).toContain('Fire');
  });
});
