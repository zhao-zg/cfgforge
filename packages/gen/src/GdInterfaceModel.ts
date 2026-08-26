/**
 * GdInterfaceModel — TypeScript port of Java `configgen.gengd.InterfaceModel`.
 *
 * Model used by genInterface template to generate GDScript interface .gd files.
 */

import type { Nameable, InterfaceSchema } from '@cfgforge/schema';
import { GdName } from './GdName';
import type { GdCodeGenerator } from './GdCodeGenerator';

export class GdInterfaceModel {
  readonly name: GdName;
  readonly sInterface: InterfaceSchema;
  private readonly gen: GdCodeGenerator;

  constructor(gen: GdCodeGenerator, sInterface: InterfaceSchema) {
    this.gen = gen;
    this.name = new GdName(gen.prefix, sInterface);
    this.sInterface = sInterface;
  }

  fullName(nameable: Nameable): string {
    return new GdName(this.gen.prefix, nameable).className;
  }
}
