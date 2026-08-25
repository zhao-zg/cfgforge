/**
 * GoName — TypeScript port of Java `configgen.gengo.GoName`.
 *
 * Resolves a CFG nameable (struct/interface/table) into Go file name,
 * class name (CamelCase), and package name (original name).
 *
 * Go naming conventions:
 * - File names: all lowercase, underscore-separated
 * - Package names: all lowercase, no underscores or camelCase
 * - Type names: CamelCase
 * - Variable names: camelCase; exported starts uppercase, private starts lowercase
 * - Exported functions: start uppercase; package-private: lowercase
 *
 * If a struct belongs to an interface, the name is
 * `interfaceName.toLowerCase() + "." + structName`, producing both
 * file and class names with the interface prefix.
 *
 * Java source: configgen.gengo.GoName.java (44 lines)
 */

import type { Nameable } from '@cfggen/schema';
import { StructSchema } from '@cfggen/schema';
import { upper1 } from '@cfggen/shared';

export class GoName {
  /** Static modName — set from parameter "mod". */
  static modName: string | null = null;

  readonly filePath: string;
  readonly className: string;
  readonly pkgName: string;

  constructor(nameable: Nameable) {
    let name: string;
    const nullableInterface =
      nameable instanceof StructSchema ? nameable.nullableInterface() : null;
    if (nullableInterface) {
      name = nullableInterface.name().toLowerCase() + '.' + nameable.name();
    } else {
      name = nameable.name();
    }
    this.pkgName = nameable.name();

    const seps = name.split('.');

    let _filePath = '';
    let _className = '';
    for (let i = 0; i < seps.length; i++) {
      _filePath += seps[i].toLowerCase();
      if (i < seps.length - 1) _filePath += '_';

      _className += upper1(seps[i]);
    }
    this.filePath = _filePath + '.go';
    this.className = _className;
  }
}
