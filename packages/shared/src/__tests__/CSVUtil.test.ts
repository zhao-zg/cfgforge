import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readCSV, readAndNormalizeCSV, writeCSV, escapeCsv, writeCSVToFile } from '../CSVUtil';

describe('CSVUtil', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('readCSV', () => {
    it('reads simple CSV', () => {
      const filePath = path.join(tmpDir, 'test.csv');
      fs.writeFileSync(filePath, 'a,b,c\n1,2,3\n', 'utf8');
      const rows = readCSV(filePath, 'UTF-8');
      expect(rows.length).toBe(2);
      expect(rows[0]).toEqual(['a', 'b', 'c']);
      expect(rows[1]).toEqual(['1', '2', '3']);
    });

    it('reads CSV with quotes', () => {
      const filePath = path.join(tmpDir, 'test.csv');
      fs.writeFileSync(filePath, '"a,b",c\n"1""2",3\n', 'utf8');
      const rows = readCSV(filePath, 'UTF-8');
      expect(rows[0]).toEqual(['a,b', 'c']);
      expect(rows[1]).toEqual(['1"2', '3']);
    });

    it('reads CSV with custom separator', () => {
      const filePath = path.join(tmpDir, 'test.csv');
      fs.writeFileSync(filePath, 'a;b;c\n1;2;3\n', 'utf8');
      const rows = readCSV(filePath, 'UTF-8', ';');
      expect(rows[0]).toEqual(['a', 'b', 'c']);
      expect(rows[1]).toEqual(['1', '2', '3']);
    });

    it('preserves empty lines', () => {
      const filePath = path.join(tmpDir, 'test.csv');
      fs.writeFileSync(filePath, 'a,b\n\n1,2\n', 'utf8');
      const rows = readCSV(filePath, 'UTF-8');
      expect(rows.length).toBe(3);
      expect(rows[1]).toEqual(['']); // empty line -> one empty field
    });
  });

  describe('readAndNormalizeCSV', () => {
    it('pads short rows to max column count', () => {
      const filePath = path.join(tmpDir, 'test.csv');
      fs.writeFileSync(filePath, 'a,b,c\n1,2\n', 'utf8');
      const rows = readAndNormalizeCSV(filePath, 'UTF-8');
      expect(rows[0]).toEqual(['a', 'b', 'c']);
      expect(rows[1]).toEqual(['1', '2', '']); // padded with empty
    });
  });

  describe('writeCSV', () => {
    it('writes simple CSV to string builder', () => {
      const sb: string[] = [];
      writeCSV(sb, [['a', 'b', 'c'], ['1', '2', '3']]);
      const result = sb.join('');
      expect(result).toBe('a,b,c\r\n1,2,3\r\n');
    });

    it('escapes fields with commas', () => {
      const sb: string[] = [];
      writeCSV(sb, [['a,b', 'c']]);
      const result = sb.join('');
      expect(result).toBe('"a,b",c\r\n');
    });

    it('escapes fields with quotes', () => {
      const sb: string[] = [];
      writeCSV(sb, [['a"b', 'c']]);
      const result = sb.join('');
      expect(result).toBe('"a""b",c\r\n');
    });

    it('escapes fields with newlines', () => {
      const sb: string[] = [];
      writeCSV(sb, [['a\nb', 'c']]);
      const result = sb.join('');
      expect(result).toBe('"a\nb",c\r\n');
    });

    it('throws on column count mismatch', () => {
      const sb: string[] = [];
      expect(() => writeCSV(sb, [['a', 'b'], ['1', '2', '3']])).toThrow();
    });
  });

  describe('writeCSVToFile', () => {
    it('writes CSV file with BOM', () => {
      const filePath = path.join(tmpDir, 'output.csv');
      writeCSVToFile(filePath, [['a', 'b'], ['1', '2']]);
      const buf = fs.readFileSync(filePath);
      expect(buf[0]).toBe(0xef);
      expect(buf[1]).toBe(0xbb);
      expect(buf[2]).toBe(0xbf);
      const text = buf.subarray(3).toString('utf8');
      expect(text).toBe('a,b\r\n1,2\r\n');
    });
  });

  describe('escapeCsv', () => {
    it('returns empty for null/empty', () => {
      expect(escapeCsv(null as any)).toBe('');
      expect(escapeCsv('')).toBe('');
    });

    it('returns as-is for simple value', () => {
      expect(escapeCsv('abc')).toBe('abc');
    });

    it('quotes value with comma', () => {
      expect(escapeCsv('a,b')).toBe('"a,b"');
    });

    it('quotes and escapes value with quote', () => {
      expect(escapeCsv('a"b')).toBe('"a""b"');
    });

    it('quotes value with newline', () => {
      expect(escapeCsv('a\nb')).toBe('"a\nb"');
    });
  });
});
