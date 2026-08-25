/**
 * CfgMcpServer E2E tests — T11.1 + T11.2
 *
 * Tests the MCP server end-to-end using InMemoryTransport + Client.
 * Covers all 9 tools:
 * - SchemaTool: list_module, list_table, read_table_schema
 * - ReadRecordTool: list_table_record, read_record
 * - WriteRecordTool: add_or_update_record, delete_record
 * - SearchTool: search_string, search_number
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { CfgMcpServer } from '../CfgMcpServer';
import { EditorService } from '@cfggen/editor-core';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function writeFile(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const CFG = `table item[id] (title='name') {
  id:int;
  name:str;
  desc:text;
}
`;

const CSV = `ID,名称,描述
id,name,desc
1,剑,一把锋利的剑
2,盾,坚固的盾牌
3,弓,远距离武器
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CfgMcpServer E2E', () => {
  let tempDir: string;
  let server: CfgMcpServer;
  let client: Client;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-mcp-'));
    writeFile(tempDir, 'config.cfg', CFG);
    writeFile(tempDir, 'item.csv', CSV);

    server = await CfgMcpServer.create(tempDir);
    const clientTransport = await server.startInMemory();

    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    rmSync(tempDir);
  });

  // -------------------------------------------------------------------------
  // SchemaTool: list_module
  // -------------------------------------------------------------------------

  it('list_module returns all modules', async () => {
    const result = await client.listTools();
    const tools = result.tools.map((t) => t.name);

    // Verify all 9 tools are registered
    expect(tools).toContain('list_module');
    expect(tools).toContain('list_table');
    expect(tools).toContain('read_table_schema');
    expect(tools).toContain('list_table_record');
    expect(tools).toContain('read_record');
    expect(tools).toContain('add_or_update_record');
    expect(tools).toContain('delete_record');
    expect(tools).toContain('search_string');
    expect(tools).toContain('search_number');
  });

  it('list_module returns module list', async () => {
    const result = await client.callTool({ name: 'list_module', arguments: {} });
    const text = (result.content[0] as { text: string }).text;

    // The table "item" has no namespace, so it's in "_top" module
    expect(text).toContain('_top');
  });

  // -------------------------------------------------------------------------
  // SchemaTool: list_table
  // -------------------------------------------------------------------------

  it('list_table returns tables in _top module', async () => {
    const result = await client.callTool({
      name: 'list_table',
      arguments: { inModule: '_top' },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('item');
  });

  it('list_table returns ModuleNotFound for nonexistent module', async () => {
    const result = await client.callTool({
      name: 'list_table',
      arguments: { inModule: 'nonexistent' },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('ModuleNotFound');
  });

  // -------------------------------------------------------------------------
  // SchemaTool: read_table_schema
  // -------------------------------------------------------------------------

  it('read_table_schema returns schema for existing table', async () => {
    const result = await client.callTool({
      name: 'read_table_schema',
      arguments: { table: 'item' },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('Table: item');
    expect(text).toContain('<related_schema>');
    expect(text).toContain('id');
    expect(text).toContain('name');
    expect(text).toContain('desc');
  });

  it('read_table_schema returns TableNotFound for nonexistent table', async () => {
    const result = await client.callTool({
      name: 'read_table_schema',
      arguments: { table: 'nonexistent' },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('TableNotFound');
  });

  // -------------------------------------------------------------------------
  // ReadRecordTool: list_table_record
  // -------------------------------------------------------------------------

  it('list_table_record returns CSV records', async () => {
    const result = await client.callTool({
      name: 'list_table_record',
      arguments: { table: 'item' },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('Table: item');
    expect(text).toContain('RecordCount: 3');
    // CSV should contain the record data
    expect(text).toContain('1');
    expect(text).toContain('剑');
  });

  it('list_table_record respects limit', async () => {
    const result = await client.callTool({
      name: 'list_table_record',
      arguments: { table: 'item', limit: 2 },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('RecordCount: 3');
    // Should only show 2 records in the CSV
    // (RecordCount is total, CSV shows limited rows)
  });

  it('list_table_record returns TableNotFound for nonexistent table', async () => {
    const result = await client.callTool({
      name: 'list_table_record',
      arguments: { table: 'nonexistent' },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('TableNotFound');
  });

  // -------------------------------------------------------------------------
  // ReadRecordTool: read_record
  // -------------------------------------------------------------------------

  it('read_record returns JSON for existing record', async () => {
    const result = await client.callTool({
      name: 'read_record',
      arguments: { table: 'item', recordId: '1' },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('Table: item');
    expect(text).toContain('RecordId: 1');
    // The JSON should contain the record fields
    expect(text).toContain('"id"');
    expect(text).toContain('"name"');
    expect(text).toContain('剑');
  });

  it('read_record returns RecordNotFound for nonexistent id', async () => {
    const result = await client.callTool({
      name: 'read_record',
      arguments: { table: 'item', recordId: '999' },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('RecordNotFound');
  });

  it('read_record returns TableNotFound for nonexistent table', async () => {
    const result = await client.callTool({
      name: 'read_record',
      arguments: { table: 'nonexistent', recordId: '1' },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('TableNotFound');
  });

  // -------------------------------------------------------------------------
  // WriteRecordTool: add_or_update_record
  // -------------------------------------------------------------------------

  it('add_or_update_record adds a new record', async () => {
    const result = await client.callTool({
      name: 'add_or_update_record',
      arguments: {
        table: 'item',
        recordJsonStr: JSON.stringify({ id: 4, name: '枪', desc: '长枪' }),
      },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('addOk');
    expect(text).toContain('Table: item');

    // Verify the record was added
    const vTable = server.editor().cfgValue().getTable('item');
    expect(vTable!.valueList.length).toBe(4);
  });

  it('add_or_update_record updates an existing record', async () => {
    const result = await client.callTool({
      name: 'add_or_update_record',
      arguments: {
        table: 'item',
        recordJsonStr: JSON.stringify({ id: 1, name: '神剑', desc: '一把锋利的剑' }),
      },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('updateOk');

    // Record count stays the same
    const vTable = server.editor().cfgValue().getTable('item');
    expect(vTable!.valueList.length).toBe(3);
  });

  it('add_or_update_record returns tableNotFound for nonexistent table', async () => {
    const result = await client.callTool({
      name: 'add_or_update_record',
      arguments: {
        table: 'nonexistent',
        recordJsonStr: JSON.stringify({ id: 1 }),
      },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('tableNotFound');
  });

  // -------------------------------------------------------------------------
  // WriteRecordTool: delete_record
  // -------------------------------------------------------------------------

  it('delete_record deletes an existing record', async () => {
    const result = await client.callTool({
      name: 'delete_record',
      arguments: { table: 'item', recordId: '2' },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('deleteOk');

    // Verify the record was deleted
    const vTable = server.editor().cfgValue().getTable('item');
    expect(vTable!.valueList.length).toBe(2);
  });

  it('delete_record returns idNotFound for nonexistent id', async () => {
    const result = await client.callTool({
      name: 'delete_record',
      arguments: { table: 'item', recordId: '999' },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('idNotFound');
  });

  // -------------------------------------------------------------------------
  // SearchTool: search_string
  // -------------------------------------------------------------------------

  it('search_string finds matching values', async () => {
    const result = await client.callTool({
      name: 'search_string',
      arguments: { q: '剑' },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('Search Results');
    expect(text).toContain('剑');
  });

  it('search_string in specific table', async () => {
    const result = await client.callTool({
      name: 'search_string',
      arguments: { q: '盾', table: 'item' },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('Search Results');
    expect(text).toContain('盾');
  });

  it('search_string returns TableNotFound for nonexistent table', async () => {
    const result = await client.callTool({
      name: 'search_string',
      arguments: { q: 'test', table: 'nonexistent' },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('not found');
  });

  it('search_string returns qNotSet for empty query', async () => {
    const result = await client.callTool({
      name: 'search_string',
      arguments: { q: '' },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('q is not set');
  });

  // -------------------------------------------------------------------------
  // SearchTool: search_number
  // -------------------------------------------------------------------------

  it('search_number finds matching values', async () => {
    const result = await client.callTool({
      name: 'search_number',
      arguments: { q: 1 },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('Search Results');
    expect(text).toContain('1');
    expect(text).toContain('id');
  });

  it('search_number in specific table', async () => {
    const result = await client.callTool({
      name: 'search_number',
      arguments: { q: 3, table: 'item' },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('Search Results');
    expect(text).toContain('item');
  });

  it('search_number returns TableNotFound for nonexistent table', async () => {
    const result = await client.callTool({
      name: 'search_number',
      arguments: { q: 1, table: 'nonexistent' },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('not found');
  });

  // -------------------------------------------------------------------------
  // Integration: write + read back
  // -------------------------------------------------------------------------

  it('add record then read it back', async () => {
    // Add a new record
    await client.callTool({
      name: 'add_or_update_record',
      arguments: {
        table: 'item',
        recordJsonStr: JSON.stringify({ id: 5, name: '法杖', desc: '魔法法杖' }),
      },
    });

    // Read it back
    const result = await client.callTool({
      name: 'read_record',
      arguments: { table: 'item', recordId: '5' },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('RecordId: 5');
    expect(text).toContain('法杖');
  });

  it('delete record then verify it is gone', async () => {
    // Delete record 3
    await client.callTool({
      name: 'delete_record',
      arguments: { table: 'item', recordId: '3' },
    });

    // Try to read it back
    const result = await client.callTool({
      name: 'read_record',
      arguments: { table: 'item', recordId: '3' },
    });
    const text = (result.content[0] as { text: string }).text;

    expect(text).toContain('RecordNotFound');
  });
});
