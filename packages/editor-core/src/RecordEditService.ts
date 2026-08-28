/**
 * RecordEditService — TypeScript port of Java `configgen.editorserver.RecordEditService`.
 *
 * Bridges EditorService with the write package's AddOrUpdateService and
 * DeleteService. After a successful write, the EditorService adopts the new
 * CfgValue so subsequent reads reflect the updated state.
 *
 * Key differences from Java:
 * - Java methods are static taking (Context, CfgValue, ...); TS methods take
 *   an EditorService instance and use its cfgValue()/context() accessors.
 * - Java returns ResultWithNewCfgValue containing both the result and the new
 *   CfgValue; TS methods call editor.adoptNewCfgValue() internally and return
 *   just the RecordEditResult.
 * - Java switch expressions → TS if/else chains.
 * - Async: the underlying write services are async in TS.
 *
 * Java source: configgen.editorserver.RecordEditService.java (101 lines)
 */

import type { Context } from '@cfgforge/context';
import type { CfgValue } from '@cfgforge/value';
import {
  AddOrUpdateService,
  AddOrUpdateErrorCode,
  DeleteService,
  DeleteErrorCode,
} from '@cfgforge/write';
import type { EditorService } from './EditorService.js';

// ---------------------------------------------------------------------------
// Types (mirror cfgeditor/src/api/recordModel.ts)
// ---------------------------------------------------------------------------

export type EditResultCode =
  | 'addOk'
  | 'updateOk'
  | 'deleteOk'
  | 'serverNotEditable'
  | 'tableNotSet'
  | 'idNotSet'
  | 'tableNotFound'
  | 'idParseErr'
  | 'idNotFound'
  | 'jsonParseErr'
  | 'storeErr';

export interface RecordEditResult {
  resultCode: EditResultCode;
  table: string;
  id: string;
  valueErrs: string[];
}

// ---------------------------------------------------------------------------
// RecordEditService
// ---------------------------------------------------------------------------

export class RecordEditService {
  /**
   * Add or update a record in a table.
   *
   * @param editor    the EditorService (provides Context + CfgValue)
   * @param tableName the table to modify
   * @param jsonStr   JSON string of the record
   * @returns the edit result
   */
  static async addOrUpdateRecord(
    editor: EditorService,
    tableName: string | null,
    jsonStr: string,
  ): Promise<RecordEditResult> {
    if (tableName === null) {
      return { resultCode: 'tableNotSet', table: '', id: '', valueErrs: [] };
    }

    const context: Context = editor.context();
    const cfgValue: CfgValue = editor.cfgValue();

    const ar = await AddOrUpdateService.addOrUpdateRecord(
      context, cfgValue, tableName, jsonStr,
    );

    const resultCode: EditResultCode = mapAddOrUpdateCode(ar.errorCode);

    if (ar.newCfgValue !== null) {
      editor.adoptNewCfgValue(ar.newCfgValue);
    }

    return {
      resultCode,
      table: tableName,
      id: ar.recordId ?? '',
      valueErrs: ar.errorMessages,
    };
  }

  /**
   * Delete a record from a table by its packed primary key string.
   *
   * @param editor    the EditorService
   * @param tableName the table to modify
   * @param id        the packed primary key string
   * @returns the edit result
   */
  static async deleteRecord(
    editor: EditorService,
    tableName: string | null,
    id: string | null,
  ): Promise<RecordEditResult> {
    if (tableName === null) {
      return { resultCode: 'tableNotSet', table: '', id: '', valueErrs: [] };
    }

    if (id === null) {
      return { resultCode: 'idNotSet', table: tableName, id: '', valueErrs: [] };
    }

    const context: Context = editor.context();
    const cfgValue: CfgValue = editor.cfgValue();

    const dr = await DeleteService.deleteRecord(
      context, cfgValue, tableName, id,
    );

    const resultCode: EditResultCode = mapDeleteCode(dr.errorCode);

    if (dr.newCfgValue !== null) {
      editor.adoptNewCfgValue(dr.newCfgValue);
    }

    return {
      resultCode,
      table: tableName,
      id,
      valueErrs: dr.errorMessages,
    };
  }
}

// ---------------------------------------------------------------------------
// Error code mapping
// ---------------------------------------------------------------------------

function mapAddOrUpdateCode(code: AddOrUpdateErrorCode): EditResultCode {
  switch (code) {
    case AddOrUpdateErrorCode.AddOK:
      return 'addOk';
    case AddOrUpdateErrorCode.UpdateOK:
      return 'updateOk';
    case AddOrUpdateErrorCode.PartialNotEditable:
      return 'serverNotEditable';
    case AddOrUpdateErrorCode.TableNotFound:
      return 'tableNotFound';
    case AddOrUpdateErrorCode.RecordParseError:
      return 'jsonParseErr';
    case AddOrUpdateErrorCode.IOException:
      return 'storeErr';
  }
}

function mapDeleteCode(code: DeleteErrorCode): EditResultCode {
  switch (code) {
    case DeleteErrorCode.OK:
      return 'deleteOk';
    case DeleteErrorCode.PartialNotEditable:
      return 'serverNotEditable';
    case DeleteErrorCode.TableNotFound:
      return 'tableNotFound';
    case DeleteErrorCode.RecordIdParseError:
      return 'idParseErr';
    case DeleteErrorCode.RecordIdNotFound:
      return 'idNotFound';
    case DeleteErrorCode.IOException:
      return 'storeErr';
  }
}
