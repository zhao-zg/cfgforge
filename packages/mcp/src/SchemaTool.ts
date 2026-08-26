/**
 * SchemaTool — TypeScript port of Java `configgen.mcpserver.SchemaTool`.
 *
 * 3-level information disclosure:
 * 1. listModule — list all module names (information entry point)
 * 2. listTable — list table names within a module + module rule
 * 3. readTableSchema — return table schema + related info
 *
 * Java source: configgen.mcpserver.SchemaTool.java (159 lines)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EditorService } from '@cfgforge/editor-core';
import { TableRelatedInfoFinder } from '@cfgforge/gen';
import type { RelatedInfo, ModuleRule } from '@cfgforge/gen';
import { exampleToPrompt } from '@cfgforge/gen';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOP = '_top';

// ---------------------------------------------------------------------------
// SchemaTool
// ---------------------------------------------------------------------------

export class SchemaTool {
  /**
   * Register the 3 schema tools on the MCP server.
   */
  static register(server: McpServer, editor: EditorService): void {
    SchemaTool.registerListModule(server, editor);
    SchemaTool.registerListTable(server, editor);
    SchemaTool.registerReadTableSchema(server, editor);
  }

  // -------------------------------------------------------------------------
  // listModule
  // -------------------------------------------------------------------------

  private static registerListModule(server: McpServer, editor: EditorService): void {
    server.registerTool(
      'list_module',
      {
        description: 'list module names. information entry point',
      },
      () => {
        const cfgValue = editor.cfgValue();
        const moduleDescriptionMap = new Map<string, string>();

        for (const table of cfgValue.sortedTables()) {
          const namespace = table.schema.namespace();
          const moduleName = namespace.length === 0 ? TOP : namespace;

          if (!moduleDescriptionMap.has(moduleName)) {
            const moduleRule: ModuleRule | null =
              TableRelatedInfoFinder.findModuleRuleForTable(editor.context(), table.schema);
            const description =
              moduleRule !== null && moduleRule.description.length > 0
                ? moduleRule.description
                : '';
            moduleDescriptionMap.set(moduleName, description);
          }
        }

        const modules = Array.from(moduleDescriptionMap.entries()).map(([name, desc]) => ({
          moduleName: name,
          description: desc,
        }));

        const text = modules
          .map((m) =>
            m.description.length === 0
              ? `- ${m.moduleName}\n`
              : `- ${m.moduleName}: ${m.description}\n`,
          )
          .join('');

        return {
          content: [{ type: 'text' as const, text }],
        };
      },
    );
  }

  // -------------------------------------------------------------------------
  // listTable
  // -------------------------------------------------------------------------

  private static registerListTable(server: McpServer, editor: EditorService): void {
    server.registerTool(
      'list_table',
      {
        description: 'list table names in module',
        inputSchema: {
          inModule: z.string().describe('module from list_module'),
        },
      },
      (args: { inModule: string }) => {
        const inModule = args.inModule;
        if (!inModule) {
          return {
            content: [{ type: 'text' as const, text: 'Error: ModuleNotSet' }],
          };
        }

        const cfgValue = editor.cfgValue();
        const isTop = inModule === TOP;
        const tableNames: string[] = [];
        let firstTableSchema = null;

        for (const table of cfgValue.sortedTables()) {
          const isMatch =
            (isTop && table.schema.namespace().length === 0) ||
            table.schema.namespace() === inModule;
          if (isMatch) {
            tableNames.push(table.name());
            if (firstTableSchema === null) {
              firstTableSchema = table.schema;
            }
          }
        }

        if (firstTableSchema === null) {
          return {
            content: [{ type: 'text' as const, text: 'Error: ModuleNotFound' }],
          };
        }

        const moduleRule: ModuleRule | null =
          TableRelatedInfoFinder.findModuleRuleForTable(editor.context(), firstTableSchema);
        const description =
          moduleRule !== null && moduleRule.description.length > 0
            ? moduleRule.description
            : '';
        const rule = moduleRule !== null && moduleRule.rule.length > 0 ? moduleRule.rule : '';

        const text = [
          `Module: ${inModule}`,
          description ? `Description: ${description}` : '',
          rule ? `Rule: ${rule}` : '',
          `Tables:`,
          ...tableNames.map((t) => `  - ${t}`),
        ]
          .filter((line) => line.length > 0)
          .join('\n');

        return {
          content: [{ type: 'text' as const, text }],
        };
      },
    );
  }

  // -------------------------------------------------------------------------
  // readTableSchema
  // -------------------------------------------------------------------------

  private static registerReadTableSchema(server: McpServer, editor: EditorService): void {
    server.registerTool(
      'read_table_schema',
      {
        description: 'read table schema',
        inputSchema: {
          table: z.string().describe('table full name'),
        },
      },
      (args: { table: string }) => {
        const tableName = args.table;
        const cfgValue = editor.cfgValue();
        const vTable = cfgValue.getTable(tableName);

        if (!vTable) {
          return {
            content: [{ type: 'text' as const, text: `Error: TableNotFound` }],
          };
        }

        const relatedInfo: RelatedInfo = TableRelatedInfoFinder.findRelatedInfo(
          editor.context(),
          cfgValue,
          vTable,
        );

        const text = formatRelatedInfo(tableName, relatedInfo);

        return {
          content: [{ type: 'text' as const, text }],
        };
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers (mirror Java's asTextContent methods)
// ---------------------------------------------------------------------------

function formatRelatedInfo(tableName: string, info: RelatedInfo): string {
  const sb: string[] = [];
  sb.push(`Table: ${tableName}\n`);
  sb.push('<related_schema>\n');
  sb.push('```\n');
  sb.push(info.relatedSchema);
  sb.push('```\n</related_schema>\n\n');

  for (const recordList of info.relatedTableRecordListInCsv) {
    sb.push(`\`\`\`csv table=${recordList.table} recordCount=${recordList.recordCount}\n`);
    sb.push(recordList.contentInCsvFormat);
    sb.push('```\n\n');
  }

  if (info.otherTableCounts.length > 0) {
    sb.push('```csv table,recordCount\n');
    for (const tc of info.otherTableCounts) {
      sb.push(`${tc.table},${tc.recordCount}\n`);
    }
    sb.push('```\n\n');
  }

  if (info.rule && info.rule.trim().length > 0) {
    sb.push('<rule>\n');
    sb.push(info.rule);
    sb.push('</rule>\n\n');
  }

  if (info.example) {
    sb.push('<example>\n');
    sb.push(exampleToPrompt(info.example));
    sb.push('</example>\n\n');
  }

  return sb.join('');
}
