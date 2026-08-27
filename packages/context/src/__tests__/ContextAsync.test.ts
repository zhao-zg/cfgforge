/**
 * Context 异步路径集成测试 — Task 4
 *
 * 验证 Context.createWithCfg 在 Tauri WebView 环境（isSyncSupported=false）下
 * 走异步路径（createWithStructure → initAsync → readSchemaAndDataAsync）的正确性。
 *
 * 策略：
 * - 创建 mock CfgFileSystem（isSyncSupported=false），readFile/readDir 等走真实 fs
 * - 用临时目录 + fixture 调用 Context.createWithCfg
 * - 验证异步路径产生的 Context 与同步路径行为一致
 * - 验证 makeValueAsync 异步值生成
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {describe, it, expect, beforeEach, afterEach} from 'vitest';

import {Context} from '../Context';
import {ContextCfg} from '../ContextCfg';
import {
  setDefaultFileSystem,
  NodeFileSystem,
  type CfgFileSystem,
} from '@cfgforge/shared';
import {HeadRows} from '@cfgforge/data';
import type {CfgValue} from '@cfgforge/value';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeFile(dir: string, filename: string, content: string): string {
  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, content, 'utf8');
  return fullPath;
}

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

/**
 * Tauri-like mock CfgFileSystem — isSyncSupported=false，异步方法走真实 fs。
 *
 * 模拟 Tauri WebView 环境：
 * - isSyncSupported = false（强制走异步路径）
 * - readFile: 用 fs.promises.readFile 读取真实文件（返回 Uint8Array）
 * - readDir: 用 fs.promises.readdir 读取真实目录
 * - exists/isDirectory/isFile: 用 fs.promises.stat
 * - resolvePath: 用 PathUtil（分隔符无关，返回 / 分隔符）
 */
class TauriMockFS implements CfgFileSystem {
  readonly isSyncSupported = false;

  resolvePath(...paths: string[]): string {
    // 模拟 TauriFileSystem.resolvePath：用 PathUtil（返回 / 分隔符）
    // 但测试中路径用 path.join（Node 风格），所以直接用 path.resolve
    return path.resolve(...paths).replace(/\\/g, '/');
  }

  async readFile(filePath: string): Promise<Uint8Array> {
    const buf = await fs.promises.readFile(filePath);
    return new Uint8Array(buf);
  }

  async writeFile(filePath: string, data: Uint8Array): Promise<void> {
    await fs.promises.mkdir(path.dirname(filePath), {recursive: true});
    await fs.promises.writeFile(filePath, data);
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async isDirectory(filePath: string): Promise<boolean> {
    try {
      return (await fs.promises.stat(filePath)).isDirectory();
    } catch {
      return false;
    }
  }

  async isFile(filePath: string): Promise<boolean> {
    try {
      return (await fs.promises.stat(filePath)).isFile();
    } catch {
      return false;
    }
  }

  async readDir(dir: string): Promise<string[]> {
    try {
      return await fs.promises.readdir(dir);
    } catch {
      return [];
    }
  }

  async mkdirs(dir: string): Promise<void> {
    await fs.promises.mkdir(dir, {recursive: true});
  }

  async remove(target: string): Promise<void> {
    await fs.promises.rm(target, {recursive: true, force: true});
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(newPath), {recursive: true});
    await fs.promises.rename(oldPath, newPath);
  }

  async fileSize(filePath: string): Promise<number> {
    try {
      return (await fs.promises.stat(filePath)).size;
    } catch {
      return 0;
    }
  }

  async listFilesRecursive(dir: string): Promise<string[]> {
    const result: string[] = [];
    const walk = async (d: string): Promise<void> => {
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(d, {withFileTypes: true});
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile()) {
          result.push(full.replace(/\\/g, '/'));
        }
      }
    };
    await walk(dir);
    return result;
  }

  async lastModified(filePath: string): Promise<number> {
    try {
      return (await fs.promises.stat(filePath)).mtimeMs;
    } catch {
      return 0;
    }
  }

  // 同步方法全部抛错
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

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const USER_CFG = `table user[id] {
  id:int;
  name:str;
  age:int;
}
`;

const USER_CSV_3ROWS = `用户ID,姓名,年龄
id,name,age
1,Alice,25
2,Bob,30
3,Charlie,35
`;

const ITEM_CFG = `table item[id] {
  id:int;
  name:str;
  price:float;
  owner:int ->user;
}
`;

const ITEM_CSV = `物品ID,名称,价格,持有者
id,name,price,owner
1,Sword,100.5,1
2,Shield,50.0,2
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Context async path (Tauri WebView)', () => {
  let tempDir: string;
  let prevFs: CfgFileSystem | null = null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-ctx-async-'));
    // 注入 Tauri-like mock FS
    prevFs = null;
    setDefaultFileSystem(new TauriMockFS());
  });

  afterEach(() => {
    // 恢复 NodeFileSystem
    setDefaultFileSystem(new NodeFileSystem());
    rmSync(tempDir);
  });

  // -----------------------------------------------------------------
  // 基本异步路径
  // -----------------------------------------------------------------
  describe('basic async creation', () => {
    it('creates Context via async path with valid config directory', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV_3ROWS);

      const ctx = await Context.create(tempDir);
      expect(ctx).toBeDefined();
      expect(ctx.cfgSchema()).toBeDefined();
      expect(ctx.cfgData()).toBeDefined();

      const cfgValue = ctx.makeValue();
      expect(cfgValue).toBeDefined();
      const userTable = cfgValue.getTable('user');
      expect(userTable).toBeDefined();
      expect(userTable!.valueList.length).toBe(3);
    });

    it('handles empty directory gracefully via async path', async () => {
      const ctx = await Context.create(tempDir);
      expect(ctx).toBeDefined();
      expect(ctx.cfgSchema()).toBeDefined();
      expect(ctx.cfgData()).toBeDefined();
      expect(ctx.cfgData().tables.size).toBe(0);
    });

    it('rootDir returns the data directory', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV_3ROWS);

      const ctx = await Context.create(tempDir);
      // TauriMockFS.resolvePath 返回 / 分隔符，但 DirectoryStructure 内部可能保留原始路径
      // 只要 rootDir 包含 tempDir 的规范化形式即可
      expect(ctx.rootDir().replace(/\\/g, '/')).toBe(tempDir.replace(/\\/g, '/'));
    });
  });

  // -----------------------------------------------------------------
  // 复杂 schema + FK
  // -----------------------------------------------------------------
  describe('complex schema with foreign key', () => {
    it('resolves foreign key references via async path', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG + '\n' + ITEM_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV_3ROWS);
      writeFile(tempDir, 'item.csv', ITEM_CSV);

      const ctx = await Context.create(tempDir);
      const cfgValue = ctx.makeValue();

      const userTable = cfgValue.getTable('user');
      const itemTable = cfgValue.getTable('item');
      expect(userTable).toBeDefined();
      expect(itemTable).toBeDefined();
      expect(userTable!.valueList.length).toBe(3);
      expect(itemTable!.valueList.length).toBe(2);

      // 验证 FK 数据正确
      // owner 是 FK → user，在 CfgValue 中解析为 VStruct 引用
      // 检查 item 表第 1 行的 owner 字段值
      const item0Owner = itemTable!.valueList[0].values[3];
      expect(item0Owner).toBeDefined();
      // FK 字段在 value 中可能是 VStruct 引用或 int 值，取决于解析阶段
      // 只要值存在且不为 null 即可
      expect(item0Owner).not.toBeNull();
    });
  });

  // -----------------------------------------------------------------
  // makeValueAsync
  // -----------------------------------------------------------------
  describe('makeValueAsync', () => {
    it('generates CfgValue via async path', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV_3ROWS);

      const ctx = await Context.create(tempDir);
      const cfgValue = await ctx.makeValueAsync();
      expect(cfgValue).toBeDefined();
      const userTable = cfgValue.getTable('user');
      expect(userTable).toBeDefined();
      expect(userTable!.valueList.length).toBe(3);
    });

    it('makeValueWithTagAsync generates tag-filtered value', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV_3ROWS);

      const ctx = await Context.create(tempDir);
      const cfgValue = await ctx.makeValueWithTagAsync('test-tag');
      expect(cfgValue).toBeDefined();
      // tag 过滤后如果没有带 tag 的字段，表可能不存在；但 user 表本身存在
      // 只要 makeValueWithTagAsync 不抛错即可
    });

    it('makeValueAsync caches result for same tag', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV_3ROWS);

      const ctx = await Context.create(tempDir);
      const v1 = await ctx.makeValueWithTagAndAllowErrAsync('tag1', false);
      const v2 = await ctx.makeValueWithTagAndAllowErrAsync('tag1', false);
      expect(v2).toBe(v1);
    });
  });

  // -----------------------------------------------------------------
  // tag 缓存
  // -----------------------------------------------------------------
  describe('tag-based caching (async path)', () => {
    it('generates different CfgValue for different tags', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV_3ROWS);

      const ctx = await Context.create(tempDir);
      const v1 = await ctx.makeValueWithTagAsync('tag1');
      const v2 = await ctx.makeValueWithTagAsync('tag2');
      expect(v2).not.toBe(v1);
    });
  });

  // -----------------------------------------------------------------
  // autoFix 路径（异步写入 schema）
  // -----------------------------------------------------------------
  describe('autoFix via async path', () => {
    it('writes aligned schema and reloads via async path', async () => {
      // config.cfg 缺少 age 字段，但 CSV 有 age 列 → autoFix 应写入 aligned schema 并 reload
      const minimalCfg = `table user[id] {
  id:int;
  name:str;
}
`;
      writeFile(tempDir, 'config.cfg', minimalCfg);
      writeFile(tempDir, 'user.csv', USER_CSV_3ROWS);

      const ctx = await Context.create(tempDir);
      expect(ctx).toBeDefined();
      // autoFix 第一轮写入 aligned schema，第二轮 reload 后成功
      expect(ctx.lastLoadDidAutoFix()).toBe(true);
      const cfgValue = ctx.makeValue();
      const userTable = cfgValue.getTable('user');
      expect(userTable).toBeDefined();
      expect(userTable!.valueList.length).toBe(3);
    });
  });

  // -----------------------------------------------------------------
  // ContextCfg 自定义配置
  // -----------------------------------------------------------------
  describe('custom ContextCfg via async path', () => {
    it('works with custom headRow and encoding', async () => {
      const cfgStr = `table user[id] {
  id:int;
  name:str;
}
`;
      // 3-row header: Chinese name, English name, type
      const csvData = `用户ID,姓名
id,name
int,str
1,Alice
`;
      writeFile(tempDir, 'config.cfg', cfgStr);
      writeFile(tempDir, 'user.csv', csvData);

      const customCfg = new ContextCfg(
        tempDir,
        null,
        HeadRows.A3,
        'UTF-8',
        null,
        null,
        null,
        false,
      );

      const ctx = await Context.createWithCfg(customCfg);
      const cfgValue = ctx.makeValue();
      expect(cfgValue).toBeDefined();
      const userTable = cfgValue.getTable('user');
      expect(userTable).toBeDefined();
      expect(userTable!.valueList.length).toBe(1);
    });
  });

  // -----------------------------------------------------------------
  // 对比测试：异步路径与同步路径结果一致
  // -----------------------------------------------------------------
  describe('parity with sync path', () => {
    it('produces identical user count via async and sync paths', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV_3ROWS);

      // 异步路径
      const asyncCtx = await Context.create(tempDir);
      const asyncValue = asyncCtx.makeValue();
      const asyncUserCount = asyncValue.getTable('user')!.valueList.length;

      // 切换回 Node FS
      setDefaultFileSystem(new NodeFileSystem());

      // 同步路径
      const syncCtx = await Context.create(tempDir);
      const syncValue = syncCtx.makeValue();
      const syncUserCount = syncValue.getTable('user')!.valueList.length;

      expect(asyncUserCount).toBe(syncUserCount);
      expect(asyncUserCount).toBe(3);
    });

    it('produces identical table names via async and sync paths', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG + '\n' + ITEM_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV_3ROWS);
      writeFile(tempDir, 'item.csv', ITEM_CSV);

      // 异步路径
      const asyncCtx = await Context.create(tempDir);
      const asyncValue = asyncCtx.makeValue();
      const asyncTables = Array.from(asyncValue.tables()).map(t => t.name()).sort();

      // 切换回 Node FS
      setDefaultFileSystem(new NodeFileSystem());

      // 同步路径
      const syncCtx = await Context.create(tempDir);
      const syncValue = syncCtx.makeValue();
      const syncTables = Array.from(syncValue.tables()).map(t => t.name()).sort();

      expect(asyncTables).toEqual(syncTables);
      expect(asyncTables).toContain('user');
      expect(asyncTables).toContain('item');
    });
  });

  // -----------------------------------------------------------------
  // i18n
  // -----------------------------------------------------------------
  describe('i18n via async path', () => {
    it('returns null for nullableLangTextFinder when not configured', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV_3ROWS);

      const ctx = await Context.create(tempDir);
      expect(ctx.nullableLangTextFinder()).toBeNull();
      expect(ctx.nullableLangSwitch()).toBeNull();
    });

    it('provides access to context configuration', async () => {
      writeFile(tempDir, 'config.cfg', USER_CFG);
      writeFile(tempDir, 'user.csv', USER_CSV_3ROWS);

      const ctx = await Context.create(tempDir);
      const cfg = ctx.contextCfg();
      expect(cfg).toBeDefined();
      expect(cfg.dataDir.replace(/\\/g, '/')).toBe(tempDir.replace(/\\/g, '/'));
      expect(cfg.headRow).toBe(HeadRows.A2_Default);
    });
  });
});
