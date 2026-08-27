/**
 * SqlRender — shared MySQL DDL/DML renderer for SQL output.
 *
 * Used by both:
 * - `SqlGenerator` (CLI `-gen sql`): writes .sql files for tables
 * - `editor-core ExportService` (editor "Export SQL" button): in-memory string
 *
 * Dialect: MySQL 5.7/8.0 (backtick identifiers, ENGINE=InnoDB, utf8mb4).
 *
 * Type mapping (schema FieldType → MySQL column type):
 * - bool          → tinyint(1)     NOT NULL DEFAULT '0'
 * - int           → int(11)        NOT NULL DEFAULT '0'
 * - long          → bigint(20)     NOT NULL DEFAULT '0'
 * - float         → double         NOT NULL DEFAULT '0'   (MySQL float loses precision)
 * - str (pk part) → varchar(255)   NOT NULL
 * - str / text    → text           DEFAULT NULL
 * - list/map/structRef/interface → text DEFAULT NULL (JSON-serialized)
 *
 * Constraints:
 * - PRIMARY KEY from table.primaryKey (multi-field keys supported)
 * - UNIQUE KEY from table.uniqueKeys()
 * - Field comments from FieldSchema.comment()
 */

import {
  isPrimitive,
  isFList,
  isFMap,
  isStructRef,
  type FieldSchema,
  type FieldType,
  type KeySchema,
  type TableSchema,
} from '@cfgforge/schema';
import type { CfgValue, VStruct, VTable } from '@cfgforge/value';
import { ValueToJson } from '@cfgforge/value';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface SqlRenderOptions {
  /** Emit `DROP TABLE IF EXISTS` before each CREATE (default true). */
  dropIfExists: boolean;
  /** Use `CREATE TABLE` (false) or `CREATE TABLE IF NOT EXISTS` (default true). */
  createIfNotExists: boolean;
  /** Rows per INSERT statement (default 100; 0/1 = one row per statement). */
  insertBatchSize: number;
  /** Table name prefix (default 'cfg_'). */
  tablePrefix: string;
}

export function defaultSqlRenderOptions(): SqlRenderOptions {
  return {
    dropIfExists: true,
    createIfNotExists: true,
    insertBatchSize: 100,
    tablePrefix: 'cfg_',
  };
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

/**
 * Convert CamelCase to snake_case.
 * - lowercase→uppercase boundary: heroR → hero_r
 * - uppercase→uppercase+lowercase boundary: HTTPServer → http_server
 * - digit→letter boundary: 2024C → 2024_c
 */
export function camelToSnake(name: string): string {
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

function isUpper(c: string): boolean { return c >= 'A' && c <= 'Z'; }
function isLower(c: string): boolean { return c >= 'a' && c <= 'z'; }
function isDigit(c: string): boolean { return c >= '0' && c <= '9'; }
function isLetter(c: string): boolean { return isLower(c) || isUpper(c); }

/** MySQL table name for a schema table: prefix + snake_case(full name path). */
export function sqlTableName(schemaName: string, prefix: string): string {
  // fullName may contain dots (namespace path); map each path segment
  const snake = schemaName.split('.').map(camelToSnake).join('_');
  return prefix + snake;
}

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

/** Escape a string for use inside a single-quoted SQL literal (MySQL). */
export function escapeSqlString(s: string): string {
  // MySQL: backslash must be doubled, then quote doubled
  return s.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

/** Escape an identifier (column/table name) with backticks. */
export function escapeIdentifier(name: string): string {
  return '`' + name.replace(/`/g, '``') + '`';
}

function escapeComment(s: string): string {
  // Comment text: strip newlines, escape quotes and backslashes
  return s.replace(/[\r\n]+/g, ' ').replace(/\\/g, '\\\\').replace(/'/g, "''");
}

// ---------------------------------------------------------------------------
// Type mapping
// ---------------------------------------------------------------------------

/**
 * MySQL column type for a schema field type.
 * @param isPrimaryKeyPart the field participates in PRIMARY KEY / UNIQUE KEY
 */
export function sqlColumnType(type: FieldType, isPrimaryKeyPart: boolean): string {
  if (isPrimitive(type)) {
    switch (type) {
      case 'bool':
        return "tinyint(1) NOT NULL DEFAULT '0'";
      case 'int':
        return "int(11) NOT NULL DEFAULT '0'";
      case 'long':
        return "bigint(20) NOT NULL DEFAULT '0'";
      case 'float':
        return "double NOT NULL DEFAULT '0'";
      case 'str':
        return isPrimaryKeyPart ? 'varchar(255) NOT NULL' : 'text DEFAULT NULL';
      case 'text':
        return 'text DEFAULT NULL';
    }
  }
  // FList / FMap / StructRef / interface fields → JSON-serialized TEXT
  return 'text DEFAULT NULL';
}

// ---------------------------------------------------------------------------
// Key handling
// ---------------------------------------------------------------------------

/** True if the field (by name) participates in the given key. */
function isKeyPart(key: KeySchema | null, fieldName: string): boolean {
  if (key === null) return false;
  return key.fields().includes(fieldName);
}

interface KeyInfo {
  /** MySQL index name, e.g. PRIMARY / uk_<table>_<fields> */
  indexName: string;
  /** Escaped column names in key order. */
  columns: string[];
  isPrimary: boolean;
}

function primaryKeyInfo(table: TableSchema, prefix: string): KeyInfo | null {
  const fields = table.primaryKey.fields();
  if (fields.length === 0) return null;
  return {
    indexName: 'PRIMARY',
    columns: fields.map(escapeIdentifier),
    isPrimary: true,
  };
}

function uniqueKeyInfos(table: TableSchema, tableName: string): KeyInfo[] {
  const result: KeyInfo[] = [];
  for (const uk of table.uniqueKeys()) {
    const fields = uk.fields();
    if (fields.length === 0) continue;
    // Index name: uk_<table>_<f1>_<f2>, truncated to MySQL 64-char limit
    const indexName = ('uk_' + tableName + '_' + fields.join('_')).slice(0, 64);
    result.push({
      indexName,
      columns: fields.map(escapeIdentifier),
      isPrimary: false,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Value serialization
// ---------------------------------------------------------------------------

/** Serialize a JSON value (from ValueToJson) to a SQL literal. */
function sqlLiteral(value: unknown): string {
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
    return "'" + escapeSqlString(value) + "'";
  }
  // Object or array → JSON string (nested structures, lists, maps)
  const jsonStr = JSON.stringify(value);
  return "'" + escapeSqlString(jsonStr) + "'";
}

/** Extract data field values (in schema order) from a record as JSON values. */
function recordToJsonValues(cfgValue: CfgValue, record: VStruct, fields: FieldSchema[]): unknown[] {
  const toJson = new ValueToJson(cfgValue, new Map());
  toJson.setSaveDefault(true);
  const jsonObj = toJson.toJsonVStruct(record);
  const values: unknown[] = [];
  for (const f of fields) {
    values.push(jsonObj[f.name] ?? null);
  }
  return values;
}

// ---------------------------------------------------------------------------
// Table rendering
// ---------------------------------------------------------------------------

/**
 * Render a single table as MySQL SQL (CREATE TABLE + INSERTs).
 *
 * @param vTable table with schema and records
 * @param cfgValue owning CfgValue (needed by ValueToJson for VText resolution)
 * @param options render options (undefined = defaults)
 */
export function renderTableSql(
  vTable: VTable,
  cfgValue: CfgValue,
  options?: Partial<SqlRenderOptions>,
): string {
  const opts = { ...defaultSqlRenderOptions(), ...options };
  const table = vTable.schema;
  const fields = table.fields();
  const tableName = sqlTableName(table.name(), opts.tablePrefix);

  // ---- Column definitions ----
  const columnDefs: string[] = [];
  for (const field of fields) {
    const inPrimary = isKeyPart(table.primaryKey, field.name);
    const inUnique = table.uniqueKeys().some((uk) => isKeyPart(uk, field.name));
    const keyPart = inPrimary || inUnique;
    const typeStr = sqlColumnType(field.type, keyPart);
    const comment = field.comment();
    const commentPart = comment.length > 0 ? " COMMENT '" + escapeComment(comment) + "'" : '';
    columnDefs.push(`  ${escapeIdentifier(field.name)} ${typeStr}${commentPart}`);
  }

  // ---- Keys ----
  const pk = primaryKeyInfo(table, opts.tablePrefix);
  if (pk !== null) {
    columnDefs.push(`  PRIMARY KEY (${pk.columns.join(', ')})`);
  }
  for (const uk of uniqueKeyInfos(table, tableName)) {
    columnDefs.push(`  UNIQUE KEY ${escapeIdentifier(uk.indexName)} (${uk.columns.join(', ')})`);
  }

  // ---- Assemble CREATE TABLE ----
  const lines: string[] = [];
  if (opts.dropIfExists) {
    lines.push(`DROP TABLE IF EXISTS ${escapeIdentifier(tableName)};`);
    lines.push('');
  }

  const createKeyword = opts.createIfNotExists ? 'CREATE TABLE IF NOT EXISTS' : 'CREATE TABLE';
  const tableComment = table.comment();
  const commentSuffix = tableComment.length > 0
    ? " COMMENT='" + escapeComment(tableComment) + "'"
    : '';
  lines.push(`${createKeyword} ${escapeIdentifier(tableName)} (`);
  lines.push(columnDefs.join(',\n'));
  lines.push(`) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4${commentSuffix};`);
  lines.push('');

  // ---- INSERT rows ----
  const records = Array.from(vTable.primaryKeyMap.values());
  if (records.length > 0) {
    const columnList = fields.map((f) => escapeIdentifier(f.name)).join(', ');
    const batchSize = Math.max(1, opts.insertBatchSize);
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const valueRows = batch.map((record) => {
        const values = recordToJsonValues(cfgValue, record, fields);
        return '(' + values.map(sqlLiteral).join(', ') + ')';
      });
      lines.push(
        `INSERT INTO ${escapeIdentifier(tableName)} (${columnList}) VALUES\n  ` +
        valueRows.join(',\n  ') + ';',
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Multi-table (whole database) rendering
// ---------------------------------------------------------------------------

/**
 * Render multiple tables as a single SQL script (sorted by table name).
 */
export function renderTablesSql(
  vTables: VTable[],
  cfgValue: CfgValue,
  options?: Partial<SqlRenderOptions>,
): string {
  const sorted = [...vTables].sort((a, b) =>
    a.schema.name().localeCompare(b.schema.name()),
  );
  const parts = sorted.map((vt) => renderTableSql(vt, cfgValue, options));
  return parts.join('\n');
}
