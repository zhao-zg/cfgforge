import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readTextFileAsync, readFromBuffer } from '../UnicodeReader';
import { writeTextFileWithBomAsync } from '../BomUtf8Writer';
import { readMarkdownAsync } from '../MarkdownReader';
import { XorCipher } from '../XorCipher';
import { setDefaultFileSystem } from '../CfgFileSystem';
import { NodeFileSystem } from '../NodeFileSystem';

describe('async file utils (T12.0b)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-test-'));
    setDefaultFileSystem(new NodeFileSystem());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('readTextFileAsync', () => {
    it('reads UTF-8 with BOM', async () => {
      const filePath = path.join(tmpDir, 'utf8bom.txt');
      const content = 'Hello, 世界!';
      const bom = Buffer.from([0xef, 0xbb, 0xbf]);
      fs.writeFileSync(filePath, Buffer.concat([bom, Buffer.from(content, 'utf8')]));

      expect(await readTextFileAsync(filePath, 'UTF-8')).toBe(content);
    });

    it('reads UTF-8 without BOM', async () => {
      const filePath = path.join(tmpDir, 'utf8.txt');
      fs.writeFileSync(filePath, 'Hello, 世界!', 'utf8');
      expect(await readTextFileAsync(filePath, 'UTF-8')).toBe('Hello, 世界!');
    });
  });

  describe('writeTextFileWithBomAsync', () => {
    it('writes UTF-8 BOM at start', async () => {
      const filePath = path.join(tmpDir, 'output.txt');
      await writeTextFileWithBomAsync(filePath, 'Hello');
      const buf = fs.readFileSync(filePath);
      expect(buf[0]).toBe(0xef);
      expect(buf[1]).toBe(0xbb);
      expect(buf[2]).toBe(0xbf);
      expect(buf.subarray(3).toString('utf8')).toBe('Hello');
    });

    it('creates parent directories automatically', async () => {
      const filePath = path.join(tmpDir, 'sub', 'deep', 'output.txt');
      await writeTextFileWithBomAsync(filePath, 'x');
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('readMarkdownAsync', () => {
    it('reads file with frontmatter', async () => {
      const filePath = path.join(tmpDir, 'test.md');
      fs.writeFileSync(filePath, '---\ntitle: My Document\n---\n\n# Hello', 'utf8');
      const doc = await readMarkdownAsync(filePath, 'UTF-8');
      expect(doc.frontmatter.get('title')).toBe('My Document');
      expect(doc.content).toContain('# Hello');
    });
  });

  describe('XorCipher.processToFileAsync', () => {
    it('writes encrypted bytes to file', async () => {
      const cipher = new XorCipher('secret');
      const filePath = path.join(tmpDir, 'enc.bin');
      await cipher.processToFileAsync(Buffer.from('hello', 'utf8'), filePath);
      expect(fs.existsSync(filePath)).toBe(true);
      const encrypted = fs.readFileSync(filePath);
      expect(encrypted.equals(Buffer.from('hello', 'utf8'))).toBe(false);
    });
  });

  it('readFromBuffer works with plain Uint8Array', () => {
    const buf = new Uint8Array([0xef, 0xbb, 0xbf, 0x41]); // BOM + 'A'
    expect(readFromBuffer(buf, 'UTF-8')).toBe('A');
  });
});