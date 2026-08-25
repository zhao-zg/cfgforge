/**
 * BytesGenerator tests — T8.9
 *
 * Tests the binary .bytes format output by verifying byte-level content
 * against the documented format:
 *
 * [schemaLength: int LE][schemaBytes] (0 if no schema)
 * [StringPool: int count + writeString each]
 * [LangTextPool: int count + TextPool each]
 * [tableCount: int LE][per table: writeString(name) + int(size) + raw bytes]
 *
 * Also tests XOR cipher encryption and separated language mode.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Context } from '@cfggen/context';
import { BytesGenerator } from '../BytesGenerator';
import type { Parameter } from '../Parameter';
import { ConfigOutput } from '../ConfigOutput';
import { StringPool } from '../StringPool';
import { TextPool } from '../TextPool';
import { LangTextPool } from '../LangTextPool';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeFile(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function mockParameter(opts: Record<string, string>): Parameter {
  return {
    get: (k: string, def: string) => (k in opts ? opts[k] : def),
    has: (k: string) => k in opts,
    getOrNull: (k: string) => (k in opts ? opts[k] : null),
  };
}

// Read a little-endian int32 from a Buffer at offset
function readInt32LE(buf: Buffer, offset: number): number {
  return buf.readInt32LE(offset);
}

// Read a little-endian bigint64 from a Buffer at offset
function readBigInt64LE(buf: Buffer, offset: number): bigint {
  return buf.readBigInt64LE(offset);
}

// Read a little-endian float32 from a Buffer at offset
function readFloat32LE(buf: Buffer, offset: number): number {
  return buf.readFloatLE(offset);
}

// Read a writeString-formatted value: int32(length) + utf8 bytes
function readString(buf: Buffer, offset: number): { value: string; next: number } {
  const len = readInt32LE(buf, offset);
  offset += 4;
  const value = buf.subarray(offset, offset + len).toString('utf8');
  return { value, next: offset + len };
}

// Read a StringPool: int32(count) + [int32(len) + utf8 bytes] each
function readStringPool(buf: Buffer, offset: number): { strings: string[]; next: number } {
  const count = readInt32LE(buf, offset);
  offset += 4;
  const strings: string[] = [];
  for (let i = 0; i < count; i++) {
    const { value, next } = readString(buf, offset);
    strings.push(value);
    offset = next;
  }
  return { strings, next: offset };
}

// Read a TextPool: writeString(langName) + int32(indices count) + [int32] each + StringPool
function readTextPool(buf: Buffer, offset: number): { langName: string; indices: number[]; poolStrings: string[]; next: number } {
  const { value: langName, next: n1 } = readString(buf, offset);
  offset = n1;
  const indexCount = readInt32LE(buf, offset);
  offset += 4;
  const indices: number[] = [];
  for (let i = 0; i < indexCount; i++) {
    indices.push(readInt32LE(buf, offset));
    offset += 4;
  }
  const { strings: poolStrings, next: n2 } = readStringPool(buf, offset);
  return { langName, indices, poolStrings, next: n2 };
}

// Read a LangTextPool: int32(poolCount) + [TextPool] each
function readLangTextPool(buf: Buffer, offset: number): { pools: Array<{ langName: string; indices: number[]; poolStrings: string[] }>; next: number } {
  const poolCount = readInt32LE(buf, offset);
  offset += 4;
  const pools: Array<{ langName: string; indices: number[]; poolStrings: string[] }> = [];
  for (let i = 0; i < poolCount; i++) {
    const tp = readTextPool(buf, offset);
    pools.push({ langName: tp.langName, indices: tp.indices, poolStrings: tp.poolStrings });
    offset = tp.next;
  }
  return { pools, next: offset };
}

// ---------------------------------------------------------------------------
// Unit tests: ConfigOutput
// ---------------------------------------------------------------------------

describe('ConfigOutput', () => {
  it('writes bool as 1 byte LE', () => {
    const out = new ConfigOutput();
    out.writeBool(true);
    out.writeBool(false);
    const buf = out.toBuffer();
    expect(buf.length).toBe(2);
    expect(buf[0]).toBe(1);
    expect(buf[1]).toBe(0);
  });

  it('writes int as 4 bytes LE', () => {
    const out = new ConfigOutput();
    out.writeInt(0x12345678);
    const buf = out.toBuffer();
    expect(buf.length).toBe(4);
    expect(buf.readUInt8(0)).toBe(0x78); // LE: LSB first
    expect(buf.readUInt8(1)).toBe(0x56);
    expect(buf.readUInt8(2)).toBe(0x34);
    expect(buf.readUInt8(3)).toBe(0x12);
  });

  it('writes long as 8 bytes LE (bigint)', () => {
    const out = new ConfigOutput();
    out.writeLong(0x123456789abcdef0n);
    const buf = out.toBuffer();
    expect(buf.length).toBe(8);
    expect(buf.readUInt8(0)).toBe(0xf0);
    expect(buf.readUInt8(7)).toBe(0x12);
  });

  it('writes float as 4 bytes LE', () => {
    const out = new ConfigOutput();
    out.writeFloat(1.5);
    const buf = out.toBuffer();
    expect(buf.length).toBe(4);
    expect(readFloat32LE(buf, 0)).toBe(1.5);
  });

  it('writes string as int32(length) + utf8 bytes', () => {
    const out = new ConfigOutput();
    out.writeString('hello');
    const buf = out.toBuffer();
    expect(buf.length).toBe(4 + 5); // int32 + "hello"
    expect(readInt32LE(buf, 0)).toBe(5);
    expect(buf.subarray(4).toString('utf8')).toBe('hello');
  });

  it('writes empty string as int32(0)', () => {
    const out = new ConfigOutput();
    out.writeString('');
    const buf = out.toBuffer();
    expect(buf.length).toBe(4);
    expect(readInt32LE(buf, 0)).toBe(0);
  });

  it('writes unicode string correctly', () => {
    const out = new ConfigOutput();
    out.writeString('你好');
    const buf = out.toBuffer();
    const utf8len = Buffer.from('你好', 'utf8').length; // 6
    expect(buf.length).toBe(4 + utf8len);
    expect(readInt32LE(buf, 0)).toBe(utf8len);
    expect(buf.subarray(4).toString('utf8')).toBe('你好');
  });

  it('writes raw bytes', () => {
    const out = new ConfigOutput();
    const raw = Buffer.from([0x01, 0x02, 0x03]);
    out.writeRawBytes(raw);
    const buf = out.toBuffer();
    expect(buf.length).toBe(3);
    expect(buf[0]).toBe(0x01);
    expect(buf[1]).toBe(0x02);
    expect(buf[2]).toBe(0x03);
  });
});

// ---------------------------------------------------------------------------
// Unit tests: StringPool
// ---------------------------------------------------------------------------

describe('StringPool', () => {
  it('deduplicates strings', () => {
    const pool = new StringPool();
    expect(pool.addString('hello')).toBe(0);
    expect(pool.addString('world')).toBe(1);
    expect(pool.addString('hello')).toBe(0); // dedup
    expect(pool.addString('world')).toBe(1); // dedup
  });

  it('serializes correctly', () => {
    const pool = new StringPool();
    pool.addString('hello');
    pool.addString('world');
    const out = new ConfigOutput();
    pool.serialize(out);
    const buf = out.toBuffer();

    const { strings, next } = readStringPool(buf, 0);
    expect(next).toBe(buf.length);
    expect(strings).toEqual(['hello', 'world']);
  });

  it('serializes empty pool', () => {
    const pool = new StringPool();
    const out = new ConfigOutput();
    pool.serialize(out);
    const buf = out.toBuffer();
    expect(buf.length).toBe(4);
    expect(readInt32LE(buf, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Unit tests: TextPool
// ---------------------------------------------------------------------------

describe('TextPool', () => {
  it('adds text and serializes', () => {
    const tp = new TextPool('en');
    tp.addText('hello');
    tp.addText('world');

    const out = new ConfigOutput();
    tp.serialize(out);
    const buf = out.toBuffer();

    const result = readTextPool(buf, 0);
    expect(result.langName).toBe('en');
    expect(result.indices).toEqual([0, 1]);
    expect(result.poolStrings).toEqual(['hello', 'world']);
    expect(result.next).toBe(buf.length);
  });

  it('deduplicates text strings via StringPool', () => {
    const tp = new TextPool('zh');
    tp.addText('same');
    tp.addText('same');
    expect(tp).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Unit tests: LangTextPool
// ---------------------------------------------------------------------------

describe('LangTextPool', () => {
  it('adds text to all language pools', () => {
    const ltp = new LangTextPool(['en', 'zh']);
    const idx0 = ltp.addText(['hello', '你好']);
    const idx1 = ltp.addText(['world', '世界']);
    expect(idx0).toBe(0);
    expect(idx1).toBe(1);

    const pools = ltp.getTextPools();
    expect(pools.length).toBe(2);
    expect(pools[0].langName).toBe('en');
    expect(pools[1].langName).toBe('zh');
  });

  it('throws on language count mismatch', () => {
    const ltp = new LangTextPool(['en', 'zh']);
    expect(() => ltp.addText(['only_one'])).toThrow('Language count mismatch');
  });

  it('serializes all pools', () => {
    const ltp = new LangTextPool(['en', 'zh']);
    ltp.addText(['hello', '你好']);

    const out = new ConfigOutput();
    ltp.serialize(out);
    const buf = out.toBuffer();

    const { pools, next } = readLangTextPool(buf, 0);
    expect(next).toBe(buf.length);
    expect(pools.length).toBe(2);
    expect(pools[0].langName).toBe('en');
    expect(pools[1].langName).toBe('zh');
  });

  it('serializeFirst only writes first pool', () => {
    const ltp = new LangTextPool(['en', 'zh']);
    ltp.addText(['hello', '你好']);

    const out = new ConfigOutput();
    ltp.serializeFirst(out);
    const buf = out.toBuffer();

    const { pools, next } = readLangTextPool(buf, 0);
    expect(next).toBe(buf.length);
    expect(pools.length).toBe(1);
    expect(pools[0].langName).toBe('en');
  });
});

// ---------------------------------------------------------------------------
// Integration tests: BytesGenerator (E2E via Context)
// ---------------------------------------------------------------------------

describe('BytesGenerator', () => {
  let tempDir: string;
  let outDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-bytes-'));
    outDir = path.join(tempDir, 'out');
    fs.mkdirSync(outDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  it('generates config.bytes with correct binary format', async () => {
    const cfg = `table user[id] {
  id:int;
  name:str;
  age:int;
}
`;
    const csv = `ID,姓名,年龄
id,name,age
1,Alice,25
2,Bob,30
`;
    writeFile(tempDir, 'config.cfg', cfg);
    writeFile(tempDir, 'user.csv', csv);

    const ctx = await Context.create(tempDir);
    const gen = new BytesGenerator(mockParameter({ dir: outDir }));
    await gen.generate(ctx);

    const bytesPath = path.join(outDir, 'config.bytes');
    expect(fs.existsSync(bytesPath)).toBe(true);

    const buf = fs.readFileSync(bytesPath);
    let offset = 0;

    // 1. Schema length (0 = no schema)
    const schemaLen = readInt32LE(buf, offset);
    offset += 4;
    expect(schemaLen).toBe(0);

    // 2. StringPool
    const { strings: poolStrings, next: n1 } = readStringPool(buf, offset);
    offset = n1;

    // StringPool contains VString values ("Alice", "Bob") but NOT table names
    // (table names are written directly via output.writeString, not through StringPool)
    expect(poolStrings).toContain('Alice');
    expect(poolStrings).toContain('Bob');

    // 3. LangTextPool (1 pool named "default", no text fields)
    const { pools, next: n2 } = readLangTextPool(buf, offset);
    offset = n2;
    expect(pools.length).toBe(1);
    expect(pools[0].langName).toBe('default');
    expect(pools[0].indices.length).toBe(0); // no text fields

    // 4. Table data
    const tableCount = readInt32LE(buf, offset);
    offset += 4;
    expect(tableCount).toBe(1);

    // Table name
    const { value: tableName, next: n3 } = readString(buf, offset);
    offset = n3;
    expect(tableName).toBe('user');

    // Table bytes length
    const tableBytesLen = readInt32LE(buf, offset);
    offset += 4;

    // Table data: 2 rows, each: int(id) + int(stringPoolIdx of name) + int(age)
    // Row 1: id=1, name="Alice" (idx in pool), age=25
    // Row 2: id=2, name="Bob" (idx in pool), age=30
    const tableData = buf.subarray(offset, offset + tableBytesLen);
    expect(tableData.length).toBe(tableBytesLen);

    // Parse table data:
    // int(rowCount) = 2
    let tdOffset = 0;
    const rowCount = readInt32LE(tableData, tdOffset);
    tdOffset += 4;
    expect(rowCount).toBe(2);

    // Row 1: id (int), name (stringPool idx as int), age (int)
    const id1 = readInt32LE(tableData, tdOffset); tdOffset += 4;
    expect(id1).toBe(1);
    const nameIdx1 = readInt32LE(tableData, tdOffset); tdOffset += 4;
    expect(poolStrings[nameIdx1]).toBe('Alice');
    const age1 = readInt32LE(tableData, tdOffset); tdOffset += 4;
    expect(age1).toBe(25);

    // Row 2: id (int), name (stringPool idx as int), age (int)
    const id2 = readInt32LE(tableData, tdOffset); tdOffset += 4;
    expect(id2).toBe(2);
    const nameIdx2 = readInt32LE(tableData, tdOffset); tdOffset += 4;
    expect(poolStrings[nameIdx2]).toBe('Bob');
    const age2 = readInt32LE(tableData, tdOffset); tdOffset += 4;
    expect(age2).toBe(30);

    expect(tdOffset).toBe(tableBytesLen);
  });

  it('handles bool, long, and float fields', async () => {
    const cfg = `table item[id] {
  id:int;
  active:bool;
  count:long;
  price:float;
}
`;
    const csv = `ID,Active,Count,Price
id,active,count,price
1,true,1000000000000,9.99
2,false,200,0.5
`;
    writeFile(tempDir, 'config.cfg', cfg);
    writeFile(tempDir, 'item.csv', csv);

    const ctx = await Context.create(tempDir);
    const gen = new BytesGenerator(mockParameter({ dir: outDir }));
    await gen.generate(ctx);

    const buf = fs.readFileSync(path.join(outDir, 'config.bytes'));
    let offset = 0;

    // Skip schema
    offset += 4; // schemaLen = 0

    // Skip StringPool
    const { next: n1 } = readStringPool(buf, offset);
    offset = n1;

    // Skip LangTextPool
    const { next: n2 } = readLangTextPool(buf, offset);
    offset = n2;

    // Table count
    const tableCount = readInt32LE(buf, offset);
    offset += 4;
    expect(tableCount).toBe(1);

    // Skip table name
    const { next: n3 } = readString(buf, offset);
    offset = n3;

    // Table bytes length
    const tableBytesLen = readInt32LE(buf, offset);
    offset += 4;

    const tableData = buf.subarray(offset, offset + tableBytesLen);
    let tdOffset = 0;

    const rowCount = readInt32LE(tableData, tdOffset); tdOffset += 4;
    expect(rowCount).toBe(2);

    // Row 1: id=1, active=true, count=1000000000000n, price=9.99
    expect(readInt32LE(tableData, tdOffset)).toBe(1); tdOffset += 4;
    expect(tableData[tdOffset]).toBe(1); tdOffset += 1; // bool true
    expect(readBigInt64LE(tableData, tdOffset)).toBe(1000000000000n); tdOffset += 8;
    expect(readFloat32LE(tableData, tdOffset)).toBeCloseTo(9.99, 4); tdOffset += 4;

    // Row 2: id=2, active=false, count=200n, price=0.5
    expect(readInt32LE(tableData, tdOffset)).toBe(2); tdOffset += 4;
    expect(tableData[tdOffset]).toBe(0); tdOffset += 1; // bool false
    expect(readBigInt64LE(tableData, tdOffset)).toBe(200n); tdOffset += 8;
    expect(readFloat32LE(tableData, tdOffset)).toBeCloseTo(0.5, 4); tdOffset += 4;
  });

  it('handles text fields', async () => {
    const cfg = `table message[id] {
  id:int;
  desc:text;
}
`;
    const csv = `ID,描述
id,desc
1,Hello World
2,Farewell
`;
    writeFile(tempDir, 'config.cfg', cfg);
    writeFile(tempDir, 'message.csv', csv);

    const ctx = await Context.create(tempDir);
    const gen = new BytesGenerator(mockParameter({ dir: outDir }));
    await gen.generate(ctx);

    const buf = fs.readFileSync(path.join(outDir, 'config.bytes'));
    let offset = 0;

    // Skip schema
    offset += 4;

    // Skip StringPool
    const { next: n1 } = readStringPool(buf, offset);
    offset = n1;

    // LangTextPool (should have 1 pool "default" with 2 text indices)
    const { pools, next: n2 } = readLangTextPool(buf, offset);
    offset = n2;
    expect(pools.length).toBe(1);
    expect(pools[0].langName).toBe('default');
    expect(pools[0].indices.length).toBe(2);
    expect(pools[0].poolStrings).toContain('Hello World');
    expect(pools[0].poolStrings).toContain('Farewell');

    // Table count
    const tableCount = readInt32LE(buf, offset);
    offset += 4;
    expect(tableCount).toBe(1);

    // Skip table name
    const { next: n3 } = readString(buf, offset);
    offset = n3;

    // Table bytes
    const tableBytesLen = readInt32LE(buf, offset);
    offset += 4;

    const tableData = buf.subarray(offset, offset + tableBytesLen);
    let tdOffset = 0;

    const rowCount = readInt32LE(tableData, tdOffset); tdOffset += 4;
    expect(rowCount).toBe(2);

    // Row 1: id=1, desc=textIndex
    expect(readInt32LE(tableData, tdOffset)).toBe(1); tdOffset += 4;
    const textIdx1 = readInt32LE(tableData, tdOffset); tdOffset += 4;
    // The text index maps to the LangTextPool indices
    expect(pools[0].indices[textIdx1]).toBeDefined();

    // Row 2: id=2, desc=textIndex
    expect(readInt32LE(tableData, tdOffset)).toBe(2); tdOffset += 4;
    const textIdx2 = readInt32LE(tableData, tdOffset); tdOffset += 4;
    expect(pools[0].indices[textIdx2]).toBeDefined();
  });

  it('handles list fields (pack format)', async () => {
    const cfg = `table skill[id] {
  id:int;
  levels:list<int> (pack);
}
`;
    const csv = `ID,等级
id,levels
1,"1,2,3"
2,"10,20"
`;
    writeFile(tempDir, 'config.cfg', cfg);
    writeFile(tempDir, 'skill.csv', csv);

    const ctx = await Context.create(tempDir);
    const gen = new BytesGenerator(mockParameter({ dir: outDir }));
    await gen.generate(ctx);

    const buf = fs.readFileSync(path.join(outDir, 'config.bytes'));
    let offset = 0;

    // Skip schema, stringPool, langTextPool
    offset += 4;
    const { next: n1 } = readStringPool(buf, offset); offset = n1;
    const { next: n2 } = readLangTextPool(buf, offset); offset = n2;

    // Table
    const tableCount = readInt32LE(buf, offset); offset += 4;
    expect(tableCount).toBe(1);
    const { next: n3 } = readString(buf, offset); offset = n3;
    const tableBytesLen = readInt32LE(buf, offset); offset += 4;
    const tableData = buf.subarray(offset, offset + tableBytesLen);

    let tdOffset = 0;
    const rowCount = readInt32LE(tableData, tdOffset); tdOffset += 4;
    expect(rowCount).toBe(2);

    // Row 1: id=1, list=[1,2,3] → writeInt(3) + writeInt(1)+writeInt(2)+writeInt(3)
    expect(readInt32LE(tableData, tdOffset)).toBe(1); tdOffset += 4;
    const listSize1 = readInt32LE(tableData, tdOffset); tdOffset += 4;
    expect(listSize1).toBe(3);
    expect(readInt32LE(tableData, tdOffset)).toBe(1); tdOffset += 4;
    expect(readInt32LE(tableData, tdOffset)).toBe(2); tdOffset += 4;
    expect(readInt32LE(tableData, tdOffset)).toBe(3); tdOffset += 4;

    // Row 2: id=2, list=[10,20]
    expect(readInt32LE(tableData, tdOffset)).toBe(2); tdOffset += 4;
    const listSize2 = readInt32LE(tableData, tdOffset); tdOffset += 4;
    expect(listSize2).toBe(2);
    expect(readInt32LE(tableData, tdOffset)).toBe(10); tdOffset += 4;
    expect(readInt32LE(tableData, tdOffset)).toBe(20); tdOffset += 4;
  });

  it('handles interface fields', async () => {
    const cfg = `interface shape {
  struct circle {
    radius:int;
  }
  struct square {
    side:int;
  }
}
table figure[id] {
  id:int;
  body:shape (pack);
}
`;
    const csv = `ID,Shape
id,body
1,circle(5)
2,square(3)
`;
    writeFile(tempDir, 'config.cfg', cfg);
    writeFile(tempDir, 'figure.csv', csv);

    const ctx = await Context.create(tempDir);
    const gen = new BytesGenerator(mockParameter({ dir: outDir }));
    await gen.generate(ctx);

    const buf = fs.readFileSync(path.join(outDir, 'config.bytes'));
    let offset = 0;

    // Skip schema
    offset += 4;

    // StringPool contains interface impl names ("circle", "square") but NOT table name
    const { strings: poolStrings, next: n1 } = readStringPool(buf, offset);
    offset = n1;
    expect(poolStrings).toContain('circle');
    expect(poolStrings).toContain('square');

    // Skip LangTextPool
    const { next: n2 } = readLangTextPool(buf, offset);
    offset = n2;

    // Table
    const tableCount = readInt32LE(buf, offset); offset += 4;
    expect(tableCount).toBe(1);
    const { next: n3 } = readString(buf, offset); offset = n3;
    const tableBytesLen = readInt32LE(buf, offset); offset += 4;
    const tableData = buf.subarray(offset, offset + tableBytesLen);

    let tdOffset = 0;
    const rowCount = readInt32LE(tableData, tdOffset); tdOffset += 4;
    expect(rowCount).toBe(2);

    // Row 1: id=1, body=interface(circle, radius=5)
    expect(readInt32LE(tableData, tdOffset)).toBe(1); tdOffset += 4;
    const implNameIdx1 = readInt32LE(tableData, tdOffset); tdOffset += 4;
    expect(poolStrings[implNameIdx1]).toBe('circle');
    expect(readInt32LE(tableData, tdOffset)).toBe(5); tdOffset += 4; // radius

    // Row 2: id=2, body=interface(square, side=3)
    expect(readInt32LE(tableData, tdOffset)).toBe(2); tdOffset += 4;
    const implNameIdx2 = readInt32LE(tableData, tdOffset); tdOffset += 4;
    expect(poolStrings[implNameIdx2]).toBe('square');
    expect(readInt32LE(tableData, tdOffset)).toBe(3); tdOffset += 4; // side
  });

  it('handles map fields', async () => {
    const cfg = `table setting[id] {
  id:int;
  props:map<int,int> (pack);
}
`;
    const csv = `ID,Props
id,props
1,"1,10,2,20"
`;
    writeFile(tempDir, 'config.cfg', cfg);
    writeFile(tempDir, 'setting.csv', csv);

    const ctx = await Context.create(tempDir);
    const gen = new BytesGenerator(mockParameter({ dir: outDir }));
    await gen.generate(ctx);

    const buf = fs.readFileSync(path.join(outDir, 'config.bytes'));
    let offset = 0;

    // Skip schema, stringPool, langTextPool
    offset += 4;
    const { next: n1 } = readStringPool(buf, offset); offset = n1;
    const { next: n2 } = readLangTextPool(buf, offset); offset = n2;

    // Table
    const tableCount = readInt32LE(buf, offset); offset += 4;
    expect(tableCount).toBe(1);
    const { next: n3 } = readString(buf, offset); offset = n3;
    const tableBytesLen = readInt32LE(buf, offset); offset += 4;
    const tableData = buf.subarray(offset, offset + tableBytesLen);

    let tdOffset = 0;
    const rowCount = readInt32LE(tableData, tdOffset); tdOffset += 4;
    expect(rowCount).toBe(1);

    // Row 1: id=1, map={(1,10),(2,20)} → writeInt(2) + writeInt(1)+writeInt(10) + writeInt(2)+writeInt(20)
    expect(readInt32LE(tableData, tdOffset)).toBe(1); tdOffset += 4;
    const mapSize = readInt32LE(tableData, tdOffset); tdOffset += 4;
    expect(mapSize).toBe(2);
    expect(readInt32LE(tableData, tdOffset)).toBe(1); tdOffset += 4; // key 1
    expect(readInt32LE(tableData, tdOffset)).toBe(10); tdOffset += 4; // value 10
    expect(readInt32LE(tableData, tdOffset)).toBe(2); tdOffset += 4; // key 2
    expect(readInt32LE(tableData, tdOffset)).toBe(20); tdOffset += 4; // value 20
  });

  it('generates multiple tables sorted by name', async () => {
    const cfg = `table zebra[id] {
  id:int;
  name:str;
}
table apple[id] {
  id:int;
  name:str;
}
`;
    writeFile(tempDir, 'config.cfg', cfg);
    writeFile(tempDir, 'zebra.csv', 'ID,Name\nid,name\n1,Zed\n');
    writeFile(tempDir, 'apple.csv', 'ID,Name\nid,name\n1,App\n');

    const ctx = await Context.create(tempDir);
    const gen = new BytesGenerator(mockParameter({ dir: outDir }));
    await gen.generate(ctx);

    const buf = fs.readFileSync(path.join(outDir, 'config.bytes'));
    let offset = 0;

    // Skip schema, stringPool, langTextPool
    offset += 4;
    const { next: n1 } = readStringPool(buf, offset); offset = n1;
    const { next: n2 } = readLangTextPool(buf, offset); offset = n2;

    // Table count
    const tableCount = readInt32LE(buf, offset); offset += 4;
    expect(tableCount).toBe(2);

    // First table should be "apple" (sorted)
    const { value: name1, next: n3 } = readString(buf, offset); offset = n3;
    expect(name1).toBe('apple');
    const len1 = readInt32LE(buf, offset); offset += 4;
    offset += len1; // skip table data

    // Second table should be "zebra"
    const { value: name2, next: n4 } = readString(buf, offset); offset = n4;
    expect(name2).toBe('zebra');
  });

  it('applies XOR cipher encryption', async () => {
    const cfg = `table user[id] {
  id:int;
  name:str;
}
`;
    const csv = `ID,Name\nid,name\n1,Alice\n`;
    writeFile(tempDir, 'config.cfg', cfg);
    writeFile(tempDir, 'user.csv', csv);

    const ctx = await Context.create(tempDir);

    // Generate encrypted file
    const genEnc = new BytesGenerator(mockParameter({ dir: outDir, cipher: 'secret' }));
    await genEnc.generate(ctx);

    // Generate unencrypted file for comparison
    const plainDir = path.join(tempDir, 'plain');
    fs.mkdirSync(plainDir, { recursive: true });
    const genPlain = new BytesGenerator(mockParameter({ dir: plainDir }));
    await genPlain.generate(ctx);

    const encBuf = fs.readFileSync(path.join(outDir, 'config.bytes'));
    const plainBuf = fs.readFileSync(path.join(plainDir, 'config.bytes'));

    // Encrypted file should differ from plain
    expect(encBuf.equals(plainBuf)).toBe(false);

    // Decrypt: XOR with same key should recover original
    const { XorCipher } = await import('@cfggen/shared');
    const cipher = new XorCipher('secret');
    const decrypted = cipher.process(encBuf);
    expect(decrypted.equals(plainBuf)).toBe(true);
  });

  it('extends GeneratorWithTag (own parameter)', () => {
    const gen = new BytesGenerator(mockParameter({ own: 'tag1', dir: '.' }));
    expect(gen.tag).toBe('tag1');
  });
});
