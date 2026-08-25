/**
 * SearchTool — TypeScript port of Java `configgen.mcpserver.SearchTool`.
 *
 * 2 tools:
 * - searchString: search VString/VText values (substring match)
 * - searchNumber: search VInt/VLong values (exact match)
 *
 * Both tools support an optional `table` parameter to search within a
 * single table, or search across all tables when omitted.
 *
 * Java source: configgen.mcpserver.SearchTool.java (153 lines)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EditorService } from '@cfggen/editor-core';
import { SearchService as ValueSearchService } from '@cfggen/value';
import type { SearchResultItem } from '@cfggen/value';
import { writeCSV } from '@cfggen/shared';

// ---------------------------------------------------------------------------
// SearchTool
// ---------------------------------------------------------------------------

export class SearchTool {
  /**
   * Register the 2 search tools on the MCP server.
   */
  static register(server: McpServer, editor: EditorService): void {
    SearchTool.registerSearchString(server, editor);
    SearchTool.registerSearchNumber(server, editor);
  }

  // -------------------------------------------------------------------------
  // searchString
  // -------------------------------------------------------------------------

  private static registerSearchString(server: McpServer, editor: EditorService): void {
    server.registerTool(
      'search_string',
      {
        description: 'search string',
        inputSchema: {
          q: z.string().describe('query'),
          table: z
            .string()
            .optional()
            .describe('if set, search in table only, otherwise search whole config'),
          maxCount: z
            .number()
            .optional()
            .describe('if not set, default to 100'),
        },
      },
      (args: { q: string; table?: string; maxCount?: number }) => {
        const q = args.q;
        const table = args.table ?? '';
        let maxCount = args.maxCount ?? 100;
        if (maxCount <= 0) {
          maxCount = 100;
        }

        if (!q || q.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'Query q is not set.' }],
          };
        }

        const cfgValue = editor.cfgValue();
        let result;

        if (table.length === 0) {
          result = ValueSearchService.searchStrInTable(cfgValue, q, maxCount);
        } else {
          const vTable = cfgValue.getTable(table);
          if (!vTable) {
            return {
              content: [
                { type: 'text' as const, text: `Table ${table} not found.` },
              ],
            };
          }
          result = ValueSearchService.searchStrInSingleTable(vTable, q, maxCount);
        }

        const text = formatSearchResults('string', q, table, result.items, true);

        return {
          content: [{ type: 'text' as const, text }],
        };
      },
    );
  }

  // -------------------------------------------------------------------------
  // searchNumber
  // -------------------------------------------------------------------------

  private static registerSearchNumber(server: McpServer, editor: EditorService): void {
    server.registerTool(
      'search_number',
      {
        description: 'search number',
        inputSchema: {
          q: z.number().describe('query'),
          table: z
            .string()
            .optional()
            .describe('if set, search in table only, otherwise search whole config'),
          maxCount: z
            .number()
            .optional()
            .describe('if not set, default to 100'),
        },
      },
      (args: { q: number; table?: string; maxCount?: number }) => {
        const q = args.q;
        const table = args.table ?? '';
        let maxCount = args.maxCount ?? 100;
        if (maxCount <= 0) {
          maxCount = 100;
        }

        const cfgValue = editor.cfgValue();
        let result;

        if (table.length === 0) {
          result = ValueSearchService.searchNumber(cfgValue, BigInt(q), maxCount);
        } else {
          const vTable = cfgValue.getTable(table);
          if (!vTable) {
            return {
              content: [
                { type: 'text' as const, text: `Table ${table} not found.` },
              ],
            };
          }
          result = ValueSearchService.searchNumberInTable(vTable, BigInt(q), maxCount);
        }

        const text = formatSearchResults('number', String(q), table, result.items, false);

        return {
          content: [{ type: 'text' as const, text }],
        };
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers (mirror Java's format method)
// ---------------------------------------------------------------------------

function formatSearchResults(
  _type: 'string' | 'number',
  q: string,
  table: string,
  items: SearchResultItem[],
  includeValue: boolean,
): string {
  if (items.length === 0) {
    return `No value found for query q=${q} table=${table}`;
  }

  const sb: string[] = [];
  sb.push(`Search Results for query q=${q} table=${table}:\n`);
  sb.push('```\n');

  const rows: string[][] = [];
  if (includeValue) {
    rows.push(['table', 'pk', 'fieldChain', 'value']);
    for (const item of items) {
      rows.push([
        item.table,
        item.pk,
        item.fieldChain,
        shortenString(item.value, 48),
      ]);
    }
  } else {
    rows.push(['table', 'pk', 'fieldChain']);
    for (const item of items) {
      rows.push([item.table, item.pk, item.fieldChain]);
    }
  }

  writeCSV(sb, rows);
  sb.push('```\n');

  return sb.join('');
}

function shortenString(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}
