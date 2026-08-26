/**
 * SearchService — TypeScript port of Java `configgen.value.SearchService`.
 *
 * Searches all primitive values in a CfgValue tree:
 *   - search(cfgValue, q, maxItems): auto-detect number vs string
 *   - searchNumber: match VInt/VLong values
 *   - searchStrInTable: match VString/VText values (substring)
 *
 * Java source: configgen.value.SearchService.java (144 lines)
 */

import type { PrimitiveValue, VTable, CfgValue, Value } from './CfgValue';
import { VInt, VLong, VString, VText } from './CfgValue';
import { ForeachValue, type ValueVisitorForSearch } from './ForeachValue';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchResultCode = 'ok' | 'qNotSet';

export interface SearchResultItem {
  table: string;
  pk: string;
  fieldChain: string;
  value: string;
}

export interface SearchResult {
  resultCode: SearchResultCode;
  q: string;
  max: number;
  items: SearchResultItem[];
}

// ---------------------------------------------------------------------------
// SearchService
// ---------------------------------------------------------------------------

export class SearchService {
  static search(cfgValue: CfgValue, q: string, maxItems: number): SearchResult {
    if (q == null || q.trim() === '') {
      return { resultCode: 'qNotSet', q: q == null ? '' : q, max: maxItems, items: [] };
    }

    const numValue = Number(q);
    const isNumber = Number.isInteger(numValue) && q.trim() !== '' && !q.includes('.');
    if (isNumber) {
      return SearchService.searchNumber(cfgValue, BigInt(numValue), maxItems);
    } else {
      return SearchService.searchStrInTable(cfgValue, q, maxItems);
    }
  }

  static searchNumber(cfgValue: CfgValue, value: bigint, maxItems: number): SearchResult {
    const visitor = new NumberVisitor(value);

    for (const vTable of cfgValue.sortedTables()) {
      ForeachValue.searchVTable(visitor, vTable);
      if (maxItems > 0 && visitor.result.length >= maxItems) {
        break;
      }
    }

    const items = maxItems > 0
      ? visitor.result.slice(0, Math.min(maxItems, visitor.result.length))
      : visitor.result;
    return { resultCode: 'ok', q: String(value), max: maxItems, items };
  }

  static searchNumberInTable(vTable: VTable, value: bigint, maxItems: number): SearchResult {
    const visitor = new NumberVisitor(value);
    ForeachValue.searchVTable(visitor, vTable);
    const items = maxItems > 0
      ? visitor.result.slice(0, Math.min(maxItems, visitor.result.length))
      : visitor.result;
    return { resultCode: 'ok', q: String(value), max: maxItems, items };
  }

  static searchStrInTable(cfgValue: CfgValue, keyword: string, maxItems: number): SearchResult {
    const visitor = new StringVisitor(keyword);

    for (const vTable of cfgValue.sortedTables()) {
      ForeachValue.searchVTable(visitor, vTable);
      if (maxItems > 0 && visitor.result.length >= maxItems) {
        break;
      }
    }

    const items = maxItems > 0
      ? visitor.result.slice(0, Math.min(maxItems, visitor.result.length))
      : visitor.result;
    return { resultCode: 'ok', q: keyword, max: maxItems, items };
  }

  static searchStrInSingleTable(vTable: VTable, keyword: string, maxItems: number): SearchResult {
    const visitor = new StringVisitor(keyword);
    ForeachValue.searchVTable(visitor, vTable);
    const items = maxItems > 0
      ? visitor.result.slice(0, Math.min(maxItems, visitor.result.length))
      : visitor.result;
    return { resultCode: 'ok', q: keyword, max: maxItems, items };
  }
}

// ---------------------------------------------------------------------------
// NumberVisitor — matches VInt/VLong values against a query number
// ---------------------------------------------------------------------------

class NumberVisitor implements ValueVisitorForSearch {
  readonly q: bigint;
  readonly result: SearchResultItem[] = [];

  constructor(q: bigint) {
    this.q = q;
  }

  visit(primitiveValue: PrimitiveValue, table: string, pk: Value, fieldChain: string[]): void {
    if (primitiveValue instanceof VInt) {
      if (this.q === BigInt(primitiveValue.value)) {
        this.result.push({
          table,
          pk: pk.packStr(),
          fieldChain: fieldChain.join('.'),
          value: String(primitiveValue.value),
        });
      }
    } else if (primitiveValue instanceof VLong) {
      if (this.q === primitiveValue.value) {
        this.result.push({
          table,
          pk: pk.packStr(),
          fieldChain: fieldChain.join('.'),
          value: String(primitiveValue.value),
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// StringVisitor — matches VString/VText values containing the query string
// ---------------------------------------------------------------------------

class StringVisitor implements ValueVisitorForSearch {
  readonly q: string;
  readonly result: SearchResultItem[] = [];

  constructor(q: string) {
    this.q = q;
  }

  visit(primitiveValue: PrimitiveValue, table: string, pk: Value, fieldChain: string[]): void {
    if (primitiveValue instanceof VString) {
      const v = primitiveValue.value;
      if (v.includes(this.q)) {
        this.result.push({
          table,
          pk: pk.packStr(),
          fieldChain: fieldChain.join('.'),
          value: v,
        });
      }
    } else if (primitiveValue instanceof VText) {
      const v = primitiveValue.value;
      if (v.includes(this.q)) {
        this.result.push({
          table,
          pk: pk.packStr(),
          fieldChain: fieldChain.join('.'),
          value: v,
        });
      }
    }
  }
}
