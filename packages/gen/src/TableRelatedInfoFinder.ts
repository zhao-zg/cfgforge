/**
 * TableRelatedInfoFinder — TypeScript port of Java `configgen.genbyai.TableRelatedInfoFinder`.
 *
 * Finds module rules ($mod.md), table rules ([table].md), and example records
 * for AI-assisted generation. Also builds related schema (CFG text) and
 * related table record lists in CSV format.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Context } from '@cfggen/context';
import type { CfgValue, VTable, VStruct, Value } from '@cfggen/value';
import { ValuePack } from '@cfggen/value';
import { ValueToJson } from '@cfggen/value';
import { ValueToCsv } from '@cfggen/value';
import { CfgValueErrs } from '@cfggen/value';
import type { TableSchema, Nameable, StructSchema } from '@cfggen/schema';
import { StructSchema as StructSchemaCls } from '@cfggen/schema';
import { findAllIncludedStructs } from '@cfggen/schema';
import { TableSchemaRefGraph } from '@cfggen/schema';
import { CfgWriter } from '@cfggen/schema';
import { isEEnum } from '@cfggen/schema';
import { isMetaStr } from '@cfggen/schema';
import { readMarkdown, readMarkdownAsync, getDefaultFileSystem } from '@cfggen/shared';
import type { Example } from './PromptModel';
import { example } from './PromptModel';

// ---------------------------------------------------------------------------
// Record types (matching Java records)
// ---------------------------------------------------------------------------

export interface TableRecordList {
  table: string;
  recordCount: number;
  contentInCsvFormat: string;
}

export interface TableCount {
  table: string;
  recordCount: number;
}

export interface ModuleRule {
  description: string;
  rule: string;
}

export interface TableRule {
  rule: string | null;
  extraRefTables: string[];
  exampleId: string | null;
  exampleDescription: string | null;
}

export interface RelatedInfo {
  relatedSchema: string;
  relatedTableRecordListInCsv: TableRecordList[];
  otherTableCounts: TableCount[];
  rule: string | null;
  example: Example | null;
}

// ---------------------------------------------------------------------------
// TableRelatedInfoFinder
// ---------------------------------------------------------------------------

export class TableRelatedInfoFinder {

  static findRelatedInfo(context: Context, cfgValue: CfgValue, vTable: VTable): RelatedInfo {
    const tableSchema = vTable.schema;
    const relatedCfg = TableRelatedInfoFinder.findRelatedCfgStr(tableSchema);
    const rule = TableRelatedInfoFinder.findTableRule(context, tableSchema);

    const relatedInfo: RelatedInfo = {
      relatedSchema: relatedCfg,
      relatedTableRecordListInCsv: [],
      otherTableCounts: [],
      rule: rule !== null ? rule.rule : null,
      example: TableRelatedInfoFinder.getExample(rule, vTable),
    };

    const refOutTables = TableSchemaRefGraph.findAllRefOuts(tableSchema);
    const extraRefTables = rule !== null ? rule.extraRefTables : [];
    for (const schema of refOutTables.values()) {
      const vt = cfgValue.getTable(schema.name());
      if (vt && (isEEnum(schema.entry) || extraRefTables.includes(schema.name()))) {
        relatedInfo.relatedTableRecordListInCsv.push(
          TableRelatedInfoFinder.getTableRecordListInCsv(vt, null, 0, 20),
        );
      } else if (vt) {
        relatedInfo.otherTableCounts.push({
          table: schema.name(),
          recordCount: vt.valueList.length,
        });
      }
    }
    return relatedInfo;
  }

  static findModuleRuleForTable(context: Context, tableSchema: TableSchema): ModuleRule | null {
    const namespace = tableSchema.namespace();
    const cfgFilePath = context.sourceStructure().getCfgFilePathByPkgName(namespace);
    if (cfgFilePath === null) {
      return null;
    }

    // $mod.md
    const modDir = path.dirname(cfgFilePath);
    const modFile = path.join(modDir, '$mod.md');
    if (!fs.existsSync(modFile)) {
      return null;
    }

    const doc = readMarkdown(modFile, 'utf-8');
    const description = doc.frontmatter.get('description') ?? '';
    return { description, rule: doc.content };
  }

  static findTableRule(context: Context, tableSchema: TableSchema): TableRule | null {
    const namespace = tableSchema.namespace();
    const cfgFilePath = context.sourceStructure().getCfgFilePathByPkgName(namespace);
    if (cfgFilePath === null) {
      return null;
    }
    const modDir = path.dirname(cfgFilePath);

    // Find table-specific .md file
    let rule: string | null = null;
    const extraRefTables: string[] = [];
    let exampleId: string | null = null;
    let exampleDescription: string | null = null;

    const tabFile = path.join(modDir, tableSchema.lastName() + '.md');
    if (fs.existsSync(tabFile)) {
      const doc = readMarkdown(tabFile, 'utf-8');
      const refTables = doc.frontmatter.get('refTables');
      if (refTables && refTables.trim().length > 0) {
        const trim = refTables.trim();
        extraRefTables.push(...trim.split(/[;,]/));
      }
      exampleId = doc.frontmatter.get('exampleId') ?? null;
      exampleDescription = doc.frontmatter.get('exampleDescription') ?? null;

      rule = doc.content;
    }

    return { rule, extraRefTables, exampleId, exampleDescription };
  }

  // -------------------------------------------------------------------------
  // Async variants (T12.0e)
  // -------------------------------------------------------------------------

  static async findModuleRuleForTableAsync(context: Context, tableSchema: TableSchema): Promise<ModuleRule | null> {
    const namespace = tableSchema.namespace();
    const cfgFilePath = context.sourceStructure().getCfgFilePathByPkgName(namespace);
    if (cfgFilePath === null) {
      return null;
    }

    const dfs = getDefaultFileSystem();
    const modDir = path.dirname(cfgFilePath);
    const modFile = path.join(modDir, '$mod.md');
    if (!await dfs.exists(modFile)) {
      return null;
    }

    const doc = await readMarkdownAsync(modFile, 'utf-8');
    const description = doc.frontmatter.get('description') ?? '';
    return { description, rule: doc.content };
  }

  static async findTableRuleAsync(context: Context, tableSchema: TableSchema): Promise<TableRule> {
    const namespace = tableSchema.namespace();
    const cfgFilePath = context.sourceStructure().getCfgFilePathByPkgName(namespace);
    if (cfgFilePath === null) {
      return { rule: null, extraRefTables: [], exampleId: null, exampleDescription: null };
    }
    const modDir = path.dirname(cfgFilePath);
    const dfs = getDefaultFileSystem();

    let rule: string | null = null;
    const extraRefTables: string[] = [];
    let exampleId: string | null = null;
    let exampleDescription: string | null = null;

    const tabFile = path.join(modDir, tableSchema.lastName() + '.md');
    if (await dfs.exists(tabFile)) {
      const doc = await readMarkdownAsync(tabFile, 'utf-8');
      const refTables = doc.frontmatter.get('refTables');
      if (refTables && refTables.trim().length > 0) {
        const trim = refTables.trim();
        extraRefTables.push(...trim.split(/[;,]/));
      }
      exampleId = doc.frontmatter.get('exampleId') ?? null;
      exampleDescription = doc.frontmatter.get('exampleDescription') ?? null;

      rule = doc.content;
    }

    return { rule, extraRefTables, exampleId, exampleDescription };
  }

  static findRelatedCfgStr(tableSchema: TableSchema): string {
    const sb: string[] = [];
    const allIncludedStructs = findAllIncludedStructs(tableSchema);
    for (const s of allIncludedStructs.values()) {
      if (s instanceof StructSchemaCls && s.nullableInterface() !== null) {
        continue;
      }
      sb.push(CfgWriter.stringifyNamable(s));
    }
    return sb.join('');
  }

  static getTableRecordListInCsv(
    vTable: VTable,
    extraFields: string[] | null,
    offset: number,
    limit: number,
  ): TableRecordList {
    const schema = vTable.schema;

    const sb: string[] = [];
    const fieldNames = new Set<string>();
    const pkFields = schema.primaryKey.fieldSchemas();
    if (pkFields) {
      for (const f of pkFields) {
        fieldNames.add(f.name);
      }
    }
    if (isEEnum(schema.entry)) {
      fieldNames.add(schema.entry.field);
    }
    const titleMeta = schema.meta().get('title');
    if (titleMeta !== undefined && isMetaStr(titleMeta)) {
      fieldNames.add(titleMeta.value);
    }

    if (extraFields) {
      for (const extraField of extraFields) {
        if (vTable.schema.findField(extraField) !== null) {
          fieldNames.add(extraField);
        }
      }
    }

    ValueToCsv.writeAsCsv(sb, vTable, fieldNames, offset, limit);

    return {
      table: schema.name(),
      recordCount: vTable.valueList.length,
      contentInCsvFormat: sb.join(''),
    };
  }

  static getExample(rule: TableRule | null, vTable: VTable | null): Example | null {
    if (rule === null || vTable === null) {
      return null;
    }
    if (!rule.exampleId || rule.exampleId.trim().length === 0 ||
        !rule.exampleDescription || rule.exampleDescription.trim().length === 0) {
      return null;
    }

    const errs = CfgValueErrs.of();
    const pkValue = ValuePack.unpackTablePrimaryKey(rule.exampleId, vTable.schema, errs);
    if (errs.errs.length === 0 && pkValue !== null) {
      // Look up record by primary key using valueEquals
      let vRecord: VStruct | undefined;
      for (const [k, v] of vTable.primaryKeyMap) {
        if (k === pkValue || (k instanceof Object && pkValue instanceof Object &&
            k.constructor === pkValue.constructor && (k as any).equals?.(pkValue))) {
          vRecord = v;
          break;
        }
      }
      if (vRecord) {
        const jsonString = ValueToJson.toJsonStr(vRecord);
        return example(rule.exampleId, rule.exampleDescription, jsonString);
      }
    }

    return null;
  }
}
