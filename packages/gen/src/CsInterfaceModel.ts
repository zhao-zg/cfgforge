/**
 * CsInterfaceModel — TypeScript port of Java `configgen.gencs.InterfaceModel`.
 *
 * Java source: configgen.gencs.InterfaceModel.java (28 lines)
 */

import type { Nameable, InterfaceSchema } from '@cfggen/schema';
import type { CsCodeGenerator } from './CsCodeGenerator';
import { CsName } from './CsName';

export class CsInterfaceModel {
  readonly topPkg: string;
  readonly name: CsName;
  readonly sInterface: InterfaceSchema;
  readonly unity: boolean;
  private readonly gen: CsCodeGenerator;

  constructor(gen: CsCodeGenerator, sInterface: InterfaceSchema) {
    this.gen = gen;
    this.topPkg = gen.pkg;
    this.name = new CsName(gen.pkg, gen.prefix, sInterface);
    this.sInterface = sInterface;
    this.unity = gen.unity;
  }

  fullName(nameable: Nameable): string {
    return new CsName(this.gen.pkg, this.gen.prefix, nameable).fullName;
  }

  nsLine(): string {
    return this.unity ? 'namespace ' + this.name.pkg + '\n{' : 'namespace ' + this.name.pkg + ';';
  }
}
