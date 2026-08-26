/**
 * GoInterfaceModel — TypeScript port of Java `configgen.gengo.InterfaceModel`.
 *
 * Java record: (pkg, name: GoName, sInterface: InterfaceSchema)
 *
 * Java source: configgen.gengo.InterfaceModel.java (8 lines)
 */

import type { InterfaceSchema } from '@cfgforge/schema';
import type { GoName } from './GoName';

export class GoInterfaceModel {
  constructor(
    readonly pkg: string,
    readonly name: GoName,
    readonly sInterface: InterfaceSchema,
  ) {}
}
