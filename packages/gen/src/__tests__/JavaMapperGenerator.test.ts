import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { Context } from '@cfgforge/context';
import { CachedFiles } from '@cfgforge/shared';
import { JavaMapperGenerator } from '../JavaMapperGenerator';
import { genChildClass, genInitAll } from '../JavaMapperTemplates';
import type { Parameter } from '../Parameter';

/**
 * javamapper Generator 集成测试（Task 5）。
 *
 * fixture 覆盖（brief Step 1）：
 * - 单主键表 task（非空 FK taskid->taskextraexp、nullable FK nexttask->task、
 *   struct 字段 range、interface 字段 completecondition + enum 列）
 * - 多主键表 lootitem[lootid,itemid] + 单字段 uniqueKey [itemid]
 * - 枚举表 completeconditiontype (enum='name')：数据行给出 name + 主键值
 * - child 参数：task → cfg/Tasks.java
 *
 * fixture 布局约束（经 Context/autofix 行为验证）：
 * - 全部 schema 放单一 config.cfg（全局命名空间，无目录命名空间）——
 *   命名空间目录下多 cfg 文件互相解析不了 FK（findConfigFilesRecursively
 *   每目录只找 <dirname>.cfg），且 aligner 的 autofix 回写会丢 enum
 *   metadata（enum='name' 写不回），全局单文件 + 列齐全时无 diff 无 autofix。
 * - csv 文件名带中文后缀（getCodeName 截断 Han 字符）。
 * - csv 行序：中文标题行 + 字段名行（HeadRows.A2_Default）。
 * - interface 列用 `"completecondition,enum"` + impl 参数列（span 必须
 *   ≥ 最大 impl 字段数 + enum 名 1 列）；struct (pack) 单列 span=1。
 */

// ---------------------------------------------------------------------------
// Parameter mock
// ---------------------------------------------------------------------------

function mockParameter(opts: Record<string, string>): Parameter {
  return {
    get: (k: string, def: string) => (k in opts ? opts[k] : def),
    has: (k: string) => k in opts,
    getOrNull: (k: string) => (k in opts ? opts[k] : null),
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CFG = [
  "interface completecondition (enumRef='completeconditiontype', defaultImpl='TalkNpc') {",
  '\tstruct KillMonster {',
  '\t\tmonsterid:int;',
  '\t\tcount:int;',
  '\t}',
  '',
  '\tstruct TalkNpc {',
  '\t\tnpcid:int;',
  '\t}',
  '}',
  '',
  'table completeconditiontype[id] (enum=\'name\') {',
  '\tid:int;',
  '\tname:str;',
  '}',
  '',
  'struct Range {',
  '\tMin:int;',
  '\tMax:int;',
  '}',
  '',
  'table task[taskid] {',
  '\ttaskid:int ->taskextraexp;',
  '\tname:str;',
  '\tnexttask:int ->task (nullable);',
  '\tcompletecondition:completecondition;',
  '\trange:Range (pack);',
  '\texp:int;',
  '}',
  '',
  'table taskextraexp[taskid] {',
  '\ttaskid:int;',
  '\textraexp:int;',
  '}',
  '',
  'table lootitem[lootid,itemid] {',
  '\tlootid:int;',
  '\titemid:int;',
  '\tcount:int;',
  '\t[itemid];',
  '}',
  '',
].join('\n');

const COMPLETECONDITIONTYPE_CSV = ['id表,程序用名字', 'id,name', '1,KillMonster', '2,TalkNpc'].join('\n') + '\n';

const TASK_CSV = [
  '任务id,名字,下一任务,完成条件,参数1,参数2,区间,经验',
  'taskid,name,nexttask,"completecondition,enum",param1,param2,range,exp',
  '1,任务一,2,KillMonster,1,3,"1,10",100',
  '2,任务二,,TalkNpc,1,,,"2,20",200',
].join('\n') + '\n';

const TASKEXTRAEXP_CSV = ['任务id,额外经验', 'taskid,extraexp', '1,50', '2,60'].join('\n') + '\n';

const LOOTITEM_CSV = ['掉落id,掉落物品,数量', 'lootid,itemid,count', '1,1001,5', '1,1002,3', '2,2001,8'].join('\n') + '\n';

// pkg 参数用固定前缀，方便断言 FQN
const PKG = 'com.test.mapper';
const BEAN_PKG = `${PKG}.bean`;
const RAW_PKG = `${PKG}.raw`;
const CFG_PKG = `${PKG}.cfg`;

// ---------------------------------------------------------------------------
// 模板纯函数：genChildClass / genInitAll
// ---------------------------------------------------------------------------

describe('genChildClass', () => {
  it('extends raw class with empty prepareData hook and instance Holder', () => {
    const out = genChildClass({
      pkg: CFG_PKG,
      className: 'Tasks',
      rawClassFqn: `${RAW_PKG}.RawTasks`,
    });
    expect(out).toContain(`package ${CFG_PKG};`);
    expect(out).toContain(`public class Tasks extends ${RAW_PKG}.RawTasks {`);
    expect(out).toContain('    private static class Holder { static final Tasks INSTANCE = new Tasks(); }');
    expect(out).toContain('    public static Tasks getInstance() { return Holder.INSTANCE; }');
    expect(out).toContain('    public void prepareData() {');
    expect(out).toContain('    }');
  });
});

describe('genInitAll', () => {
  const out = genInitAll({
    pkg: RAW_PKG,
    rows: [
      { rawFqn: `${RAW_PKG}.RawLootitems`, initFqn: `${RAW_PKG}.RawLootitems` },
      { rawFqn: `${RAW_PKG}.RawTasks`, initFqn: `${CFG_PKG}.Tasks` }, // child 存在时 init 调子类
    ],
    verifyTargets: [
      {
        rawFqn: `${RAW_PKG}.RawTasks`,
        rowFqn: `${RAW_PKG}.RawTasks.RawTask`,
        sqlTable: 'cfg_task',
        fields: [
          { field: 'nexttask', refGetter: 'getNexttaskRef', refSqlTable: 'cfg_task', nullable: true, keyExpr: 'num' },
          { field: 'taskid', refGetter: 'getTaskidRef', refSqlTable: 'cfg_taskextraexp', nullable: false, keyExpr: 'num' },
          { field: 'ename', refGetter: 'getEnameRef', refSqlTable: 'cfg_loot', nullable: false, keyExpr: 'str' },
        ],
      },
    ],
  });

  it('package + class decl + getInstance', () => {
    expect(out).toContain(`package ${RAW_PKG};`);
    expect(out).toContain('public class CfgMapperInit {');
    expect(out).toContain('    public static CfgMapperInit getInstance() { return Holder.INSTANCE; }');
  });

  it('initAll calls child FQN when child exists, raw otherwise, in sortedTables order', () => {
    expect(out).toContain(`${RAW_PKG}.RawLootitems.getInstance().init();`);
    expect(out).toContain(`${CFG_PKG}.Tasks.getInstance().init();`);
    const idxLoot = out.indexOf(`${RAW_PKG}.RawLootitems.getInstance().init();`);
    const idxTask = out.indexOf(`${CFG_PKG}.Tasks.getInstance().init();`);
    expect(idxLoot).toBeGreaterThanOrEqual(0);
    expect(idxTask).toBeGreaterThanOrEqual(0);
    expect(idxLoot).toBeLessThan(idxTask);
  });

  it('verifyRefs: non-null int FK checked with != 0, str with null+isEmpty, nullable skipped', () => {
    expect(out).toContain('public static java.util.List<String> verifyRefs() {');
    expect(out).toContain(`for (${RAW_PKG}.RawTasks.RawTask row : ${RAW_PKG}.RawTasks.getInstance().tableMap.values()) {`);
    expect(out).toContain('if (row.getTaskid() != 0 && row.getTaskidRef() == null) {');
    expect(out).toContain('errs.add("cfg_task key=" + row.key() + " field=taskid -> cfg_taskextraexp missing");');
    // str FK 判空：getter 复用（合法 Java 表达式）
    expect(out).toContain('if (row.getEname() != null && !row.getEname().isEmpty() && row.getEnameRef() == null) {');
  });
});

// ---------------------------------------------------------------------------
// Generator 集成测试（fixture 目录 + Context）
// ---------------------------------------------------------------------------

describe('JavaMapperGenerator', () => {
  let tempDir: string;
  let outDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgforge-jmgen-'));
    outDir = path.join(tempDir, 'out');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'config.cfg'), CFG);
    fs.writeFileSync(path.join(tempDir, 'completeconditiontype类型.csv'), COMPLETECONDITIONTYPE_CSV);
    fs.writeFileSync(path.join(tempDir, 'task任务.csv'), TASK_CSV);
    fs.writeFileSync(path.join(tempDir, 'taskextraexp.csv'), TASKEXTRAEXP_CSV);
    fs.writeFileSync(path.join(tempDir, 'lootitem.csv'), LOOTITEM_CSV);
  });

  afterEach(() => {
    CachedFiles.finalExit();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function makeContext(): Promise<Context> {
    return Context.create(tempDir);
  }

  function baseDir(): string {
    // pkg 所有点 → 目录分隔（与 Generator 的 dstDir 逻辑一致，replace 单点只替换首个）
    return path.join(outDir, ...PKG.split('.'));
  }

  function read(rel: string): string {
    return fs.readFileSync(path.join(baseDir(), rel), 'utf-8');
  }

  async function generateWith(child: string): Promise<void> {
    const gen = new JavaMapperGenerator(mockParameter({ dir: outDir, pkg: PKG, child }));
    await gen.generate(await makeContext());
    CachedFiles.finalExit();
  }

  it('generates raw/bean/cfg files for all tables sorted by name', async () => {
    await generateWith('task');

    // raw/：每表一个 RawXxx + CfgMapperInit（completeconditiontype < lootitem < task < taskextraexp）
    expect(fs.existsSync(path.join(baseDir(), 'raw', 'RawCompleteconditiontypes.java'))).toBe(true);
    expect(fs.existsSync(path.join(baseDir(), 'raw', 'RawLootitems.java'))).toBe(true);
    expect(fs.existsSync(path.join(baseDir(), 'raw', 'RawTasks.java'))).toBe(true);
    expect(fs.existsSync(path.join(baseDir(), 'raw', 'RawTaskextraexps.java'))).toBe(true);
    expect(fs.existsSync(path.join(baseDir(), 'raw', 'CfgMapperInit.java'))).toBe(true);

    // bean/：顶层 struct + interface + 全部 impl（interface 与 impl 同包 = interface fullName）
    expect(fs.existsSync(path.join(baseDir(), 'bean', 'Range.java'))).toBe(true);
    expect(fs.existsSync(path.join(baseDir(), 'bean', 'completecondition', 'Completecondition.java'))).toBe(true);
    expect(fs.existsSync(path.join(baseDir(), 'bean', 'completecondition', 'KillMonster.java'))).toBe(true);
    expect(fs.existsSync(path.join(baseDir(), 'bean', 'completecondition', 'TalkNpc.java'))).toBe(true);

    // cfg/：child 子类
    expect(fs.existsSync(path.join(baseDir(), 'cfg', 'Tasks.java'))).toBe(true);
  });

  it('enum table bakes int constants from data rows and getByName', async () => {
    await generateWith('task');
    const raw = read('raw/RawCompleteconditiontypes.java');
    // enumNameToIntegerValueMap 来自数据行（KillMonster=1, TalkNpc=2）
    expect(raw).toContain('public static final int KILLMONSTER = 1;');
    expect(raw).toContain('public static final int TALKNPC = 2;');
    // 枚举名字段 name 非主键 → getByName
    expect(raw).toContain('public RawCompleteconditiontype getByName(String name) {');
  });

  it('impl POJO type() returns enum table raw constant; interface dispatches by fullName', async () => {
    await generateWith('task');
    const kill = read('bean/completecondition/KillMonster.java');
    expect(kill).toContain(`public class KillMonster implements ${BEAN_PKG}.completecondition.Completecondition {`);
    expect(kill).toContain(`    public ${RAW_PKG}.RawCompleteconditiontypes type() {`);
    expect(kill).toContain(`        return ${RAW_PKG}.RawCompleteconditiontypes.KILLMONSTER;`);

    const iface = read('bean/completecondition/Completecondition.java');
    expect(iface).toContain(`package ${BEAN_PKG}.completecondition;`);
    expect(iface).toContain('if ("completecondition.KillMonster".equals(type)) return');
    expect(iface).toContain('if ("completecondition.TalkNpc".equals(type)) return');
  });

  it('raw task row: struct field via bean FQN _parse, FK ref getters delegate', async () => {
    await generateWith('task');
    const raw = read('raw/RawTasks.java');
    // struct 字段（Range 顶层 struct → bean/Range.java，FQN 引用）
    expect(raw).toContain(`this.range = ${BEAN_PKG}.Range._parse(recored.getJSONObject("range"));`);
    // interface 字段（completecondition → bean/completecondition/Completecondition，与 impl 同包）
    expect(raw).toContain(`this.completecondition = ${BEAN_PKG}.completecondition.Completecondition._parse(recored.getJSONObject("completecondition"));`);
    // FK ref getter：taskid -> taskextraexp（getByKey），nexttask -> task（getByKey）
    expect(raw).toContain(`public ${RAW_PKG}.RawTaskextraexps getTaskidRef() {`);
    expect(raw).toContain('return RawTaskextraexps.getInstance().getByKey(taskid);');
    expect(raw).toContain(`public ${RAW_PKG}.RawTasks getNexttaskRef() {`);
    expect(raw).toContain('return RawTasks.getInstance().getByKey(nexttask);');
  });

  it('multi-pk table: Key class + single-field uniqueKey getByXxx', async () => {
    await generateWith('task');
    const raw = read('raw/RawLootitems.java');
    expect(raw).toContain('public static class RawLootitemKey {');
    expect(raw).toContain('public int hashCode() { return java.util.Objects.hash(lootid, itemid); }');
    expect(raw).toContain('public RawLootitem getByItemid(int itemid) { return itemidMap.get(itemid); }');
  });

  it('CfgMapperInit: initAll in sortedTables order, child init uses child FQN; verifyRefs checks non-null FKs', async () => {
    await generateWith('task');
    const init = read('raw/CfgMapperInit.java');
    expect(init).toContain(`package ${RAW_PKG};`);
    expect(init).toContain('public class CfgMapperInit {');

    // initAll：sortedTables 顺序（completeconditiontype < lootitem < task < taskextraexp）
    const order = [
      init.indexOf('RawCompleteconditiontypes.getInstance().init();'),
      init.indexOf('RawLootitems.getInstance().init();'),
      init.indexOf('Tasks.getInstance().init();'), // child 表 init 调子类 FQN（cfg.Tasks）
      init.indexOf('RawTaskextraexps.getInstance().init();'),
    ];
    for (const idx of order) expect(idx).toBeGreaterThanOrEqual(0);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
    expect(order[2]).toBeLessThan(order[3]);

    // verifyRefs：task 表非空 FK（taskid→taskextraexp）校验；nullable nexttask 不校验
    expect(init).toContain('if (row.getTaskid() != 0 && row.getTaskidRef() == null) {');
    expect(init).toContain('errs.add("cfg_task key=" + row.key() + " field=taskid -> cfg_taskextraexp missing");');
    expect(init).not.toContain('getNexttaskRef() == null');
  });

  it('cfg/Tasks.java child class with prepareData hook', async () => {
    await generateWith('task');
    const child = read('cfg/Tasks.java');
    expect(child).toContain(`package ${CFG_PKG};`);
    expect(child).toContain(`public class Tasks extends ${RAW_PKG}.RawTasks {`);
    expect(child).toContain('public void prepareData() {');
    expect(child).toContain('public static Tasks getInstance() { return Holder.INSTANCE; }');
  });

  it('second run does not overwrite existing child file', async () => {
    await generateWith('task');
    // 预写手写内容（模拟用户定制）再跑一遍 → 内容不变
    const childPath = path.join(baseDir(), 'cfg', 'Tasks.java');
    const handwritten = '// handwritten custom logic\n';
    fs.writeFileSync(childPath, handwritten, 'utf-8');
    await generateWith('task');
    expect(fs.readFileSync(childPath, 'utf-8')).toBe(handwritten);
  });

  it('cfg dir is not cleaned up: extra handwritten file in cfg/ survives', async () => {
    const cfgDir = path.join(baseDir(), 'cfg');
    fs.mkdirSync(cfgDir, { recursive: true });
    const keepPath = path.join(cfgDir, 'Custom.java');
    fs.writeFileSync(keepPath, '// keep me', 'utf-8');
    await generateWith('task');
    expect(fs.existsSync(keepPath)).toBe(true);
  });

  it('unknown child table name rejects with all valid names listed', async () => {
    await expect(generateWith('no_such_table')).rejects.toThrow(/no_such_table/);
    await expect(generateWith('no_such_table')).rejects.toThrow(/lootitem/);
  });

  it('defaults: pkg=com.jedi.gameServer.mapper, child=empty; dir honored', async () => {
    // dir 显式传 outDir（默认值 'mapper' 是相对 cwd 的路径，不适合测试断言）
    const gen = new JavaMapperGenerator(mockParameter({ dir: outDir }));
    await gen.generate(await makeContext());
    CachedFiles.finalExit();
    const base = path.join(outDir, ...'com.jedi.gameServer.mapper'.split('.'));
    expect(fs.existsSync(path.join(base, 'raw', 'CfgMapperInit.java'))).toBe(true);
    // 无 child 参数 → cfg/ 目录为空（不生成子类）
    expect(fs.existsSync(path.join(base, 'cfg', 'Tasks.java'))).toBe(false);
  });

  it('cleans stale files in raw/ and bean/ but keeps them generated', async () => {
    const staleRaw = path.join(baseDir(), 'raw', 'RawStale.java');
    const staleBean = path.join(baseDir(), 'bean', 'StaleBean.java');
    fs.mkdirSync(path.dirname(staleRaw), { recursive: true });
    fs.mkdirSync(path.dirname(staleBean), { recursive: true });
    fs.writeFileSync(staleRaw, '// stale', 'utf-8');
    fs.writeFileSync(staleBean, '// stale', 'utf-8');

    await generateWith('task');

    expect(fs.existsSync(staleRaw)).toBe(false);
    expect(fs.existsSync(staleBean)).toBe(false);
    expect(fs.existsSync(path.join(baseDir(), 'raw', 'RawTasks.java'))).toBe(true);
  });
});
