/**
 * CsName — TypeScript port of Java `configgen.gencs.Name`.
 *
 * Resolves a CFG nameable (struct/interface/table) into C# namespace, class name,
 * full name, and file path.
 *
 * Java source: configgen.gencs.Name.java (42 lines)
 */

import { underscoreToPascalCase } from '@cfggen/shared';
import type { Nameable } from '@cfggen/schema';
import { StructSchema } from '@cfggen/schema';

export class CsName {
  readonly pkg: string;
  readonly className: string;
  readonly fullName: string;
  readonly path: string;

  constructor(topPkg: string, prefix: string, nameable: Nameable) {
    let name: string;
    const nullableInterface =
      nameable instanceof StructSchema ? nameable.nullableInterface() : null;
    if (nullableInterface) {
      name = nullableInterface.name() + '.' + nameable.name();
    } else {
      name = nameable.name();
    }

    const seps = name.split('.');
    const pks: string[] = [];
    for (let i = 0; i < seps.length - 1; i++) {
      pks[i] = underscoreToPascalCase(seps[i]);
    }
    this.className = prefix + underscoreToPascalCase(seps[seps.length - 1]);

    if (pks.length === 0) {
      this.pkg = topPkg;
      this.fullName = this.className;
    } else {
      const join = pks.join('.');
      this.pkg = topPkg + '.' + join;
      this.fullName = join + '.' + this.className;
    }

    if (pks.length === 0) {
      this.path = this.className + '.cs';
    } else {
      this.path = pks.join('/') + '/' + this.className + '.cs';
    }
  }
}
