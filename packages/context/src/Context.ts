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

import type { CfgSchema } from '@cfgforge/schema';
import { CfgSchemas, CfgSchemaErrs, CfgSchemaResolver, CfgSchemaFilterByTag } from '@cfgforge/schema';
import type { CfgData, ReadResult } from '@cfgforge/data';
import { CfgDataReader, CfgSchemaAlignToData, FileFmt, readExcel, readCsv, readCsvAsync, getTableNameIndex } from '@cfgforge/data';
import { DRawSheet, OneSheet, ReadResult as ReadResultCls } from '@cfgforge/data';
import { CfgDataStat } from '@cfgforge/data';
import { getDefaultFileSystem } from '@cfgforge/shared';
import { join as pathJoin } from '@cfgforge/shared';
import type { CfgValue } from '@cfgforge/value';
import { CfgValueParser, CfgValueErrs, ValueEnv } from '@cfgforge/value';
import type { LangTextFinder, LangSwitchable } from '@cfgforge/i18n';
import { LangTextFinder as I18nLangTextFinder, LangSwitchable as I18nLangSwitchable } from '@cfgforge/i18n';

import { ContextCfg } from './ContextCfg.js';
import { DirectoryStructure } from './DirectoryStructure.js';

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
    *
    * Auto-detects environment: if CfgFileSystem is set to a non-Node implementation
    * (e.g. TauriFileSystem), uses async path (DirectoryStructure.createAsync +
    * async CSV pre-read + async i18n + async schema write). Otherwise uses
    * sync path (original behavior for CLI/gen).
    */
  static async createWithCfg(cfg: ContextCfg): Promise<Context> {
    // 用 isSyncSupported 而非 hasDefaultFileSystem() 判断走哪条路径：
    // Tauri 环境也会 setDefaultFileSystem(TauriFileSystem)，但 TauriFileSystem
    // 的同步方法全部抛错，必须走异步路径。isSyncSupported=false 时走异步。
    // 注意：必须用静态 import 而非 await import()——Tauri WebView 的 asset
    // protocol 不支持动态 import 模块路径，会返回 HTML fallback 导致 MIME 类型错误。
    const fs = getDefaultFileSystem();
    if (fs.isSyncSupported) {
      // NodeFileSystem — use original sync path for backward compatibility
      const ds = new DirectoryStructure(cfg.dataDir, cfg.explicitDir);
      return Context.createWithStructureSync(cfg, ds);
    }
    // TauriFileSystem (WebView) — use async path
    const ds = await DirectoryStructure.createAsync(cfg.dataDir, cfg.explicitDir);
    return Context.createWithStructure(cfg, ds);
  }

  /**
   * Create a Context with a pre-built DirectoryStructure (sync path).
   * Uses the original sync constructor (readSchemaAndData, sync i18n).
   * For Node/CLI/test environments only.
   */
  static async createWithStructureSync(cfg: ContextCfg, sourceStructure: DirectoryStructure): Promise<Context> {
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

    // Use sync constructor (asyncInit=false → readSchemaAndData in constructor)
    return new Context(cfg, sourceStructure, excelReader, csvReader, false);
  }

  /**
   * Create a Context with a pre-built DirectoryStructure (async path).
   * Uses async i18n + async schema/data reading via CfgFileSystem.
   * For Tauri/WebView environments.
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

    // Pre-read CSV files asynchronously (Tauri/WebView: readCSVAsync via CfgFileSystem).
    // Skip files where getTableNameIndex returns null (matches CfgDataReader.readCfgData logic).
    const csvCache = new Map<string, ReadResult>();
    for (const f of excelFiles) {
      if (f.fmt === FileFmt.CSV || f.fmt === FileFmt.TXT_AS_TSV) {
        const ti = getTableNameIndex(f.relativePath);
        if (ti === null) {
          continue; // skip ignored CSV files (no table name match)
        }
        const fieldSeparator = f.fmt === FileFmt.CSV ? ',' : '\t';
        const result = await readCsvAsync(
          f.path, f.relativePath,
          ti.tableName,
          ti.index,
          fieldSeparator,
          cfg.csvOrTsvDefaultEncoding,
          f.nullableAddTag,
        );
        csvCache.set(f.path, result);
      }
    }

    const csvReader: CsvReaderFn = (
      filePath, relativePath, tableName, index, fieldSeparator, nullableAddTag,
    ) => {
      // CSV was pre-read in createWithStructure; serve from cache.
      // IMPORTANT: return a deep copy because CfgDataReader.readCfgData →
      // CellParser.parse clears sheet.rows (sheet.rows.length = 0).
      // In the autoFix two-phase path (readSchemaAndDataAsync), the first phase
      // would destroy the cached rows, leaving the second phase with empty data.
      const cached = csvCache.get(filePath);
      if (cached !== undefined) {
        return cloneReadResult(cached);
      }
      // Fallback: try reading directly (Node env only)
      return readCsv(filePath, relativePath, tableName, index, fieldSeparator,
        cfg.csvOrTsvDefaultEncoding, nullableAddTag);
    };

    const excelReader: ExcelReaderFn = (filePath, _relPath, _sheetFilter) => {
      const cached = excelCache.get(filePath);
      if (cached === undefined) {
        throw new Error(`Excel file not pre-read: ${filePath}`);
      }
      // Same reason as csvReader: CellParser clears sheet.rows.
      return cloneReadResult(cached);
    };

    // Build context with async init path
    const ctx = new Context(cfg, sourceStructure, excelReader, csvReader, true);
    await ctx.initAsync();
    return ctx;
  }

  // -------------------------------------------------------------------------
  // Private constructor
  // -------------------------------------------------------------------------

  /**
   * @param asyncInit If true, skips sync readSchemaAndData in constructor;
   *                  caller must call initAsync() afterwards.
   */
  private constructor(
    cfg: ContextCfg,
    sourceStructure: DirectoryStructure,
    excelReader: ExcelReaderFn,
    csvReader: CsvReaderFn,
    asyncInit: boolean = false,
  ) {
    this._contextCfg = cfg;
    this._sourceStructure = sourceStructure;
    this._excelReader = excelReader;
    this._csvReader = csvReader;

    if (asyncInit) {
      // Async path: i18n + schema/data reading deferred to initAsync()
      return;
    }

    // i18n setup (sync path)
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

  /**
   * Async initialization (i18n + schema/data reading via CfgFileSystem).
   * Called after constructor when asyncInit=true.
   */
  private async initAsync(): Promise<void> {
    const cfg = this._contextCfg;

    // i18n setup (async path)
    if (cfg.i18nFilename !== null) {
      this._nullableLangTextFinder = await I18nLangTextFinder.readAsync(cfg.i18nFilename);
    } else if (cfg.langSwitchDir !== null) {
      this._nullableLangSwitch = await I18nLangSwitchable.readAsync(
        cfg.langSwitchDir, cfg.langSwitchDefaultLang ?? 'zh_cn',
      );
    }

    // Schema + Data reading (two-phase async)
    const dataReader = new CfgDataReader(cfg.headRow, this._csvReader, this._excelReader);
    const ok = await this.readSchemaAndDataAsync(dataReader, true);
    if (!ok) {
      await this.readSchemaAndDataAsync(dataReader, false);
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

  /**
   * Async variant of readSchemaAndData (via CfgFileSystem abstraction).
   * Uses CfgSchemas.writeToDirAsync and DirectoryStructure.reloadAsync.
   */
  private async readSchemaAndDataAsync(dataReader: CfgDataReader, autoFix: boolean): Promise<boolean> {
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
      await CfgSchemas.writeToDirAsync(
        pathJoin(this.rootDir(), DirectoryStructure.ROOT_CONFIG_FILENAME),
        alignedSchema,
      );
      this._sourceStructure = await this._sourceStructure.reloadAsync();
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

  /** Returns the CSV reader function (can read any CSV file). */
  csvReader(): CsvReaderFn { return this._csvReader; }
  /** Returns the Excel reader function (cached from initial load; for re-reading modified files, use readExcel directly). */
  excelReader(): ExcelReaderFn { return this._excelReader; }

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

  // -------------------------------------------------------------------------
  // makeValueAsync — async value generation (Tauri/WebView)
  // -------------------------------------------------------------------------

  async makeValueAsync(): Promise<CfgValue> {
    return this.makeValueWithTagAsync(null);
  }

  async makeValueWithTagAsync(tag: string | null): Promise<CfgValue> {
    return this.makeValueWithTagAndAllowErrAsync(tag, this._contextCfg.allowValueErr);
  }

  async makeValueWithTagAndAllowErrAsync(tag: string | null, allowValueErr: boolean): Promise<CfgValue> {
    if (tag !== null && tag.length === 0) {
      throw new Error('tag不能为空');
    }

    // Cache hit: tag matches AND allowErr direction is safe
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
    const cfgValue = await parser.parseCfgValueAsync();
    const prefix = tag === null ? 'value' : `[${tag}] filtered value`;
    valueErrs.checkErrors(prefix, allowValueErr);

    this._lastCfgValue = cfgValue;
    this._lastCfgValueTag = tag;
    this._lastCfgValueAllowErr = allowValueErr;
    return this._lastCfgValue;
  }
}

// ---------------------------------------------------------------------------
// cloneReadResult — deep-copy a ReadResult to protect cached data from
// CellParser.parse which clears sheet.rows (sheet.rows.length = 0).
// In the async path (createWithStructure), CSV/Excel files are pre-read into
// a cache. The two-phase autoFix reads data twice; without cloning, the first
// phase destroys the cached rows, leaving the second phase with empty data.
// ---------------------------------------------------------------------------

function cloneReadResult(rr: ReadResult): ReadResult {
  const sheets = rr.sheets.map(os => {
    const origSheet = os.sheet;
    // Deep-copy rows array: DRawRow objects are immutable (cell/count are readonly),
    // so a shallow array copy suffices to protect against rows.length = 0.
    const clonedRows = [...origSheet.rows];
    const clonedSheet = new DRawSheet(
      origSheet.relativeFilePath,
      origSheet.sheetName,
      origSheet.index,
      clonedRows,
      [], // fieldIndices will be re-populated by HeadParser
    );
    return new OneSheet(os.tableName, clonedSheet);
  });
  return new ReadResultCls(sheets, new CfgDataStat(), rr.nullableAddTag);
}
