/**
 * LangText — TypeScript port of Java `configgen.geni18n.LangText`.
 *
 * Extracts translatable text (VText values) from a CfgValue tree and
 * saves them to xlsx files (one per module, sheets = tables).
 *
 * Structure:
 *   LangText: Map<moduleName, ModuleText>
 *   ModuleText: Map<tableName, TextByIdFinder>
 *
 * Column layout in xlsx:
 *   id | [desc] | orig1 | t(field1) | orig2 | t(field2) | ...
 *
 * Java source: configgen.geni18n.LangText.java (233 lines)
 */

import * as path from 'path';
import * as XLSX from 'xlsx';
import { hasText } from '@cfggen/schema';
import type { Nameable } from '@cfggen/schema';
import {
  type CfgValue,
  type Value,
  type PrimitiveValue,
  type VTable,
  VText,
  VStruct,
} from '@cfggen/value';
import { ForeachValue, ValueVisitorForPrimitive } from '@cfggen/value';
import { ValueUtil } from '@cfggen/value';
import { TextByIdFinder, OneText, OneRecord } from '@cfggen/i18n';
import { normalize, fieldChainStr } from '@cfggen/i18n';
import { Logger } from '@cfggen/shared';

// ---------------------------------------------------------------------------
// LangStat — translation statistics
// ---------------------------------------------------------------------------

export class LangStat {
  private notTranslateCount = 0;
  private textCount = 0;
  private readonly hasNotTranslateTables = new Set<string>();

  addOneTranslate(_table: string, _orig: string, translated: string): void {
    this.textCount++;
    if (translated.length === 0) {
      this.notTranslateCount++;
    }
  }

  incNotTranslate(table: string): void {
    this.notTranslateCount++;
    this.hasNotTranslateTables.add(table);
  }

  dump(): void {
    Logger.verbose('              textCount : %d', this.textCount);
    Logger.verbose('      notTranslateCount : %d', this.notTranslateCount);
  }
}

// ---------------------------------------------------------------------------
// LangText — Map<moduleName, ModuleText>
// ---------------------------------------------------------------------------

/**
 * key: module name (table name prefix before last '.', or "_top")
 */
export class LangText {
  readonly modules: Map<string, ModuleText> = new Map();

  /**
   * Save all modules to xlsx files in wroteDir.
   */
  save(wroteDir: string, stat: LangStat): void {
    for (const [moduleFn, module] of this.modules) {
      const dst = path.join(wroteDir, moduleFn + '.xlsx');
      module.save(dst, stat);
    }
  }

  /**
   * Compare two LangText for equality (debug aid).
   */
  equalsWithLog(other: LangText): boolean {
    if (this.modules.size !== other.modules.size) return false;
    for (const [module, thisTop] of this.modules) {
      const otherTop = other.modules.get(module);
      if (!otherTop) return false;
      if (thisTop.tables.size !== otherTop.tables.size) return false;
      for (const [table, wroteTable] of thisTop.tables) {
        const extractedTable = otherTop.tables.get(table);
        if (!extractedTable || !wroteTable.equals(extractedTable)) {
          Logger.log('%s NOT match', table);
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Build a LangText from a Map<tableName, TextByIdFinder>.
   */
  static ofFinder(tableMap: Map<string, TextByIdFinder>): LangText {
    const res = new LangText();
    for (const [table, finder] of tableMap) {
      const moduleName = LangText.getModule(table);
      let module = res.modules.get(moduleName);
      if (!module) {
        module = new ModuleText();
        res.modules.set(moduleName, module);
      }
      module.tables.set(table, finder);
    }
    return res;
  }

  private static getModule(table: string): string {
    const idx = table.lastIndexOf('.');
    if (idx !== -1) {
      return table.substring(0, idx);
    }
    return '_top';
  }

  /**
   * Extract translatable text from CfgValue.
   * For each VTable with text fields, iterate all records and collect
   * (pk, fieldChain, original, translated) into TextByIdFinder.
   */
  static extract(cfgValue: CfgValue): LangText {
    const tableMap = new Map<string, TextByIdFinder>();

    for (const vTable of cfgValue.sortedTables()) {
      if (!hasText(vTable.schema as Nameable)) {
        continue;
      }

      const finder = new TextByIdFinder();
      finder.setNullableDescriptionName(vTable.schema.meta().getStr('lang', null));

      for (const [pk, vStruct] of vTable.primaryKeyMap) {
        const pkStr = pk.packStr();
        const description = finder.getNullableDescriptionName() !== null
          ? ValueUtil.extractFieldValueStr(vStruct, finder.getNullableDescriptionName()!)
          : null;

        const record = new OneRecord(description, []);
        ForeachValue.foreachValue(
          new TextValueVisitor(finder, record),
          vStruct,
          pk,
          [],
        );
        if (record.texts.length > 0) {
          finder.getPkToTexts().set(pkStr, record);
        }
      }

      if (finder.getPkToTexts().size > 0) {
        const tableName = vTable.name();
        tableMap.set(tableName, finder);

        let txtCount = 0;
        for (const r of finder.getPkToTexts().values()) {
          for (const t of r.texts) {
            if (t !== null) txtCount++;
          }
        }
        Logger.verbose('extract %20s: %8d pks %8d texts', tableName, finder.getPkToTexts().size, txtCount);
      }
    }

    return LangText.ofFinder(tableMap);
  }
}

// ---------------------------------------------------------------------------
// ModuleText — Map<tableName, TextByIdFinder>
// ---------------------------------------------------------------------------

export class ModuleText {
  readonly tables: Map<string, TextByIdFinder> = new Map();

  save(filePath: string, stat: LangStat): void {
    const wb = XLSX.utils.book_new();
    for (const [table, finder] of this.tables) {
      const sheetName = ModuleText.getSheetName(table);
      const ws = ModuleText.saveSheet(finder, table, stat);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }
    XLSX.writeFile(wb, filePath);
  }

  private static getSheetName(table: string): string {
    if (table.length < 31) return table;
    const idx = table.lastIndexOf('.');
    if (idx !== -1) {
      const tableName = table.substring(idx + 1);
      if (tableName.length < 31) return tableName;
    }
    throw new Error('table name too long for sheet name: ' + table);
  }

  private static saveSheet(finder: TextByIdFinder, table: string, stat: LangStat): XLSX.WorkSheet {
    const hasDescriptionColumn = finder.getNullableDescriptionName() !== null;
    const offset = hasDescriptionColumn ? 2 : 1;

    // Build header row
    const header: string[] = ['id'];
    if (hasDescriptionColumn) {
      header.push(finder.getNullableDescriptionName()!);
    }
    const fieldChains = [...finder.getFieldChainToIndex().keys()];
    for (const field of fieldChains) {
      header.push(field);
      header.push('t(' + field + ')');
    }

    const rows: (string | null)[][] = [header];

    // Build data rows
    for (const [pk, record] of finder.getPkToTexts()) {
      const row: (string | null)[] = [pk];
      if (hasDescriptionColumn) {
        row.push(record.description);
      }

      for (let idx = 0; idx < record.texts.length; idx++) {
        const ot = record.texts[idx];
        if (ot !== null) {
          stat.addOneTranslate(table, ot.original, ot.translated);
          row.push(ot.original);
          row.push(ot.translated);
          if (ot.translated.length === 0) {
            stat.incNotTranslate(table);
          }
        } else {
          row.push(null);
          row.push(null);
        }
      }
      rows.push(row);
    }

    return XLSX.utils.aoa_to_sheet(rows);
  }
}

// ---------------------------------------------------------------------------
// TextValueVisitor — extracts VText values during ForeachValue traversal
// ---------------------------------------------------------------------------

class TextValueVisitor extends ValueVisitorForPrimitive {
  private readonly finder: TextByIdFinder;
  private readonly record: OneRecord;

  constructor(finder: TextByIdFinder, record: OneRecord) {
    super();
    this.finder = finder;
    this.record = record;
  }

  override visitPrimitive(pv: PrimitiveValue, _pk: Value, fieldChain: string[]): void {
    if (pv instanceof VText) {
      const original = pv.original.trim();
      const translated = pv.translated;
      if (original.length === 0 && translated.length === 0) {
        return;
      }

      const normalized = normalize(original);
      const oneText = new OneText(normalized, translated);

      const fcStr = fieldChainStr(fieldChain);
      let idx = this.finder.getFieldChainToIndex().get(fcStr);
      if (idx === undefined) {
        idx = this.finder.getFieldChainToIndex().size;
        this.finder.getFieldChainToIndex().set(fcStr, idx);
      }
      // Ensure array is large enough; pad with null
      while (this.record.texts.length <= idx) {
        this.record.texts.push(null);
      }
      this.record.texts[idx] = oneText;
    }
  }
}
