/**
 * ExcelReader Tauri buffer 路径测试 — Task 3
 *
 * 验证 readExcel() 在 Tauri WebView 环境（isSyncSupported=false）下
 * 走 buffer 路径（wb.xlsx.load(buffer)）的正确性。
 *
 * 策略：
 * - 创建精简 mock CfgFileSystem（isSyncSupported=false）
 * - readFile 从真实 xlsx 文件读取字节返回 Uint8Array（模拟 Tauri plugin-fs）
 * - 调用 readExcel() 验证走 buffer 路径并产生与 Node 路径一致的结果
 * - 额外测试 byteOffset≠0 时 Buffer.from 正确性
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import {readExcel} from '../ExcelReader';
import {
  setDefaultFileSystem,
  getDefaultFileSystem,
  type CfgFileSystem,
} from '@cfgforge/shared';
import { NodeFileSystem } from '@cfgforge/shared';

// Resolve the test xlsx file path
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const XLSX_PATH = path.join(REPO_ROOT, 'example', 'config', 'ai_行为', 'ai行为.xlsx');
const RELATIVE_PATH = 'ai_行为/ai行为.xlsx';

/**
 * 精简 mock CfgFileSystem — 模拟 Tauri WebView 环境。
 *
 * 只实现 readExcel 需要的方法：
 * - isSyncSupported = false（强制走 buffer 路径）
 * - readFile: 从真实文件读取字节返回 Uint8Array（模拟 Tauri plugin-fs 行为）
 *
 * 其他方法抛错或返回默认值（readExcel 不使用）。
 */
class TauriBufferMockFS implements CfgFileSystem {
  readonly isSyncSupported = false;

  async readFile(filePath: string): Promise<Uint8Array> {
    // 读取真实文件字节，返回 Uint8Array（非 Buffer）
    // 这模拟 Tauri plugin-fs 的 readFile 行为
    const buf = fs.readFileSync(filePath);
    // 返回副本作为纯 Uint8Array（不是 Buffer 子类）
    return new Uint8Array(buf);
  }

  resolvePath(...paths: string[]): string {
    return path.join(...paths);
  }

  // ---- 以下方法 readExcel 不使用，提供最简实现 ----

  async writeFile(): Promise<void> {
    throw new Error('Not implemented in mock');
  }
  async exists(): Promise<boolean> {
    return false;
  }
  async isDirectory(): Promise<boolean> {
    return false;
  }
  async isFile(): Promise<boolean> {
    return false;
  }
  async readDir(): Promise<string[]> {
    return [];
  }
  async mkdirs(): Promise<void> {}
  async remove(): Promise<void> {}
  async rename(): Promise<void> {}
  async fileSize(): Promise<number> {
    return 0;
  }
  async listFilesRecursive(): Promise<string[]> {
    return [];
  }
  async lastModified(): Promise<number> {
    return 0;
  }

  readTextFileSync(): string {
    throw new Error('sync not supported');
  }
  readFileSync(): Uint8Array {
    throw new Error('sync not supported');
  }
  writeTextFileSync(): void {
    throw new Error('sync not supported');
  }
  writeFileSync(): void {
    throw new Error('sync not supported');
  }
  existsSync(): boolean {
    throw new Error('sync not supported');
  }
  isDirectorySync(): boolean {
    throw new Error('sync not supported');
  }
  readDirSync(): string[] {
    throw new Error('sync not supported');
  }
  mkdirsSync(): void {
    throw new Error('sync not supported');
  }
  removeSync(): void {
    throw new Error('sync not supported');
  }
  renameSync(): void {
    throw new Error('sync not supported');
  }
  fileSizeSync(): number {
    throw new Error('sync not supported');
  }
  lastModifiedSync(): number {
    throw new Error('sync not supported');
  }
}

describe('ExcelReader Tauri buffer path', () => {
  let prevFs: CfgFileSystem | null = null;
  let mockFs: TauriBufferMockFS;

  beforeEach(() => {
    // 保存当前默认 FS，注入 mock
    mockFs = new TauriBufferMockFS();
    // 通过 setDefaultFileSystem 注入
    setDefaultFileSystem(mockFs);
  });

  afterEach(() => {
    // 恢复默认 FS（NodeFileSystem）
    setDefaultFileSystem(new NodeFileSystem());
  });

  // -----------------------------------------------------------------
  // 基本读取：验证 buffer 路径产生与 Node 路径一致的结果
  // -----------------------------------------------------------------
  describe('basic read via buffer path', () => {
    it('reads xlsx via wb.xlsx.load(buffer) and returns ReadResult', async () => {
      const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
      expect(result).toBeDefined();
      expect(result.sheets.length).toBe(4);
      expect(result.stat.excelCount).toBe(1);
      expect(result.stat.sheetCount).toBe(4);
      expect(result.stat.ignoredSheetCount).toBe(2);
      expect(result.nullableAddTag).toBeNull();
    });

    it('parses all sheet names correctly via buffer path', async () => {
      const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
      const names = result.sheets.map((s) => s.tableName);
      expect(names).toContain('ai.ai');
      expect(names).toContain('ai.ai_condition');
      expect(names).toContain('ai.ai_action'); // index 0
      // __CONFIG and 说明 are ignored
      expect(names).not.toContain('ai.__CONFIG');
      expect(names).not.toContain('ai.说明');
    });

    it('parses sheet indices correctly via buffer path', async () => {
      const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
      const idx0 = result.sheets.find(
        (s) => s.tableName === 'ai.ai_action' && s.sheet.index === 0,
      );
      const idx1 = result.sheets.find(
        (s) => s.tableName === 'ai.ai_action' && s.sheet.index === 1,
      );
      expect(idx0).toBeDefined();
      expect(idx1).toBeDefined();
    });

    it('has correct relativeFilePath in each DRawSheet via buffer path', async () => {
      const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
      for (const s of result.sheets) {
        expect(s.sheet.relativeFilePath).toBe(RELATIVE_PATH);
      }
    });
  });

  // -----------------------------------------------------------------
  // 数据内容：验证 buffer 路径读取的数据与 Node 路径一致
  // -----------------------------------------------------------------
  describe('data content via buffer path', () => {
    it('reads header and field rows from ai sheet', async () => {
      const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
      const sheet = result.sheets.find((s) => s.tableName === 'ai.ai')!;
      const rows = sheet.sheet.rows;

      // Row 0 (header)
      expect(rows[0].cell(0)).toBe('ID');
      expect(rows[0].cell(1)).toContain('描述');

      // Row 1 (field names)
      expect(rows[1].cell(0)).toBe('ID');
      expect(rows[1].cell(1)).toBe('Desc');
      expect(rows[1].cell(2)).toBe('CondID');
    });

    it('reads data rows with numbers converted to string', async () => {
      const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
      const sheet = result.sheets.find((s) => s.tableName === 'ai.ai')!;
      const rows = sheet.sheet.rows;

      // Row 3 (Excel row 4): first data row
      expect(rows[3].cell(0)).toBe('1');
      expect(rows[3].cell(2)).toBe('1;2');
      expect(rows[3].cell(3)).toBe('150');
      expect(rows[3].cell(4)).toBe('10000');
    });

    it('reads boolean cells correctly', async () => {
      const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
      const sheet = result.sheets.find((s) => s.tableName === 'ai.ai')!;
      expect(sheet.sheet.rows[3].cell(6)).toBe('true');
    });

    it('reads null/empty cells as empty string', async () => {
      const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
      const sheet = result.sheets.find((s) => s.tableName === 'ai.ai')!;
      expect(sheet.sheet.rows[3].cell(1)).toBe('');
    });

    it('reads Chinese text correctly', async () => {
      const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
      const sheet = result.sheets.find((s) => s.tableName === 'ai.ai')!;
      expect(sheet.sheet.rows[4].cell(0)).toBe('10012');
      expect(sheet.sheet.rows[4].cell(1)).toBe('召唤猴子');
    });

    it('reads newline in rich text cells', async () => {
      const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
      const idx1 = result.sheets.find(
        (s) => s.tableName === 'ai.ai_action' && s.sheet.index === 1,
      )!;
      expect(idx1.sheet.rows[2].cell(1)).toBe('新手关塔\n减伤');
    });

    it('fills empty rows with EMPTY_ROW', async () => {
      const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
      const sheet = result.sheets.find((s) => s.tableName === 'ai.ai')!;
      const rows = sheet.sheet.rows;
      // Row 2 (Excel row 3) is empty → filled with EMPTY_ROW
      expect(rows[2].count()).toBe(0);
      expect(rows[2].cell(0)).toBe('');
    });
  });

  // -----------------------------------------------------------------
  // readSheet 过滤
  // -----------------------------------------------------------------
  describe('readSheet filter via buffer path', () => {
    it('filters to a specific sheet', async () => {
      const result = await readExcel(XLSX_PATH, RELATIVE_PATH, 'AI_CONDITION');
      expect(result.sheets.length).toBe(1);
      expect(result.sheets[0].tableName).toBe('ai.ai_condition');
    });

    it('filters to a sheet with Chinese name', async () => {
      const result = await readExcel(XLSX_PATH, RELATIVE_PATH, 'AI中文会被忽略只要a-z开头');
      expect(result.sheets.length).toBe(1);
      expect(result.sheets[0].tableName).toBe('ai.ai');
    });

    it('returns no sheets when filter matches nothing', async () => {
      const result = await readExcel(XLSX_PATH, RELATIVE_PATH, 'NoSuchSheet');
      expect(result.sheets.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------
  // DRawSheet 属性
  // -----------------------------------------------------------------
  describe('DRawSheet properties via buffer path', () => {
    it('id() returns correct identifier', async () => {
      const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
      for (const s of result.sheets) {
        const id = s.sheet.id();
        expect(id).toContain(RELATIVE_PATH);
        expect(id).toContain(s.sheet.sheetName);
      }
    });

    it('isCsv() returns false for Excel sheets', async () => {
      const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
      for (const s of result.sheets) {
        expect(s.sheet.isCsv()).toBe(false);
      }
    });
  });

  // -----------------------------------------------------------------
  // byteOffset 边界测试
  // -----------------------------------------------------------------
  describe('byteOffset edge case', () => {
    it('correctly loads xlsx when Uint8Array has non-zero byteOffset', async () => {
      // 模拟 TauriFileSystem.readFile 返回的 Uint8Array 可能是
      // 一个更大 ArrayBuffer 的子视图（byteOffset≠0）。
      // ExcelReader 用 Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)
      // 来正确处理这种情况。

      // 1. 读取真实 xlsx 文件字节
      const fileBuf = fs.readFileSync(XLSX_PATH);
      const xlsxBytes = new Uint8Array(fileBuf);

      // 2. 创建一个更大的 ArrayBuffer，将 xlsx 字节放在偏移位置
      const offset = 128; // 非零偏移
      const largerBuf = new Uint8Array(offset + xlsxBytes.length);
      // 前面填充无效数据
      for (let i = 0; i < offset; i++) {
        largerBuf[i] = 0xff;
      }
      // 复制 xlsx 字节到偏移位置
      largerBuf.set(xlsxBytes, offset);

      // 3. 创建子视图（byteOffset=offset, byteLength=xlsxBytes.length）
      const subView = largerBuf.subarray(offset);

      // 4. 验证子视图属性
      expect(subView.byteOffset).toBe(offset);
      expect(subView.byteLength).toBe(xlsxBytes.length);

      // 5. 用 ExcelJS 直接验证 buffer 路径
      const wb = new ExcelJS.Workbook();
      const nodeBuf = Buffer.from(subView.buffer, subView.byteOffset, subView.byteLength);
      await wb.xlsx.load(nodeBuf as any);

      // 6. 验证能正确解析 sheet
      expect(wb.worksheets.length).toBeGreaterThan(0);
      const sheetNames = wb.worksheets.map((ws) => ws.name);
      expect(sheetNames).toContain('AI_CONDITION');
    });

    it('readExcel works with a mock FS that returns subarray views', async () => {
      // 创建一个 mock FS，readFile 返回 subarray 视图（byteOffset≠0）
      const offsetMockFs: CfgFileSystem = {
        isSyncSupported: false,
        async readFile(filePath: string): Promise<Uint8Array> {
          const fileBuf = fs.readFileSync(filePath);
          const xlsxBytes = new Uint8Array(fileBuf);
          const offset = 64;
          const larger = new Uint8Array(offset + xlsxBytes.length);
          larger.set(xlsxBytes, offset);
          return larger.subarray(offset); // byteOffset = 64
        },
        resolvePath(...paths: string[]): string {
          return path.join(...paths);
        },
        async writeFile() {
          throw new Error('Not implemented');
        },
        async exists() {
          return false;
        },
        async isDirectory() {
          return false;
        },
        async isFile() {
          return false;
        },
        async readDir() {
          return [];
        },
        async mkdirs() {},
        async remove() {},
        async rename() {},
        async fileSize() {
          return 0;
        },
        async listFilesRecursive() {
          return [];
        },
        async lastModified() {
          return 0;
        },
        readTextFileSync() {
          throw new Error('sync not supported');
        },
        readFileSync() {
          throw new Error('sync not supported');
        },
        writeTextFileSync() {
          throw new Error('sync not supported');
        },
        writeFileSync() {
          throw new Error('sync not supported');
        },
        existsSync() {
          throw new Error('sync not supported');
        },
        isDirectorySync() {
          throw new Error('sync not supported');
        },
        readDirSync() {
          throw new Error('sync not supported');
        },
        mkdirsSync() {
          throw new Error('sync not supported');
        },
        removeSync() {
          throw new Error('sync not supported');
        },
        renameSync() {
          throw new Error('sync not supported');
        },
        fileSizeSync() {
          throw new Error('sync not supported');
        },
        lastModifiedSync() {
          throw new Error('sync not supported');
        },
      };

      setDefaultFileSystem(offsetMockFs);

      const result = await readExcel(XLSX_PATH, RELATIVE_PATH, null);
      expect(result.sheets.length).toBe(4);
      expect(result.stat.sheetCount).toBe(4);

      // 验证数据内容正确
      const sheet = result.sheets.find((s) => s.tableName === 'ai.ai')!;
      expect(sheet.sheet.rows[0].cell(0)).toBe('ID');
      expect(sheet.sheet.rows[3].cell(0)).toBe('1');
    });
  });

  // -----------------------------------------------------------------
  // 对比测试：buffer 路径与 Node 路径结果一致
  // -----------------------------------------------------------------
  describe('parity with Node path', () => {
    it('produces identical sheet count and names as Node path', async () => {
      // buffer 路径结果（当前 mock FS 已注入）
      const bufferResult = await readExcel(XLSX_PATH, RELATIVE_PATH, null);

      // 切换回 Node FS
      setDefaultFileSystem(new NodeFileSystem());

      // Node 路径结果
      const nodeResult = await readExcel(XLSX_PATH, RELATIVE_PATH, null);

      // 对比
      expect(bufferResult.sheets.length).toBe(nodeResult.sheets.length);
      const bufferNames = bufferResult.sheets.map((s) => s.tableName).sort();
      const nodeNames = nodeResult.sheets.map((s) => s.tableName).sort();
      expect(bufferNames).toEqual(nodeNames);

      // 对比 stat
      expect(bufferResult.stat.excelCount).toBe(nodeResult.stat.excelCount);
      expect(bufferResult.stat.sheetCount).toBe(nodeResult.stat.sheetCount);
      expect(bufferResult.stat.ignoredSheetCount).toBe(nodeResult.stat.ignoredSheetCount);
    });

    it('produces identical row data as Node path', async () => {
      // buffer 路径
      const bufferResult = await readExcel(XLSX_PATH, RELATIVE_PATH, null);

      // 切换回 Node FS
      setDefaultFileSystem(new NodeFileSystem());

      // Node 路径
      const nodeResult = await readExcel(XLSX_PATH, RELATIVE_PATH, null);

      // 逐 sheet 对比行数据
      for (let i = 0; i < bufferResult.sheets.length; i++) {
        const bSheet = bufferResult.sheets[i];
        const nSheet = nodeResult.sheets[i];
        expect(bSheet.tableName).toBe(nSheet.tableName);
        expect(bSheet.sheet.rows.length).toBe(nSheet.sheet.rows.length);
        for (let r = 0; r < bSheet.sheet.rows.length; r++) {
          const bRow = bSheet.sheet.rows[r];
          const nRow = nSheet.sheet.rows[r];
          expect(bRow.count()).toBe(nRow.count());
          for (let c = 0; c < bRow.count(); c++) {
            expect(bRow.cell(c)).toBe(nRow.cell(c));
          }
        }
      }
    });
  });
});
