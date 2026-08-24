/**
 * Source — TypeScript port of Java `configgen.data.Source`.
 *
 * Source is a sealed interface (discriminated union) that marks where a
 * value came from:
 *   - DCell / DCellList: from Excel or CSV (a cell at row, col)
 *   - DFile: from a JSON file (file path + field access path)
 *
 * This file defines DFile. DCell and DCellList are defined separately in
 * the CellParser module (Phase 3, T3.5).
 */

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
