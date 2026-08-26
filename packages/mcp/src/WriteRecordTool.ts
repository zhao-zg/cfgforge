/**
 * WriteRecordTool — TypeScript port of Java `configgen.mcpserver.WriteRecordTool`.
 *
 * 2 tools:
 * - addOrUpdateRecord: add or update a record (delegates to RecordEditService)
 * - deleteRecord: delete a record by id (delegates to RecordEditService)
 *
 * Java uses `synchronized(lock)` for write serialization; TS is single-threaded
 * and async, so no explicit lock is needed.
 *
 * Java source: configgen.mcpserver.WriteRecordTool.java (75 lines)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EditorService } from '@cfgforge/editor-core';
import { RecordEditService } from '@cfgforge/editor-core';

// ---------------------------------------------------------------------------
// WriteRecordTool
// ---------------------------------------------------------------------------

export class WriteRecordTool {
  /**
   * Register the 2 write record tools on the MCP server.
   */
  static register(server: McpServer, editor: EditorService): void {
    WriteRecordTool.registerAddOrUpdateRecord(server, editor);
    WriteRecordTool.registerDeleteRecord(server, editor);
  }

  // -------------------------------------------------------------------------
  // addOrUpdateRecord
  // -------------------------------------------------------------------------

  private static registerAddOrUpdateRecord(server: McpServer, editor: EditorService): void {
    server.registerTool(
      'add_or_update_record',
      {
        description: 'add or update record',
        inputSchema: {
          table: z.string().describe('table full name'),
          recordJsonStr: z.string().describe('record json string'),
        },
      },
      async (args: { table: string; recordJsonStr: string }) => {
        const tableName = args.table;
        const recordJsonStr = args.recordJsonStr;

        const result = await RecordEditService.addOrUpdateRecord(
          editor,
          tableName,
          recordJsonStr,
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: `Result: ${result.resultCode}\nTable: ${result.table}\nRecordId: ${result.id}${result.valueErrs.length > 0 ? '\nErrors:\n' + result.valueErrs.map((e: string) => `  - ${e}`).join('\n') : ''}`,
            },
          ],
        };
      },
    );
  }

  // -------------------------------------------------------------------------
  // deleteRecord
  // -------------------------------------------------------------------------

  private static registerDeleteRecord(server: McpServer, editor: EditorService): void {
    server.registerTool(
      'delete_record',
      {
        description: 'delete record',
        inputSchema: {
          table: z.string().describe('table full name'),
          recordId: z.string().describe('record id'),
        },
      },
      async (args: { table: string; recordId: string }) => {
        const tableName = args.table;
        const recordId = args.recordId;

        const result = await RecordEditService.deleteRecord(
          editor,
          tableName,
          recordId,
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: `Result: ${result.resultCode}\nTable: ${result.table}\nRecordId: ${result.id}${result.valueErrs.length > 0 ? '\nErrors:\n' + result.valueErrs.map((e: string) => `  - ${e}`).join('\n') : ''}`,
            },
          ],
        };
      },
    );
  }
}
