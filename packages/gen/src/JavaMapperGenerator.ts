/**
 * JavaMapperGenerator — `-gen javamapper`（Task 5：主类拼装）。
 *
 * 生成目录结构（dir/pkg/ 下）：
 * - bean/  可达 POJO：struct bean、interface bean（$type 工厂）、interface impl bean
 * - raw/   每表一个 RawXxx 单例 + CfgMapperInit（initAll/verifyRefs）
 * - cfg/   child 参数指定的表生成子类骨架（永不清理永不覆盖）
 *
 * 主流程：
 * 1. child 表名校验（分号分隔；不存在 → throw，信息含全部合法表名）
 * 2. sortedTables() → RawTableModel；表字段递归收集可达 POJO（防重防环）
 * 3. 写 bean/（CachedFiles）→ 写 raw/ → 写 cfg/（存在即跳过）
 * 4. keepMetaAndDeleteOtherFiles 仅对 rawDir/beanDir；cfgDir 不清理
 *
 * 模型层做全部类型分析，模板零 schema 依赖（Task 1 契约）：
 * - fieldKind 由 FieldType 谓词 + StructRef.obj instanceof InterfaceSchema 判定
 * - bean FQN = beanPkg + schema 命名空间路径 + upperStartSegments(lastName)
 *   （同一 resolveNameable 闭包同时供 POJO _parse 与 raw 行字段引用，保证一致）
 * - 枚举常量来源 vTable.enumNameToIntegerValueMap（数据行）；为 null 且
 *   enumNames 非空时 enumStrConstants（name→name 自身）
 * - FK 仅当目标表在生成集合中才加入 fks；isRefUniq 的目标方法名 getBy + upper1(字段名)
 */

import * as path from 'path';
import * as fs from 'fs';

import { CachedFiles, Logger } from '@cfgforge/shared';
import type { Context } from '@cfgforge/context';
import type { CfgValue, VTable } from '@cfgforge/value';
import type {
  FieldType,
  FieldSchema,
  Nameable,
  Fieldable,
  InterfaceSchema,
  ForeignKeySchema,
} from '@cfgforge/schema';
import {
  Primitive,
  isPrimitive,
  isStructRef,
  isFList,
  isFMap,
  isEEnum,
  isRefPrimary,
  isRefUniq,
  InterfaceSchema as InterfaceSchemaClass,
} from '@cfgforge/schema';
import type { Parameter } from './Parameter';
import { GeneratorWithTag } from './GeneratorWithTag';
import { upper1 } from '@cfgforge/shared';
import { sqlTableName } from './SqlRender';
import { upperStartSegments, enumFieldNameOf, type TypeOpts } from './JavaTypeUtil';
import { mapperNames, mapperFieldType } from './JavaMapperName';
import type {
  PojoModel,
  PojoFieldModel,
  InterfacePojoModel,
  RawTableModel,
  RawFieldModel,
  RawUniqueKeyModel,
  RawFkModel,
} from './JavaMapperModel';
import { genPojoClass, genInterfacePojo, genRawClass, genChildClass, genInitAll } from './JavaMapperTemplates';

export class JavaMapperGenerator extends GeneratorWithTag {
  readonly dir: string;
  readonly pkg: string;
  readonly child: string;
  readonly encoding: string;

  constructor(parameter: Parameter) {
    super(parameter);
    this.dir = parameter.get('dir', 'mapper');
    this.pkg = parameter.get('pkg', 'com.jedi.gameServer.mapper');
    this.child = parameter.get('child', '');
    this.encoding = parameter.get('encoding', 'UTF-8');
    if (this.encoding.length === 0) {
      throw new Error("javamapper: parameter 'encoding' must not be empty");
    }
  }

  async generate(ctx: Context): Promise<void> {
    const cfgValue: CfgValue = ctx.makeValueWithTag(this.tag);
    // pkg 所有点映射为目录分隔（'com.a.b' → 'com/a/b'；replace 单点只替换首个）
    const dstDir = path.join(this.dir, ...this.pkg.split('.'));

    const beanPkg = `${this.pkg}.bean`;
    const rawPkg = `${this.pkg}.raw`;
    const cfgPkg = `${this.pkg}.cfg`;
    const beanDir = path.join(dstDir, 'bean');
    const rawDir = path.join(dstDir, 'raw');
    const cfgDir = path.join(dstDir, 'cfg');

    // ---- 1. child 表名校验（分号分隔）----
    const sortedTables = cfgValue.sortedTables();
    const childNames = this.child.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
    for (const name of childNames) {
      if (cfgValue.getTable(name) === undefined) {
        const valid = sortedTables.map((t) => t.name()).join(', ');
        throw new Error(`javamapper: child table '${name}' not found (valid tables: ${valid})`);
      }
    }

    // ---- 2. 收集模型 ----
    // resolveNameable：schema 命名空间 → bean 子包路径；类名与 bean 文件名一致。
    // POJO _parse 与 raw 行字段引用共用同一闭包，保证 FQN 一致。
    const beanFqnCache = new Map<string, string>();
    const opts: TypeOpts = {
      langSwitchText: false,
      resolveNameable: (n: Nameable) => this.beanFqnOf(n, beanPkg, beanFqnCache),
    };

    const tableNames = new Set(sortedTables.map((t) => t.name()));
    const rawModels: RawTableModel[] = [];
    // 可达 POJO 收集（WorkSet 防重防环；interface 收集全部 impl）
    const pojos: PojoModel[] = [];
    const ifacePojos: InterfacePojoModel[] = [];
    const seenSchemas = new Set<string>(); // schema.fullName() → 已收集

    const collectPojo = (nameable: Fieldable): void => {
      const fullName = nameable.fullName();
      if (seenSchemas.has(fullName)) return;
      seenSchemas.add(fullName);

      if (nameable instanceof InterfaceSchemaClass) {
        const iface = nameable as InterfaceSchema;
        // enumRef 指向的枚举表 raw FQN（type() 返回类型）
        let enumRefTableFqn: string | null = null;
        const enumRefTable = iface.nullableEnumRefTable();
        if (enumRefTable !== null && tableNames.has(enumRefTable.name())) {
          enumRefTableFqn = `${rawPkg}.${mapperNames(enumRefTable.name()).rawClass}`;
        }
        // interface 与 impl 同包：bean/<interface fullName>/（impl 的 fullName 命名空间
        // = interface fullName，见 StructSchema.fullName；Task 3 模板契约 implFqn 同包分发）
        const ifaceNsPath = iface.fullName();
        ifacePojos.push({
          pkg: `${beanPkg}${pkgSuffixOf(ifaceNsPath)}`,
          className: upperStartSegments(iface.lastName()),
          impls: iface.impls().map((impl) => ({
            className: upperStartSegments(impl.lastName()),
            fullName: impl.fullName(),
            namespacePath: nsPathOf(impl),
          })),
          enumRefTableFqn,
          hasEnumRef: enumRefTableFqn !== null,
        });
        for (const impl of iface.impls()) {
          collectPojo(impl);
        }
        return;
      }

      // StructSchema（含 interface impl）
      const struct = nameable as import('@cfgforge/schema').StructSchema;
      const nullableIface = struct.nullableInterface();
      const isImpl = nullableIface !== null;
      let enumRefType: string | null = null;
      let enumRefConstName: string | null = null;
      if (isImpl) {
        const enumRefTable = nullableIface!.nullableEnumRefTable();
        if (enumRefTable !== null && tableNames.has(enumRefTable.name())) {
          enumRefType = `${rawPkg}.${mapperNames(enumRefTable.name()).rawClass}`;
          // 常量名 = impl 的 schema 名大写化（enumFieldNameOf(implName, false)）
          enumRefConstName = enumFieldNameOf(struct.name(), false);
        }
      }
      pojos.push({
        pkg: `${beanPkg}${pkgSuffixOf(nsPathOf(struct))}`,
        className: upperStartSegments(struct.lastName()),
        fields: struct.fields().map((f) => this.pojoFieldOf(f, opts)),
        isInterfaceImpl: isImpl,
        interfaceFqn: isImpl
          ? `${beanPkg}${pkgSuffixOf(nullableIface!.fullName())}.${upperStartSegments(nullableIface!.lastName())}`
          : null,
        enumRefType,
        enumRefFieldName: isImpl ? struct.name() : null,
        enumRefConstName,
        namespacePath: nsPathOf(struct),
      });
      // 递归收集字段引用的 struct/interface（防环：seenSchemas 已登记）
      for (const f of struct.fields()) {
        for (const ref of this.fieldRefTargets(f)) {
          collectPojo(ref);
        }
      }
    };

    for (const vTable of sortedTables) {
      // 表字段可达 POJO
      for (const f of vTable.schema.fields()) {
        for (const ref of this.fieldRefTargets(f)) {
          collectPojo(ref);
        }
      }
      rawModels.push(this.rawModelOf(vTable, sortedTables, tableNames, beanPkg, rawPkg, opts));
    }

    // ---- 3. 写 bean/ ----
    for (const pojo of pojos) {
      const content = genPojoClass(pojo, opts);
      const rel = pojo.namespacePath ? path.join(...pojo.namespacePath.split('.'), `${pojo.className}.java`) : `${pojo.className}.java`;
      this.writeCode(path.join(beanDir, rel), content);
    }
    for (const ifacePojo of ifacePojos) {
      const content = genInterfacePojo(ifacePojo, opts);
      // interface 的包 = 其 fullName 命名空间（impls 同包）；pkg 去掉 beanPkg 前缀即子包路径
      const nsPath = ifacePojo.pkg === beanPkg ? '' : ifacePojo.pkg.substring(beanPkg.length + 1);
      this.writeCode(
        path.join(beanDir, ...(nsPath ? nsPath.split('.') : []), `${ifacePojo.className}.java`),
        content,
      );
    }

    // ---- 4. 写 raw/ ----
    for (const m of rawModels) {
      const content = genRawClass(m, opts);
      this.writeCode(path.join(rawDir, `${m.names.rawClass}.java`), content);
    }

    // CfgMapperInit：initAll 按 sortedTables 顺序（child 存在时 init 调子类）；
    // verifyRefs 校验非空简单 FK（int/long/float `!= 0`、str `!= null && !isEmpty()`）
    const rawFqnOfTable = new Map(sortedTables.map((t) => [t.name(), `${rawPkg}.${mapperNames(t.name()).rawClass}`]));
    {
      const rows = sortedTables.map((t) => {
        const rawFqn = rawFqnOfTable.get(t.name())!;
        const isChild = childNames.includes(t.name());
        return { rawFqn, initFqn: isChild ? `${cfgPkg}.${mapperNames(t.name()).childClass}` : rawFqn };
      });
      const verifyTargets = sortedTables.map((t) => {
        const rawFqn = rawFqnOfTable.get(t.name())!;
        const names = mapperNames(t.name());
        const fields: {
          field: string; refGetter: string; refSqlTable: string; nullable: boolean; keyExpr: string;
        }[] = [];
        for (const fk of t.schema.foreignKeys()) {
          const refTableSchema = fk.refTableSchema();
          if (refTableSchema === null || !tableNames.has(refTableSchema.name())) continue;
          if (!(isRefPrimary(fk.refKey) || isRefUniq(fk.refKey))) continue; // RefList 不校验
          const nullable = (fk.refKey as { nullable: boolean }).nullable;
          for (const kf of fk.key.fieldSchemas() ?? []) {
            if (!isPrimitive(kf.type)) continue; // 容器/引用 key 不校验
            fields.push({
              field: kf.name,
              refGetter: 'get' + upper1(kf.name) + 'Ref',
              refSqlTable: sqlTableName(refTableSchema.name(), 'cfg_'),
              nullable,
              keyExpr: kf.type === Primitive.STRING || kf.type === Primitive.TEXT ? 'str' : 'num',
            });
          }
        }
        return { rawFqn, rowFqn: `${rawFqn}.${names.rowClass}`, sqlTable: names.sqlTable, fields };
      });
      const content = genInitAll({ pkg: rawPkg, rows, verifyTargets });
      this.writeCode(path.join(rawDir, 'CfgMapperInit.java'), content);
    }

    // ---- 5. 写 cfg/：child 子类（存在即跳过）----
    for (const vTable of sortedTables) {
      if (!childNames.includes(vTable.name())) continue;
      const names = mapperNames(vTable.name());
      const filePath = path.join(cfgDir, `${names.childClass}.java`);
      if (fs.existsSync(filePath)) {
        Logger.log(`javamapper skip existing child: ${filePath}`);
        continue;
      }
      const content = genChildClass({
        pkg: cfgPkg,
        className: names.childClass,
        rawClassFqn: `${rawPkg}.${names.rawClass}`,
      });
      this.writeCode(filePath, content);
    }

    // ---- 6. 清理（cfgDir 永不清理）----
    CachedFiles.keepMetaAndDeleteOtherFiles(rawDir);
    CachedFiles.keepMetaAndDeleteOtherFiles(beanDir);
  }

  // -------------------------------------------------------------------------
  // internal helpers
  // -------------------------------------------------------------------------

  /**
   * bean FQN：beanPkg + 子包路径 + upperStartSegments(lastName)。
   * 子包路径 = fullName 命名空间；interface 例外 = fullName 自身
   * （impl 的命名空间挂在 interface fullName 下，interface 与 impl 同包）。
   */
  private beanFqnOf(n: Nameable, beanPkg: string, cache: Map<string, string>): string {
    const cached = cache.get(n.fullName());
    if (cached !== undefined) return cached;
    const isIface = n instanceof InterfaceSchemaClass;
    const nsPath = isIface ? n.fullName() : nsPathOf(n);
    const fqn = `${beanPkg}${pkgSuffixOf(nsPath)}.${upperStartSegments(n.lastName())}`;
    cache.set(n.fullName(), fqn);
    return fqn;
  }

  /** 字段类型引用的 struct/interface schema 列表（含 list 元素/map value） */
  private fieldRefTargets(f: FieldSchema): Fieldable[] {
    const targets: Fieldable[] = [];
    const t = f.type;
    if (isStructRef(t) && t.obj) targets.push(t.obj);
    if (isFList(t) && isStructRef(t.item) && t.item.obj) targets.push(t.item.obj);
    if (isFMap(t) && isStructRef(t.value) && t.value.obj) targets.push(t.value.obj);
    return targets;
  }

  /** FieldSchema → PojoFieldModel（fieldKind 谓词判定） */
  private pojoFieldOf(f: FieldSchema, opts: TypeOpts): PojoFieldModel {
    return this.rawFieldOf(f, opts);
  }

  private rawFieldOf(f: FieldSchema, opts: TypeOpts): RawFieldModel {
    const t = f.type;
    if (isStructRef(t)) {
      const isIface = t.obj instanceof InterfaceSchemaClass;
      return {
        name: f.name,
        type: t,
        comment: f.comment(),
        fieldKind: isIface ? 'interface' : 'struct',
        refClassName: t.obj ? opts.resolveNameable!(t.obj) : null,
      };
    }
    if (isFList(t)) {
      const item = t.item;
      const itemIsRef = isStructRef(item);
      return {
        name: f.name,
        type: t,
        comment: f.comment(),
        fieldKind: 'list',
        elemType: item,
        refClassName: itemIsRef && item.obj ? opts.resolveNameable!(item.obj) : null,
      };
    }
    if (isFMap(t)) {
      const value = t.value;
      const valueIsRef = isStructRef(value);
      return {
        name: f.name,
        type: t,
        comment: f.comment(),
        fieldKind: 'map',
        keyType: t.key,
        valueType: value,
        refClassName: valueIsRef && value.obj ? opts.resolveNameable!(value.obj) : null,
      };
    }
    return { name: f.name, type: t, comment: f.comment(), fieldKind: 'scalar' };
  }

  /** VTable → RawTableModel（enum/uniqueKey/FK 全部在此判定） */
  private rawModelOf(
    vTable: VTable,
    sortedTables: VTable[],
    tableNames: Set<string>,
    beanPkg: string,
    rawPkg: string,
    opts: TypeOpts,
  ): RawTableModel {
    const schema = vTable.schema;
    const names = mapperNames(schema.name());

    const fields = schema.fields().map((f) => this.rawFieldOf(f, opts));
    const pkFields = (schema.primaryKey.fieldSchemas() ?? []).map((fs) => {
      const found = fields.find((f) => f.name === fs.name);
      if (!found) throw new Error(`javamapper: pk field ${fs.name} not in table ${schema.name()} fields`);
      return found;
    });

    // uniqueKeys：仅单字段保留（v1 契约）
    const uniqueKeys: RawUniqueKeyModel[] = [];
    for (const uk of schema.uniqueKeys()) {
      const ukFields = uk.fields();
      if (ukFields.length !== 1) continue;
      const fs = (uk.fieldSchemas() ?? []).find((s) => s.name === ukFields[0]);
      if (!fs) continue;
      uniqueKeys.push({
        fields: ukFields,
        mapField: `${ukFields[0]}Map`,
        getBy: 'getBy' + upper1(ukFields[0]),
        keyJavaType: rawScalarTypeOf(fs.type),
      });
    }

    // FK：目标表在生成集合中才加；仅 RefPrimary/RefUniq 且 key 为标量
    // （RefList/容器 key 的 ref getter v1 不支持——getByKey 传 List 类型不合法）
    const fks: RawFkModel[] = [];
    for (const fk of schema.foreignKeys()) {
      const refTableSchema = fk.refTableSchema();
      if (refTableSchema === null || !tableNames.has(refTableSchema.name())) {
        Logger.log(`javamapper ignore fk ${schema.name()}.${fk.name}: ref table not in gen set`);
        continue;
      }
      if (!(isRefPrimary(fk.refKey) || isRefUniq(fk.refKey))) continue; // RefList：v1 不支持
      const keyFields = fk.key.fieldSchemas() ?? [];
      if (!keyFields.every((kf) => isPrimitive(kf.type))) continue; // 容器/引用 key：跳过
      const refNames = mapperNames(refTableSchema.name());
      let refMethod = 'getByKey';
      if (isRefUniq(fk.refKey)) {
        // 目标 uniqueKey 查询方法：getBy + upper1(字段名)
        const keyNames = fk.refKey.keyNames();
        if (keyNames.length === 1) {
          refMethod = 'getBy' + upper1(keyNames[0]);
        }
      }
      fks.push({
        fieldName: fk.name,
        refRawFqn: `${rawPkg}.${refNames.rawClass}`,
        refMethod,
        nullable: (fk.refKey as { nullable: boolean }).nullable,
        argExprs: keyFields.map((kf) => kf.name),
      });
    }

    // refFqns：本表字段引用的 schema 名 → bean FQN
    const refFqns = new Map<string, string>();
    for (const f of fields) {
      const t = f.type;
      const refs: FieldType[] = [];
      if (isStructRef(t)) refs.push(t);
      if (isFList(t)) refs.push(t.item);
      if (isFMap(t)) refs.push(t.value);
      for (const ref of refs) {
        if (isStructRef(ref) && ref.obj) {
          refFqns.set(ref.obj.fullName(), opts.resolveNameable!(ref.obj as Nameable));
        }
      }
    }

    // enum 表：EEnum 判定 + 常量烘焙（数据行来源）
    const isEnumTable = isEEnum(schema.entry);
    let enumField: string | null = null;
    let enumGetByName = false;
    let enumConstants: { name: string; value: number }[] | null = null;
    let enumStrConstants: { name: string; value: string }[] | null = null;
    if (isEnumTable) {
      enumField = (schema.entry as import('@cfgforge/schema').EEnum).field;
      // 枚举名字段非主键时才生成 getByName
      const pkNames = schema.primaryKey.fields();
      enumGetByName = !pkNames.includes(enumField!);
      if (vTable.enumNameToIntegerValueMap !== null) {
        enumConstants = [...vTable.enumNameToIntegerValueMap.entries()].map(([name, value]) => ({
          name: enumFieldNameOf(name, false),
          value,
        }));
      } else if (vTable.enumNames !== null && vTable.enumNames.size > 0) {
        enumStrConstants = [...vTable.enumNames].map((name) => ({
          name: enumFieldNameOf(name, false),
          value: name,
        }));
      }
    }

    return {
      names,
      pkg: rawPkg,
      beanPkg,
      fields,
      pkFields,
      uniqueKeys,
      fks,
      refFqns,
      isEnumTable,
      enumField,
      enumGetByName,
      enumConstants,
      enumStrConstants,
    };
  }

  private writeCode(filePath: string, content: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    CachedFiles.writeFile(filePath, Buffer.from(content, 'utf-8'));
  }
}

// ---------------------------------------------------------------------------
// module-local helpers
// ---------------------------------------------------------------------------

/**
 * Nameable 的 bean 子包路径：fullName() 去掉最后一段（'' 或 'task.completecondition'）。
 * 注意 interface impl 的 namespace() 返回 ''，其命名空间挂在 fullName()
 * 上（如 'completecondition.KillMonster'），必须按 fullName 取。
 */
function nsPathOf(n: Nameable): string {
  return nsOf(n.fullName());
}

/** fullName → 命名空间路径（'' 或 'task.completecondition'） */
function nsOf(fullName: string): string {
  const idx = fullName.lastIndexOf('.');
  return idx === -1 ? '' : fullName.substring(0, idx);
}

/** 命名空间路径 → 包后缀（'' 或 '.task.completecondition'） */
function pkgSuffixOf(nsPath: string): string {
  return nsPath === '' ? '' : '.' + nsPath;
}

/** 基础标量的原始 Java 类型（uniqueKey 参数用） */
function rawScalarTypeOf(t: FieldType): string {
  switch (t) {
    case Primitive.BOOL: return 'boolean';
    case Primitive.INT: return 'int';
    case Primitive.LONG: return 'long';
    case Primitive.FLOAT: return 'float';
    default: return 'String';
  }
}
