import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  readCSVAsync,
  readAndNormalizeCSVAsync,
  writeCSVToFileAsync,
  escapeCsv,
} from '../CSVUtil';
import { setDefaultFileSystem } from '../CfgFileSystem';
import { NodeFileSystem } from '../NodeFileSystem';

describe('CSVUtil async (T12.0b)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-test-'));
    setDefaultFileSystem(new NodeFileSystem());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('readCSVAsync', () => {
    it('reads simple CSV', async () => {
      const filePath = path.join(tmpDir, 'test.csv');
      fs.writeFileSync(filePath, 'a,b,c\n1,2,3\n', 'utf8');
      const rows = await readCSVAsync(filePath, 'UTF-8');
      expect(rows.length).toBe(2);
      expect(rows[0]).toEqual(['a', 'b', 'c']);
      expect(rows[1]).toEqual(['1', '2', '3']);
    });

    it('reads CSV with quotes', async () => {
      const filePath = path.join(tmpDir, 'test.csv');
      fs.writeFileSync(filePath, '"a,b",c\n"1""2",3\n', 'utf8');
      const rows = await readCSVAsync(filePath, 'UTF-8');
      expect(rows[0]).toEqual(['a,b', 'c']);
      expect(rows[1]).toEqual(['1"2', '3']);
    });

    it('reads CSV with custom separator', async () => {
      const filePath = path.join(tmpDir, 'test.csv');
      fs.writeFileSync(filePath, 'a;b;c\n1;2;3\n', 'utf8');
      const rows = await readCSVAsync(filePath, 'UTF-8', ';');
      expect(rows[0]).toEqual(['a', 'b', 'c']);
      expect(rows[1]).toEqual(['1', '2', '3']);
    });
  });

  describe('readAndNormalizeCSVAsync', () => {
    it('pads short rows to max column count', async () => {
      const filePath = path.join(tmpDir, 'test.csv');
      fs.writeFileSync(filePath, 'a,b,c\n1,2\n', 'utf8');
      const rows = await readAndNormalizeCSVAsync(filePath, 'UTF-8');
      expect(rows[0]).toEqual(['a', 'b', 'c']);
      expect(rows[1]).toEqual(['1', '2', '']);
    });
  });

  describe('writeCSVToFileAsync', () => {
    it('writes CSV file with BOM', async () => {
      const filePath = path.join(tmpDir, 'output.csv');
      await writeCSVToFileAsync(filePath, [['a', 'b'], ['1', '2']]);
      const buf = fs.readFileSync(filePath);
      expect(buf[0]).toBe(0xef);
      expect(buf[1]).toBe(0xbb);
      expect(buf[2]).toBe(0xbf);
      const text = buf.subarray(3).toString('utf8');
      expect(text).toBe('a,b\r\n1,2\r\n');
    });

    it('creates parent directories automatically', async () => {
      const filePath = path.join(tmpDir, 'sub', 'deep', 'output.csv');
      await writeCSVToFileAsync(filePath, [['a', 'b']]);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  it('escapeCsv still works (sync helper)', () => {
    expect(escapeCsv('a,b')).toBe('"a,b"');
    expect(escapeCsv('abc')).toBe('abc');
    expect(escapeCsv(null as any)).toBe('');
  });
});