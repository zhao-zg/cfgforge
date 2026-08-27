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
  enumRefType: string | null; // interface enumRef 的枚举表 raw 类全名（type() 返回类型）
  enumRefFieldName: string | null; // impl 的 schema 名（常量名推导依据，仅模型元数据）
  enumRefConstName: string | null; // type() 返回的常量名（模型算好，如 KILLMONSTER）
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
