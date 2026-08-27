/**
 * JavaMapperModel — javamapper POJO 模板的输入模型（Task 3：struct/interface bean）。
 *
 * 设计约定（模型层做全部类型分析，模板层零 schema 依赖）：
 * - fieldKind 显式标注字段语义（scalar/struct/interface/list/map），由 Task 5
 *   Generator 从 FieldType 谓词（isPrimitive/isStructRef/isFList/isFMap +
 *   StructRef.obj instanceof InterfaceSchema）计算；Task 3 测试手写字面量。
 * - list 元素类型放 elemType，map 的 key/value 放 keyType/valueType；
 *   struct/interface 引用的已解析类名（resolveNameable 输出的 FQN）放 refClassName，
 *   模板不再做任何命名推导。
 * - type() 返回的枚举常量名由模型直接给出（enumRefConstName，
 *   Task 5 用 enumFieldNameOf(implSchemaName, false) 算好），模板不猜命名规则。
 */

import type { FieldType } from '@cfgforge/schema';
import type { MapperNames } from './JavaMapperName';

/** 字段语义（模型层判定，模板仅按此分派） */
export type PojoFieldKind = 'scalar' | 'struct' | 'interface' | 'list' | 'map';

export interface PojoFieldModel {
  name: string;
  type: FieldType;
  comment: string;
  fieldKind: PojoFieldKind;
  /** list 元素类型（fieldKind='list' 时必有） */
  elemType?: FieldType | null;
  /** map key 类型（fieldKind='map' 时必有；schema 约定 key 必为基础标量） */
  keyType?: FieldType | null;
  /** map value 类型（fieldKind='map' 时必有） */
  valueType?: FieldType | null;
  /**
   * struct/interface 引用的已解析类名/FQN（resolveNameable 输出）。
   * 字段本身为 struct/interface、或 list/map 的元素为 struct/interface 时必有。
   */
  refClassName?: string | null;
}

export interface PojoModel {
  pkg: string; // com.jedi.gameServer.mapper.bean[.ns]
  className: string; // TestDefaultBean
  fields: PojoFieldModel[];
  isInterfaceImpl: boolean; // false=独立 struct；true=interface impl
  interfaceFqn: string | null; // impl 时的接口全名
  enumRefType: string | null; // type() 返回类型（'int'/'String'，与枚举常量声明类型一致）
  enumRefFieldName: string | null; // impl 的 schema 名（常量名推导依据，仅模型元数据）
  enumRefConstName: string | null; // type() 返回的常量名（模型算好，如 KILLMONSTER）
  /** 常量所在枚举表 raw 类 FQN（return 语句的常量限定符；缺省回退 enumRefType——模板单测手写模型用） */
  enumConstOwnerFqn?: string | null;
  namespacePath: string; // 相对 bean 包的子包路径 'task' / ''
}

export interface InterfacePojoModel {
  pkg: string;
  className: string; // Completecondition
  /** fullName=schema fullName，$type 精确匹配用 */
  impls: { className: string; fullName: string; namespacePath: string }[];
  enumRefTableFqn: string | null; // 枚举表 raw 类（type() 返回类型，impl 模型用）
  hasEnumRef: boolean;
}

// ---------------------------------------------------------------------------
// Task 4：raw 表类模型（每表一个 RawXxx 单例，行类嵌套）
// ---------------------------------------------------------------------------

/** raw 行字段沿用 POJO 的 fieldKind 模式（模型层判定，模板仅按此分派） */
export type RawFieldKind = PojoFieldKind;

export interface RawFieldModel {
  name: string;
  type: FieldType;
  comment: string;
  fieldKind: RawFieldKind;
  /** list 元素类型（fieldKind='list' 时必有） */
  elemType?: FieldType | null;
  /** map key/value 类型（fieldKind='map' 时必有） */
  keyType?: FieldType | null;
  valueType?: FieldType | null;
  /**
   * struct/interface 引用的 bean FQN（Generator 从 refFqns 查表注入；
   * 模板也可经 refFqns 自行查表，两处来源一致）。list/map 元素为引用时必有。
   */
  refClassName?: string | null;
}

/** 单字段 uniqueKey 索引（v1 契约：多字段由 Generator 过滤，模板假设单字段） */
export interface RawUniqueKeyModel {
  /** uniqueKey 字段名（单元素） */
  fields: string[];
  /** 索引 map 字段名（如 rankMap） */
  mapField: string;
  /** 查询方法名（如 getByRank） */
  getBy: string;
  /** 索引字段 Java 参数类型（如 int/String） */
  keyJavaType: string;
  /** 自定义 map key 表达式模板（预留，v1 未用） */
  keyExprTemplate?: string;
}

/** FK ref getter：跨表引用便捷访问（目标表不在生成集合时 Generator 过滤掉） */
export interface RawFkModel {
  /** 本表 FK 字段名（决定 getter 名 get<Xxx>Ref） */
  fieldName: string;
  /**
   * 目标表行类 FQN（如 ...mapper.raw.RawTaskextraexps.RawTaskextraexp）——
   * ref getter 的返回类型（getByKey 返回行类，非外层单例类）
   */
  refRawFqn: string;
  /** 目标查询方法名：'getByKey' 或其 uniqueKey 的 getByXxx */
  refMethod: string;
  /** 可空 FK（生成侧暂未区分，模型元数据） */
  nullable: boolean;
  /** 已算好的传参表达式（通常就是 [本表字段名]） */
  argExprs: string[];
}

export interface RawTableModel {
  names: MapperNames; // Task 2
  pkg: string; // ...mapper.raw
  beanPkg: string; // ...mapper.bean（POJO 引用前缀）
  fields: RawFieldModel[]; // schema 字段序（含主键字段）
  pkFields: RawFieldModel[]; // 主键字段（1..n）
  uniqueKeys: RawUniqueKeyModel[];
  fks: RawFkModel[];
  /** schema 名 → bean FQN（struct/interface 引用查表；Generator 注入） */
  refFqns: Map<string, string>;
  isEnumTable: boolean; // entry 是 EEnum
  enumField: string | null; // 枚举名字段名
  /** 枚举名字段非主键时才生成 getByName（主键判断 Generator 做） */
  enumGetByName: boolean;
  /** enumNameToIntegerValueMap 烘焙（有整数值时） */
  enumConstants: { name: string; value: number }[] | null;
  /** 无整数值时（name→name） */
  enumStrConstants: { name: string; value: string }[] | null;
}
