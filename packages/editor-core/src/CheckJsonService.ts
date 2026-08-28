/**
 * CheckJsonService — TypeScript port of Java `configgen.editorserver.CheckJsonService`.
 *
 * Validates a JSON string against a table's schema by extracting JSON from
 * raw text, parsing via ValueJsonParser, and returning the normalized JSON
 * or an error message.
 *
 * Java source: configgen.editorserver.CheckJsonService.java (62 lines)
 */

import { CfgValueErrs, ValueJsonParser, ValueToJson } from '@cfgforge/value';
import type { VStruct, VTable } from '@cfgforge/value';
import { ByAIGenerator, FIX_ERROR } from '@cfgforge/gen';
import type { EditorService } from './EditorService.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CheckJsonResultCode =
  | 'ok'
  | 'tableNotFound'
  | 'JsonNotFound'
  | 'ParseJsonError';

export interface CheckJsonResult {
  resultCode: CheckJsonResultCode;
  table: string;
  jsonResult: string;
}

// ---------------------------------------------------------------------------
// CheckJsonService
// ---------------------------------------------------------------------------

export class CheckJsonService {
  static checkJson(editor: EditorService, table: string, raw: string): CheckJsonResult {
    if (!table || table.length === 0) {
      return { resultCode: 'tableNotFound', table: '', jsonResult: 'table not found' };
    }

    const vTable: VTable | undefined = editor.cfgValue().getTable(table);
    if (vTable === undefined) {
      return { resultCode: 'tableNotFound', table, jsonResult: 'table not found' };
    }

    if (!raw || raw.length === 0) {
      return { resultCode: 'JsonNotFound', table, jsonResult: 'json empty' };
    }

    const jsonResult = ByAIGenerator.extractJson(raw);
    if (jsonResult === null) {
      return { resultCode: 'JsonNotFound', table, jsonResult: 'json not found' };
    }

    const tableSchema = vTable.schema;
    const parseErrs: CfgValueErrs = CfgValueErrs.of();
    const record: VStruct = new ValueJsonParser(tableSchema, parseErrs).fromJson(jsonResult);
    // allowErr=true, don't throw — we check errs manually
    parseErrs.checkErrors('check json', true, true);

    if (parseErrs.errs.length > 0) {
      const errStr = parseErrs.errs.map((e) => e.msg()).join('\n');
      const errMsg = FIX_ERROR.replace('%s', errStr);
      return { resultCode: 'ParseJsonError', table, jsonResult: errMsg };
    }

    const jsonString = ValueToJson.toJsonStr(record);
    return { resultCode: 'ok', table, jsonResult: jsonString };
  }
}
