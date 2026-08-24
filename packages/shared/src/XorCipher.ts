/**
 * XOR 加密流。用密钥循环异或每个字节。
 * 原 Java: configgen.util.XorCipherOutputStream
 *
 * 对称加密：同一密钥加密/解密（XOR 自反性）。
 * 注意：加密和解密必须各自从密钥起始位置开始（index=0）。
 */

import * as fs from 'fs';

export class XorCipher {
  private cipherBytes: Buffer;
  private index = 0;

  constructor(cipher: string) {
    if (!cipher || cipher.length === 0) {
      throw new Error('Cipher cannot be null or empty');
    }
    this.cipherBytes = Buffer.from(cipher, 'utf8');
  }

  process(data: Buffer): Buffer {
    const result = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) {
      result[i] = data[i] ^ this.cipherBytes[this.index % this.cipherBytes.length];
      this.index++;
      if (this.index === this.cipherBytes.length) {
        this.index = 0;
      }
    }
    return result;
  }

  processToFile(data: Buffer, filePath: string): void {
    const encrypted = this.process(data);
    fs.writeFileSync(filePath, encrypted);
  }
}
