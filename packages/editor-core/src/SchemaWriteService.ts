/**
 * SchemaWriteService — TypeScript port of Java `configgen.editorserver.SchemaWriteService`.
 *
 * Reads and writes CFG schema text:
 *   - readSchemaText: concatenates all .cfg file contents from the data directory.
 *   - writeSchemaText: parses + validates + writes config.cfg, then reloads the
 *     EditorService context so subsequent reads reflect the new schema.
 *
 * Key differences from Java:
 * - Java methods are static taking (Path dataDir, ...); TS methods take an
 *   EditorService instance and use its context()/rootDir() accessors.
 * - Java's CfgSyntaxException → TS ParseError (from CfgParser).
 * - Java's CfgSchemaException → TS CfgSchemaException (from CfgSchemaErrs.checkErrors()).
 * - Java's writeSchemaText does NOT reload the context — it only parses, validates,
 *   and writes. The caller (EditorServer) is responsible for reloading.
 *   TS follows the same pattern: caller calls editor.reload() if needed.
 * - readSchemaText reads from disk (like Java's Files.readString), not from
 *   context-cached CfgFileInfo.content, so it always reflects the latest file state.
 * - TS writes via fs.writeFileSync (synchronous, matching Java's CachedFiles.writeFile).
 *
 * Java source: configgen.editorserver.SchemaWriteService.java (99 lines)
 */

import * as fs from 'fs';
import * as path from 'path';

import { CfgReader, ParseError, CfgSchemaException, CfgSchemaErrs } from '@cfgforge/schema';
import { getDefaultFileSystem } from '@cfgforge/shared';
import type { EditorService } from './EditorService.js';

// Re-import fs for readSchemaText (reads from disk, not cached content)

// ---------------------------------------------------------------------------
// Types (mirror cfgeditor API expectations)
// ---------------------------------------------------------------------------

export interface SchemaTextResult {
  text: string;
}

export interface SchemaWriteResult {
  ok: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// SchemaWriteService
// ---------------------------------------------------------------------------

export class SchemaWriteService {
  /**
   * Read the concatenated CFG text from all .cfg files in the data directory.
   * Files are sorted by pkgNameDot; root config.cfg comes first.
   *
   * Java: SchemaWriteService.readSchemaText(dataDir, cfgFiles)
   */
  static readSchemaText(editor: EditorService): SchemaTextResult {
    const cfgFiles = editor.context().sourceStructure().getCfgFiles();
    let sb = '';

    for (const c of cfgFiles) {
      try {
        // Read from disk (like Java's Files.readString), not from cached content,
        // so we always reflect the latest file state after a write.
        const content = fs.readFileSync(c.path, 'utf-8');
        if (content.length > 0) {
          if (sb.length > 0 && !content.startsWith('\n')) {
            sb += '\n';
          }
          sb += content;
        }
      } catch {
        // Failed to read — skip (Java logs and continues)
      }
    }

    return { text: sb };
  }

  /**
   * Async variant of readSchemaText.
   * Uses CfgFileSystem abstraction (Tauri/WebView compatible).
   */
  static async readSchemaTextAsync(editor: EditorService): Promise<SchemaTextResult> {
    const cfgFiles = editor.context().sourceStructure().getCfgFiles();
    let sb = '';
    const dfs = getDefaultFileSystem();

    for (const c of cfgFiles) {
      try {
        const bytes = await dfs.readFile(c.path);
        const content = Buffer.from(bytes).toString('utf-8');
        if (content.length > 0) {
          if (sb.length > 0 && !content.startsWith('\n')) {
            sb += '\n';
          }
          sb += content;
        }
      } catch {
        // Failed to read — skip
      }
    }

    return { text: sb };
  }

  /**
   * Parse, validate, and write CFG schema text to config.cfg.
   * On success, reloads the EditorService context to pick up the new schema.
   *
   * Java: SchemaWriteService.writeSchemaText(dataDir, cfgText)
   *
   * @param editor  the EditorService (provides rootDir + reload)
   * @param cfgText the full CFG schema text to write
   * @returns { ok: true } on success, { ok: false, errors: [...] } on failure
   */
  static writeSchemaText(editor: EditorService, cfgText: string): SchemaWriteResult {
    const errors: string[] = [];

    // 1. Parse CFG text (syntax check)
    let schema;
    try {
      schema = CfgReader.parse(cfgText);
    } catch (e) {
      if (e instanceof ParseError) {
        errors.push(e.message);
      } else {
        errors.push((e as Error).message);
      }
      return { ok: false, errors };
    }

    // 2. Schema semantic validation (resolve checks for duplicate names, type refs, etc.)
    try {
      const errs: CfgSchemaErrs = schema.resolve();
      errs.checkErrors('schemaWrite');
    } catch (e) {
      if (e instanceof CfgSchemaException) {
        for (const err of e.errs.errs) {
          errors.push(err.msg());
        }
      } else {
        errors.push((e as Error).message);
      }
      return { ok: false, errors };
    }

    // 3. Write to config.cfg
    const cfgPath = path.join(editor.rootDir(), 'config.cfg');
    try {
      fs.writeFileSync(cfgPath, cfgText, 'utf8');
    } catch (e) {
      errors.push(`Failed to write config.cfg: ${(e as Error).message}`);
      return { ok: false, errors };
    }

    // Note: Java does NOT reload context here — caller is responsible for
    // calling editor.reload() if it needs the context updated.
    return { ok: true, errors: [] };
  }

  /**
   * Async variant of writeSchemaText.
   * Uses CfgFileSystem abstraction (Tauri/WebView compatible).
   */
  static async writeSchemaTextAsync(editor: EditorService, cfgText: string): Promise<SchemaWriteResult> {
    const errors: string[] = [];

    // 1. Parse CFG text (syntax check)
    let schema;
    try {
      schema = CfgReader.parse(cfgText);
    } catch (e) {
      if (e instanceof ParseError) {
        errors.push(e.message);
      } else {
        errors.push((e as Error).message);
      }
      return { ok: false, errors };
    }

    // 2. Schema semantic validation
    try {
      const errs: CfgSchemaErrs = schema.resolve();
      errs.checkErrors('schemaWrite');
    } catch (e) {
      if (e instanceof CfgSchemaException) {
        for (const err of e.errs.errs) {
          errors.push(err.msg());
        }
      } else {
        errors.push((e as Error).message);
      }
      return { ok: false, errors };
    }

    // 3. Write to config.cfg
    const cfgPath = path.join(editor.rootDir(), 'config.cfg');
    try {
      await getDefaultFileSystem().writeFile(cfgPath, Buffer.from(cfgText, 'utf8'));
    } catch (e) {
      errors.push(`Failed to write config.cfg: ${(e as Error).message}`);
      return { ok: false, errors };
    }

    return { ok: true, errors: [] };
  }
}
