/**
 * 通用 Unicode 文本读取器，通过 BOM 检测编码并跳过 BOM。
 * 原 Java: configgen.util.UnicodeReader (extends Reader)
 *
 * Node.js 版：用 Buffer 预读 4 字节检测 BOM，返回解码后的字符串。
 */

import * as fs from 'fs';

const BOM_SIZE = 4;

export interface ReadResult {
  encoding: string;
  text: string;
}

function detectEncoding(bom: Buffer, n: number): { encoding: string | null; skipBytes: number } {
  if (n > 3 && bom[0] === 0x00 && bom[1] === 0x00 && bom[2] === 0xfe && bom[3] === 0xff) {
    return { encoding: 'UTF-32BE', skipBytes: 4 };
  }
  if (n > 3 && bom[0] === 0xff && bom[1] === 0xfe && bom[2] === 0x00 && bom[3] === 0x00) {
    return { encoding: 'UTF-32LE', skipBytes: 4 };
  }
  if (n > 2 && bom[0] === 0xef && bom[1] === 0xbb && bom[2] === 0xbf) {
    return { encoding: 'utf-8', skipBytes: 3 };
  }
  if (n > 1 && bom[0] === 0xfe && bom[1] === 0xff) {
    return { encoding: 'utf-16be', skipBytes: 2 };
  }
  if (n > 1 && bom[0] === 0xff && bom[1] === 0xfe) {
    return { encoding: 'utf-16le', skipBytes: 2 };
  }
  return { encoding: null, skipBytes: 0 };
}

/**
 * 读取文件并自动检测 BOM 编码。
 * @param filePath 文件路径
 * @param defaultEnc 无 BOM 时使用的默认编码（如 'GBK'）
 * @returns 解码后的文本内容
 */
export function readTextFile(filePath: string, defaultEnc: string): string {
  const buf = fs.readFileSync(filePath);

  // Read ahead up to 4 bytes for BOM detection
  const n = Math.min(buf.length, BOM_SIZE);
  const bom = Buffer.alloc(BOM_SIZE);
  buf.copy(bom, 0, 0, n);

  const { encoding, skipBytes } = detectEncoding(bom, n);
  const actualEncoding = encoding ?? defaultEnc;
  const dataBuf = buf.subarray(skipBytes);

  // Node.js TextDecoder supports utf-8, utf-16le, utf-16be (via label), gbk etc.
  // For utf-16be, TextDecoder doesn't directly support 'utf-16be' label in all Node versions,
  // but supports 'utf-16le' and 'utf-16be' since Node 14+
  const decoder = new TextDecoder(actualEncoding as BufferEncoding);
  return decoder.decode(dataBuf);
}

/**
 * 从 Buffer 读取并检测 BOM，返回解码后的文本。
 * @param buf 包含文本数据的 Buffer
 * @param defaultEnc 无 BOM 时使用的默认编码
 * @returns 解码后的文本内容
 */
export function readFromBuffer(buf: Buffer, defaultEnc: string): string {
  const n = Math.min(buf.length, BOM_SIZE);
  const bom = buf.subarray(0, n);
  const { encoding, skipBytes } = detectEncoding(bom, n);
  const actualEncoding = encoding ?? defaultEnc;
  const dataBuf = buf.subarray(skipBytes);
  const decoder = new TextDecoder(actualEncoding as BufferEncoding);
  return decoder.decode(dataBuf);
}
