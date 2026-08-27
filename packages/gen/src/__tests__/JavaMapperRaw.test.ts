import { describe, it, expect } from 'vitest';
import { genRawClass } from '../JavaMapperTemplates';
import type { RawTableModel } from '../JavaMapperModel';
import { Primitive, FList, FMap, StructRef, type Nameable } from '@cfgforge/schema';
import type { TypeOpts } from '../JavaTypeUtil';

/**
 * javamapper raw 表类模板单测 —— golden 字符串断言（Task 4）。
 *
 * 约定（控制者裁决）：
 * - RawFieldModel 沿用 fieldKind 模式，但保留原 schema FieldType（type）；
 *   模板允许调 rowReadExpr/mapperFieldType 两个纯函数（无 schema 类 import）。
 * - 行类嵌套 `public static class`，private final 字段，构造器包私有（读 recored）。
 * - 多主键 → 嵌套 Key 类（Objects.hash + instanceof equals）；单主键 → key() 返回字段值。
 * - 枚举常量由模型烘焙（enumConstants/enumStrConstants），模板不猜命名。
 * - v1 只支持单字段 uniqueKey（多字段由 Generator 过滤）。
 * - init()：for 循环 + PBData 列定义/记录推送；行数校验 enum drift。
 * - 静态 get 仅单主键；all() 恒生成；FK ref getter 方法名 get<Xxx>Ref。
 */

/** 测试用 Nameable stub：name 可带命名空间点号 */
function nameableOf(name: string): Nameable {
  const idx = name.lastIndexOf('.');
  const lastName = idx === -1 ? name : name.substring(idx + 1);
  return {
    name: () => name,
    fmt: () => ({}) as never,
    meta: () => ({}) as never,
    copy: () => nameableOf(name),
    comment: () => '',
    namespace: () => (idx === -1 ? '' : name.substring(0, idx)),
    lastName: () => lastName,
    fullName: () => name,
  };
}

const BEAN_PKG = 'com.jedi.gameServer.mapper.bean';
const RAW_PKG = 'com.jedi.gameServer.mapper.raw';

const OPTS: TypeOpts = {
  langSwitchText: false,
  resolveNameable: (n) => {
    const ns = n.namespace();
    const cls = n.lastName().charAt(0).toUpperCase() + n.lastName().slice(1);
    return ns ? `${BEAN_PKG}.${ns}.${cls}` : `${BEAN_PKG}.${cls}`;
  },
};

function structRefOf(fullName: string): StructRef {
  const ref = new StructRef(fullName);
  ref.obj = nameableOf(fullName);
  return ref;
}

// ---------------------------------------------------------------------------
// Fixture 1：单主键 + 枚举常量 + FK ref + 基础 list + struct 引用
// ---------------------------------------------------------------------------

const SINGLE_PK_MODEL: RawTableModel = {
  names: { rawClass: 'RawTasks', rowClass: 'RawTask', keyClass: 'RawTaskKey', childClass: 'Tasks', sqlTable: 'cfg_task' },
  pkg: RAW_PKG,
  beanPkg: BEAN_PKG,
  fields: [
    { name: 'taskid', type: Primitive.INT, comment: '任务id', fieldKind: 'scalar' },
    {
      name: 'name',
      type: new FList(Primitive.STRING),
      comment: '',
      fieldKind: 'list',
      elemType: Primitive.STRING,
    },
    {
      name: 'completecondition',
      type: structRefOf('task.completecondition.Completecondition'),
      comment: '',
      fieldKind: 'interface',
      refClassName: `${BEAN_PKG}.task.completecondition.Completecondition`,
    },
  ],
  pkFields: [{ name: 'taskid', type: Primitive.INT, comment: '任务id', fieldKind: 'scalar' }],
  uniqueKeys: [],
  fks: [
    {
      fieldName: 'taskextraexp',
      refRawFqn: `${RAW_PKG}.RawTaskextraexps`,
      refMethod: 'getByKey',
      nullable: false,
      argExprs: ['taskid'],
    },
  ],
  refFqns: new Map([
    ['task.completecondition.Completecondition', `${BEAN_PKG}.task.completecondition.Completecondition`],
  ]),
  isEnumTable: false,
  enumField: null,
  enumGetByName: false,
  enumConstants: [
    { name: 'KILL_MONSTER', value: 1 },
    { name: 'TALK_NPC', value: 2 },
  ],
  enumStrConstants: null,
};

describe('genRawClass: single pk + enum constants + FK ref', () => {
  const out = genRawClass(SINGLE_PK_MODEL, OPTS);

  it('package + fixed 7 imports (+JSON for basic list)', () => {
    expect(out).toContain(`package ${RAW_PKG};`);
    expect(out).toContain('import java.util.HashMap;');
    expect(out).toContain('import java.util.List;');
    expect(out).toContain('import java.util.Map;');
    expect(out).toContain('import com.alibaba.fastjson2.JSONObject;');
    expect(out).toContain('import com.alibaba.fastjson2.JSON;');
    expect(out).toContain('import com.jedi.gameServer.mapper.cfg.CfgVersions;');
    expect(out).toContain('import com.jedi.serverEngine.datastore.DataStoreCompat;');
    expect(out).toContain('import com.jedi.serverEngine.Logs.JLogger;');
    expect(out).toContain('import com.jedi.serverEngine.message.PBData;');
  });

  it('nested row class: public static, final fields, package-private ctor reads recored', () => {
    expect(out).toContain('public class RawTasks {');
    expect(out).toContain('    public static class RawTask {');
    expect(out).toContain('        private final int taskid;');
    expect(out).toContain('        private final java.util.List<String> name;');
    expect(out).toContain(
      `        private final ${BEAN_PKG}.task.completecondition.Completecondition completecondition;`,
    );
    expect(out).toContain('        RawTask(JSONObject recored) {');
    expect(out).toContain('            this.taskid = recored.getIntValue("taskid");');
    expect(out).toContain(
      '            this.name = JSON.parseArray(recored.getString("name"), String.class);',
    );
    expect(out).toContain(
      `            this.completecondition = ${BEAN_PKG}.task.completecondition.Completecondition._parse(recored.getJSONObject("completecondition"));`,
    );
  });

  it('single pk: key() returns the pk field, no Key class', () => {
    expect(out).toContain('        public int key() {');
    expect(out).toContain('            return taskid;');
    expect(out).not.toContain('class RawTaskKey');
  });

  it('getters only, no setters', () => {
    expect(out).toContain('        public int getTaskid() {');
    expect(out).not.toContain('setTaskid');
    expect(out).not.toContain('setCompletecondition');
  });

  it('toString joins all fields with commas in parens', () => {
    expect(out).toContain('return "(" + taskid + "," + name + "," + completecondition + ")";');
  });

  it('tableMap + Holder singleton', () => {
    expect(out).toContain('    public Map<Object, RawTask> tableMap;');
    expect(out).toContain('    private static class Holder { static final RawTasks INSTANCE = new RawTasks(); }');
    expect(out).toContain('    public static RawTasks getInstance() { return Holder.INSTANCE; }');
  });

  it('enum constants baked as public static final int', () => {
    expect(out).toContain('    public static final int KILL_MONSTER = 1;');
    expect(out).toContain('    public static final int TALK_NPC = 2;');
  });

  it('init(): SQL query + row loop + PBData columns/records + AddCfgPBInfo', () => {
    expect(out).toContain('        PBData.table_info.Builder infoBuilder = PBData.table_info.newBuilder();');
    expect(out).toContain('        try {');
    expect(out).toContain('            List<JSONObject> recoreds = DataStoreCompat.queryStaticList("select * from `cfg_task`");');
    expect(out).toContain('            tableMap = new HashMap<>();');
    expect(out).toContain('            for (JSONObject recored : recoreds) {');
    expect(out).toContain('                RawTask newOne = new RawTask(recored);');
    expect(out).toContain('                tableMap.put(newOne.key(), newOne);');
    expect(out).toContain('                if (infoBuilder.getColoumsCount() == 0) {');
    expect(out).toContain('                    for (Map.Entry<String, Object> entry : recored.entrySet()) {');
    expect(out).toContain('                        PBData.coloum_value_type valueType = PBData.coloum_value_type.value_string;');
    expect(out).toContain('                        if (entry.getValue() instanceof Integer) valueType = PBData.coloum_value_type.value_int;');
    expect(out).toContain('                        else if (entry.getValue() instanceof Float) valueType = PBData.coloum_value_type.value_float;');
    expect(out).toContain(
      '                        infoBuilder.addColoums(PBData.coloum_define.newBuilder().setName(entry.getKey()).setType(valueType));',
    );
    expect(out).toContain('                PBData.one_record.Builder recordBuilder = PBData.one_record.newBuilder();');
    expect(out).toContain('                for (int i = 0; i < infoBuilder.getColoumsCount(); i++) {');
    expect(out).toContain('                    String name = infoBuilder.getColoums(i).getName();');
    expect(out).toContain('                    recordBuilder.addRecords(recored.getString(name));');
    expect(out).toContain('                infoBuilder.addRecords(recordBuilder);');
    expect(out).toContain('        } catch (Exception e) {');
    expect(out).toContain('            JLogger.error(e.getMessage(), e);');
    expect(out).toContain('        CfgVersions.getInstance().AddCfgPBInfo("cfg_task", infoBuilder);');
  });

  it('enum drift check after loop when enumConstants present', () => {
    expect(out).toContain('            if (tableMap.size() != 2) JLogger.error("cfg_task enum drift: rows=" + tableMap.size() + " expected=" + 2);');
  });

  it('queries: getByKey / static get / all', () => {
    expect(out).toContain('    public RawTask getByKey(int taskid) {');
    expect(out).toContain('        return tableMap.get(taskid);');
    expect(out).toContain('    public static RawTask get(int taskid) { return getInstance().getByKey(taskid); }');
    expect(out).toContain('    public static java.util.Collection<RawTask> all() { return getInstance().tableMap.values(); }');
  });

  it('FK ref getter delegates to target raw singleton', () => {
    expect(out).toContain(`    public ${RAW_PKG}.RawTaskextraexps getTaskextraexpRef() {`);
    expect(out).toContain('        return RawTaskextraexps.getInstance().getByKey(taskid);');
  });

  it('non-enum table: no getByName / nameMap', () => {
    expect(out).not.toContain('nameMap');
    expect(out).not.toContain('getByName');
  });
});

// ---------------------------------------------------------------------------
// Fixture 2：多主键 Key 类（int + String 混合字段）
// ---------------------------------------------------------------------------

const MULTI_PK_MODEL: RawTableModel = {
  names: {
    rawClass: 'RawTasklootitems',
    rowClass: 'RawTasklootitem',
    keyClass: 'RawTasklootitemKey',
    childClass: 'Tasklootitems',
    sqlTable: 'cfg_task_lootitem',
  },
  pkg: RAW_PKG,
  beanPkg: BEAN_PKG,
  fields: [
    { name: 'lootid', type: Primitive.INT, comment: '', fieldKind: 'scalar' },
    { name: 'itemid', type: Primitive.INT, comment: '', fieldKind: 'scalar' },
    { name: 'count', type: Primitive.INT, comment: '', fieldKind: 'scalar' },
  ],
  pkFields: [
    { name: 'lootid', type: Primitive.INT, comment: '', fieldKind: 'scalar' },
    { name: 'itemid', type: Primitive.INT, comment: '', fieldKind: 'scalar' },
  ],
  uniqueKeys: [],
  fks: [],
  refFqns: new Map(),
  isEnumTable: false,
  enumField: null,
  enumGetByName: false,
  enumConstants: null,
  enumStrConstants: null,
};

describe('genRawClass: composite pk Key class', () => {
  const out = genRawClass(MULTI_PK_MODEL, OPTS);

  it('nested Key class: final fields + package-private ctor', () => {
    expect(out).toContain('    public static class RawTasklootitemKey {');
    expect(out).toContain('        private final int lootid;');
    expect(out).toContain('        private final int itemid;');
    expect(out).toContain('        RawTasklootitemKey(int lootid, int itemid) {');
    expect(out).toContain('            this.lootid = lootid;');
    expect(out).toContain('            this.itemid = itemid;');
  });

  it('hashCode via Objects.hash, equals via instanceof + field compare', () => {
    expect(out).toContain('        @Override');
    expect(out).toContain('        public int hashCode() { return java.util.Objects.hash(lootid, itemid); }');
    expect(out).toContain('        @Override');
    expect(out).toContain('        public boolean equals(Object other) {');
    expect(out).toContain('            if (!(other instanceof RawTasklootitemKey)) return false;');
    expect(out).toContain('            RawTasklootitemKey o = (RawTasklootitemKey) other;');
    expect(out).toContain('            return lootid == o.lootid && itemid == o.itemid;');
  });

  it('row has no key(); multi-pk getByKey wraps new Key(...); no static get', () => {
    expect(out).not.toContain('key()');
    expect(out).toContain('    public RawTasklootitem getByKey(int lootid, int itemid) {');
    expect(out).toContain('        return tableMap.get(new RawTasklootitemKey(lootid, itemid));');
    expect(out).not.toContain('    public static RawTasklootitem get(');
    expect(out).toContain('    public static java.util.Collection<RawTasklootitem> all() { return getInstance().tableMap.values(); }');
  });

  it('tableMap.put uses new Key(...) with row getters', () => {
    expect(out).toContain('                tableMap.put(new RawTasklootitemKey(newOne.getLootid(), newOne.getItemid()), newOne);');
  });

  it('no enum constants, no drift check, no JSON import (no basic list)', () => {
    expect(out).not.toContain('public static final int');
    expect(out).not.toContain('enum drift');
    expect(out).not.toContain('import com.alibaba.fastjson2.JSON;');
  });
});

// ---------------------------------------------------------------------------
// Fixture 3：uniqueKey 索引 + getByName（枚举名字段非主键）
// ---------------------------------------------------------------------------

const UNIQUE_ENUM_MODEL: RawTableModel = {
  names: {
    rawClass: 'RawTaskcompleteconditiontypes',
    rowClass: 'RawTaskcompleteconditiontype',
    keyClass: 'RawTaskcompleteconditiontypeKey',
    childClass: 'Taskcompleteconditiontypes',
    sqlTable: 'cfg_task_completeconditiontype',
  },
  pkg: RAW_PKG,
  beanPkg: BEAN_PKG,
  fields: [
    { name: 'id', type: Primitive.INT, comment: '', fieldKind: 'scalar' },
    { name: 'name', type: Primitive.STRING, comment: '', fieldKind: 'scalar' },
    { name: 'rank', type: Primitive.INT, comment: '', fieldKind: 'scalar' },
    { name: 'attrMap', type: new FMap(Primitive.INT, Primitive.INT), comment: '', fieldKind: 'map', keyType: Primitive.INT, valueType: Primitive.INT },
  ],
  pkFields: [{ name: 'id', type: Primitive.INT, comment: '', fieldKind: 'scalar' }],
  uniqueKeys: [
    {
      fields: ['rank'],
      mapField: 'rankMap',
      getBy: 'getByRank',
      keyJavaType: 'int',
    },
  ],
  fks: [],
  refFqns: new Map(),
  isEnumTable: true,
  enumField: 'name',
  enumGetByName: true,
  enumConstants: [
    { name: 'KILLMONSTER', value: 1 },
    { name: 'TALKNPC', value: 2 },
    { name: 'PAYMONEY', value: 3 },
  ],
  enumStrConstants: null,
};

describe('genRawClass: uniqueKey index + getByName + $entry map loop', () => {
  const out = genRawClass(UNIQUE_ENUM_MODEL, OPTS);

  it('uniqueKey index map + typed getter', () => {
    expect(out).toContain('    private Map<Object, RawTaskcompleteconditiontype> rankMap;');
    expect(out).toContain('    public RawTaskcompleteconditiontype getByRank(int rank) {');
    expect(out).toContain('    public RawTaskcompleteconditiontype getByRank(int rank) { return rankMap.get(rank); }');
  });

  it('getByName generated when enum field is not the pk', () => {
    expect(out).toContain('    private Map<String, RawTaskcompleteconditiontype> nameMap;');
    expect(out).toContain('    public RawTaskcompleteconditiontype getByName(String name) {');
    expect(out).toContain('    public RawTaskcompleteconditiontype getByName(String name) { return nameMap.get(name); }');
  });

  it('init loop fills nameMap/rankMap; maps init before loop', () => {
    expect(out).toContain('            nameMap = new HashMap<>();');
    expect(out).toContain('            rankMap = new HashMap<>();');
    expect(out).toContain('                nameMap.put(recored.getString("name"), newOne);');
    expect(out).toContain('                rankMap.put(newOne.getRank(), newOne);');
  });

  it('map field read: $entry loop in row ctor', () => {
    expect(out).toContain(
      '            java.util.LinkedHashMap<Integer, Integer> attrMap = new java.util.LinkedHashMap<>();',
    );
    expect(out).toContain(
      '            for (JSONObject e : recored.getJSONArray("attrMap").toJavaList(JSONObject.class)) {',
    );
    expect(out).toContain('                attrMap.put(e.getIntValue("key"), e.getIntValue("value"));');
    expect(out).toContain('            this.attrMap = attrMap;');
  });

  it('enum drift check counts 3', () => {
    expect(out).toContain(
      '            if (tableMap.size() != 3) JLogger.error("cfg_task_completeconditiontype enum drift: rows=" + tableMap.size() + " expected=" + 3);',
    );
  });

  it('single pk still has key() + static get', () => {
    expect(out).toContain('            return id;');
    expect(out).toContain('    public static RawTaskcompleteconditiontype get(int id) { return getInstance().getByKey(id); }');
  });
});

// ---------------------------------------------------------------------------
// enumStrConstants + 基础标量读取形态（bool tinyint / long / float）
// ---------------------------------------------------------------------------

describe('genRawClass: enumStrConstants + scalar read forms', () => {
  const out = genRawClass(
    {
      names: { rawClass: 'RawWeeklys', rowClass: 'RawWeekly', keyClass: 'RawWeeklyKey', childClass: 'Weeklys', sqlTable: 'cfg_weekly' },
      pkg: RAW_PKG,
      beanPkg: BEAN_PKG,
      fields: [
        { name: 'id', type: Primitive.INT, comment: '', fieldKind: 'scalar' },
        { name: 'name', type: Primitive.STRING, comment: '', fieldKind: 'scalar' },
        { name: 'open', type: Primitive.BOOL, comment: '', fieldKind: 'scalar' },
        { name: 'starttime', type: Primitive.LONG, comment: '', fieldKind: 'scalar' },
        { name: 'rate', type: Primitive.FLOAT, comment: '', fieldKind: 'scalar' },
      ],
      pkFields: [{ name: 'id', type: Primitive.INT, comment: '', fieldKind: 'scalar' }],
      uniqueKeys: [],
      fks: [],
      refFqns: new Map(),
      isEnumTable: true,
      enumField: 'name',
      enumGetByName: false, // name 是主键时 Generator 置 false（此处直接测 false 分支）
      enumConstants: null,
      enumStrConstants: [
        { name: 'MONDAY', value: 'monday' },
        { name: 'SUNDAY', value: 'sunday' },
      ],
    },
    OPTS,
  );

  it('string enum constants as public static final String', () => {
    expect(out).toContain('    public static final String MONDAY = "monday";');
    expect(out).toContain('    public static final String SUNDAY = "sunday";');
    expect(out).not.toContain('public static final int ');
  });

  it('enumGetByName=false suppresses getByName/nameMap even on enum table', () => {
    expect(out).not.toContain('nameMap');
    expect(out).not.toContain('getByName');
  });

  it('scalar reads use SQL semantics: bool tinyint != 0, getLongValue/getFloatValue', () => {
    expect(out).toContain('            this.open = (recored.getIntValue("open") != 0);');
    expect(out).toContain('            this.starttime = recored.getLongValue("starttime");');
    expect(out).toContain('            this.rate = recored.getFloatValue("rate");');
    expect(out).toContain('        public int key() {');
    expect(out).toContain('            return id;');
  });

  it('no drift check when enumConstants null (string constants only)', () => {
    expect(out).not.toContain('enum drift');
  });

  it('no JSON import when no basic list field', () => {
    expect(out).not.toContain('import com.alibaba.fastjson2.JSON;');
  });
});
