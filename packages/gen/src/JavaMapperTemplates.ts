/**
 * JavaMapperTemplates — javamapper 生成器的纯函数模板（输入输出均为字符串，不碰 IO）。
 *
 * Task 3 POJO 部分：
 * - genPojoClass      struct bean / interface impl bean
 * - genInterfacePojo  interface bean（$type 静态工厂分发）
 *
 * Task 4 raw 表类：
 * - genRawClass       每表一个 RawXxx 单例（行类嵌套 + tableMap + init/PBData + 查询）
 *
 * 与 java generator（javaTemplates.ts）不共用模板层，但都只调公共层
 * （JavaMapperName/JavaTypeUtil）。
 *
 * 生成代码契约（JSON 契约来自 -gen sql 的 ValueToJson）：
 * - 字段 private final，构造器包私有，静态工厂 `_parse(JSONObject)` 是唯一公开入口：
 *   先逐字段解析到局部变量（局部变量名=字段名，参数即局部），最后 new 构造器。
 * - 仅 getter，无 setter（行对象不可变，配置是全局共享只读数据）。
 * - map 字段：SQL 里 VMap 存的是 [{"$type":"$entry","key":..,"value":..}] 数组，
 *   fastjson TypeReference 解不了 → 手写 LinkedHashMap 循环；value 为 struct/interface
 *   时对象在 $entry 的 "value" 字段下（`Xxx._parse(e.getJSONObject("value"))`）。
 *   list 元素为 struct/interface 时无 $entry 包装，直接 `Xxx._parse(e)`。
 * - key/value/元素的标量读取表达式由模板内联的 scalarReadExpr 生成
 *   （parseExpr 固定 `o.` 前缀，对不上循环变量 `e.`，且 map/struct 容器本就 throw）。
 * - bean 类互相引用一律 FQN（不 import）；顶层 import fastjson2：
 *   JSON（基础 list，按需）/JSONObject（_parse 签名恒引用，无条件输出）。
 * - $type 匹配用 schema fullName 精确相等（防同名 impl 嵌套歧义），常量在前的
 *   equals 保证 $type 缺失（null）不 NPE，不匹配抛 IllegalArgumentException。
 *
 * genRawClass 契约：
 * - 模板零 schema 类依赖：只调 rowReadExpr/mapperFieldType 两个纯函数（接收
 *   FieldType 值，无 schema import）；其余类型信息由模型烘焙。
 * - 行类 `public static class RawXxx` 嵌套：final 字段、包私有构造器读 `recored`
 *   （SQL 列语义：bool=tinyint!=0；list/map/引用列为 JSON 文本）、仅 getter、
 *   toString "()" 拼接；单主键有 `key()`，多主键用嵌套 Key 类（Objects.hash +
 *   instanceof equals，数值 ==、对象 .equals()）。
 * - 外层单例（Holder）持有 tableMap（Map<Object, Row>）；枚举常量烘焙为
 *   public static final int/String；getByName 仅当模型 enumGetByName=true；
 *   uniqueKey 索引为单字段 Map<Object, Row> + 类型化 getByXxx（v1 契约）。
 * - init()：DataStoreCompat.queryStaticList + for 循环装配 + PBData 列定义/记录
 *   推送 + CfgVersions.AddCfgPBInfo；有枚举常量时末尾行数校验（enum drift）。
 * - 查询：getByKey(…)/静态 get（仅单主键）/all()；FK ref getter get<Xxx>Ref
 *   是行类实例方法（argExprs 引用行字段），委托目标 raw 单例。
 */

import type { FieldType } from '@cfgforge/schema';
import { Primitive, isStructRef } from '@cfgforge/schema';
import { upper1 } from '@cfgforge/shared';

import { mapperFieldType, parseExpr, rowReadExpr } from './JavaMapperName';
import { boxTypeOf, type TypeOpts } from './JavaTypeUtil';
import type {
  PojoFieldModel,
  PojoModel,
  InterfacePojoModel,
  RawTableModel,
  RawFieldModel,
} from './JavaMapperModel';

// ---------------------------------------------------------------------------
// Task 5：child 子类 / CfgMapperInit 模型
// ---------------------------------------------------------------------------

/** cfg/ 下手写扩展子类：永不清理永不覆盖（存在即跳过） */
export interface ChildModel {
  pkg: string; // ...mapper.cfg
  className: string; // Tasks
  rawClassFqn: string; // ...mapper.raw.RawTasks
}

export interface InitAllModel {
  pkg: string; // ...mapper.raw
  /** sortedTables 顺序；initFqn=child 存在时用 child */
  rows: { rawFqn: string; initFqn: string }[];
  /** 每表一块 verifyRefs 校验目标 */
  verifyTargets: {
    rawFqn: string;
    rowFqn: string;
    /** 本表 sql 表名（错误消息前缀 cfg_task） */
    sqlTable: string;
    fields: {
      /** FK 字段名 */
      field: string;
      /** ref getter 方法名（get<Xxx>Ref） */
      refGetter: string;
      /** 目标表 sql 名（错误消息 -> missing） */
      refSqlTable: string;
      /** nullable FK 不校验（null 合法） */
      nullable: boolean;
      /** 非空判断语义：'num'（int/long/float != 0）或 'str'（!= null && !isEmpty()） */
      keyExpr: string;
    }[];
  }[];
}

// ---------------------------------------------------------------------------
// genPojoClass — struct bean / interface impl bean
// ---------------------------------------------------------------------------

export function genPojoClass(m: PojoModel, opts: TypeOpts): string {
  const o = requireResolveNameable(opts);

  const L: string[] = [];
  L.push(`package ${m.pkg};`);
  L.push('');

  // imports：JSONObject 无条件输出（_parse(JSONObject o) 签名恒引用，即使字段为空），
  // JSON 仅基础 list 用到时输出；bean 互相引用用 FQN，不 import
  const uses = analyzeFieldUsage(m.fields);
  L.push('import com.alibaba.fastjson2.JSONObject;');
  if (uses.json) L.push('import com.alibaba.fastjson2.JSON;');
  L.push('');

  // class decl
  if (m.isInterfaceImpl) {
    L.push(`public class ${m.className} implements ${m.interfaceFqn} {`);
  } else {
    L.push(`public class ${m.className} {`);
  }
  L.push('');

  // type()：仅 hasEnumRef 的 interface 的 impl 生成（enumRefType 非空即视为需要）
  if (m.isInterfaceImpl && m.enumRefType !== null && m.enumRefConstName !== null) {
    L.push(`    @Override`);
    L.push(`    public ${m.enumRefType} type() {`);
    L.push(`        return ${m.enumRefType}.${m.enumRefConstName};`);
    L.push(`    }`);
    L.push('');
  }

  // field declarations
  for (const f of m.fields) {
    if (f.comment.length > 0) {
      L.push(`    /**`);
      for (const line of f.comment.split('\n')) {
        L.push(`     * ${line}`);
      }
      L.push(`     */`);
    }
    L.push(`    private final ${fieldDeclType(f, o)} ${f.name};`);
  }
  L.push('');

  // package-private constructor
  L.push(`    ${m.className}(${m.fields.map((f) => `${fieldDeclType(f, o)} ${f.name}`).join(', ')}) {`);
  for (const f of m.fields) {
    L.push(`        this.${f.name} = ${f.name};`);
  }
  L.push(`    }`);
  L.push('');

  // static factory _parse：先解析到局部变量，最后 new
  L.push(`    public static ${m.className} _parse(JSONObject o) {`);
  for (const f of m.fields) {
    genParseLocal(L, f, o);
  }
  L.push(`        return new ${m.className}(${m.fields.map((f) => f.name).join(', ')});`);
  L.push(`    }`);
  L.push('');

  // getters（仅 getter，无 setter）
  for (const f of m.fields) {
    L.push(`    public ${fieldDeclType(f, o)} get${upper1(f.name)}() {`);
    L.push(`        return ${f.name};`);
    L.push(`    }`);
    L.push('');
  }

  // toString："(" + f1 + "," + f2 + ... + ")"
  L.push(`    @Override`);
  L.push(`    public String toString() {`);
  if (m.fields.length === 0) {
    L.push(`        return "()";`);
  } else {
    L.push(`        return "(" + ${m.fields.map((f) => f.name).join(' + "," + ')} + ")";`);
  }
  L.push(`    }`);

  L.push(`}`);
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// genInterfacePojo — interface bean（$type 静态工厂分发）
// ---------------------------------------------------------------------------

export function genInterfacePojo(m: InterfacePojoModel, opts: TypeOpts): string {
  requireResolveNameable(opts);

  const L: string[] = [];
  L.push(`package ${m.pkg};`);
  L.push('');
  L.push(`import com.alibaba.fastjson2.JSONObject;`);
  L.push('');

  L.push(`public interface ${m.className} {`);
  L.push('');

  L.push(`    static ${m.className} _parse(JSONObject o) {`);
  L.push(`        String type = o.getString("$type");`);
  for (const impl of m.impls) {
    // $type 存 schema fullName，精确相等匹配（防 ConditionAnd 嵌套同名歧义）；
    // 常量在前的 equals：$type 缺失（null）走 throw 分支而非 NPE
    L.push(`        if ("${impl.fullName}".equals(type)) return ${implFqn(m.pkg, impl.className)}._parse(o);`);
  }
  L.push(`        throw new IllegalArgumentException("${m.className} unknown $type: " + type);`);
  L.push(`    }`);

  L.push(`}`);
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// genRawClass — 每表一个 raw 单例类（Task 4）
// ---------------------------------------------------------------------------

export function genRawClass(m: RawTableModel, opts: TypeOpts): string {
  requireResolveNameable(opts);
  const row = m.names.rowClass;
  const raw = m.names.rawClass;
  const multiPk = m.pkFields.length > 1;
  // 行构造器内找不到的读取（list-of-ref/map-of-ref 的 refFqns 兜底）需要 refFqns
  const f = asPojoFields(m, opts);

  const L: string[] = [];
  L.push(`package ${m.pkg};`);
  L.push('');
  for (const imp of rawImports(m, f, opts)) L.push(`import ${imp};`);
  L.push('');
  L.push(`public class ${raw} {`);

  genRowClass(L, m, f, opts);
  if (multiPk) genKeyClass(L, m);

  // 枚举常量（int 优先，str 兜底；模板不猜命名，模型烘焙）
  for (const c of m.enumConstants ?? []) L.push(`    public static final int ${c.name} = ${c.value};`);
  for (const c of m.enumStrConstants ?? []) L.push(`    public static final String ${c.name} = "${c.value}";`);
  if ((m.enumConstants ?? []).length > 0 || (m.enumStrConstants ?? []).length > 0) L.push('');

  // tableMap + 单例 Holder
  L.push(`    public Map<Object, ${row}> tableMap;`);
  L.push(`    private static class Holder { static final ${raw} INSTANCE = new ${raw}(); }`);
  L.push(`    public static ${raw} getInstance() { return Holder.INSTANCE; }`);
  L.push('');

  // getByName（枚举名字段非主键时，模型 enumGetByName 标志）
  if (m.enumGetByName) {
    L.push(`    private Map<String, ${row}> nameMap;`);
    L.push(`    public ${row} getByName(String name) { return nameMap.get(name); }`);
    L.push('');
  }

  // uniqueKey 索引（v1 单字段契约：Map<Object, Row> + 类型化 getByXxx）
  for (const uk of m.uniqueKeys) {
    L.push(`    private Map<Object, ${row}> ${uk.mapField};`);
    L.push(`    public ${row} ${uk.getBy}(${uk.keyJavaType} ${uk.fields[0]}) { return ${uk.mapField}.get(${uk.fields[0]}); }`);
  }
  if (m.uniqueKeys.length > 0) L.push('');

  genRawInit(L, m);

  // getByKey / 静态 get（仅单主键）/ all
  L.push('');
  if (multiPk) {
    const params = m.pkFields.map((p) => `${rowScalarType(p)} ${p.name}`).join(', ');
    L.push(`    public ${row} getByKey(${params}) {`);
    L.push(`        return tableMap.get(new ${m.names.keyClass}(${m.pkFields.map((p) => p.name).join(', ')}));`);
    L.push(`    }`);
  } else {
    const pk = m.pkFields[0];
    L.push(`    public ${row} getByKey(${rowScalarType(pk)} ${pk.name}) {`);
    L.push(`        return tableMap.get(${pk.name});`);
    L.push(`    }`);
    L.push('');
    L.push(`    public static ${row} get(${rowScalarType(pk)} ${pk.name}) { return getInstance().getByKey(${pk.name}); }`);
  }
  L.push('');
  L.push(`    public static java.util.Collection<${row}> all() { return getInstance().tableMap.values(); }`);

  L.push('}');
  return L.join('\n');
}

/** 行类：public static 嵌套，final 字段 + 包私有构造器读 recored + key()/getter/toString */
function genRowClass(L: string[], m: RawTableModel, f: PojoFieldModel[], opts: TypeOpts): void {
  const row = m.names.rowClass;
  const multiPk = m.pkFields.length > 1;
  L.push(`    public static class ${row} {`);
  for (const fd of f) {
    if (fd.comment.length > 0) {
      L.push(`        /**`);
      for (const line of fd.comment.split('\n')) L.push(`         * ${line}`);
      L.push(`         */`);
    }
    L.push(`        private final ${fieldDeclType(fd, opts)} ${fd.name};`);
  }
  L.push('');
  L.push(`        ${row}(JSONObject recored) {`);
  for (const fd of f) {
    // list-of-ref / map-of-ref 经 refFqns 兜底注入 refClassName（生成器未填时）
    const patched = patchRefFqn(fd, m, opts);
    genJsonContainerLocal(L, fd.name, patched, 'recored', '            ', opts, true);
  }
  L.push(`        }`);
  L.push('');
  if (!multiPk) {
    L.push(`        public ${rowScalarType(m.pkFields[0])} key() {`);
    L.push(`            return ${m.pkFields[0].name};`);
    L.push(`        }`);
    L.push('');
  }
  for (const fd of f) {
    L.push(`        public ${fieldDeclType(fd, opts)} get${upper1(fd.name)}() {`);
    L.push(`            return ${fd.name};`);
    L.push(`        }`);
    L.push('');
  }

  // FK ref getter：行类实例方法（argExprs 引用 taskid 等行字段，外层单例作用域不可解析）；
  // 委托目标 raw 单例（目标表不在生成集合时 Generator 已过滤）
  for (const fk of m.fks) {
    const method = 'get' + upper1(fk.fieldName) + 'Ref';
    const target = fk.refRawFqn.substring(fk.refRawFqn.lastIndexOf('.') + 1);
    L.push(`        public ${fk.refRawFqn} ${method}() {`);
    L.push(`            return ${target}.getInstance().${fk.refMethod}(${fk.argExprs.join(', ')});`);
    L.push(`        }`);
    L.push('');
  }

  L.push(`        @Override`);
  L.push(`        public String toString() {`);
  if (f.length === 0) {
    L.push(`            return "()";`);
  } else {
    L.push(`            return "(" + ${f.map((fd) => fd.name).join(' + "," + ')} + ")";`);
  }
  L.push(`        }`);
  L.push(`    }`);
  L.push('');
}

/** 多主键 Key 类：final 字段、包私有构造器、Objects.hash、instanceof equals */
function genKeyClass(L: string[], m: RawTableModel): void {
  const key = m.names.keyClass;
  const pks = m.pkFields;
  L.push(`    public static class ${key} {`);
  for (const p of pks) L.push(`        private final ${rowScalarType(p)} ${p.name};`);
  L.push('');
  L.push(`        ${key}(${pks.map((p) => `${rowScalarType(p)} ${p.name}`).join(', ')}) {`);
  for (const p of pks) L.push(`            this.${p.name} = ${p.name};`);
  L.push(`        }`);
  L.push('');
  L.push(`        @Override`);
  L.push(`        public int hashCode() { return java.util.Objects.hash(${pks.map((p) => p.name).join(', ')}); }`);
  L.push('');
  L.push(`        @Override`);
  L.push(`        public boolean equals(Object other) {`);
  L.push(`            if (!(other instanceof ${key})) return false;`);
  L.push(`            ${key} o = (${key}) other;`);
  L.push(`            return ${pks.map((p) => keyFieldEqual(p)).join(' && ')};`);
  L.push(`        }`);
  L.push(`    }`);
  L.push('');
}

/** init()：MySQL 加载 + 行装配（tableMap/枚举 nameMap/uniqueKey map）+ PBData 推送 */
function genRawInit(L: string[], m: RawTableModel): void {
  const row = m.names.rowClass;
  const multiPk = m.pkFields.length > 1;
  const enumCount = m.enumConstants?.length ?? 0;
  L.push(`    public void init() {`);
  L.push(`        PBData.table_info.Builder infoBuilder = PBData.table_info.newBuilder();`);
  L.push(`        try {`);
  L.push(`            List<JSONObject> recoreds = DataStoreCompat.queryStaticList("select * from \`${m.names.sqlTable}\`");`);
  L.push(`            tableMap = new HashMap<>();`);
  if (m.enumGetByName) L.push(`            nameMap = new HashMap<>();`);
  for (const uk of m.uniqueKeys) L.push(`            ${uk.mapField} = new HashMap<>();`);
  L.push(`            for (JSONObject recored : recoreds) {`);
  L.push(`                ${row} newOne = new ${row}(recored);`);
  if (multiPk) {
    L.push(`                tableMap.put(new ${m.names.keyClass}(${m.pkFields.map((p) => `newOne.get${upper1(p.name)}()`).join(', ')}), newOne);`);
  } else {
    L.push(`                tableMap.put(newOne.key(), newOne);`);
  }
  if (m.enumGetByName) L.push(`                nameMap.put(recored.getString("${m.enumField}"), newOne);`);
  for (const uk of m.uniqueKeys) {
    L.push(`                ${uk.mapField}.put(newOne.get${upper1(uk.fields[0])}(), newOne);`);
  }
  if (enumCount > 0) {
    L.push(`                if (tableMap.size() != ${enumCount}) JLogger.error("${m.names.sqlTable} enum drift: rows=" + tableMap.size() + " expected=" + ${enumCount});`);
  }
  L.push(`                if (infoBuilder.getColoumsCount() == 0) {`);
  L.push(`                    for (Map.Entry<String, Object> entry : recored.entrySet()) {`);
  L.push(`                        PBData.coloum_value_type valueType = PBData.coloum_value_type.value_string;`);
  L.push(`                        if (entry.getValue() instanceof Integer) valueType = PBData.coloum_value_type.value_int;`);
  L.push(`                        else if (entry.getValue() instanceof Float) valueType = PBData.coloum_value_type.value_float;`);
  L.push(`                        infoBuilder.addColoums(PBData.coloum_define.newBuilder().setName(entry.getKey()).setType(valueType));`);
  L.push(`                    }`);
  L.push(`                }`);
  L.push(`                PBData.one_record.Builder recordBuilder = PBData.one_record.newBuilder();`);
  L.push(`                for (int i = 0; i < infoBuilder.getColoumsCount(); i++) {`);
  L.push(`                    String name = infoBuilder.getColoums(i).getName();`);
  L.push(`                    recordBuilder.addRecords(recored.getString(name));`);
  L.push(`                }`);
  L.push(`                infoBuilder.addRecords(recordBuilder);`);
  L.push(`            }`);
  L.push(`        } catch (Exception e) {`);
  L.push(`            JLogger.error(e.getMessage(), e);`);
  L.push(`        }`);
  L.push(`        CfgVersions.getInstance().AddCfgPBInfo("${m.names.sqlTable}", infoBuilder);`);
  L.push(`    }`);
}

// ---------------------------------------------------------------------------
// raw 专用 internal helpers
// ---------------------------------------------------------------------------

/** 固定 import（HashMap/List/Map/JSONObject/CfgVersions/DataStoreCompat/JLogger/PBData）+ 按需 JSON */
function rawImports(m: RawTableModel, fields: PojoFieldModel[], opts: TypeOpts): string[] {
  const cfgPkg = m.pkg.substring(0, m.pkg.lastIndexOf('.')) + '.cfg';
  const imports = [
    'java.util.HashMap',
    'java.util.List',
    'java.util.Map',
    'com.alibaba.fastjson2.JSONObject',
    `${cfgPkg}.CfgVersions`,
    'com.jedi.serverEngine.datastore.DataStoreCompat',
    'com.jedi.serverEngine.Logs.JLogger',
    'com.jedi.serverEngine.message.PBData',
  ];
  if (fields.some((f) => f.fieldKind === 'list' && !refFqnOf(f, opts))) {
    imports.push('com.alibaba.fastjson2.JSON'); // 基础 list：JSON.parseArray
  }
  return imports;
}

/** RawFieldModel 视为 PojoFieldModel（结构兼容，仅借用 fieldKind 分派） */
function asPojoFields(m: RawTableModel, _opts: TypeOpts): PojoFieldModel[] {
  void _opts;
  return m.fields as unknown as PojoFieldModel[];
}

/** list-of-ref / map-of-ref 的 refClassName 兜底：经 refFqns 查表注入（生成器可省填） */
function patchRefFqn(f: PojoFieldModel, m: RawTableModel, opts: TypeOpts): PojoFieldModel {
  if (f.refClassName || !m.refFqns || m.refFqns.size === 0) return f;
  if (f.fieldKind !== 'list' && f.fieldKind !== 'map') return f;
  const t = f.fieldKind === 'list' ? f.elemType : f.valueType;
  if (t === undefined || t === null || !isStructRef(t) || !t.obj) return f;
  const fqn = m.refFqns.get(t.obj.fullName()) ?? refFqnOf(f, opts);
  return fqn ? { ...f, refClassName: fqn } : f;
}

/** 行字段标量声明类型（与 genPojoClass 的 rawScalarType 同语义，raw 侧独立引用） */
function rowScalarType(f: RawFieldModel): string {
  return rawScalarType(f.type);
}

/** Key 字段相等判断：数值原始类型 ==，对象（String 等）.equals() */
function keyFieldEqual(p: RawFieldModel): string {
  const t = p.type;
  const useEq =
    t === Primitive.INT || t === Primitive.LONG || t === Primitive.FLOAT || t === Primitive.BOOL;
  return useEq ? `${p.name} == o.${p.name}` : `${p.name}.equals(o.${p.name})`;
}

// ---------------------------------------------------------------------------
// internal helpers
// ---------------------------------------------------------------------------

/** resolveNameable 必须始终注入（Task 2 审查裁决：默认命名有两条不一致路径，不再兜底） */
function requireResolveNameable(opts: TypeOpts): TypeOpts {
  if (!opts.resolveNameable) {
    throw new Error('JavaMapperTemplates requires opts.resolveNameable to be injected');
  }
  return opts;
}

/** impl 的 bean FQN：与接口同包（bean/<接口命名空间>/） */
function implFqn(interfacePkg: string, implClassName: string): string {
  return `${interfacePkg}.${implClassName}`;
}

/**
 * 字段声明类型（原始类型不装箱：字段/getter/构造器用 int，容器元素才装箱）。
 * golden: `private final int testInt;` / `java.util.List<Integer>`。
 */
function fieldDeclType(f: PojoFieldModel, opts: TypeOpts): string {
  switch (f.fieldKind) {
    case 'scalar':
      return rawScalarType(f.type);
    case 'struct':
    case 'interface':
      return f.refClassName!;
    case 'list':
      return `java.util.List<${simpleElemType(f, opts)}>`;
    case 'map':
      return `java.util.Map<${scalarBoxType(f.keyType!, opts)}, ${simpleElemType(f, opts)}>`;
  }
}

/** 基础标量的原始类型（容器元素请走 mapperFieldType 装箱版本） */
function rawScalarType(t: FieldType): string {
  switch (t) {
    case Primitive.BOOL:
      return 'boolean';
    case Primitive.INT:
      return 'int';
    case Primitive.LONG:
      return 'long';
    case Primitive.FLOAT:
      return 'float';
    default: // STRING / TEXT
      return 'String';
  }
}

/** list 元素 / map value 的声明类型：struct/interface 用 refClassName，基础用 mapperFieldType */
function simpleElemType(f: PojoFieldModel, opts: TypeOpts): string {
  if (f.refClassName) return f.refClassName;
  return mapperFieldType(f.elemType ?? f.valueType!, opts);
}

/** map key：schema 约定必为基础标量 */
function scalarBoxType(t: FieldType, opts: TypeOpts): string {
  return mapperFieldType(t, opts);
}

/**
 * 模板内联的标量读取表达式（循环变量版 parseExpr 的同构逻辑）。
 * parseExpr 固定 `o.` 前缀 + 对 map/struct 容器 throw，`$entry` 循环里
 * 的 key/value 与 struct 元素读取只能在此生成（jsonVar 为 `o` 或 `e`）。
 */
function scalarReadExpr(jsonVar: string, fieldName: string, t: FieldType): string {
  switch (t) {
    case Primitive.BOOL:
      return `${jsonVar}.getBooleanValue("${fieldName}")`;
    case Primitive.INT:
      return `${jsonVar}.getIntValue("${fieldName}")`;
    case Primitive.LONG:
      return `${jsonVar}.getLongValue("${fieldName}")`;
    case Primitive.FLOAT:
      return `${jsonVar}.getFloatValue("${fieldName}")`;
    default: // STRING / TEXT
      return `${jsonVar}.getString("${fieldName}")`;
  }
}

/** 生成"局部变量 = 解析表达式"（或 $entry/struct 元素循环块），push 到 L */
function genParseLocal(L: string[], f: PojoFieldModel, opts: TypeOpts): void {
  genJsonContainerLocal(L, f.name, f, 'o', '        ', opts);
}

/**
 * 生成 JSON 容器字段的"局部变量 = 解析表达式"（或循环块）。
 * Task 3 的 _parse 局部与 Task 4 的行类构造器共用：jsonVar 为 `o`（_parse，缩进 8）
 * 或 `recored`（行构造器，SQL 结果集行，缩进 12）。scalar 在 jsonVar=recored 时走
 * rowReadExpr（SQL 列语义，bool=tinyint!=0），否则走 parseExpr（JSON 值语义）；
 * 基础 list 与 $entry/引用元素循环两者读取语义一致（列值均为 JSON 文本）。
 * assignToThis=true（行构造器，Python golden 形态）：简单字段直接 `this.x = expr`，
 * 循环容器先局部变量再 `this.x = x`；false（_parse）保持局部变量形态。
 */
function genJsonContainerLocal(
  L: string[],
  name: string,
  f: PojoFieldModel,
  jsonVar: string,
  indent: string,
  opts: TypeOpts,
  assignToThis = false,
): void {
  const decl = fieldDeclType(f, opts);
  const fromRecord = jsonVar === 'recored';
  const inner = indent + '    ';
  switch (f.fieldKind) {
    case 'scalar': {
      const expr = fromRecord ? rowReadExpr(name, f.type) : parseExpr(name, f.type, opts);
      if (assignToThis) {
        L.push(`${indent}this.${name} = ${expr};`);
      } else {
        L.push(`${indent}${decl} ${name} = ${expr};`);
      }
      return;
    }
    case 'struct':
    case 'interface': {
      // struct/interface 单引用：`Fqn._parse(jsonVar.getJSONObject(...))`
      const fqn = refFqnOf(f, opts);
      const target = assignToThis ? `this.${name}` : `${decl} ${name}`;
      L.push(`${indent}${target} = ${fqn}._parse(${jsonVar}.getJSONObject("${name}"));`);
      return;
    }
    case 'list': {
      const fqn = refFqnOf(f, opts);
      if (fqn) {
        // struct/interface 元素 list：手写循环 + Fqn._parse(e)（顶层元素无 $entry 包装）
        L.push(`${indent}java.util.ArrayList<${fqn}> ${name} = new java.util.ArrayList<>();`);
        L.push(`${indent}for (JSONObject e : ${jsonVar}.getJSONArray("${name}").toJavaList(JSONObject.class)) {`);
        L.push(`${inner}${name}.add(${fqn}._parse(e));`);
        L.push(`${indent}}`);
        if (assignToThis) L.push(`${indent}this.${name} = ${name};`);
      } else {
        // 基础 list：JSON.parseArray（元素为包装类；行字段也是 JSON 文本列）
        const target = assignToThis ? `this.${name}` : `${decl} ${name}`;
        L.push(`${indent}${target} = JSON.parseArray(${jsonVar}.getString("${name}"), ${boxTypeOf(f.elemType!, opts)}.class);`);
      }
      return;
    }
    case 'map': {
      const fqn = refFqnOf(f, opts);
      // $entry 数组契约：手写循环（key/value 标量读取用内联 scalarReadExpr）
      L.push(`${indent}java.util.LinkedHashMap<${scalarBoxType(f.keyType!, opts)}, ${simpleElemType(f, opts)}> ${name} = new java.util.LinkedHashMap<>();`);
      L.push(`${indent}for (JSONObject e : ${jsonVar}.getJSONArray("${name}").toJavaList(JSONObject.class)) {`);
      const keyExpr = scalarReadExpr('e', 'key', f.keyType!);
      const valueExpr = fqn
        ? `${fqn}._parse(e.getJSONObject("value"))` // value 为 struct/interface：对象在 $entry 的 "value" 字段下
        : scalarReadExpr('e', 'value', f.valueType!);
      L.push(`${inner}${name}.put(${keyExpr}, ${valueExpr});`);
      L.push(`${indent}}`);
      if (assignToThis) L.push(`${indent}this.${name} = ${name};`);
      return;
    }
  }
}

/** struct/interface 引用 FQN：字段自带 refClassName 优先，否则经 opts.resolveNameable 解析 */
function refFqnOf(f: PojoFieldModel, opts: TypeOpts): string | null {
  if (f.refClassName) return f.refClassName;
  const t =
    f.fieldKind === 'list' ? f.elemType : f.fieldKind === 'map' ? f.valueType : f.type;
  if (t !== undefined && t !== null && isStructRef(t) && t.obj && opts.resolveNameable) {
    return opts.resolveNameable(t.obj);
  }
  return null;
}

// ---------------------------------------------------------------------------
// genChildClass — cfg/ 下手写扩展子类（Task 5）
// ---------------------------------------------------------------------------

/**
 * child 子类骨架：extends RawXxx，Holder 单例 + 空 prepareData() 钩子。
 * 生成后归用户所有（再跑生成器不覆盖），prepareData 是手写加工数据的入口。
 */
export function genChildClass(m: ChildModel): string {
  const L: string[] = [];
  L.push(`package ${m.pkg};`);
  L.push('');
  L.push(`public class ${m.className} extends ${m.rawClassFqn} {`);
  L.push(`    private static class Holder { static final ${m.className} INSTANCE = new ${m.className}(); }`);
  L.push(`    public static ${m.className} getInstance() { return Holder.INSTANCE; }`);
  L.push('');
  L.push(`    public void prepareData() {`);
  L.push(`    }`);
  L.push(`}`);
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// genInitAll — CfgMapperInit（Task 5）
// ---------------------------------------------------------------------------

/**
 * CfgMapperInit：initAll 按 sortedTables 顺序调各表 init（child 存在时调子类），
 * verifyRefs 校验非空 FK 引用完整性（int/long/float `!= 0`、str `!= null && !isEmpty()`，
 * nullable FK 不校验）。
 */
export function genInitAll(m: InitAllModel): string {
  const L: string[] = [];
  L.push(`package ${m.pkg};`);
  L.push('');
  L.push(`public class CfgMapperInit {`);
  L.push(`    private static class Holder { static final CfgMapperInit INSTANCE = new CfgMapperInit(); }`);
  L.push(`    public static CfgMapperInit getInstance() { return Holder.INSTANCE; }`);
  L.push('');
  L.push(`    public void initAll() {`);
  for (const row of m.rows) {
    L.push(`        ${row.initFqn}.getInstance().init();`);
  }
  L.push(`    }`);
  L.push('');
  L.push(`    public static java.util.List<String> verifyRefs() {`);
  L.push(`        java.util.List<String> errs = new java.util.ArrayList<>();`);
  for (const target of m.verifyTargets) {
    if (target.fields.length === 0) continue;
    L.push(`        for (${target.rowFqn} row : ${target.rawFqn}.getInstance().tableMap.values()) {`);
    for (const f of target.fields) {
      if (f.nullable) continue; // nullable FK：null 合法，不校验
      L.push(`            if (${nonEmptyCheck(f.field, f.keyExpr)} && row.${f.refGetter}() == null) {`);
      L.push(`                errs.add("${target.sqlTable} key=" + row.key() + " field=${f.field} -> ${f.refSqlTable} missing");`);
      L.push(`            }`);
    }
    L.push(`        }`);
  }
  L.push(`        return errs;`);
  L.push(`    }`);
  L.push(`}`);
  return L.join('\n');
}

/**
 * 非空判断表达式：数值 `getF() != 0`；str `getF() != null && !getF().isEmpty()`。
 * keyExpr 传 'str'（字符串语义）或 'num'（数值语义）。
 */
function nonEmptyCheck(field: string, keyExpr: string): string {
  const getter = `row.get${upper1(field)}()`;
  return keyExpr === 'str' ? `${getter} != null && !${getter}.isEmpty()` : `${getter} != 0`;
}

/** 统计字段解析用到的 fastjson2 符号（JSONObject 由 _parse 签名恒引用，模板无条件 import；此处只管 JSON 按需） */
function analyzeFieldUsage(fields: PojoFieldModel[]): { json: boolean } {
  const uses = { json: false };
  for (const f of fields) {
    if (f.fieldKind === 'list' && !f.refClassName) {
      uses.json = true; // 基础 list：JSON.parseArray
    }
  }
  return uses;
}
