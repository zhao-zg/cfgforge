/**
 * Context — TypeScript port of Java `configgen.ctx.Context`.
 *
 * Core coordinator: reads schema + data, aligns them, and provides
 * cached CfgValue generation with tag filtering and allowErr safety.
 *
 * Key difference from Java:
 * - Java's Context constructor is synchronous (FastExcel is sync).
 * - TS ExcelJS is async, so Context construction requires a pre-read
 *   step for Excel files. The static factory `Context.create()` is async;
 *   it pre-reads Excel files, then calls the private constructor.
 * - In TS, synchronized is not needed (single-threaded), but the
 *   cache-invalidation logic is retained.
 *
 * Java source: configgen.ctx.Context.java (235 lines)
 */

import * as path from 'path';

import type { CfgSchema } from '@cfggen/schema';
import { CfgSchemas, CfgSchemaErrs, CfgSchemaResolver, CfgSchemaFilterByTag } from '@cfggen/schema';
import type { CfgData, ExcelFileInfo, ReadResult } from '@cfggen/data';
import { CfgDataReader, CfgSchemaAlignToData, FileFmt, readExcel, readCsv } from '@cfggen/data';
import type { CfgValue } from '@cfggen/value';
import { CfgValueParser, CfgValueErrs, ValueEnv } from '@cfggen/value';
import type { LangTextFinder, LangSwitchable } from '@cfggen/i18n';
import { LangTextFinder as I18nLangTextFinder, LangSwitchable as I18nLangSwitchable } from '@cfggen/i18n';

import { ContextCfg } from './ContextCfg';
import { DirectoryStructure } from './DirectoryStructure';

// ---------------------------------------------------------------------------
// Reader function types (matching CfgDataReader's expected signatures)
// ---------------------------------------------------------------------------

type ExcelReaderFn = (
  filePath: string,
  relativePath: string,
  sheetNameFilter: string | null,
) => ReadResult;

type CsvReaderFn = (
  filePath: string,
  relativePath: string,
  tableName: string,
  index: number,
  fieldSeparator: string,
  nullableAddTag: string | null,
) => ReadResult;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export class Context {
  private readonly _contextCfg: ContextCfg;

  private _sourceStructure: DirectoryStructure;
  private _nullableLangTextFinder: LangTextFinder | null = null;
  private _nullableLangSwitch: LangSwitchable | null = null;

  private readonly _excelReader: ExcelReaderFn;
  private readonly _csvReader: CsvReaderFn;
  private _cfgSchema!: CfgSchema;
  private _cfgData!: CfgData;
  private _lastLoadDidAutoFix = false;

  private _lastCfgValue: CfgValue | null = null;
  private _lastCfgValueTag: string | null = null;
  private _lastCfgValueAllowErr = false;

  // -------------------------------------------------------------------------
  // Static factory constructors (async due to ExcelJS)
  // -------------------------------------------------------------------------

  /**
   * Create a Context with default configuration.
   * Equivalent to Java `new Context(dataDir)`.
   */
  static async create(dataDir: string): Promise<Context> {
    return Context.createWithCfg(ContextCfg.of(dataDir));
  }

  /**
   * Create a Context with the given configuration.
   * Equivalent to Java `new Context(cfg)`.
   */
  static async createWithCfg(cfg: ContextCfg): Promise<Context> {
    const ds = new DirectoryStructure(cfg.dataDir, cfg.explicitDir);
    return Context.createWithStructure(cfg, ds);
  }

  /**
   * Create a Context with a pre-built DirectoryStructure.
   * Equivalent to Java `new Context(cfg, sourceStructure)`.
   */
  static async createWithStructure(cfg: ContextCfg, sourceStructure: DirectoryStructure): Promise<Context> {
    // Pre-read Excel files (ExcelJS is async, CfgDataReader needs sync readers)
    const excelFiles = sourceStructure.getExcelFiles();
    const excelCache = new Map<string, ReadResult>();
    for (const f of excelFiles) {
      if (f.fmt === FileFmt.EXCEL) {
        const result = await readExcel(f.path, f.relativePath, null);
        excelCache.set(f.path, result);
      }
    }

    const csvReader: CsvReaderFn = (
      filePath, relativePath, tableName, index, fieldSeparator, nullableAddTag,
    ) => readCsv(filePath, relativePath, tableName, index, fieldSeparator,
      cfg.csvOrTsvDefaultEncoding, nullableAddTag);

    const excelReader: ExcelReaderFn = (filePath, _relPath, _sheetFilter) => {
      const cached = excelCache.get(filePath);
      if (cached === undefined) {
        throw new Error(`Excel file not pre-read: ${filePath}`);
      }
      return cached;
    };

    return new Context(cfg, sourceStructure, excelReader, csvReader);
  }

  // -------------------------------------------------------------------------
  // Private constructor
  // -------------------------------------------------------------------------

  private constructor(
    cfg: ContextCfg,
    sourceStructure: DirectoryStructure,
    excelReader: ExcelReaderFn,
    csvReader: CsvReaderFn,
  ) {
    this._contextCfg = cfg;
    this._sourceStructure = sourceStructure;
    this._excelReader = excelReader;
    this._csvReader = csvReader;

    // i18n setup
    if (cfg.i18nFilename !== null) {
      this._nullableLangTextFinder = I18nLangTextFinder.read(cfg.i18nFilename);
    } else if (cfg.langSwitchDir !== null) {
      this._nullableLangSwitch = I18nLangSwitchable.read(
        cfg.langSwitchDir, cfg.langSwitchDefaultLang ?? 'zh_cn',
      );
    }

    // Schema + Data reading (two-phase: autoFix=true, then autoFix=false)
    const dataReader = new CfgDataReader(cfg.headRow, csvReader, excelReader);
    const ok = this.readSchemaAndData(dataReader, true);
    if (!ok) {
      this.readSchemaAndData(dataReader, false);
    }
  }

  // -------------------------------------------------------------------------
  // Schema + Data reading (two-phase)
  // -------------------------------------------------------------------------

  private readSchemaAndData(dataReader: CfgDataReader, autoFix: boolean): boolean {
    const schema = CfgSchemas.readFromDir(this._sourceStructure.getCfgFiles());
    const errs = schema.resolve();
    errs.checkErrors('schema');

    const alignErr = CfgSchemaErrs.of();
    const data = dataReader.readCfgData(
      this._sourceStructure.getExcelFiles(), schema, alignErr,
    );
    const alignedSchema = new CfgSchemaAlignToData(this._contextCfg.headRow)
      .align(schema, data, alignErr);
    new CfgSchemaResolver(alignedSchema, alignErr).resolve();
    alignErr.checkErrors('aligned schema');

    if (schema.equals(alignedSchema)) {
      this._cfgData = data;
      this._cfgSchema = schema;
      return true;
    } else if (autoFix) {
      CfgSchemas.writeToDir(
        path.join(this.rootDir(), DirectoryStructure.ROOT_CONFIG_FILENAME),
        alignedSchema,
      );
      this._sourceStructure = this._sourceStructure.reload();
      this._lastLoadDidAutoFix = true;
      return false;
    } else {
      throw new Error('schema align failed');
    }
  }

  // -------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------

  contextCfg(): ContextCfg { return this._contextCfg; }
  sourceStructure(): DirectoryStructure { return this._sourceStructure; }
  rootDir(): string { return this._sourceStructure.getRootDir(); }
  cfgSchema(): CfgSchema { return this._cfgSchema; }
  cfgData(): CfgData { return this._cfgData; }
  lastLoadDidAutoFix(): boolean { return this._lastLoadDidAutoFix; }

  nullableLangTextFinder(): LangTextFinder | null { return this._nullableLangTextFinder; }
  nullableLangSwitch(): LangSwitchable | null { return this._nullableLangSwitch; }

  // -------------------------------------------------------------------------
  // makeValue — cached value generation with tag + allowErr safety
  // -------------------------------------------------------------------------

  makeValue(): CfgValue {
    return this.makeValueWithTag(null);
  }

  makeValueWithTag(tag: string | null): CfgValue {
    return this.makeValueWithTagAndAllowErr(tag, this._contextCfg.allowValueErr);
  }

  makeValueWithTagAndAllowErr(tag: string | null, allowValueErr: boolean): CfgValue {
    if (tag !== null && tag.length === 0) {
      throw new Error('tag不能为空');
    }

    // Cache hit: tag matches AND allowErr direction is safe
    // - strict (allowErr=false) value can serve any request
    // - lenient (allowErr=true) value can only serve lenient requests
    if (this._lastCfgValue !== null
      && tag === this._lastCfgValueTag
      && (!this._lastCfgValueAllowErr || allowValueErr)) {
      return this._lastCfgValue;
    }
    this._lastCfgValue = null;

    let tagSchema: CfgSchema;
    if (tag !== null) {
      const errs = CfgSchemaErrs.of();
      tagSchema = new CfgSchemaFilterByTag(this._cfgSchema, tag, errs).filter();
      new CfgSchemaResolver(tagSchema, errs).resolve();
      errs.checkErrors(`[${tag}] filtered schema`);
    } else {
      tagSchema = this._cfgSchema;
    }

    const valueErrs = CfgValueErrs.of();
    const env = new ValueEnv(
      this._cfgSchema,
      this._cfgData,
      this._contextCfg.headRow,
      this._nullableLangTextFinder as unknown as null,
      this._sourceStructure,
    );
    const parser = new CfgValueParser(tagSchema, env, valueErrs);
    const cfgValue = parser.parseCfgValue();
    const prefix = tag === null ? 'value' : `[${tag}] filtered value`;
    valueErrs.checkErrors(prefix, allowValueErr);

    this._lastCfgValue = cfgValue;
    this._lastCfgValueTag = tag;
    this._lastCfgValueAllowErr = allowValueErr;
    return this._lastCfgValue;
  }

  // -------------------------------------------------------------------------
  // updateDataAndValue — for editor server
  // -------------------------------------------------------------------------

  updateDataAndValue(cfgData: CfgData, cfgValue: CfgValue): void {
    this._cfgData = cfgData;
    this._lastCfgValue = cfgValue;
    this._lastCfgValueTag = null;
    this._lastCfgValueAllowErr = false;
  }
}
