/**
 * CheckJsonService + PromptService tests — T9.8
 *
 * CheckJsonService validates a JSON string against a table's schema:
 *   - Extracts JSON from raw text (markdown code blocks)
 *   - Parses via ValueJsonParser
 *   - Returns ok + formatted JSON, or error code + message
 *
 * PromptService generates AI prompt text for a table:
 *   - Returns prompt + init text, or error code
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EditorService } from '../EditorService';
import { CheckJsonService } from '../CheckJsonService';
import { PromptService } from '../PromptService';
import type { CheckJsonResult, CheckJsonResultCode } from '../CheckJsonService';
import type { PromptResult, PromptResultCode } from '../PromptService';

function writeFile(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const CFG = `table item[id] (title='name') {
  id:int;
  name:str;
  damage:int;
}
`;

const CSV = `ID,名称,伤害
id,name,damage
100,剑,50
`;

// ---------------------------------------------------------------------------
// CheckJsonService Tests
// ---------------------------------------------------------------------------

describe('CheckJsonService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-checkjson-'));
    writeFile(tempDir, 'config.cfg', CFG);
    writeFile(tempDir, 'item.csv', CSV);
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('returns ok for valid JSON', async () => {
    const svc = await EditorService.create(tempDir);
    const json = '```json\n{"id": 200, "name": "枪", "damage": 100}\n```';
    const result = CheckJsonService.checkJson(svc, 'item', json) as CheckJsonResult;

    expect(result.resultCode).toBe('ok');
    expect(result.table).toBe('item');
    // jsonResult should be a valid JSON string
    const parsed = JSON.parse(result.jsonResult);
    expect(parsed.id).toBe(200);
    expect(parsed.name).toBe('枪');
    expect(parsed.damage).toBe(100);
  });

  it('extracts JSON from markdown code block', async () => {
    const svc = await EditorService.create(tempDir);
    const raw = 'Here is the JSON:\n```json\n{"id": 1, "name": "test", "damage": 10}\n```\nDone.';
    const result = CheckJsonService.checkJson(svc, 'item', raw) as CheckJsonResult;

    expect(result.resultCode).toBe('ok');
    expect(result.table).toBe('item');
  });

  it('returns tableNotFound for non-existent table', async () => {
    const svc = await EditorService.create(tempDir);
    const result = CheckJsonService.checkJson(svc, 'nonexistent', '{}') as CheckJsonResult;

    expect(result.resultCode).toBe('tableNotFound');
    expect(result.table).toBe('nonexistent');
  });

  it('returns tableNotFound for empty table name', async () => {
    const svc = await EditorService.create(tempDir);
    const result = CheckJsonService.checkJson(svc, '', '{}') as CheckJsonResult;

    expect(result.resultCode).toBe('tableNotFound');
  });

  it('returns JsonNotFound for empty raw', async () => {
    const svc = await EditorService.create(tempDir);
    const result = CheckJsonService.checkJson(svc, 'item', '') as CheckJsonResult;

    expect(result.resultCode).toBe('JsonNotFound');
    expect(result.table).toBe('item');
  });

  it('returns JsonNotFound when no JSON in raw text', async () => {
    const svc = await EditorService.create(tempDir);
    const result = CheckJsonService.checkJson(svc, 'item', 'just plain text') as CheckJsonResult;

    expect(result.resultCode).toBe('JsonNotFound');
  });

  it('returns ParseJsonError for invalid JSON structure', async () => {
    const svc = await EditorService.create(tempDir);
    // Wrong field types — wrapped in markdown code block
    const raw = '```json\n{"id": "not a number", "name": "test", "damage": 10}\n```';
    const result = CheckJsonService.checkJson(svc, 'item', raw) as CheckJsonResult;

    expect(result.resultCode).toBe('ParseJsonError');
    expect(result.table).toBe('item');
    expect(result.jsonResult.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// PromptService Tests
// ---------------------------------------------------------------------------

describe('PromptService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-prompt-'));
    writeFile(tempDir, 'config.cfg', CFG);
    writeFile(tempDir, 'item.csv', CSV);
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('returns ok with prompt and init for valid table', async () => {
    const svc = await EditorService.create(tempDir);
    const result = PromptService.gen(svc, 'item') as PromptResult;

    expect(result.resultCode).toBe('ok');
    expect(result.prompt.length).toBeGreaterThan(0);
    expect(result.init.length).toBeGreaterThan(0);
  });

  it('returns tableNotSet for empty table name', async () => {
    const svc = await EditorService.create(tempDir);
    const result = PromptService.gen(svc, '') as PromptResult;

    expect(result.resultCode).toBe('tableNotSet');
  });

  it('returns tableNotFound for non-existent table', async () => {
    const svc = await EditorService.create(tempDir);
    const result = PromptService.gen(svc, 'nonexistent') as PromptResult;

    expect(result.resultCode).toBe('tableNotFound');
    expect(result.table).toBe('nonexistent');
  });
});
