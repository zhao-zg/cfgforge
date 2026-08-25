/**
 * ConfigOutput — TypeScript port of Java `configgen.genjava.ConfigOutput`.
 *
 * Little-endian binary writer backed by a growable Buffer.
 * Used by BytesGenerator to serialize config data to .bytes format.
 *
 * Write methods:
 * - writeBool: 1 byte (0x00 / 0x01)
 * - writeInt: 4 bytes LE
 * - writeLong: 8 bytes LE (bigint)
 * - writeFloat: 4 bytes LE IEEE 754
 * - writeString: writeInt(utf8Bytes.length) + raw bytes
 * - writeRawBytes: raw byte array
 *
 * Java source: configgen.genjava.ConfigOutput.java (89 lines)
 */

export class ConfigOutput {
  private _buffers: Buffer[] = [];
  private _totalLength = 0;

  /** Current accumulated buffer (call toBuffer() to get final result). */
  get length(): number {
    return this._totalLength;
  }

  writeBool(v: boolean): void {
    const buf = Buffer.alloc(1);
    buf.writeUInt8(v ? 1 : 0, 0);
    this._append(buf);
  }

  writeInt(v: number): void {
    const buf = Buffer.alloc(4);
    buf.writeInt32LE(v, 0);
    this._append(buf);
  }

  writeLong(v: bigint): void {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64LE(v, 0);
    this._append(buf);
  }

  writeFloat(v: number): void {
    const buf = Buffer.alloc(4);
    buf.writeFloatLE(v, 0);
    this._append(buf);
  }

  writeString(v: string): void {
    const bytes = Buffer.from(v, 'utf8');
    this.writeInt(bytes.length);
    this.writeRawBytes(bytes);
  }

  writeRawBytes(data: Buffer): void {
    this._append(data);
  }

  /** Concatenate all buffers into one and return it. */
  toBuffer(): Buffer {
    return Buffer.concat(this._buffers, this._totalLength);
  }

  private _append(buf: Buffer): void {
    this._buffers.push(buf);
    this._totalLength += buf.length;
  }
}
