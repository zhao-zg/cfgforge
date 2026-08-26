/**
 * GdName — TypeScript port of Java `configgen.gengd.Name`.
 *
 * Computes className and file path for a Nameable (struct/interface/table).
 *
 * Differences from Java:
 * - Uses upper1 from @cfggen/shared instead of StringUtil.upper1
 * - String.split('.') directly (no regex escaping needed in TS)
 */

import { upper1 } from '@cfggen/shared';
import type { Nameable } from '@cfggen/schema';
import { StructSchema } from '@cfggen/schema';

export class GdName {
  readonly className: string;
  readonly path: string;

  constructor(prefix: string, nameable: Nameable) {
    let name: string;
    const nullableInterface =
      nameable instanceof StructSchema ? nameable.nullableInterface() : null;
    if (nullableInterface !== null) {
      name = nullableInterface.name().toLowerCase() + '.' + nameable.name();
    } else {
      name = nameable.name();
    }
    const seps = name.split('.');

    // Build className: prefix + Upper1(each part), underscore before last part if multi-part
    let classNameBuilder = prefix;
    for (let i = 0; i < seps.length; i++) {
      if (seps.length > 1 && i === seps.length - 1) {
        classNameBuilder += '_';
      }
      classNameBuilder += upper1(seps[i]);
    }
    this.className = classNameBuilder;

    // Build file path
    if (seps.length === 1) {
      this.path = this.className + '.gd';
    } else {
      let pathBuilder = '';
      for (let i = 0; i < seps.length - 1; i++) {
        if (i > 0) {
          pathBuilder += '/';
        }
        pathBuilder += upper1(seps[i]);
      }
      pathBuilder += '/' + this.className + '.gd';
      this.path = pathBuilder;
    }
  }
}
