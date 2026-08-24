/**
 * DField — TypeScript port of Java `configgen.data.CfgData.DField`.
 *
 * Header field metadata parsed by HeadParser from the name row and comment row.
 */

export class DField {
  readonly name: string;
  readonly comment: string;
  readonly suggestedType: string;

  constructor(name: string, comment: string, suggestedType: string) {
    this.name = name;
    this.comment = comment;
    this.suggestedType = suggestedType;
  }
}
