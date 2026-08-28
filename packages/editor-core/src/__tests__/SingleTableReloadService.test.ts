/**
 * SingleTableReloadService tests — P1-5 单表数据重载
 *
 * DataUpdater.updateByReloadTable 重新读取单表 CSV 后，服务把新 CfgData 合并进
 * editor 的 context（updateDataAndValue），并用新 CfgData 重建 CfgValue 快照
 * （adoptNewCfgValue）。测试喂 fixture：改 CSV 后触发 reloadTable，断言 CfgValue
 * 中该表数据已刷新、其他表不受影响、表名错误报错。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EditorService } from '../EditorService';
import { SingleTableReloadService } from '../SingleTableReloadService';

function writeFile(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const CFG = `table item[id] (title='name') {
  id:int;
  name:str;
}
table monster[id] (title='name') {
  id:int;
  name:str;
}
`;

const ITEM_CSV = `id,name
id,name
1,剑
`;

const MONSTER_CSV = `id,name
id,name
100,史莱姆
`;

describe('SingleTableReloadService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-reload-'));
  });

  afterEach(() => {
    rmSync(tempDir);
  });

  async function createEditor(): Promise<EditorService> {
    writeFile(tempDir, 'config.cfg', CFG);
    writeFile(tempDir, 'item.csv', ITEM_CSV);
    writeFile(tempDir, 'monster.csv', MONSTER_CSV);
    return EditorService.create(tempDir);
  }

  // -------------------------------------------------------------------------
  // 正常路径：单表重载后数据刷新
  // -------------------------------------------------------------------------

  it('reloadTable 重新读取该表 CSV 并刷新 CfgValue', async () => {
    const editor = await createEditor();
    const before = editor.cfgValue().getTable('item');
    expect(before).not.toBeNull();

    // 外部修改 item.csv：新增 id=2 记录
    writeFile(tempDir, 'item.csv', `id,name
id,name
1,剑
2,盾
`);

    const result = await SingleTableReloadService.reloadTable(editor, 'item');
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);

    // CfgValue 快照已刷新：item 表含 2 条记录（primaryKeyMap 含 id=1 与 id=2）
    const after = editor.cfgValue().getTable('item');
    expect(after).not.toBeNull();
    const ids = [...after!.primaryKeyMap.keys()].map(k => k.packStr());
    expect(ids).toContain('1');
    expect(ids).toContain('2');
    expect(after!.valueList.length).toBe(2);

    // 其他表不受影响
    const monster = editor.cfgValue().getTable('monster');
    expect(monster).not.toBeNull();
    expect(monster!.valueList.length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 错误路径
  // -------------------------------------------------------------------------

  it('reloadTable 表名不存在时报错', async () => {
    const editor = await createEditor();
    const result = await SingleTableReloadService.reloadTable(editor, 'not_exist');
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});