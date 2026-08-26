/**
 * TableCreateService — TypeScript port of Java `configgen.editorserver.TableCreateService`.
 *
 * Creates new table/struct/enum definitions and writes them back to config.cfg.
 * Optionally creates empty CSV data files for table types.
 *
 * Key differences from Java:
 * - Java methods are static taking (Path dataDir, ...); TS takes an EditorService
 *   instance and uses its rootDir()/context() accessors.
 * - Java uses JSONObject for the request; TS uses a plain object (TableCreateRequest).
 * - Java's SchemaToCsvHeader is not ported; we inline a simple CSV header generator
 *   that handles primitive fields (span=1), which covers all new-table use cases.
 * - TS writes via fs.writeFileSync (synchronous, matching Java's CachedFiles.writeFile).
 *
 * Java source: configgen.editorserver.TableCreateService.java (363 lines)
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  CfgReader,
  CfgWriter,
  CfgSchema,
  CfgSchemaErrs,
  CfgSchemaException,
  ParseError,
  TableSchema,
  StructSchema,
  FieldSchema,
  KeySchema,
  ENo,
  EEnum,
  Primitive,
  StructRef,
  AutoOrPack,
  Metadata_of,
  CommentData,
  metaEnumValuesOfAssigned,
  tableNameNotLowerCase,
  type Nameable,
  type FieldType,
  fieldSpan,
} from '@cfggen/schema';
import { writeCSVToFile, writeCSVToFileAsync, getDefaultFileSystem } from '@cfggen/shared';
import type { EditorService } from './EditorService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateResult {
  ok: boolean;
  errors: string[];
}

export interface FieldRequest {
  name: string;
  type?: string;
  comment?: string;
}

export interface EnumValueRequest {
  name: string;
  comment?: string;
}

export interface TableCreateRequest {
  type: 'table' | 'struct' | 'enum';
  name: string;
  fields?: FieldRequest[];
  primaryKey?: string[];
  withDataFile?: boolean;
  enumValues?: EnumValueRequest[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// ---------------------------------------------------------------------------
// TableCreateService
// ---------------------------------------------------------------------------

export class TableCreateService {
  /**
   * Create a new table/struct/enum and write back to config.cfg.
   * Optionally creates an empty CSV data file for table types.
   *
   * Java: TableCreateService.createTable(dataDir, existingText, request)
   */
  static createTable(editor: EditorService, request: TableCreateRequest): CreateResult {
    const errors: string[] = [];

    // 1. Read and parse existing config.cfg from disk
    const cfgPath = path.join(editor.rootDir(), 'config.cfg');
    let existingText = '';
    try {
      if (fs.existsSync(cfgPath)) {
        existingText = fs.readFileSync(cfgPath, 'utf-8');
      }
    } catch (e) {
      errors.push(`Failed to read config.cfg: ${(e as Error).message}`);
      return { ok: false, errors };
    }

    let schema: CfgSchema;
    try {
      if (existingText.trim().length > 0) {
        schema = CfgReader.parse(existingText);
      } else {
        schema = CfgSchema.of();
      }
    } catch (e) {
      if (e instanceof ParseError) {
        errors.push(`Failed to parse existing config.cfg: ${e.message}`);
      } else {
        errors.push(`Failed to parse existing config.cfg: ${(e as Error).message}`);
      }
      return { ok: false, errors };
    }

    // 2. Validate name
    const name = request.name;
    if (!name || name.trim().length === 0) {
      errors.push('Name is required');
      return { ok: false, errors };
    }
    if (!IDENTIFIER_PATTERN.test(name)) {
      errors.push(`Name must be a valid identifier: ${name}`);
      return { ok: false, errors };
    }

    // Check name conflict
    for (const item of schema.items()) {
      if (item.name().toLowerCase() === name.toLowerCase()) {
        errors.push(`Name already exists: ${name}`);
        return { ok: false, errors };
      }
    }

    // 3. Build new element based on type
    let newElement: Nameable | null = null;
    try {
      switch (request.type) {
        case 'table':
          newElement = TableCreateService.buildTableSchema(request, name);
          break;
        case 'struct':
          newElement = TableCreateService.buildStructSchema(request, name);
          break;
        case 'enum':
          newElement = TableCreateService.buildEnumTableSchema(request, name);
          break;
        default:
          errors.push(`Unknown type: ${request.type}, must be 'table', 'struct', or 'enum'`);
          return { ok: false, errors };
      }
    } catch (e) {
      if (e instanceof CfgSchemaException) {
        for (const err of e.errs.errs) {
          errors.push(err.msg());
        }
      } else {
        errors.push((e as Error).message);
      }
      return { ok: false, errors };
    }

    if (newElement === null) {
      return { ok: false, errors };
    }

    // 4. Add to schema and validate
    schema.add(newElement);

    try {
      const errs = schema.resolve();
      errs.checkErrors('createTable');
    } catch (e) {
      if (e instanceof CfgSchemaException) {
        for (const err of e.errs.errs) {
          errors.push(err.msg());
        }
      } else {
        errors.push((e as Error).message);
      }
      return { ok: false, errors };
    }

    // 5. Optionally create empty CSV data file (before writing config.cfg,
    //    so if CSV creation fails, config.cfg is not modified)
    if (request.type === 'table' && request.withDataFile) {
      const table = newElement as TableSchema;
      if (!table.meta().hasEnumValues()) {
        try {
          TableCreateService.createEmptyCsv(editor.rootDir(), table);
        } catch (e) {
          errors.push(`Failed to create data file: ${(e as Error).message}`);
          return { ok: false, errors };
        }
      }
    }

    // 6. Write config.cfg
    try {
      const cfgText = CfgWriter.stringify(schema);
      fs.writeFileSync(cfgPath, cfgText, 'utf8');
    } catch (e) {
      errors.push(`Failed to write config.cfg: ${(e as Error).message}`);
      return { ok: false, errors };
    }

    return { ok: true, errors: [] };
  }

  /**
   * Async variant of createTable.
   * Uses CfgFileSystem abstraction (Tauri/WebView compatible).
   */
  static async createTableAsync(editor: EditorService, request: TableCreateRequest): Promise<CreateResult> {
    const errors: string[] = [];
    const dfs = getDefaultFileSystem();

    // 1. Read and parse existing config.cfg from disk
    const cfgPath = path.join(editor.rootDir(), 'config.cfg');
    let existingText = '';
    try {
      if (await dfs.exists(cfgPath)) {
        const bytes = await dfs.readFile(cfgPath);
        existingText = Buffer.from(bytes).toString('utf-8');
      }
    } catch (e) {
      errors.push(`Failed to read config.cfg: ${(e as Error).message}`);
      return { ok: false, errors };
    }

    let schema: CfgSchema;
    try {
      if (existingText.trim().length > 0) {
        schema = CfgReader.parse(existingText);
      } else {
        schema = CfgSchema.of();
      }
    } catch (e) {
      if (e instanceof ParseError) {
        errors.push(`Failed to parse existing config.cfg: ${e.message}`);
      } else {
        errors.push(`Failed to parse existing config.cfg: ${(e as Error).message}`);
      }
      return { ok: false, errors };
    }

    // 2. Validate name
    const name = request.name;
    if (!name || name.trim().length === 0) {
      errors.push('Name is required');
      return { ok: false, errors };
    }
    if (!IDENTIFIER_PATTERN.test(name)) {
      errors.push(`Name must be a valid identifier: ${name}`);
      return { ok: false, errors };
    }

    // Check name conflict
    for (const item of schema.items()) {
      if (item.name().toLowerCase() === name.toLowerCase()) {
        errors.push(`Name already exists: ${name}`);
        return { ok: false, errors };
      }
    }

    // 3. Build new element based on type
    let newElement: Nameable | null = null;
    try {
      switch (request.type) {
        case 'table':
          newElement = TableCreateService.buildTableSchema(request, name);
          break;
        case 'struct':
          newElement = TableCreateService.buildStructSchema(request, name);
          break;
        case 'enum':
          newElement = TableCreateService.buildEnumTableSchema(request, name);
          break;
        default:
          errors.push(`Unknown type: ${request.type}, must be 'table', 'struct', or 'enum'`);
          return { ok: false, errors };
      }
    } catch (e) {
      if (e instanceof CfgSchemaException) {
        for (const err of e.errs.errs) {
          errors.push(err.msg());
        }
      } else {
        errors.push((e as Error).message);
      }
      return { ok: false, errors };
    }

    if (newElement === null) {
      return { ok: false, errors };
    }

    // 4. Add to schema and validate
    schema.add(newElement);

    try {
      const errs = schema.resolve();
      errs.checkErrors('createTable');
    } catch (e) {
      if (e instanceof CfgSchemaException) {
        for (const err of e.errs.errs) {
          errors.push(err.msg());
        }
      } else {
        errors.push((e as Error).message);
      }
      return { ok: false, errors };
    }

    // 5. Optionally create empty CSV data file
    if (request.type === 'table' && request.withDataFile) {
      const table = newElement as TableSchema;
      if (!table.meta().hasEnumValues()) {
        try {
          await TableCreateService.createEmptyCsvAsync(editor.rootDir(), table);
        } catch (e) {
          errors.push(`Failed to create data file: ${(e as Error).message}`);
          return { ok: false, errors };
        }
      }
    }

    // 6. Write config.cfg
    try {
      const cfgText = CfgWriter.stringify(schema);
      await dfs.writeFile(cfgPath, Buffer.from(cfgText, 'utf8'));
    } catch (e) {
      errors.push(`Failed to write config.cfg: ${(e as Error).message}`);
      return { ok: false, errors };
    }

    return { ok: true, errors: [] };
  }

  /**
   * Java: TableCreateService.createDataFile(dataDir, tableName)
   */
  static createDataFile(editor: EditorService, tableName: string): CreateResult {
    const errors: string[] = [];

    // Read and parse config.cfg
    const cfgPath = path.join(editor.rootDir(), 'config.cfg');
    let cfgText: string;
    try {
      cfgText = fs.readFileSync(cfgPath, 'utf-8');
    } catch (e) {
      errors.push(`Failed to read config.cfg: ${(e as Error).message}`);
      return { ok: false, errors };
    }

    let schema: CfgSchema;
    try {
      schema = CfgReader.parse(cfgText);
      schema.resolve().checkErrors('createDataFile');
    } catch (e) {
      errors.push(`Failed to parse/resolve schema: ${(e as Error).message}`);
      return { ok: false, errors };
    }

    // Find target table
    let targetTable: TableSchema | null = null;
    for (const item of schema.items()) {
      if (item instanceof TableSchema && item.name() === tableName) {
        targetTable = item;
        break;
      }
    }

    if (targetTable === null) {
      errors.push(`Table not found: ${tableName}`);
      return { ok: false, errors };
    }

    if (targetTable.isJson()) {
      errors.push(`Table uses JSON data source, cannot create CSV file: ${tableName}`);
      return { ok: false, errors };
    }

    if (targetTable.meta().hasEnumValues()) {
      errors.push(`Enum table does not need a data file: ${tableName}`);
      return { ok: false, errors };
    }

    // Check if file already exists
    const csvPath = path.join(editor.rootDir(), tableName + '.csv');
    if (fs.existsSync(csvPath)) {
      errors.push(`Data file already exists: ${path.basename(csvPath)}`);
      return { ok: false, errors };
    }

    try {
      TableCreateService.createEmptyCsv(editor.rootDir(), targetTable);
    } catch (e) {
      errors.push(`Failed to create data file: ${(e as Error).message}`);
      return { ok: false, errors };
    }

    return { ok: true, errors: [] };
  }

  /**
   * Async variant of createDataFile.
   * Uses CfgFileSystem abstraction (Tauri/WebView compatible).
   */
  static async createDataFileAsync(editor: EditorService, tableName: string): Promise<CreateResult> {
    const errors: string[] = [];
    const dfs = getDefaultFileSystem();

    // Read and parse config.cfg
    const cfgPath = path.join(editor.rootDir(), 'config.cfg');
    let cfgText: string;
    try {
      const bytes = await dfs.readFile(cfgPath);
      cfgText = Buffer.from(bytes).toString('utf-8');
    } catch (e) {
      errors.push(`Failed to read config.cfg: ${(e as Error).message}`);
      return { ok: false, errors };
    }

    let schema: CfgSchema;
    try {
      schema = CfgReader.parse(cfgText);
      schema.resolve().checkErrors('createDataFile');
    } catch (e) {
      errors.push(`Failed to parse/resolve schema: ${(e as Error).message}`);
      return { ok: false, errors };
    }

    // Find target table
    let targetTable: TableSchema | null = null;
    for (const item of schema.items()) {
      if (item instanceof TableSchema && item.name() === tableName) {
        targetTable = item;
        break;
      }
    }

    if (targetTable === null) {
      errors.push(`Table not found: ${tableName}`);
      return { ok: false, errors };
    }

    if (targetTable.isJson()) {
      errors.push(`Table uses JSON data source, cannot create CSV file: ${tableName}`);
      return { ok: false, errors };
    }

    if (targetTable.meta().hasEnumValues()) {
      errors.push(`Enum table does not need a data file: ${tableName}`);
      return { ok: false, errors };
    }

    // Check if file already exists
    const csvPath = path.join(editor.rootDir(), tableName + '.csv');
    if (await dfs.exists(csvPath)) {
      errors.push(`Data file already exists: ${path.basename(csvPath)}`);
      return { ok: false, errors };
    }

    try {
      await TableCreateService.createEmptyCsvAsync(editor.rootDir(), targetTable);
    } catch (e) {
      errors.push(`Failed to create data file: ${(e as Error).message}`);
      return { ok: false, errors };
    }

    return { ok: true, errors: [] };
  }
  // -------------------------------------------------------------------------

  private static buildTableSchema(request: TableCreateRequest, name: string): TableSchema {
    // Table name must be lowercase
    if (name !== name.toLowerCase()) {
      const errs = CfgSchemaErrs.of();
      errs.addErr(tableNameNotLowerCase(name));
      throw new CfgSchemaException(errs);
    }

    const fields = TableCreateService.buildFields(request.fields);
    if (fields.length === 0) {
      throw new Error('Table must have at least one field');
    }

    // Primary key
    let primaryKey: KeySchema;
    if (request.primaryKey && request.primaryKey.length > 0) {
      primaryKey = new KeySchema(request.primaryKey);
    } else {
      primaryKey = new KeySchema([fields[0].name]);
    }

    return new TableSchema(
      name.toLowerCase(),
      primaryKey,
      ENo.NO,
      false,
      Metadata_of(),
      fields,
      [],
      [],
    );
  }

  private static buildStructSchema(request: TableCreateRequest, name: string): StructSchema {
    const fields = TableCreateService.buildFields(request.fields);
    if (fields.length === 0) {
      throw new Error('Struct must have at least one field');
    }

    return new StructSchema(
      name,
      AutoOrPack.AUTO,
      Metadata_of(),
      fields,
      [],
    );
  }

  private static buildEnumTableSchema(request: TableCreateRequest, name: string): TableSchema {
    // Table name must be lowercase
    if (name !== name.toLowerCase()) {
      const errs = CfgSchemaErrs.of();
      errs.addErr(tableNameNotLowerCase(name));
      throw new CfgSchemaException(errs);
    }

    const enumValues = request.enumValues;
    if (!enumValues || enumValues.length === 0) {
      throw new Error('Enum must have at least one value');
    }

    const values = enumValues.map((v, i) => ({
      name: v.name,
      comment: v.comment ?? '',
      number: i,
    }));

    const meta = Metadata_of();
    meta.putEnumValues(metaEnumValuesOfAssigned(values));

    // Enum's field is "name"
    const nameField = new FieldSchema(
      'name',
      Primitive.STRING,
      AutoOrPack.AUTO,
      Metadata_of(),
    );

    return new TableSchema(
      name.toLowerCase(),
      new KeySchema(['name']),
      new EEnum('name'),
      false,
      meta,
      [nameField],
      [],
      [],
    );
  }

  private static buildFields(fieldRequests?: FieldRequest[]): FieldSchema[] {
    if (!fieldRequests) {
      return [];
    }

    const fields: FieldSchema[] = [];
    for (const f of fieldRequests) {
      const fieldName = f.name;
      if (!fieldName || fieldName.trim().length === 0) {
        throw new Error('Field name is required');
      }
      if (!IDENTIFIER_PATTERN.test(fieldName)) {
        throw new Error(`Invalid field name: ${fieldName}`);
      }

      const fieldType = TableCreateService.parseFieldType(f.type ?? 'int');
      const meta = Metadata_of();

      if (f.comment && f.comment.trim().length > 0) {
        meta.putComment(new CommentData('', f.comment, null));
      }

      fields.push(new FieldSchema(fieldName, fieldType, AutoOrPack.AUTO, meta));
    }
    return fields;
  }

  private static parseFieldType(type: string): FieldType {
    switch (type.toLowerCase()) {
      case 'bool':
        return Primitive.BOOL;
      case 'int':
        return Primitive.INT;
      case 'long':
        return Primitive.LONG;
      case 'float':
        return Primitive.FLOAT;
      case 'string':
      case 'str':
        return Primitive.STRING;
      case 'text':
        return Primitive.TEXT;
      default:
        return new StructRef(type);
    }
  }

  // -------------------------------------------------------------------------
  // Internal: CSV creation
  // -------------------------------------------------------------------------

  /**
   * Create an empty CSV file with header rows (comment row + name row).
   * Simplified version of Java's SchemaToCsvHeader — only handles flat fields
   * (span=1), which is sufficient for newly created tables.
   */
  private static createEmptyCsv(rootDir: string, table: TableSchema): void {
    const commentRow: string[] = [];
    const nameRow: string[] = [];

    for (const field of table.fields()) {
      const span = fieldSpan(field);
      const comment = field.comment() ?? '';

      if (span === 1) {
        // Single column field
        nameRow.push(field.name);
        commentRow.push(comment);
      } else {
        // Multi-span field (list, map, struct ref) — use _-prefixed names
        // For simple new tables this path won't be hit, but handle gracefully
        for (let i = 0; i < span; i++) {
          nameRow.push(i === 0 ? field.name : `_${i}`);
          commentRow.push(i === 0 ? comment : '');
        }
      }
    }

    // If no fields (shouldn't happen for valid tables), add at least one column
    if (nameRow.length === 0) {
      nameRow.push('id');
      commentRow.push('');
    }

    const csvPath = path.join(rootDir, table.name() + '.csv');
    writeCSVToFile(csvPath, [commentRow, nameRow]);
  }

  /**
   * Async variant of createEmptyCsv.
   * Uses CfgFileSystem abstraction (Tauri/WebView compatible).
   */
  private static async createEmptyCsvAsync(rootDir: string, table: TableSchema): Promise<void> {
    const commentRow: string[] = [];
    const nameRow: string[] = [];

    for (const field of table.fields()) {
      const span = fieldSpan(field);
      const comment = field.comment() ?? '';

      if (span === 1) {
        nameRow.push(field.name);
        commentRow.push(comment);
      } else {
        for (let i = 0; i < span; i++) {
          nameRow.push(i === 0 ? field.name : `_${i}`);
          commentRow.push(i === 0 ? comment : '');
        }
      }
    }

    if (nameRow.length === 0) {
      nameRow.push('id');
      commentRow.push('');
    }

    const csvPath = path.join(rootDir, table.name() + '.csv');
    await writeCSVToFileAsync(csvPath, [commentRow, nameRow]);
  }
}
