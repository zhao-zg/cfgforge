/**
 * JavaTextModel — TypeScript port of Java `TextModel.java`.
 *
 * Model for Text.jte template.
 */

import { lower1 } from '@cfgforge/shared';

export class JavaTextModel {
  readonly pkg: string;
  readonly languages: string[];

  constructor(pkg: string, languages: string[]) {
    this.pkg = pkg;
    this.languages = languages.map(lower1);
  }

  join(): string {
    return this.languages.join(' + "," + ');
  }
}
