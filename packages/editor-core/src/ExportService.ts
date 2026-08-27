/**
 * ExportService — export a table's records to CSV or SQL format.
 *
 * Provides static methods to generate CSV and SQL strings from a VTable.
 */

import type { CfgValue, VTable } from '@cfgforge/value';
import { ValueToJson } from '@cfgforge/value';
import type { EditorService } from './EditorService';
import type { FieldType, Primitive } from '@cfgforge/schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = 'csv' | 'sql';
export type ExportResultCode = 'ok' | 'tableNotFound';

export interface ExportResult {
  resultCode: ExportResultCode;
  table: string;
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
    let result = '';
    for (let i = 0; i < name.length; i++) {
      const c = name[i];
      const prev = name[i - 1];
      if (i > 0 && prev !== undefined) {
        const isBoundary =
          (isLower(prev) && isUpper(c)) ||
          (isUpper(prev) && isUpper(c) && i + 1 < name.length && isLower(name[i + 1])) ||
          (isDigit(prev) && isLetter(c));
        if (isBoundary) {
          result += '_';
        }
      }
      result += c.toLowerCase();
    }
    return result;
  }

  static async export(editor: EditorService, table: string, format: ExportFormat): Promise<ExportResult> {
    const vTable = editor.cfgValue().getTable(table);
    if (vTable === undefined) {
      return { resultCode: 'tableNotFound', table, content: '' };
    }

    if (format === 'csv') {
      return { resultCode: 'ok', table, content: ExportService.exportCsv(editor.cfgValue(), vTable) };
    } else {
      return { resultCode: 'ok', table, content: ExportService.exportSql(editor.cfgValue(), vTable) };
    }
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

  // -------------------------------------------------------------------------
  // SQL
  // -------------------------------------------------------------------------

  private static exportSql(cfgValue: CfgValue, vTable: VTable): string {
    const tableName = 'cfg_' + ExportService.camelToSnake(vTable.name());
    const fields = vTable.schema.fields();

    // Build records
    const records: Record<string, unknown>[] = [];
    for (const vStruct of vTable.primaryKeyMap.values()) {
      const toJson = new ValueToJson(cfgValue, new Map());
      toJson.setSaveDefault(true);
      const jsonObj = toJson.toJsonVStruct(vStruct);
      const dataObj: Record<string, unknown> = {};
      for (const f of fields) {
        dataObj[f.name] = jsonObj[f.name] ?? null;
      }
      records.push(dataObj);
    }

    const lines: string[] = [];

    // CREATE TABLE
    const colDefs = fields.map(f => `"${f.name}" ${ExportService.sqlType(f.type)}`);
    lines.push(`CREATE TABLE IF NOT EXISTS "${tableName}" (${colDefs.join(', ')});`);

    // INSERT statements
    for (const record of records) {
      const values = fields.map(f => ExportService.sqlSerializeValue(record[f.name]));
      lines.push(`INSERT INTO "${tableName}" VALUES (${values.join(', ')});`);
    }

    return lines.join('\n');
  }

  private static sqlType(type: FieldType): string {
    if (typeof type === 'string') {
      switch (type as Primitive) {
        case 'int':
        case 'long':
        case 'bool':
          return 'INTEGER';
        case 'float':
          return 'REAL';
        case 'str':
        case 'text':
          return 'TEXT';
        default:
          return 'TEXT';
      }
    }
    // FList, FMap, StructRef → TEXT (store JSON)
    return 'TEXT';
  }

  private static sqlSerializeValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (typeof value === 'boolean') {
      return value ? '1' : '0';
    }
    if (typeof value === 'string') {
      return "'" + value.replace(/'/g, "''") + "'";
    }
    // Object or array → JSON string
    const jsonStr = JSON.stringify(value);
    return "'" + jsonStr.replace(/'/g, "''") + "'";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isUpper(c: string): boolean {
  return c >= 'A' && c <= 'Z';
}

function isLower(c: string): boolean {
  return c >= 'a' && c <= 'z';
}

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}

function isLetter(c: string): boolean {
  return isUpper(c) || isLower(c);
}
