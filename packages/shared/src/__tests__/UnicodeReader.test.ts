import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readTextFile } from '../UnicodeReader';

describe('UnicodeReader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads UTF-8 with BOM', () => {
    const filePath = path.join(tmpDir, 'utf8bom.txt');
    const content = 'Hello, 世界!';
    // Write UTF-8 with BOM
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const textBuf = Buffer.from(content, 'utf8');
    fs.writeFileSync(filePath, Buffer.concat([bom, textBuf]));

    const result = readTextFile(filePath, 'UTF-8');
    expect(result).toBe(content);
  });

  it('reads UTF-8 without BOM', () => {
    const filePath = path.join(tmpDir, 'utf8.txt');
    const content = 'Hello, 世界!';
    fs.writeFileSync(filePath, content, 'utf8');

    const result = readTextFile(filePath, 'UTF-8');
    expect(result).toBe(content);
  });

  it('reads UTF-16BE with BOM', () => {
    const filePath = path.join(tmpDir, 'utf16be.txt');
    const content = 'Hello, 世界!';
    const bom = Buffer.from([0xfe, 0xff]);
    // UTF-16BE encoding
    const textBuf = Buffer.from(content, 'utf16le');
    // Swap bytes for BE
    const beBuf = Buffer.alloc(textBuf.length);
    for (let i = 0; i < textBuf.length; i += 2) {
      beBuf[i] = textBuf[i + 1];
      beBuf[i + 1] = textBuf[i];
    }
    fs.writeFileSync(filePath, Buffer.concat([bom, beBuf]));

    const result = readTextFile(filePath, 'UTF-8');
    expect(result).toBe(content);
  });

  it('reads UTF-16LE with BOM', () => {
    const filePath = path.join(tmpDir, 'utf16le.txt');
    const content = 'Hello, 世界!';
    const bom = Buffer.from([0xff, 0xfe]);
    const textBuf = Buffer.from(content, 'utf16le');
    fs.writeFileSync(filePath, Buffer.concat([bom, textBuf]));

    const result = readTextFile(filePath, 'UTF-8');
    expect(result).toBe(content);
  });

  it('reads GBK (default encoding, no BOM)', () => {
    const filePath = path.join(tmpDir, 'gbk.txt');
    // "你好" in GBK encoding
    const gbkBuf = Buffer.from([0xc4, 0xe3, 0xba, 0xc3]);
    fs.writeFileSync(filePath, gbkBuf);

    const result = readTextFile(filePath, 'GBK');
    expect(result).toBe('你好');
  });
});
