/**
 * CfgValueParser — TypeScript port of Java `configgen.value.CfgValueParser`.
 *
 * Orchestrates the value parsing pipeline:
 *   1. For each table in subSchema:
 *      - If DTable exists → use VTableParser (Excel/CSV path)
 *      - Else → use VTableJsonParser (JSON path)
 *   2. Merge per-table errors into the main error collector
 *   3. Call RefValidator.validate() to check foreign key references
 *
 * Java original uses ExecutorService.newWorkStealingPool() for concurrent
 * table parsing. This TS version is synchronous (worker_threads can be
 * added later as an optimization).
 *
 * Java source: configgen.value.CfgValueParser.java (106 lines)
 */

import type { CfgSchema, TableSchema } from '@cfgforge/schema';
import type { DTable } from '@cfgforge/data';
import { CfgValue, CfgValueStat, VTable } from './CfgValue';
import { CfgValueErrs } from './CfgValueErrs';
import { ValueEnv } from './ValueEnv';
import { VTableParser } from './VTableParser';
import { VTableJsonParser } from './VTableJsonParser';
import { TextValue } from './TextValue';
import { RefValidator } from './RefValidator';

// ---------------------------------------------------------------------------
// OneTableParserResult — internal result from parsing one table
// ---------------------------------------------------------------------------

interface OneTableParserResult {
  vTable: VTable;
  errs: CfgValueErrs;
}

// ---------------------------------------------------------------------------
// CfgValueParser
// ---------------------------------------------------------------------------

export class CfgValueParser {
  private readonly _subSchema: CfgSchema;
  private readonly _env: ValueEnv;
  private readonly _errs: CfgValueErrs;

  /**
   * @param subSchema The schema for the target CfgValue (may be partial)
   * @param env       Global environment (fullSchema, cfgData, headRow, etc.)
   * @param errs      Error collector
   */
  constructor(subSchema: CfgSchema, env: ValueEnv, errs: CfgValueErrs) {
    if (subSchema == null) throw new Error('subSchema must not be null');
    if (env == null) throw new Error('env must not be null');
    if (errs == null) throw new Error('errs must not be null');

    subSchema.requireResolved();
    env.fullSchema.requireResolved();

    this._subSchema = subSchema;
    this._env = env;
    this._errs = errs;
  }

  /**
   * Parse all tables in subSchema and return the assembled CfgValue.
   * After parsing, calls RefValidator to check foreign key references.
   */
  parseCfgValue(): CfgValue {
    const cfgValue = CfgValue.of(this._subSchema);
    const tableMap = this._subSchema.tableMap();

    if (tableMap) {
      for (const subTable of tableMap.values()) {
        const name = subTable.name();
        const table = this._env.fullSchema.findTable(name);
        if (!table) {
          throw new Error(`Table "${name}" not found in fullSchema`);
        }

        const dTable = this._env.cfgData.getDTable(name);

        let result: OneTableParserResult;

        if (dTable != null) {
          // Excel/CSV path
          result = this._parseExcelTable(subTable, dTable, table);
        } else {
          // JSON path
          result = this._parseJsonTable(subTable, table, cfgValue.valueStat);
        }

        cfgValue.vTableMap.set(result.vTable.schema.name(), result.vTable);
        this._errs.merge(result.errs);
      }
    }

    // Validate foreign key references
    new RefValidator(cfgValue, this._errs).validate();

    return cfgValue;
  }

  /**
   * Parse a single table from Excel/CSV data.
   */
  private _parseExcelTable(
    subTable: TableSchema,
    dTable: DTable,
    table: TableSchema,
  ): OneTableParserResult {
    const errs = CfgValueErrs.of();
    const parser = new VTableParser(
      subTable,
      dTable,
      table,
      this._env.headRow,
      errs,
    );
    const vTable = parser.parseTable();
    TextValue.setTranslatedForTable(vTable, this._env.nullableLangTextFinder);
    return { vTable, errs };
  }

  /**
   * Parse a single table from JSON data (sync, for Node/CLI).
   */
  private _parseJsonTable(
    subTable: TableSchema,
    table: TableSchema,
    valueStat: CfgValueStat,
  ): OneTableParserResult {
    const errs = CfgValueErrs.of();
    const parser = new VTableJsonParser(
      subTable,
      this._subSchema.isPartial(),
      this._env.jsonTableFiles,
      table,
      errs,
      valueStat,
    );
    const vTable = parser.parseTable();
    TextValue.setTranslatedForTable(vTable, this._env.nullableLangTextFinder);
    return { vTable, errs };
  }

  /**
   * Parse a single table from JSON data (async, for Tauri/WebView).
   */
  private async _parseJsonTableAsync(
    subTable: TableSchema,
    table: TableSchema,
    valueStat: CfgValueStat,
  ): Promise<OneTableParserResult> {
    const errs = CfgValueErrs.of();
    const parser = new VTableJsonParser(
      subTable,
      this._subSchema.isPartial(),
      this._env.jsonTableFiles,
      table,
      errs,
      valueStat,
    );
    const vTable = await parser.parseTableAsync();
    TextValue.setTranslatedForTable(vTable, this._env.nullableLangTextFinder);
    return { vTable, errs };
  }

  /**
   * Parse all tables and return the assembled CfgValue (async, for Tauri/WebView).
   * JSON tables are read asynchronously; Excel/CSV tables use the same sync readers
   * (CSV content is pre-read in Context async factory).
   */
  async parseCfgValueAsync(): Promise<CfgValue> {
    const cfgValue = CfgValue.of(this._subSchema);
    const tableMap = this._subSchema.tableMap();

    if (tableMap) {
      for (const subTable of tableMap.values()) {
        const name = subTable.name();
        const table = this._env.fullSchema.findTable(name);
        if (!table) {
          throw new Error(`Table "${name}" not found in fullSchema`);
        }

        const dTable = this._env.cfgData.getDTable(name);

        let result: OneTableParserResult;

        if (dTable != null) {
          // Excel/CSV path (sync — CSV content pre-read in Context)
          result = this._parseExcelTable(subTable, dTable, table);
        } else {
          // JSON path (async)
          result = await this._parseJsonTableAsync(subTable, table, cfgValue.valueStat);
        }

        cfgValue.vTableMap.set(result.vTable.schema.name(), result.vTable);
        this._errs.merge(result.errs);
      }
    }

    // Validate foreign key references
    new RefValidator(cfgValue, this._errs).validate();

    return cfgValue;
  }
}
