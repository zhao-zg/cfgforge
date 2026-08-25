/**
 * ReadRecordTool — TypeScript port of Java `configgen.mcpserver.ReadRecordTool`.
 *
 * 2 tools:
 * - listTableRecord: paginated CSV record list
 * - readRecord: read a single record as JSON
 *
 * Java source: configgen.mcpserver.ReadRecordTool.java (100 lines)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EditorService } from '@cfggen/editor-core';
import { TableRelatedInfoFinder } from '@cfggen/gen';
import { CfgValueErrs, ValuePack, ValueToJson, valueEquals } from '@cfggen/value';

// ---------------------------------------------------------------------------
// ReadRecordTool
// ---------------------------------------------------------------------------

export class ReadRecordTool {
  /**
   * Register the 2 read record tools on the MCP server.
   */
  static register(server: McpServer, editor: EditorService): void {
    ReadRecordTool.registerListTableRecord(server, editor);
    ReadRecordTool.registerReadRecord(server, editor);
  }

  // -------------------------------------------------------------------------
  // listTableRecord
  // -------------------------------------------------------------------------

  private static registerListTableRecord(server: McpServer, editor: EditorService): void {
    server.registerTool(
      'list_table_record',
      {
        description: 'list table record',
        inputSchema: {
          table: z.string().describe('table full name'),
          extraFields: z
            .string()
            .optional()
            .describe('extra fields to show, use comma to separate'),
          offset: z
            .number()
            .optional()
            .describe('record offset, if not set, default to 0'),
          limit: z
            .number()
            .optional()
            .describe('record count, if not set, default to 20'),
        },
      },
      (args: {
        table: string;
        extraFields?: string;
        offset?: number;
        limit?: number;
      }) => {
        const tableName = args.table;
        const offset = args.offset ?? 0;
        let limit = args.limit ?? 20;
        if (limit <= 0) {
          limit = 20;
        }

        const cfgValue = editor.cfgValue();
        const vTable = cfgValue.getTable(tableName);
        if (!vTable) {
          return {
            content: [{ type: 'text' as const, text: `Error: TableNotFound` }],
          };
        }

        const extraFieldsArr =
          args.extraFields && args.extraFields.length > 0
            ? args.extraFields.split(',')
            : null;

        const recordList = TableRelatedInfoFinder.getTableRecordListInCsv(
          vTable,
          extraFieldsArr,
          offset,
          limit,
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: `Table: ${tableName}\nRecordCount: ${recordList.recordCount}\n\n${recordList.contentInCsvFormat}`,
            },
          ],
        };
      },
    );
  }

  // -------------------------------------------------------------------------
  // readRecord
  // -------------------------------------------------------------------------

  private static registerReadRecord(server: McpServer, editor: EditorService): void {
    server.registerTool(
      'read_record',
      {
        description: 'read one record',
        inputSchema: {
          table: z.string().describe('table full name'),
          recordId: z.string().describe('record id'),
        },
      },
      (args: { table: string; recordId: string }) => {
        const tableName = args.table;
        const recordId = args.recordId;

        const cfgValue = editor.cfgValue();
        const vTable = cfgValue.getTable(tableName);
        if (!vTable) {
          return {
            content: [{ type: 'text' as const, text: `Error: TableNotFound` }],
          };
        }

        const errs = CfgValueErrs.of();
        const pkValue = ValuePack.unpackTablePrimaryKey(recordId, vTable.schema, errs);

        if (errs.errs.length > 0) {
          const errorMessages = errs.errs.map((e) => e.msg());
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: RecordIdParseError\nTable: ${tableName}\nRecordId: ${recordId}\nErrors:\n${errorMessages.map((m) => `  - ${m}`).join('\n')}`,
              },
            ],
          };
        }

        if (pkValue === null) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: RecordIdParseError\nTable: ${tableName}\nRecordId: ${recordId}`,
              },
            ],
          };
        }

        // Look up record by primary key using valueEquals
        let vRecord = undefined;
        for (const [k, v] of vTable.primaryKeyMap) {
          if (k === pkValue || valueEquals(k, pkValue)) {
            vRecord = v;
            break;
          }
        }

        if (!vRecord) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: RecordNotFound\nTable: ${tableName}\nRecordId: ${recordId}`,
              },
            ],
          };
        }

        const jsonStr = ValueToJson.toJsonStr(vRecord);

        return {
          content: [
            {
              type: 'text' as const,
              text: `Table: ${tableName}\nRecordId: ${recordId}\n\n${jsonStr}`,
            },
          ],
        };
      },
    );
  }
}
