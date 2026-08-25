/**
 * TextPool — TypeScript port of Java `configgen.genbytes.TextPool`.
 *
 * Per-language text array: holds a list of string-pool indices and its own
 * StringPool. Each addText call appends the text to the pool and records
 * the index.
 *
 * serialize(out): writeString(langName) + writeInt(indices.length)
 *   + writeInt(each index) + StringPool.serialize(out)
 *
 * Java source: configgen.genbytes.TextPool.java (48 lines)
 */

import { ConfigOutput } from './ConfigOutput';
import { StringPool } from './StringPool';

export class TextPool {
  private readonly _langName: string;
  private readonly _indices: number[] = [];
  private readonly _pool: StringPool;

  constructor(langName: string) {
    this._langName = langName;
    this._pool = new StringPool();
  }

  get langName(): string {
    return this._langName;
  }

  addText(text: string): void {
    const idx = this._pool.addString(text);
    this._indices.push(idx);
  }

  serialize(out: ConfigOutput): void {
    out.writeString(this._langName);
    out.writeInt(this._indices.length);
    for (const index of this._indices) {
      out.writeInt(index);
    }
    this._pool.serialize(out);
  }
}
