/**
 * SchemaRelationService — 关系（外键/FK）图形化编辑的后端服务。
 *
 * 提供外键的增、删、改、查，并将变更持久化写回 config.cfg：
 *   1. 读 config.cfg（同步 fs 或 CfgFileSystem 抽象）
 *   2. CfgReader.parse(existingText)
 *   3. 定位目标 Nameable（TableSchema 或 StructSchema，即 Structural）
 *   4. 构造 ForeignKeySchema（RefPrimary/RefUniq + KeySchema + Metadata_of）
 *   5. add / remove / replace
 *   6. schema.resolve() + errs.checkErrors('relationEdit')
 *   7. CfgWriter.stringify(schema) → 写回 config.cfg
 *
 * 与 TableCreateService 一致：同步 + async 双变体；async 版通过
 * CfgFileSystem 抽象（Tauri/WebView 兼容），调用方负责 editor.reload()。
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
  KeySchema,
  RefPrimary,
  RefUniq,
  Metadata_of,
  isRefPrimary,
  isRefUniq,
  ForeignKeySchema,
  type RefKey,
  type Structural,
} from '@cfgforge/schema';
import { getDefaultFileSystem } from '@cfgforge/shared';
import type { EditorService } from './EditorService.js';
import type {
  SForeignKey,
  SRefType,
} from './SchemaService.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FKAddRequest {
  table: string;        // 目标表（小写）
  fkName?: string;      // 可选，缺省自动生成 字段_目标表
  keys: string[];       // 本地键（字段名）
  refTable: string;     // 被引用表
  refKeys?: string[];   // 可选：引用目标表的唯一键；缺省引用主键
  nullable?: boolean;   // 可空（仅 RefPrimary/RefUniq）
}

export interface FKListResult {
  ok: boolean;
  errors: string[];
  fks: SForeignKey[];
}

export interface FKMutateResult {
  ok: boolean;
  errors: string[];
}

/** Mutate callback: apply the FK change; push errors to abort before writing. */
type ApplyFn = (structural: Structural, errors: string[]) => void;

// ---------------------------------------------------------------------------
// SchemaRelationService
// ---------------------------------------------------------------------------

export class SchemaRelationService {
  // -------------------------------------------------------------------------
  // listFks
  // -------------------------------------------------------------------------

  static listFks(editor: EditorService, table: string): FKListResult {
    const errors: string[] = [];
    const schema = SchemaRelationService.readAndParse(editor, errors);
    if (schema === null) {
      return { ok: false, errors, fks: [] };
    }

    const structural = SchemaRelationService.findStructural(schema, table, errors);
    if (structural === null) {
      return { ok: false, errors, fks: [] };
    }

    return {
      ok: true,
      errors: [],
      fks: SchemaRelationService.toSForeignKeys(structural.foreignKeys()),
    };
  }

  static async listFksAsync(editor: EditorService, table: string): Promise<FKListResult> {
    const errors: string[] = [];
    const schema = await SchemaRelationService.readAndParseAsync(editor, errors);
    if (schema === null) {
      return { ok: false, errors, fks: [] };
    }

    const structural = SchemaRelationService.findStructural(schema, table, errors);
    if (structural === null) {
      return { ok: false, errors, fks: [] };
    }

    return {
      ok: true,
      errors: [],
      fks: SchemaRelationService.toSForeignKeys(structural.foreignKeys()),
    };
  }

  // -------------------------------------------------------------------------
  // addForeignKey
  // -------------------------------------------------------------------------

  static addForeignKey(editor: EditorService, req: FKAddRequest): FKMutateResult {
    return SchemaRelationService.mutate(editor, req.table, (structural, errors) => {
      const fkName = SchemaRelationService.pickFkName(req, structural, errors);
      if (fkName === null) return;
      const fk = SchemaRelationService.buildForeignKey(fkName, req, structural, errors);
      if (fk !== null) {
        structural.addForeignKey(fk);
      }
    });
  }

  static async addForeignKeyAsync(editor: EditorService, req: FKAddRequest): Promise<FKMutateResult> {
    return SchemaRelationService.mutateAsync(editor, req.table, (structural, errors) => {
      const fkName = SchemaRelationService.pickFkName(req, structural, errors);
      if (fkName === null) return;
      const fk = SchemaRelationService.buildForeignKey(fkName, req, structural, errors);
      if (fk !== null) {
        structural.addForeignKey(fk);
      }
    });
  }

  // -------------------------------------------------------------------------
  // updateForeignKey
  // -------------------------------------------------------------------------

  static updateForeignKey(
    editor: EditorService,
    table: string,
    fkName: string,
    req: FKAddRequest,
  ): FKMutateResult {
    return SchemaRelationService.mutate(editor, table, (structural, errors) => {
      const old = structural.findForeignKey(fkName);
      if (old === null) {
        errors.push(`Foreign key not found: ${fkName}`);
        return;
      }
      SchemaRelationService.removeFk(structural, old);
      const newName = SchemaRelationService.pickFkName(req, structural, errors, old.name);
      if (newName === null) return;
      const fk = SchemaRelationService.buildForeignKey(newName, req, structural, errors);
      if (fk !== null) {
        structural.addForeignKey(fk);
      }
    });
  }

  static async updateForeignKeyAsync(
    editor: EditorService,
    table: string,
    fkName: string,
    req: FKAddRequest,
  ): Promise<FKMutateResult> {
    return SchemaRelationService.mutateAsync(editor, table, (structural, errors) => {
      const old = structural.findForeignKey(fkName);
      if (old === null) {
        errors.push(`Foreign key not found: ${fkName}`);
        return;
      }
      SchemaRelationService.removeFk(structural, old);
      const newName = SchemaRelationService.pickFkName(req, structural, errors, old.name);
      if (newName === null) return;
      const fk = SchemaRelationService.buildForeignKey(newName, req, structural, errors);
      if (fk !== null) {
        structural.addForeignKey(fk);
      }
    });
  }

  // -------------------------------------------------------------------------
  // removeForeignKey
  // -------------------------------------------------------------------------

  static removeForeignKey(editor: EditorService, table: string, fkName: string): FKMutateResult {
    return SchemaRelationService.mutate(editor, table, (structural, errors) => {
      const old = structural.findForeignKey(fkName);
      if (old === null) {
        errors.push(`Foreign key not found: ${fkName}`);
        return;
      }
      SchemaRelationService.removeFk(structural, old);
    });
  }

  static async removeForeignKeyAsync(
    editor: EditorService,
    table: string,
    fkName: string,
  ): Promise<FKMutateResult> {
    return SchemaRelationService.mutateAsync(editor, table, (structural, errors) => {
      const old = structural.findForeignKey(fkName);
      if (old === null) {
        errors.push(`Foreign key not found: ${fkName}`);
        return;
      }
      SchemaRelationService.removeFk(structural, old);
    });
  }

  // -------------------------------------------------------------------------
  // Internal: shared mutate pipelines (sync / async)
  // -------------------------------------------------------------------------

  private static mutate(
    editor: EditorService,
    table: string,
    apply: ApplyFn,
  ): FKMutateResult {
    const errors: string[] = [];
    const schema = SchemaRelationService.readAndParse(editor, errors);
    if (schema === null) {
      return { ok: false, errors };
    }

    const structural = SchemaRelationService.findStructural(schema, table, errors);
    if (structural === null) {
      return { ok: false, errors };
    }

    apply(structural, errors);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    // Validate the modified schema
    try {
      const errs = schema.resolve();
      errs.checkErrors('relationEdit');
    } catch (e) {
      SchemaRelationService.collectSchemaErrors(e, errors);
      return { ok: false, errors };
    }

    // Write config.cfg
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
    apply: ApplyFn,
  ): Promise<FKMutateResult> {
    const errors: string[] = [];
    const schema = await SchemaRelationService.readAndParseAsync(editor, errors);
    if (schema === null) {
      return { ok: false, errors };
    }

    const structural = SchemaRelationService.findStructural(schema, table, errors);
    if (structural === null) {
      return { ok: false, errors };
    }

    apply(structural, errors);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    try {
      const errs = schema.resolve();
      errs.checkErrors('relationEdit');
    } catch (e) {
      SchemaRelationService.collectSchemaErrors(e, errors);
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

  /**
   * Locate a Structural (TableSchema or StructSchema) by name.
   */
  private static findStructural(
    schema: CfgSchema,
    table: string,
    errors: string[],
  ): Structural | null {
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

  /**
   * Resolve FK name: explicit fkName, or auto-generated keys[0]_refTable
   * with _2/_3 suffixes to avoid conflicts. Returns null if the requested
   * name conflicts with a field or existing FK.
   *
   * @param exemptName 豁免名（update 时传旧 FK 名）：旧 FK 已删除，允许新 FK
   *   沿用旧名——包括内联 FK 的「FK 名 == 字段名」场景（改 refTable 等属性时
   *   保留字段内联形式，否则 update 会被当作名字冲突拒绝）。
   */
  private static pickFkName(
    req: FKAddRequest,
    structural: Structural,
    errors: string[],
    exemptName?: string,
  ): string | null {
    let name: string;
    if (req.fkName && req.fkName.trim().length > 0) {
      name = req.fkName;
    } else {
      const base = `${req.keys[0]}_${req.refTable}`;
      let candidate = base;
      let i = 2;
      while (
        structural.findForeignKey(candidate) !== null ||
        structural.findField(candidate) !== null
      ) {
        candidate = `${base}_${i}`;
        i++;
      }
      name = candidate;
    }

    if (
      structural.findForeignKey(name) !== null ||
      (structural.findField(name) !== null && name !== exemptName)
    ) {
      errors.push(`Foreign key name conflict: ${name}`);
      return null;
    }
    return name;
  }

  /**
   * Build a ForeignKeySchema from a request. Returns null if the local keys
   * are invalid (already reported via errors).
   */
  private static buildForeignKey(
    fkName: string,
    req: FKAddRequest,
    structural: Structural,
    errors: string[],
  ): ForeignKeySchema | null {
    // Local key fields must exist
    for (const k of req.keys) {
      if (structural.findField(k) === null) {
        errors.push(`Field not found: ${k}`);
        return null;
      }
    }
    return new ForeignKeySchema(
      fkName,
      new KeySchema(req.keys),
      req.refTable,
      SchemaRelationService.buildRefKey(req),
      Metadata_of(),
    );
  }

  private static buildRefKey(req: FKAddRequest): RefKey {
    const nullable = req.nullable === true;
    if (req.refKeys && req.refKeys.length > 0) {
      return new RefUniq(new KeySchema(req.refKeys), nullable);
    }
    return new RefPrimary(nullable);
  }

  /**
   * Remove a ForeignKeySchema from a Structural by identity.
   */
  private static removeFk(structural: Structural, fk: ForeignKeySchema): void {
    const fks = structural.foreignKeys();
    const idx = fks.indexOf(fk);
    if (idx >= 0) {
      fks.splice(idx, 1);
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

  // -------------------------------------------------------------------------
  // Serialization (SForeignKey, same shape as SchemaService)
  // -------------------------------------------------------------------------

  private static toSForeignKeys(fks: ForeignKeySchema[]): SForeignKey[] {
    const res: SForeignKey[] = [];
    for (const f of fks) {
      let refType: SRefType;
      let refKeys: string[] | undefined;
      if (isRefPrimary(f.refKey)) {
        refType = f.refKey.nullable ? 'rNullablePrimary' : 'rPrimary';
      } else if (isRefUniq(f.refKey)) {
        refType = f.refKey.nullable ? 'rNullableUniq' : 'rUniq';
        refKeys = f.refKey.keyNames();
      } else {
        refType = 'rList';
        refKeys = f.refKey.keyNames();
      }
      res.push({
        name: f.name,
        keys: f.key.fields(),
        refTable: f.refTableSchema() !== null ? f.refTableSchema()!.fullName() : f.refTable,
        refType,
        refKeys,
      });
    }
    return res;
  }
}