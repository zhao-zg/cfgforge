import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BomUtf8Writer } from '../BomUtf8Writer';

describe('BomUtf8Writer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes UTF-8 BOM at start', () => {
    const filePath = path.join(tmpDir, 'output.txt');
    const writer = new BomUtf8Writer(filePath);
    writer.write('Hello');
    writer.close();

    const buf = fs.readFileSync(filePath);
    // First 3 bytes should be EF BB BF
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);
  });

  it('writes content after BOM', () => {
    const filePath = path.join(tmpDir, 'output.txt');
    const writer = new BomUtf8Writer(filePath);
    writer.write('Hello, 世界!');
    writer.close();

    const buf = fs.readFileSync(filePath);
    // Skip BOM, rest should be UTF-8 text
    const text = buf.subarray(3).toString('utf8');
    expect(text).toBe('Hello, 世界!');
  });

  it('only writes BOM once on first write', () => {
    const filePath = path.join(tmpDir, 'output.txt');
    const writer = new BomUtf8Writer(filePath);
    writer.write('A');
    writer.write('B');
    writer.write('C');
    writer.close();

    const buf = fs.readFileSync(filePath);
    // Should be: BOM + ABC
    expect(buf.length).toBe(6); // 3 (BOM) + 3 (ABC)
    expect(buf.subarray(3).toString('utf8')).toBe('ABC');
  });

  it('writes to existing file without duplicating BOM', () => {
    const filePath = path.join(tmpDir, 'output.txt');
    const writer1 = new BomUtf8Writer(filePath);
    writer1.write('Test');
    writer1.close();

    // Reopen and write more
    const writer2 = new BomUtf8Writer(filePath);
    writer2.write('Overwrite');
    writer2.close();

    const buf = fs.readFileSync(filePath);
    // Should only have one BOM
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);
    expect(buf.subarray(3).toString('utf8')).toBe('Overwrite');
  });
});
