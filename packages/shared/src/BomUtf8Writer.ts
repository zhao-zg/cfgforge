/**
 * UTF-8 BOM 写入器。首次写入时先写 BOM（EF BB BF）。
 * 原 Java: configgen.util.BomUtf8Writer (implements Closeable)
 *
 * T12.0b: 新增 writeTextFileWithBomAsync（异步版，走 CfgFileSystem 抽象）。
 * 同步 BomUtf8Writer 保留（仍基于 Node fs，供 CLI 同步路径使用）。
 */

import * as fs from 'fs';
import { getDefaultFileSystem } from './CfgFileSystem';

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

/**
 * 异步写入 UTF-8 BOM 文本文件（Tauri/WebView 环境可用）。
 * 底层走 CfgFileSystem 抽象：先拼 BOM + UTF-8 字节，再一次性写入。
 * @param filePath 文件路径
 * @param text 文本内容
 */
export async function writeTextFileWithBomAsync(filePath: string, text: string): Promise<void> {
  const body = new TextEncoder().encode(text);
  const out = new Uint8Array(UTF8_BOM.length + body.length);
  out.set(UTF8_BOM, 0);
  out.set(body, UTF8_BOM.length);
  await getDefaultFileSystem().writeFile(filePath, out);
}