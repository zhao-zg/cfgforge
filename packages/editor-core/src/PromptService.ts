/**
 * PromptService — TypeScript port of Java `configgen.editorserver.PromptService`.
 *
 * Generates AI prompt text for a given table, including the schema definition
 * and an optional init message.
 *
 * Java source: configgen.editorserver.PromptService.java (43 lines)
 */

import { PromptGen } from '@cfgforge/gen';
import type { Prompt } from '@cfgforge/gen';
import type { EditorService } from './EditorService.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PromptResultCode =
  | 'ok'
  | 'AICfgNotSet'
  | 'tableNotSet'
  | 'tableNotFound'
  | 'promptFileNotFound';

export interface PromptResult {
  resultCode: PromptResultCode;
  prompt: string;
  init: string;
  /** Table name (included for error responses; empty on success). */
  table?: string;
}

// ---------------------------------------------------------------------------
// PromptService
// ---------------------------------------------------------------------------

export class PromptService {
  static gen(editor: EditorService, table: string): PromptResult {
    if (!table || table.length === 0) {
      return { resultCode: 'tableNotSet', prompt: '', init: '' };
    }

    const vTable = editor.cfgValue().getTable(table);
    if (vTable === undefined) {
      return { resultCode: 'tableNotFound', prompt: '', init: '', table };
    }

    const prompt: Prompt = PromptGen.genPrompt(editor.context(), editor.cfgValue(), vTable);
    return { resultCode: 'ok', prompt: prompt.prompt, init: prompt.init };
  }
}
