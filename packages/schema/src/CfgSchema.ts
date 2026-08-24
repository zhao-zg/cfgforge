/**
 * CfgSchema — TypeScript port of Java `configgen.schema.CfgSchema`.
 *
 * Container for the entire schema. Not fully read-only — has two states:
 * 1. Initialization (items being added)
 * 2. Resolved (after CfgSchemaResolver runs, index maps populated)
 *
 * The resolve() method delegates to CfgSchemaResolver (to be implemented in T2.12-T2.17).
 */

import type { Nameable } from './Nameable';
import type { Fieldable } from './Fieldable';
import type { TableSchema } from './TableSchema';

export class CfgSchema {
  private readonly _items: Nameable[] = [];
  private readonly _isPartial: boolean;
  private _itemMap: Map<string, Nameable> | null = null;
  private _fieldableMap: Map<string, Fieldable> | null = null;
  private _tableMap: Map<string, TableSchema> | null = null;
  private _isResolved = false;
  private readonly _fileEndComments = new Map<string, string>();

  private constructor(isPartial: boolean = false) {
    this._isPartial = isPartial;
  }

  static of(): CfgSchema {
    return new CfgSchema(false);
  }

  static ofPartial(): CfgSchema {
    return new CfgSchema(true);
  }

  /**
   * Resolve the schema by running the CfgSchemaResolver.
   * Returns CfgSchemaErrs (to be implemented in T2.18).
   * For now, this is a placeholder that just builds index maps.
   */
  resolve(): unknown {
    // TODO: T2.12-T2.17 — CfgSchemaResolver.resolve(this)
    // For now, build basic index maps
    this.buildIndexMaps();
    this._isResolved = true;
    return null;
  }

  /**
   * Build index maps from items. Called by resolve() or manually.
   */
  buildIndexMaps(): void {
    const itemMap = new Map<string, Nameable>();
    const fieldableMap = new Map<string, Fieldable>();
    const tableMap = new Map<string, TableSchema>();

    for (const item of this._items) {
      itemMap.set(item.fullName(), item);
      if (isFieldable(item)) {
        fieldableMap.set(item.fullName(), item);
      }
      if (isTableSchema(item)) {
        tableMap.set(item.name(), item);
      }
    }

    this._itemMap = itemMap;
    this._fieldableMap = fieldableMap;
    this._tableMap = tableMap;
  }

  setResolved(): void {
    this._isResolved = true;
  }

  requireResolved(): void {
    if (!this._isResolved) {
      throw new Error('cfgSchema not resolved');
    }
  }

  add(item: Nameable): void {
    this._items.push(item);
  }

  items(): Nameable[] {
    return this._items;
  }

  isPartial(): boolean {
    return this._isPartial;
  }

  findFieldable(name: string): Fieldable | undefined {
    return this._fieldableMap?.get(name);
  }

  findTable(name: string): TableSchema | undefined {
    return this._tableMap?.get(name);
  }

  findItem(name: string): Nameable | undefined {
    return this._itemMap?.get(name);
  }

  /**
   * Internal: set the index maps. Used by CfgSchemaResolver.
   */
  setMaps(
    itemMap: Map<string, Nameable>,
    fieldableMap: Map<string, Fieldable>,
    tableMap: Map<string, TableSchema>,
  ): void {
    this._itemMap = itemMap;
    this._fieldableMap = fieldableMap;
    this._tableMap = tableMap;
  }

  fieldableMap(): Map<string, Fieldable> | null {
    return this._fieldableMap;
  }

  tableMap(): Map<string, TableSchema> | null {
    return this._tableMap;
  }

  sortedFieldables(): Fieldable[] {
    if (!this._fieldableMap) return [];
    const sorted = new Map([...this._fieldableMap.entries()].sort((a, b) => a[0].localeCompare(b[0])));
    return Array.from(sorted.values());
  }

  sortedTables(): TableSchema[] {
    if (!this._tableMap) return [];
    const sorted = new Map([...this._tableMap.entries()].sort((a, b) => a[0].localeCompare(b[0])));
    return Array.from(sorted.values());
  }

  getFileEndComment(pkgName: string): string {
    return this._fileEndComments.get(pkgName) ?? '';
  }

  setFileEndComment(pkgName: string, comment: string): void {
    if (comment !== null && comment.length > 0) {
      this._fileEndComments.set(pkgName, comment);
    }
  }

  fileEndComments(): Map<string, string> {
    return this._fileEndComments;
  }

  equals(other: unknown): boolean {
    if (this === other) return true;
    if (!(other instanceof CfgSchema)) return false;
    if (this._items.length !== other._items.length) return false;
    return this._items.every((item, i) => {
      const otherItem = other._items[i];
      if (item instanceof Object && otherItem instanceof Object && 'equals' in item && typeof item.equals === 'function') {
        return item.equals(otherItem);
      }
      return item === otherItem;
    });
  }

  toString(): string {
    return `CfgSchema{items=${this._items.length}}`;
  }
}

// ---------------------------------------------------------------------------
// Type guards (local, to avoid circular imports)
// ---------------------------------------------------------------------------

function isFieldable(item: Nameable): item is Fieldable {
  return typeof (item as unknown as Fieldable).fmt === 'function'
    && typeof (item as unknown as Fieldable).meta === 'function';
}

function isTableSchema(item: Nameable): item is TableSchema {
  return typeof (item as unknown as TableSchema).isJson === 'function'
    && typeof (item as unknown as TableSchema).primaryKey !== 'undefined';
}
