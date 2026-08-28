/**
 * SchemaFieldService — 字段级编辑（增/删/改）的后端服务。
 *
 * 与 SchemaRelationService 一致的 mutate 管道：
 *   1. 读 config.cfg（同步 fs 或 CfgFileSystem 抽象）
 *   2. CfgReader.parse(existingText)
 *   3. 定位目标 Structural（TableSchema 或 StructSchema）
 *   4. addField / updateField / removeField
 *   5. schema.resolve() + errs.checkErrors('fieldEdit')
 *   6. CfgWriter.stringify(schema) → 写回 config.cfg
 *
 * 保护规则：
 * - 字段名必须合法 identifier；重名拒绝。
 * - removeField 拒绝：主键字段、本表 FK 本地键、被其他表 FK 引用（跨表）的字段。
 * - 同步 + async 双变体；async 版通过 CfgFileSystem 抽象（Tauri/WebView 兼容），
 *   调用方负责 editor.reload()。
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  CfgReader,
  CfgWriter,
  CfgSchema,
  CfgSchemaException,
  ParseError,
  TableSchema,
  StructSchema,
  FieldSchema,
  AutoOrPack,
  Metadata_of,
  CommentData,
  RefPrimary,
  type Structural,
  type FieldType,
} from '@cfgforge/schema';
import { getDefaultFileSystem } from '@cfgforge/shared';
import type { EditorService } from './EditorService.js';
import { TableCreateService } from './TableCreateService.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FieldAddRequest {
  name: string;
  type?: string;     // 缺省 'int'（与 TableCreateService 一致）
  comment?: string;
}

export interface FieldUpdateRequest {
  name?: string;     // 改名（缺省不变）
  type?: string;     // 改类型（缺省不变）
  comment?: string;  // 改注释（缺省不变）
}

export interface FieldMutateResult {
  ok: boolean;
  errors: string[];
}

const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// ---------------------------------------------------------------------------
// SchemaFieldService
// ---------------------------------------------------------------------------

export class SchemaFieldService {
  // -------------------------------------------------------------------------
  // addField
  // -------------------------------------------------------------------------

  static addField(editor: EditorService, table: string, req: FieldAddRequest): FieldMutateResult {
    return SchemaFieldService.mutate(editor, table, (structural, errors) => {
      const name = SchemaFieldService.checkFieldName(req.name, structural, errors);
      if (name === null) return;

      const field = SchemaFieldService.buildField(name, req.type ?? 'string', req.comment);
      structural.fields().push(field);
    });
  }

  static async addFieldAsync(editor: EditorService, table: string, req: FieldAddRequest): Promise<FieldMutateResult> {
    return SchemaFieldService.mutateAsync(editor, table, (structural, errors) => {
      const name = SchemaFieldService.checkFieldName(req.name, structural, errors);
      if (name === null) return;

      const field = SchemaFieldService.buildField(name, req.type ?? 'string', req.comment);
      structural.fields().push(field);
    });
  }

  // -------------------------------------------------------------------------
  // updateField
  // -------------------------------------------------------------------------

  static updateField(
    editor: EditorService,
    table: string,
    oldName: string,
    req: FieldUpdateRequest,
  ): FieldMutateResult {
    return SchemaFieldService.mutate(editor, table, (structural, errors, schema) => {
      const old = SchemaFieldService.findField(structural, oldName, errors);
      if (old === null) return;

      // 新名字：未提供则保持原名
      let newName = old.name;
      if (req.name !== undefined && req.name.trim().length > 0) {
        const checked = SchemaFieldService.checkFieldName(req.name, structural, errors, old.name);
        if (checked === null) return;
        newName = checked;
      }

      const newType = req.type !== undefined && req.type.trim().length > 0
        ? TableCreateService['parseFieldType'](req.type)
        : old.type;

      // 注释：显式提供（含空串=清空）才改动；未提供则保留
      const meta = req.comment !== undefined ? Metadata_of() : old.meta;
      if (req.comment !== undefined && req.comment.trim().length > 0) {
        meta.putComment(new CommentData('', req.comment, null));
      }

      const idx = structural.fields().indexOf(old);
      structural.fields()[idx] = new FieldSchema(newName, newType, old.fmt, meta);

      // 改名：同步更新主键/唯一键/本表 FK 中引用旧名的字段
      if (newName !== old.name) {
        SchemaFieldService.renameKeyReferences(structural, old.name, newName);
      }
    });
  }

  static async updateFieldAsync(
    editor: EditorService,
    table: string,
    oldName: string,
    req: FieldUpdateRequest,
  ): Promise<FieldMutateResult> {
    return SchemaFieldService.mutateAsync(editor, table, (structural, errors, schema) => {
      const old = SchemaFieldService.findField(structural, oldName, errors);
      if (old === null) return;

      let newName = old.name;
      if (req.name !== undefined && req.name.trim().length > 0) {
        const checked = SchemaFieldService.checkFieldName(req.name, structural, errors, old.name);
        if (checked === null) return;
        newName = checked;
      }

      const newType = req.type !== undefined && req.type.trim().length > 0
        ? TableCreateService['parseFieldType'](req.type)
        : old.type;

      const meta = req.comment !== undefined ? Metadata_of() : old.meta;
      if (req.comment !== undefined && req.comment.trim().length > 0) {
        meta.putComment(new CommentData('', req.comment, null));
      }

      const idx = structural.fields().indexOf(old);
      structural.fields()[idx] = new FieldSchema(newName, newType, old.fmt, meta);

      if (newName !== old.name) {
        SchemaFieldService.renameKeyReferences(structural, old.name, newName);
      }
    });
  }

  // -------------------------------------------------------------------------
  // removeField
  // -------------------------------------------------------------------------

  static removeField(editor: EditorService, table: string, fieldName: string): FieldMutateResult {
    return SchemaFieldService.mutate(editor, table, (structural, errors, schema) => {
      SchemaFieldService.removeFieldInternal(structural, fieldName, schema, errors);
    });
  }

  static async removeFieldAsync(editor: EditorService, table: string, fieldName: string): Promise<FieldMutateResult> {
    return SchemaFieldService.mutateAsync(editor, table, (structural, errors, schema) => {
      SchemaFieldService.removeFieldInternal(structural, fieldName, schema, errors);
    });
  }

  // -------------------------------------------------------------------------
  // Shared mutate pipeline
  // -------------------------------------------------------------------------

  private static mutate(
    editor: EditorService,
    table: string,
    apply: (structural: Structural, errors: string[], schema: CfgSchema) => void,
  ): FieldMutateResult {
    const errors: string[] = [];
    const schema = SchemaFieldService.readAndParse(editor, errors);
    if (schema === null) {
      return { ok: false, errors };
    }

    const structural = SchemaFieldService.findStructural(schema, table, errors);
    if (structural === null) {
      return { ok: false, errors };
    }

    apply(structural, errors, schema);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    try {
      const errs = schema.resolve();
      errs.checkErrors('fieldEdit');
    } catch (e) {
      SchemaFieldService.collectSchemaErrors(e, errors);
      return { ok: false, errors };
    }

    try {
      const cfgPath = path.join(editor.rootDir(), 'config.cfg');
      const cfgText = CfgWriter.stringify(schema);
      fs.writeFileSync(cfgPath, cfgText, 'utf8');
    } catch (e) {
      errors.push(`Failed to write config.cfg: ${(e as Error).message}`);
      return { ok: false, errors };
    }

    return { ok: true, errors: [] };
  }

  private static async mutateAsync(
    editor: EditorService,
    table: string,
    apply: (structural: Structural, errors: string[], schema: CfgSchema) => void,
  ): Promise<FieldMutateResult> {
    const errors: string[] = [];
    const schema = await SchemaFieldService.readAndParseAsync(editor, errors);
    if (schema === null) {
      return { ok: false, errors };
    }

    const structural = SchemaFieldService.findStructural(schema, table, errors);
    if (structural === null) {
      return { ok: false, errors };
    }

    apply(structural, errors, schema);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    try {
      const errs = schema.resolve();
      errs.checkErrors('fieldEdit');
    } catch (e) {
      SchemaFieldService.collectSchemaErrors(e, errors);
      return { ok: false, errors };
    }

    try {
      const cfgPath = path.join(editor.rootDir(), 'config.cfg');
      const cfgText = CfgWriter.stringify(schema);
      const dfs = getDefaultFileSystem();
      await dfs.writeFile(cfgPath, Buffer.from(cfgText, 'utf8'));
    } catch (e) {
      errors.push(`Failed to write config.cfg: ${(e as Error).message}`);
      return { ok: false, errors };
    }

    return { ok: true, errors: [] };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private static readAndParse(editor: EditorService, errors: string[]): CfgSchema | null {
    const cfgPath = path.join(editor.rootDir(), 'config.cfg');
    let existingText = '';
    try {
      if (fs.existsSync(cfgPath)) {
        existingText = fs.readFileSync(cfgPath, 'utf-8');
      }
    } catch (e) {
      errors.push(`Failed to read config.cfg: ${(e as Error).message}`);
      return null;
    }

    try {
      if (existingText.trim().length > 0) {
        return CfgReader.parse(existingText);
      }
      return CfgSchema.of();
    } catch (e) {
      if (e instanceof ParseError) {
        errors.push(`Failed to parse existing config.cfg: ${e.message}`);
      } else {
        errors.push(`Failed to parse existing config.cfg: ${(e as Error).message}`);
      }
      return null;
    }
  }

  private static async readAndParseAsync(editor: EditorService, errors: string[]): Promise<CfgSchema | null> {
    const dfs = getDefaultFileSystem();
    const cfgPath = path.join(editor.rootDir(), 'config.cfg');
    let existingText = '';
    try {
      if (await dfs.exists(cfgPath)) {
        const bytes = await dfs.readFile(cfgPath);
        existingText = Buffer.from(bytes).toString('utf-8');
      }
    } catch (e) {
      errors.push(`Failed to read config.cfg: ${(e as Error).message}`);
      return null;
    }

    try {
      if (existingText.trim().length > 0) {
        return CfgReader.parse(existingText);
      }
      return CfgSchema.of();
    } catch (e) {
      if (e instanceof ParseError) {
        errors.push(`Failed to parse existing config.cfg: ${e.message}`);
      } else {
        errors.push(`Failed to parse existing config.cfg: ${(e as Error).message}`);
      }
      return null;
    }
  }

  private static findStructural(schema: CfgSchema, table: string, errors: string[]): Structural | null {
    for (const item of schema.items()) {
      if (item instanceof TableSchema && item.name() === table) {
        return item;
      }
      if (item instanceof StructSchema && item.name() === table) {
        return item;
      }
    }
    errors.push(`Table not found: ${table}`);
    return null;
  }

  private static findField(structural: Structural, fieldName: string, errors: string[]): FieldSchema | null {
    const field = structural.findField(fieldName);
    if (field === null) {
      errors.push(`Field not found: ${fieldName}`);
    }
    return field;
  }

  /**
   * Validate a new field name: non-empty, identifier pattern, no conflict.
   * @param exemptName 豁免名（update 时传旧名，改名到旧名允许）
   */
  private static checkFieldName(
    name: string,
    structural: Structural,
    errors: string[],
    exemptName?: string,
  ): string | null {
    if (!name || name.trim().length === 0) {
      errors.push('Field name is required');
      return null;
    }
    if (!IDENTIFIER_PATTERN.test(name)) {
      errors.push(`Field name must be a valid identifier: ${name}`);
      return null;
    }
    if (structural.findField(name) !== null && name !== exemptName) {
      errors.push(`Field already exists: ${name}`);
      return null;
    }
    return name;
  }

  private static buildField(name: string, type: string, comment?: string): FieldSchema {
    const fieldType = TableCreateService['parseFieldType'](type);
    const meta = Metadata_of();
    if (comment && comment.trim().length > 0) {
      meta.putComment(new CommentData('', comment, null));
    }
    return new FieldSchema(name, fieldType, AutoOrPack.AUTO, meta);
  }

  private static removeFieldInternal(
    structural: Structural,
    fieldName: string,
    schema: CfgSchema,
    errors: string[],
  ): void {
    const field = structural.findField(fieldName);
    if (field === null) {
      errors.push(`Field not found: ${fieldName}`);
      return;
    }

    // 1. 跨表 FK 引用保护（优先，其他表 FK 可能引用本表字段，如 item.id 被 weapon.owner ->item 引用）
    for (const item of schema.items()) {
      if (item === structural) continue;
      if (!(item instanceof TableSchema)) continue;
      for (const fk of item.foreignKeys()) {
        if (fk.refTableNormalized() !== structural.name()) continue;
        // RefPrimary 引用目标表主键（keyNames() 为空）；RefUniq/RefList 引用显式键
        let refNames: string[];
        if (fk.refKey instanceof RefPrimary) {
          refNames = structural instanceof TableSchema
            ? structural.primaryKey.fields()
            : [];
        } else {
          refNames = fk.refKey.keyNames();
        }
        if (refNames.includes(fieldName)) {
          errors.push(`Field is referenced by foreign key and cannot be removed: ${fieldName}`);
          return;
        }
      }
    }

    // 2. 主键保护（本表）
    if (structural instanceof TableSchema) {
      if (structural.primaryKey.fields().includes(fieldName)) {
        errors.push(`Field is part of the primary key and cannot be removed: ${fieldName}`);
        return;
      }
    }

    // 3. 本表 FK 本地键保护
    for (const fk of structural.foreignKeys()) {
      if (fk.key.fields().includes(fieldName)) {
        errors.push(`Field is referenced by foreign key and cannot be removed: ${fieldName}`);
        return;
      }
    }

    // 4. 从唯一键中剔除该字段（避免悬空引用导致 KeyNotFound）
    if (structural instanceof TableSchema) {
      for (const uk of structural.uniqueKeys()) {
        const names = uk.fields();
        const idx = names.indexOf(fieldName);
        if (idx >= 0) {
          names.splice(idx, 1);
        }
      }
    }

    // 5. 删除字段
    const idx = structural.fields().indexOf(field);
    structural.fields().splice(idx, 1);
  }

  /**
   * 字段改名后，同步更新主键/唯一键/本表 FK 中引用旧字段名的引用。
   * 仅更新本表内引用（KeySchema.fields() 是可变数组）。
   */
  private static renameKeyReferences(structural: Structural, oldName: string, newName: string): void {
    const replace = (names: string[]): void => {
      for (let i = 0; i < names.length; i++) {
        if (names[i] === oldName) {
          names[i] = newName;
        }
      }
    };

    if (structural instanceof TableSchema) {
      replace(structural.primaryKey.fields());
      for (const uk of structural.uniqueKeys()) {
        replace(uk.fields());
      }
    }
    for (const fk of structural.foreignKeys()) {
      replace(fk.key.fields());
    }
  }

  private static collectSchemaErrors(e: unknown, errors: string[]): void {
    if (e instanceof CfgSchemaException) {
      for (const err of e.errs.errs) {
        errors.push(err.msg());
      }
    } else {
      errors.push((e as Error).message);
    }
  }
}