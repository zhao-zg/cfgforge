/**
 * UTF-8 BOM 写入器。首次写入时先写 BOM（EF BB BF）。
 * 原 Java: configgen.util.BomUtf8Writer (implements Closeable)
 */

import * as fs from 'fs';

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

export class BomUtf8Writer {
  private fd: number;
  private touched = false;

  constructor(filePath: string) {
    // Open file for writing (truncate if exists, create if not)
    this.fd = fs.openSync(filePath, 'w');
  }

  write(str: string): void {
    if (!this.touched) {
      fs.writeSync(this.fd, UTF8_BOM, 0, UTF8_BOM.length, null);
      this.touched = true;
    }
    const buf = Buffer.from(str, 'utf8');
    fs.writeSync(this.fd, buf, 0, buf.length, null);
  }

  close(): void {
    fs.closeSync(this.fd);
  }
}
