/**
 * ExportService — export a table's records to CSV or SQL format.
 *
 * Provides static methods to generate CSV and SQL strings from a VTable.
 * SQL output is delegated to the shared MySQL renderer in @cfgforge/gen
 * (SqlRender), so editor exports and `-gen sql` produce identical SQL.
 */

import type { CfgValue, VTable } from '@cfgforge/value';
import { ValueToJson } from '@cfgforge/value';
import {
  camelToSnake,
  renderTablesSql,
  renderTableSql,
} from '@cfgforge/gen';
import type { EditorService } from './EditorService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = 'csv' | 'sql';
export type ExportResultCode = 'ok' | 'tableNotFound';
export type ExportAllResultCode = 'ok';

export interface ExportResult {
  resultCode: ExportResultCode;
  table: string;
  content: string;
}

export interface ExportAllResult {
  resultCode: ExportAllResultCode;
  content: string;
}

// ---------------------------------------------------------------------------
// ExportService
// ---------------------------------------------------------------------------

export class ExportService {
  /**
   * Convert CamelCase to snake_case.
   * Inserts underscore at:
   * - lowercase→uppercase boundary: heroR → hero_r
   * - uppercase→uppercase+lowercase boundary: HTTPServer → http_server (HTTP→Server)
   * - letter→digit boundary: A2024 → a_2024
   * - digit→letter boundary: 2024C → 2024_c
   */
  static camelToSnake(name: string): string {
    return camelToSnake(name);
  }

  static async export(editor: EditorService, table: string, format: ExportFormat): Promise<ExportResult> {
    const vTable = editor.cfgValue().getTable(table);
    if (vTable === undefined) {
      return { resultCode: 'tableNotFound', table, content: '' };
    }

    if (format === 'csv') {
      return { resultCode: 'ok', table, content: ExportService.exportCsv(editor.cfgValue(), vTable) };
    } else {
      return {
        resultCode: 'ok',
        table,
        content: renderTableSql(vTable, editor.cfgValue()),
      };
    }
  }

  /**
   * Export all tables as one MySQL script (sorted by table name).
   */
  static async exportAllSql(editor: EditorService): Promise<ExportAllResult> {
    const content = renderTablesSql(editor.cfgValue().sortedTables(), editor.cfgValue());
    return { resultCode: 'ok', content };
  }

  // -------------------------------------------------------------------------
  // CSV
  // -------------------------------------------------------------------------

  private static exportCsv(cfgValue: CfgValue, vTable: VTable): string {
    const fields = vTable.schema.fields();
    const fieldNames = fields.map(f => f.name);

    // Build records: iterate primaryKeyMap, convert each VStruct to JSON
    const records: Record<string, unknown>[] = [];
    for (const vStruct of vTable.primaryKeyMap.values()) {
      const toJson = new ValueToJson(cfgValue, new Map());
      toJson.setSaveDefault(true);
      const jsonObj = toJson.toJsonVStruct(vStruct);
      // Remove $type, $note, $fold, $refs, $embed_* keys — keep only data fields
      const dataObj: Record<string, unknown> = {};
      for (const fn of fieldNames) {
        dataObj[fn] = jsonObj[fn] ?? '';
      }
      records.push(dataObj);
    }

    // Build CSV string
    const lines: string[] = [];

    // Header row
    lines.push(fieldNames.map(ExportService.csvEscapeField).join(','));

    // Data rows
    for (const record of records) {
      const values = fieldNames.map(fn => ExportService.csvSerializeValue(record[fn]));
      lines.push(values.join(','));
    }

    return '\uFEFF' + lines.join('\r\n');
  }

  private static csvEscapeField(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  private static csvSerializeValue(value: unknown): string {
    let str: string;
    if (value === null || value === undefined) {
      str = '';
    } else if (typeof value === 'string') {
      str = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      str = String(value);
    } else {
      // Object or array → JSON
      str = JSON.stringify(value);
    }
    return ExportService.csvEscapeField(str);
  }
}
