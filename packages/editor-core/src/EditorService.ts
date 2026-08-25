/**
 * EditorService — TypeScript port of Java `configgen.editorserver.EditorServer`
 * (the core service part; HTTP layer is removed).
 *
 * Holds a Context instance (cached by dataDir) and provides access to the
 * current CfgValue snapshot. All write operations go through the services in
 * this package; after a successful write, the CfgValue is rebuilt.
 *
 * Key differences from Java:
 * - HTTP REST layer removed: EditorService is constructed with a dataDir and
 *   exposes direct method calls.
 * - Context is cached by dataDir (Map<dataDir, Context>) to avoid re-reading.
 * - Java uses a volatile State (context + cfgValue + graph) rebuilt inside a
 *   synchronized block. TS is single-threaded; we keep a simpler context +
 *   cfgValue snapshot and rebuild on reload().
 *
 * Java source: configgen.editorserver.EditorServer.java (533 lines)
 */

import * as path from 'path';

import { Context } from '@cfggen/context';
import type { CfgValue } from '@cfggen/value';
import { TableSchemaRefGraph } from '@cfggen/schema';
import type { TableSchemaRefGraph as TableSchemaRefGraphType } from '@cfggen/schema';

// ---------------------------------------------------------------------------
// Context cache (by absolute dataDir)
// ---------------------------------------------------------------------------

const contextCache = new Map<string, Context>();

function resolveDataDir(dataDir: string): string {
  return path.resolve(dataDir);
}

// ---------------------------------------------------------------------------
// EditorService
// ---------------------------------------------------------------------------

export class EditorService {
  private readonly _dataDir: string;
  private _context!: Context;
  private _cfgValue!: CfgValue;
  private _graph!: TableSchemaRefGraphType;

  private constructor(dataDir: string, context: Context) {
    this._dataDir = dataDir;
    this.initFromContext(context);
  }

  /**
   * Create an EditorService for the given dataDir. Context is cached by
   * dataDir (avoiding repeated reads).
   */
  static async create(dataDir: string): Promise<EditorService> {
    const resolved = resolveDataDir(dataDir);
    let ctx = contextCache.get(resolved);
    if (!ctx) {
      ctx = await Context.create(resolved);
      contextCache.set(resolved, ctx);
    }
    return new EditorService(resolved, ctx);
  }

  /**
   * Rebuild the context + cfgValue snapshot from a fresh Context.
   * Called after schema/data changes to pick up the new state.
   */
  private initFromContext(newContext: Context): void {
    this._context = newContext;
    // Use allowErr=true like the Java server: partial schemas produce
    // values with errors, and edit operations will report serverNotEditable.
    this._cfgValue = newContext.makeValueWithTagAndAllowErr(null, true);
    this._graph = new TableSchemaRefGraph(this._cfgValue.schema);
  }

  /**
   * Reload the dataDir (fresh Context from disk) and rebuild the snapshot.
   * Also updates the context cache so subsequent creates get the new state.
   */
  async reload(): Promise<void> {
    const fresh = await Context.create(this._dataDir);
    contextCache.set(this._dataDir, fresh);
    this.initFromContext(fresh);
  }

  // -------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------

  dataDir(): string {
    return this._dataDir;
  }

  context(): Context {
    return this._context;
  }

  cfgValue(): CfgValue {
    return this._cfgValue;
  }

  graph(): TableSchemaRefGraphType {
    return this._graph;
  }

  rootDir(): string {
    return this._context.rootDir();
  }

  /**
   * After a write operation that produced a new CfgValue (from write package
   * services which already updated the Context), adopt the new value.
   */
  adoptNewCfgValue(newCfgValue: CfgValue): void {
    this._cfgValue = newCfgValue;
    this._graph = new TableSchemaRefGraph(newCfgValue.schema);
  }
}