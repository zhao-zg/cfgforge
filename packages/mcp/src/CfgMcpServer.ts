/**
 * CfgMcpServer — TypeScript port of Java `configgen.mcpserver.CfgMcpServer`.
 *
 * MCP server using stdio transport. Holds an EditorService instance (which
 * provides Context + CfgValue), and registers 9 MCP tools across 4 tool
 * classes: SchemaTool, ReadRecordTool, WriteRecordTool, SearchTool.
 *
 * Key differences from Java:
 * - Java uses Streamable HTTP transport (port 3457); TS uses stdio transport.
 * - Java uses a volatile singleton + `McpServers.run()` declarative API;
 *   TS uses `McpServer` + `StdioServerTransport` from @modelcontextprotocol/sdk.
 * - Java's `CfgValueWithContext` record is replaced by EditorService which
 *   already holds Context + CfgValue + graph.
 * - Java's `synchronized(lock)` for write operations is unnecessary in
 *   single-threaded TS; the underlying services are async.
 *
 * Java source: configgen.mcpserver.CfgMcpServer.java (84 lines)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import type { EditorService } from '@cfgforge/editor-core';
import { SchemaTool } from './SchemaTool';
import { ReadRecordTool } from './ReadRecordTool';
import { WriteRecordTool } from './WriteRecordTool';
import { SearchTool } from './SearchTool';

// ---------------------------------------------------------------------------
// CfgMcpServer
// ---------------------------------------------------------------------------

export class CfgMcpServer {
  private readonly _editor: EditorService;
  private readonly _server: McpServer;

  private constructor(editor: EditorService) {
    this._editor = editor;

    this._server = new McpServer(
      { name: 'cfg-mcp-server', version: '1.0.0' },
    );

    // Register all 9 tools
    SchemaTool.register(this._server, this._editor);
    ReadRecordTool.register(this._server, this._editor);
    WriteRecordTool.register(this._server, this._editor);
    SearchTool.register(this._server, this._editor);
  }

  /**
   * Create a CfgMcpServer for the given dataDir.
   * Internally creates an EditorService (Context cached by dataDir).
   */
  static async create(dataDir: string): Promise<CfgMcpServer> {
    const { EditorService } = await import('@cfgforge/editor-core');
    const editor = await EditorService.create(dataDir);
    return new CfgMcpServer(editor);
  }

  /**
   * Create a CfgMcpServer from an existing EditorService (for testing).
   */
  static fromEditor(editor: EditorService): CfgMcpServer {
    return new CfgMcpServer(editor);
  }

  /**
   * Connect to a transport and start serving.
   */
  async connect(transport: Transport): Promise<void> {
    await this._server.connect(transport);
  }

  /**
   * Start serving over stdio (stdin/stdout).
   */
  async startStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this._server.connect(transport);
  }

  /**
   * Start serving over an in-memory transport (for testing).
   * Returns the paired client transport.
   */
  async startInMemory(): Promise<Transport> {
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await this._server.connect(serverTransport);
    return clientTransport;
  }

  /**
   * Close the server connection.
   */
  async close(): Promise<void> {
    await this._server.close();
  }

  /**
   * Access the underlying EditorService.
   */
  editor(): EditorService {
    return this._editor;
  }

  /**
   * Reload the EditorService from disk (after schema/data changes).
   */
  async reload(): Promise<void> {
    await this._editor.reload();
  }
}
