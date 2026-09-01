/**
 * ValueErrsService — collect all validation errors from the editor's
 * CfgValue and serialize them into a navigation-friendly format (ValueErrInfo[]).
 *
 * Used by the cfgeditor "Error List" side panel: grouped by table, click to
 * navigate to the offending record in edit mode, "re-check" button to
 * re-validate.
 *
 * Key design: calls Context.collectErrsAsync() which re-parses the full
 * CfgValue WITHOUT caching and WITHOUT checkErrors (no console spam, no throw).
 * This is a low-frequency operation (user-triggered re-check or post-save).
 *
 * Navigation resolution: record-level errors (PrimaryOrUniqueKeyDuplicated,
 * MustFillButCellEmpty, ForeignValueNotFound, RefNotNullableButCellEmpty)
 * carry a `value` (or `recordId`). For the ones carrying a value we resolve
 * the owning record by walking the parsed CfgValue and matching by source
 * (same DCell row / same DFile). This yields a recordId in the canonical
 * `${table}-${pkPackStr}` format used by the editor's record URLs.
 */

import type { EditorService } from './EditorService.js';
import type { VErr, VWarn, Msg } from '@cfgforge/value';
import { CfgValueErrs, ForeachVStruct, ValueUtil, VStruct } from '@cfgforge/value';
import { DCell, DCellList, DFile } from '@cfgforge/data';
import type { Source } from '@cfgforge/data';
import type { Value, CfgValue, VTable } from '@cfgforge/value';
// ---------------------------------------------------------------------------
// ValueErrInfo — serializable error info for the UI
// ---------------------------------------------------------------------------

export interface ValueErrInfo {
  table: string;
  recordId?: string;
  field?: string;
  errType: string;
  msg: string;
  sourceKind: 'cell' | 'file';
  sourceDesc: string;
  level: 'err' | 'warn';
}

// ---------------------------------------------------------------------------
// Source helpers — stable tokens for matching a Value against the CfgValue
// ---------------------------------------------------------------------------

/** Extract source description from a VErr's `source` field. */
function extractSource(source: unknown): { sourceKind: 'cell' | 'file'; sourceDesc: string } | null {
  if (source instanceof DCell) {
    const dRowId = source.rowId();
    const sheetPart = dRowId.sheetName ? `#${dRowId.sheetName}` : '';
    return {
      sourceKind: 'cell',
      sourceDesc: `${dRowId.fileName}${sheetPart}!${source.displayCol()}${source.displayRow()}`,
    };
  }
  if (source instanceof DCellList) {
    if (source.cells.length > 0) {
      return extractSource(source.cells[0]);
    }
    return null;
  }
  if (source instanceof DFile) {
    const pathPart = source.path.length > 0 ? `.${source.path.join('.')}` : '';
    return {
      sourceKind: 'file',
      sourceDesc: `${source.fileName}${pathPart}`,
    };
  }
  return null;
}

/** The row-location token of a Source (file+row for cells, file for files). */
function sourceRowToken(src: Source): string | null {
  if (src instanceof DCell) {
    const dRowId = src.rowId();
    const sheetPart = dRowId.sheetName ? `#${dRowId.sheetName}` : '';
    return `${dRowId.fileName}${sheetPart}!${src.displayCol()}${src.displayRow()}`;
  }
  if (src instanceof DCellList) {
    if (src.cells.length === 0) return null;
    return sourceRowToken(src.cells[0]);
  }
  if (src instanceof DFile) {
    return src.fileName;
  }
  return null;
}

/** The row-location token of a Value's source (file+row for cells, file for files). */
function valueRowToken(value: Value): string | null {
  const src = (value as unknown as { source?: Source }).source;
  if (!src) return null;
  return sourceRowToken(src);
}

/** Best-effort extraction of table name from a Value's source. */
function tableFromValueSource(value: Value): string {
  const source = (value as unknown as { source?: Source }).source;
  if (!source) return '';
  const extracted = extractSource(source);
  if (!extracted) return '';
  // For cells: fileName is like "item.csv" or "ItemData.xlsx" — strip extension
  // For files: sourceDesc is like "data/item/Reward.json.amount" — take basename, strip ext
  const raw = extracted.sourceDesc.split(/[#!]/)[0];
  const baseName = raw.replace(/[\\/]/g, '/').split('/').pop() ?? raw;
  const dotIdx = baseName.lastIndexOf('.');
  return dotIdx > 0 ? baseName.substring(0, dotIdx) : baseName;
}

// ---------------------------------------------------------------------------
// Record-id resolution — locate the record owning a (partial) value
// ---------------------------------------------------------------------------

/** Lookup the canonical `table-pk` id for the record whose source tree contains `value`. */
function resolveRecordId(
  value: Value,
  cfgValue: CfgValue | null,
): { table: string; recordId: string } | null {
  if (!cfgValue) return null;

  // Fast path: value IS a top-level record (e.g. PrimaryOrUniqueKeyDuplicated
  // carries the extracted key value, whose source is the record's cells).
  if (value instanceof VStruct) {
    const vTable = cfgValue.vTableMap.get(value.name());
    if (vTable && vTable.schema === value.schema) {
      return {
        table: vTable.name(),
        recordId: `${vTable.name()}-${ValueUtil.extractPrimaryKeyValue(value, vTable.schema).packStr()}`,
      };
    }
  }

  // General path: scan every record; if any cell of the value's source tree
  // lies within the record's source cell range, that's the owning record.
  const token = valueRowToken(value);
  if (token === null) return null;

  for (const table of cfgValue.tables()) {
    const found = findRecordByToken(table, token);
    if (found !== null) return found;
  }
  return null;
}

/** Find the record in `table` whose source row token matches `token`. */
function findRecordByToken(table: VTable, token: string): { table: string; recordId: string } | null {
  let found: { table: string; recordId: string } | null = null;

  ForeachVStruct.foreachVTable(
    {
      visit(vStruct) {
        // Only top-level records (schema === table.schema).
        if (vStruct.schema === table.schema) {
          const recToken = valueRowToken(vStruct);
          if (recToken !== null && recToken === token) {
            found = {
              table: table.name(),
              recordId: `${table.name()}-${ValueUtil.extractPrimaryKeyValue(vStruct, table.schema).packStr()}`,
            };
            return false;
          }
        }
        return true;
      },
    },
    table,
  );

  return found;
}

// ---------------------------------------------------------------------------
// toValueErrInfo — pure function: VErr/VWarn → ValueErrInfo
// ---------------------------------------------------------------------------

/** VWarn _tag set for level discrimination. */
const VWARN_TAGS = new Set<string>(['JsonHasExtraFields']);

/**
 * Convert a VErr or VWarn into a ValueErrInfo.
 * Uses _tag-based branching to extract table/recordId/field.
 * When a record-level error carries a `value`, we resolve table/recordId by
 * matching against the parsed CfgValue (`cfgValue` param).
 */
export function toValueErrInfo(
  err: VErr | VWarn,
  cfgValue?: CfgValue | null,
): ValueErrInfo {
  const errType = err._tag;
  const msg = (err as Msg).msg();
  const level: 'err' | 'warn' = VWARN_TAGS.has(errType) ? 'warn' : 'err';

  // Extract source info
  const sourceField = (err as unknown as { source?: Source }).source;
  const sourceInfo = sourceField ? extractSource(sourceField) : null;
  const sourceKind: 'cell' | 'file' = sourceInfo?.sourceKind ?? 'cell';
  const sourceDesc: string = sourceInfo?.sourceDesc ?? '';

  // Extract table, recordId, field — _tag-based branching
  const e = err as unknown as Record<string, unknown>;
  let table = '';
  let recordId: string | undefined;
  let field: string | undefined;

  switch (errType) {
    // Errors with explicit table field
    case 'PrimaryOrUniqueKeyDuplicated':
      table = String(e.table ?? '');
      // value is the extracted key value; table-pkPackStr is the canonical recordId
      if (e.value) {
        recordId = `${table}-${(e.value as Value).packStr()}`;
      }
      break;
    case 'EnumEmpty':
    case 'EntryContainsSpace':
    case 'EntryDuplicated':
      table = String(e.table ?? '');
      break;
    case 'SeqValueNotContinuous':
      table = String(e.table ?? '');
      field = String(e.field ?? '');
      break;

    // Errors with recordId
    case 'ForeignValueNotFound':
      // recordId is "源表-pk" format (set by ForeachContext.recordId()).
      // The source table (where the error occurred) is the table prefix of
      // recordId; foreignTable is the *target* table, not the source.
      if (e.recordId) {
        const rid = String(e.recordId);
        const dash = rid.lastIndexOf('-');
        if (dash > 0) {
          table = rid.substring(0, dash);
        }
      }
      recordId = e.recordId ? String(e.recordId) : undefined;
      field = e.foreignKey ? String(e.foreignKey) : undefined;
      break;
    case 'RefNotNullableButCellEmpty':
      // recordId is "源表-pk" format, same as ForeignValueNotFound.
      if (e.recordId) {
        const rid = String(e.recordId);
        const dash = rid.lastIndexOf('-');
        if (dash > 0) {
          table = rid.substring(0, dash);
        }
      }
      recordId = e.recordId ? String(e.recordId) : undefined;
      break;

    // Errors with nameable + field
    case 'ParsePackErr':
      table = String(e.nameable ?? '');
      break;
    case 'InterfaceCellImplNotFound':
      table = String(e.nameable ?? '');
      break;
    case 'FieldCellSpanNotEnough':
      table = String(e.nameable ?? '');
      field = String(e.field ?? '');
      break;
    case 'FieldCellNotUsed':
      table = String(e.nameable ?? '');
      break;
    case 'NotMatchFieldType':
      table = String(e.nameable ?? '');
      field = String(e.field ?? '');
      break;
    case 'MapKeyDuplicated':
      table = String(e.nameable ?? '');
      field = String(e.field ?? '');
      break;

    // Errors with value (VStruct) — extract table from source
    case 'MustFillButCellEmpty':
      if (e.value) {
        const v = e.value as Value;
        table = tableFromValueSource(v);
        // Try to get field name from VStruct.schema
        const struct = v as VStruct;
        if (struct.schema && typeof struct.schema === 'object' && 'name' in struct.schema) {
          field = String((struct.schema as { name(): string }).name());
        }
      }
      break;

    // JSON file errors — source is DFile, table from inStruct
    case 'JsonStrEmpty':
    case 'JsonParseException':
    case 'JsonTypeNotExist':
    case 'JsonTypeNotMatch':
    case 'JsonValueNotMatchType':
    case 'JsonHasExtraFields':
      if (e.source instanceof DFile) {
        table = e.source.inStruct;
      }
      break;

    // JSON file read error — no source, table from jsonFile
    case 'JsonFileReadErr':
      // jsonFile is a relative path like "data/item/Reward.json"
      // We can't reliably map it to a table name, so leave table empty
      break;

    // Internal error — no table
    case 'InternalError':
      break;

    default:
      // Unknown error type — best effort
      break;
  }

  // Record-level errors whose value carries the record: resolve table/recordId
  // against the parsed CfgValue (same source as collectErrsAsync).
  const cellValue = (e as unknown as { value?: Value }).value;
  if (
    cellValue &&
    (errType === 'MustFillButCellEmpty')
  ) {
    const resolved = resolveRecordId(cellValue, cfgValue ?? null);
    if (resolved) {
      table = resolved.table || table;
      recordId = resolved.recordId;
    }
  }

  return { table, recordId, field, errType, msg, sourceKind, sourceDesc, level };
}

// ---------------------------------------------------------------------------
// ValueErrsService
// ---------------------------------------------------------------------------

export class ValueErrsService {
  /**
   * Collect all validation errors from the editor's CfgValue.
   * Re-parses the full configuration to capture all VErr/VWarn.
   * Returns a flat array of ValueErrInfo, unsorted (UI groups by table).
   *
   * Uses the editor's current parsed CfgValue as the "map" to resolve
   * record-level errors to their owning table/recordId.
   */
  static async collectValueErrs(editor: EditorService, force?: boolean): Promise<ValueErrInfo[]> {
    if (force) {
      editor.context().invalidateCollectedErrs();
    }
    const errs: CfgValueErrs = await editor.context().collectErrsAsync();
    const cfgValue = editor.cfgValue();
    const result: ValueErrInfo[] = [];

    for (const e of errs.errs) {
      result.push(toValueErrInfo(e, cfgValue));
    }
    for (const w of errs.warns) {
      result.push(toValueErrInfo(w, cfgValue));
    }

    return result;
  }
}