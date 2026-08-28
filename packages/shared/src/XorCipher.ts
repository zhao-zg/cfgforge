/**
 * XOR 加密流。用密钥循环异或每个字节。
 * 原 Java: configgen.util.XorCipherOutputStream
 *
 * 对称加密：同一密钥加密/解密（XOR 自反性）。
 * 注意：加密和解密必须各自从密钥起始位置开始（index=0）。
 *
 * T12.0b: 新增 processToFileAsync（异步版，走 CfgFileSystem 抽象）。
 */

import * as fs from 'fs';
import { getDefaultFileSystem } from './CfgFileSystem.js';

export class XorCipher {
  private cipherBytes: Uint8Array;
  private index = 0;

  constructor(cipher: string) {
    if (!cipher || cipher.length === 0) {
      throw new Error('Cipher cannot be null or empty');
    }
    this.cipherBytes = new TextEncoder().encode(cipher);
  }

  process(data: Uint8Array): Uint8Array {
    const result = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      result[i] = data[i] ^ this.cipherBytes[this.index % this.cipherBytes.length];
      this.index++;
      if (this.index === this.cipherBytes.length) {
        this.index = 0;
      }
    }
    return result;
  }

  processToFile(data: Uint8Array, filePath: string): void {
    const encrypted = this.process(data);
    fs.writeFileSync(filePath, encrypted);
  }

  /**
   * 异步加密并写入文件（Tauri/WebView 环境可用），走 CfgFileSystem 抽象。
   */
  async processToFileAsync(data: Uint8Array, filePath: string): Promise<void> {
    const encrypted = this.process(data);
    await getDefaultFileSystem().writeFile(filePath, encrypted);
  }
}