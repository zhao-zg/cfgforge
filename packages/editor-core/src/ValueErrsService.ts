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
 */

import type { EditorService } from './EditorService.js';
import type { VErr, VWarn, Msg } from '@cfgforge/value';
import { CfgValueErrs } from '@cfgforge/value';
import { DCell, DCellList, DFile } from '@cfgforge/data';
import type { Source } from '@cfgforge/data';
import type { Value, VStruct } from '@cfgforge/value';

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
// toValueErrInfo — pure function: VErr/VWarn → ValueErrInfo
// ---------------------------------------------------------------------------

/** VWarn _tag set for level discrimination. */
const VWARN_TAGS = new Set<string>(['JsonHasExtraFields']);

/**
 * Extract source description from a VErr's `source` field.
 * Returns { sourceKind, sourceDesc } or null if no source.
 */
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

/**
 * Best-effort extraction of table name from a Value's source.
 * VStruct.source is typically a DCell whose DRowId.fileName is the table's CSV/Excel file.
 * We use the file name (without extension) as the table name.
 */
function tableFromValueSource(value: Value): string {
  const source = (value as unknown as { source?: Source }).source;
  if (!source) return '';
  const extracted = extractSource(source);
  if (!extracted) return '';
  // fileName is like "item.csv" or "ItemData.xlsx" — strip extension
  const fileName = extracted.sourceDesc.split(/[#!]/)[0];
  const dotIdx = fileName.lastIndexOf('.');
  return dotIdx > 0 ? fileName.substring(0, dotIdx) : fileName;
}

/**
 * Convert a VErr or VWarn into a ValueErrInfo.
 * Uses _tag-based branching to extract table/recordId/field.
 */
export function toValueErrInfo(err: VErr | VWarn): ValueErrInfo {
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
      // keys array
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
      table = String(e.foreignTable ?? '');
      recordId = e.recordId ? String(e.recordId) : undefined;
      field = e.foreignKey ? String(e.foreignKey) : undefined;
      break;
    case 'RefNotNullableButCellEmpty':
      recordId = e.recordId ? String(e.recordId) : undefined;
      // table from value source
      if (e.value) {
        table = tableFromValueSource(e.value as Value);
      }
      break;

    // Errors with nameable + field
    case 'ParsePackErr':
      table = String(e.nameable ?? '');
      field = undefined;
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
   */
  static async collectValueErrs(editor: EditorService): Promise<ValueErrInfo[]> {
    const errs: CfgValueErrs = await editor.context().collectErrsAsync();
    const result: ValueErrInfo[] = [];

    for (const e of errs.errs) {
      result.push(toValueErrInfo(e));
    }
    for (const w of errs.warns) {
      result.push(toValueErrInfo(w));
    }

    return result;
  }
}
