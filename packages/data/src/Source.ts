/**
 * Source — TypeScript port of Java `configgen.data.Source`.
 *
 * Source is a sealed interface (discriminated union) that marks where a
 * value came from:
 *   - DCell / DCellList: from Excel or CSV (a cell at row, col)
 *   - DFile: from a JSON file (file path + field access path)
 *
 * This file defines DFile, DCellList, and the Source type alias.
 * DCell is defined separately in DCell.ts.
 */

import type { DCell } from './DCell.js';

/**
 * Union type representing the source of a value.
 * (Java sealed interface Source permits DCell, DCellList, DFile.)
 */
export type Source = DCell | DCellList | DFile;

/**
 * DCellList — a list of DCells that together form a composite source.
 * (Java record `Source.DCellList(List<DCell> cells)`.)
 */
export class DCellList {
  readonly cells: DCell[];

  constructor(cells: DCell[]) {
    this.cells = cells;
  }

  static of(): DCellList {
    return new DCellList([]);
  }

  /**
   * Factory: returns a DCell if the list has exactly one element,
   * otherwise wraps in a DCellList. Matches Java `Source.of(List<DCell>)`.
   */
  static fromCells(cells: DCell[]): Source {
    if (cells.length === 1) {
      return cells[0];
    }
    return new DCellList(cells);
  }
}

export class DFile {
  readonly fileName: string;
  readonly inStruct: string;
  readonly path: string[];

  constructor(fileName: string, inStruct: string, path: string[] = []) {
    this.fileName = fileName;
    this.inStruct = inStruct;
    this.path = path;
  }

  /**
   * Factory: creates DFile with empty path.
   * @param fileName  relative path of the JSON file
   * @param inStruct  fully-qualified struct name this file belongs to
   */
  static of(fileName: string, inStruct: string): DFile {
    return new DFile(fileName, inStruct, []);
  }

  /**
   * Returns a new DFile with a different inStruct, keeping the same path.
   * (Named `withInStruct` because `inStruct` is a readonly property.)
   */
  withInStruct(struct: string): DFile {
    return new DFile(this.fileName, struct, this.path);
  }

  /**
   * Returns a new DFile with a field appended to the path.
   */
  child(field: string): DFile {
    return new DFile(this.fileName, this.inStruct, [...this.path, field]);
  }

  /**
   * Appends impl to the last path element (or creates it if path is empty).
   * Used when resolving interface implementations: the $type value is
   * appended to the last field name to form the impl struct name.
   * e.g. path=["Logic"] + impl=".DamageModifier" → ["Logic.DamageModifier"]
   */
  lastAppend(impl: string): DFile {
    if (this.path.length === 0) {
      return this.child(impl);
    }
    const newPath = [...this.path.slice(0, -1), this.path[this.path.length - 1] + impl];
    return new DFile(this.fileName, this.inStruct, newPath);
  }

  /**
   * Returns the parent DFile (path with last element removed).
   * Returns self if path is already empty.
   */
  parent(): DFile {
    if (this.path.length === 0) {
      return this;
    }
    return new DFile(this.fileName, this.inStruct, this.path.slice(0, -1));
  }
}
