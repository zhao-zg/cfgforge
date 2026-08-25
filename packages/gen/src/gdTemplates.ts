/**
 * gdTemplates — TypeScript port of Java JTE templates in `jte/gd/`.
 *
 * 3 template functions:
 * - genStruct(model)     — GenStruct.jte (213 lines, most complex)
 * - genInterface(model)  — GenInterface.jte (36 lines)
 * - genProcessor(model)  — Processor.jte (43 lines)
 *
 * GDScript uses tab indentation (Godot convention). All generated code
 * uses tabs for indentation, matching the .gd runtime files.
 *
 * Java templates: app/src/main/resources/jte/gd/*.jte
 */

import { upper1, lower1, removeLineSep } from '@cfggen/shared';
import type { FieldSchema, ForeignKeySchema, KeySchema, TableSchema, Structural, SimpleType, FieldType } from '@cfggen/schema';
import { Primitive, StructRef, FList, FMap, isPrimitive, isStructRef, isFList, isFMap, isSimpleType } from '@cfggen/schema';
import { hasRef, hasRefFieldType } from '@cfggen/schema';
import { isEEntry, isEEnum } from '@cfggen/schema';
import { RefPrimary, RefUniq, RefList, isRefPrimary, isRefUniq, isRefList } from '@cfggen/schema';
import type { VTable } from '@cfggen/value';
import { GdName } from './GdName';
import type { GdStructModel } from './GdStructModel';
import type { GdInterfaceModel } from './GdInterfaceModel';
import type { GdProcessorModel } from './GdProcessorModel';

// ---------------------------------------------------------------------------
// genStruct — GenStruct.jte
// ---------------------------------------------------------------------------

export function genStruct(model: GdStructModel): string {
  const structural: Structural = model.structural;
  const className: string = model.name.className;
  const vTable: VTable | null = model.vTable;
  const table: TableSchema | null = vTable ? vTable.schema : null;
  const fields = structural.fields();
  const foreignKeys = structural.foreignKeys();
  const lines: string[] = [];

  // class_name declaration — extends interface if impl
  // GdName handles nullableInterface internally (constructor checks it).
  // Here we check via duck typing to avoid importing StructSchema (which would
  // need a value import for instanceof, causing circular dependency issues).
  const structNullableInterface =
    (structural as any).nullableInterface ? (structural as any).nullableInterface() : null;
  const isImpl = structNullableInterface !== null;

  if (isImpl) {
    const ifaceName = model.fullName(structNullableInterface);
    lines.push(`class_name ${className} extends ${ifaceName}`);
  } else {
    lines.push(`class_name ${className}`);
  }
  lines.push('');

  // Struct comment
  lines.push(`## ${structural.name()}`);
  const comment = structural.comment();
  if (comment && comment.length > 0) {
    for (const line of comment.split('\n')) {
      lines.push(`## ${line}`);
    }
  }
  lines.push('');

  // Public properties
  lines.push('# 公开属性');
  for (const field of fields) {
    const fieldComment = field.comment();
    const typeStr = model.type(field.type);
    const fieldStr = `var ${model.fieldName(field)}: ${typeStr}`;
    if (fieldComment && fieldComment.length > 0) {
      lines.push(`${fieldStr}  # ${removeLineSep(fieldComment)}`);
    } else {
      lines.push(fieldStr);
    }
  }
  lines.push('');

  // Foreign key ref properties
  if (foreignKeys.length > 0) {
    lines.push('# 外键引用属性');
    for (const fk of foreignKeys) {
      lines.push(`var ${model.refName(fk)}: ${model.refType(fk)}`);
    }
    lines.push('');
  }

  // Table-specific: enum instances, storage, queries
  if (vTable !== null && table !== null) {
    // Static enum instances
    if (isEEntry(table.entry) || isEEnum(table.entry)) {
      lines.push('# 静态枚举实例');
      if (vTable.enumNames) {
        for (const enumName of vTable.enumNames) {
          lines.push(`static var ${upper1(enumName)}: ${className}`);
        }
      }
      lines.push('');
    }

    // Internal storage
    const keyType = model.keyType()!;
    lines.push('# 内部存储');
    lines.push(`static var _data: Dictionary[${keyType}, ${className}] = {}`);
    for (const uk of table.uniqueKeys()) {
      lines.push(`static var ${model.uniqueKeyMapName(uk)}: ${model.dictionaryType(uk, className)} = {}`);
    }
    lines.push('');

    // Primary key query
    lines.push('# 主键查询');
    lines.push(`static func find(id: ${keyType}) -> ${className}:`);
    lines.push('\treturn _data.get(id)');
    lines.push('');

    // Unique key queries
    for (const uk of table.uniqueKeys()) {
      lines.push('# 唯一键查询');
      const params = model.actualParams(uk);
      lines.push(`static func ${model.uniqueKeyGetByName(uk)}(${params}) -> ${className}:`);
      lines.push(`\treturn ${model.uniqueKeyMapName(uk)}.get(${params})`);
      lines.push('');
    }

    // Get all data
    lines.push('# 获取所有数据');
    lines.push(`static func all() -> Array[${className}]:`);
    lines.push('\treturn _data.values()');
    lines.push('');
  }

  // _to_string
  lines.push('# 字符串表示');
  lines.push('func _to_string() -> String:');
  if (fields.length === 0) {
    lines.push(`\treturn "${className}{}"`);
  } else {
    const toStrings = model.toStrings(fields);
    lines.push(`\treturn "${className}{" + ${toStrings} + "}"`);
  }
  lines.push('');

  // _init_from_stream (table only)
  if (vTable !== null && table !== null) {
    lines.push('# 从流初始化');
    lines.push('static func _init_from_stream(stream: ConfigStream, _errors: ConfigErrors):');
    // Reset unique key maps
    for (const uk of table.uniqueKeys()) {
      lines.push(`\t${model.uniqueKeyMapName(uk)} = {}`);
    }
    lines.push('');
    lines.push('\tvar count = stream.read_int32()');
    lines.push('\tfor i in range(count):');
    lines.push('\t\tvar item = _create(stream)');
    lines.push(`\t\t_data[item.${model.primaryKeyFieldName()}] = item`);
    for (const uk of table.uniqueKeys()) {
      lines.push(`\t\t${model.uniqueKeyMapName(uk)}[item.${model.actualParamsKeySelf(uk)}] = item`);
    }
    lines.push('');

    // Enum match
    if (isEEntry(table.entry) || isEEnum(table.entry)) {
      const entryBase = isEEntry(table.entry) ? table.entry : (isEEnum(table.entry) ? table.entry : null);
      if (entryBase && entryBase.fieldSchema) {
        const ef = model.fieldName(entryBase.fieldSchema);
        lines.push(`\t\tif item.${ef}.strip_edges() != "":`);
        lines.push(`\t\t\tmatch item.${ef}.strip_edges():`);
        if (vTable.enumNames) {
          for (const enumName of vTable.enumNames) {
            lines.push(`\t\t\t\t"${enumName}":`);
            lines.push(`\t\t\t\t\tif ${upper1(enumName)} != null:`);
            lines.push(`\t\t\t\t\t\t_errors.enum_dup("${structural.name()}", str(item))`);
            lines.push(`\t\t\t\t\t${upper1(enumName)} = item`);
          }
        }
        lines.push('\t\t\t\t_:');
        lines.push(`\t\t\t\t\t_errors.enum_data_add("${structural.name()}", str(item))`);
      }
    }
    lines.push('');

    // Check for null enums
    if (isEEntry(table.entry) || isEEnum(table.entry)) {
      if (vTable.enumNames) {
        for (const enumName of vTable.enumNames) {
          lines.push(`\t\tif ${upper1(enumName)} == null:`);
          lines.push(`\t\t\t_errors.enum_null("${structural.name()}", "${enumName}")`);
        }
      }
    }
    lines.push('');
  }

  // _create (always generated)
  lines.push('# 创建实例');
  lines.push(`static func _create(stream: ConfigStream) -> ${className}:`);
  lines.push(`\tvar instance = ${className}.new()`);
  for (const field of fields) {
    const t = field.type;
    const n = model.fieldName(field);
    if (isFList(t)) {
      const fl = t as FList;
      const itemCreate = model.create(fl.item);
      lines.push(`\tfor c in range(stream.read_int32()):`);
      lines.push(`\t\tinstance.${n}.append(${itemCreate})`);
    } else if (isFMap(t)) {
      const fm = t as FMap;
      const keyCreate = model.create(fm.key);
      const valueCreate = model.create(fm.value);
      lines.push(`\tfor c in range(stream.read_int32()):`);
      lines.push(`\t\tvar k = ${keyCreate}`);
      lines.push(`\t\tvar v = ${valueCreate}`);
      lines.push(`\t\tinstance.${n}[k] = v`);
    } else {
      const createExpr = model.create(t);
      lines.push(`\tinstance.${n} = ${createExpr}`);
    }
  }
  lines.push('\treturn instance');
  lines.push('');

  // _resolve and _resolve_refs (only if hasRef)
  if (hasRef(structural)) {
    lines.push('# 解析外键引用');
    lines.push('func _resolve(errors: ConfigErrors):');
    // Resolve field references
    let hasResolveBody = false;
    for (const field of fields) {
      const type = field.type;
      if (hasRefFieldType(type)) {
        hasResolveBody = true;
        if (isStructRef(type)) {
          const fn = model.fieldName(field);
          lines.push(`\tif ${fn} != null:`);
          lines.push(`\t\t${fn}._resolve(errors)`);
        } else if (isFList(type)) {
          const fn = model.fieldName(field);
          lines.push(`\tfor item in ${fn}:`);
          lines.push('\t\tif item != null:');
          lines.push('\t\t\titem._resolve(errors)');
        } else if (isFMap(type)) {
          const fn = model.fieldName(field);
          lines.push(`\tfor item in ${fn}.values():`);
          lines.push('\t\tif item != null:');
          lines.push('\t\t\titem._resolve(errors)');
        }
      }
    }

    // Resolve foreign key references
    for (const fk of foreignKeys) {
      const refKey = fk.refKey;
      if (isRefPrimary(refKey) || isRefUniq(refKey)) {
        const refSimple = refKey as RefPrimary | RefUniq;
        const firstField = fk.key.fieldSchemas()![0];
        const refName = model.refName(fk);
        const fkStr = `"${fk.name}"`;
        const ft = firstField.type;

        if (isSimpleType(ft)) {
          // SimpleType
          hasResolveBody = true;
          const tableGet = model.tableGet(fk.refTableSchema(), refSimple, model.actualParams(fk.key));
          lines.push(`\t${refName} = ${tableGet}`);
          if (!refSimple.nullable) {
            lines.push(`\tif ${refName} == null:`);
            lines.push(`\t\terrors.ref_null("${structural.name()}", ${fkStr})`);
          }
        } else if (isFList(ft)) {
          // FList
          hasResolveBody = true;
          lines.push(`\tfor item in ${model.fieldName(firstField)}:`);
          const tableGet = model.tableGet(fk.refTableSchema(), refSimple, 'item');
          lines.push(`\t\tvar r = ${tableGet}`);
          lines.push(`\t\tif r == null:`);
          lines.push(`\t\t\terrors.ref_null("${structural.name()}", ${fkStr})`);
          lines.push(`\t\t${refName}.append(r)`);
        } else if (isFMap(ft)) {
          // FMap
          hasResolveBody = true;
          lines.push(`\tfor k in ${model.fieldName(firstField)}.keys():`);
          const tableGet = model.tableGet(fk.refTableSchema(), refSimple, `${model.fieldName(firstField)}[k]`);
          lines.push(`\t\tvar v = ${tableGet}`);
          lines.push(`\t\tif v == null:`);
          lines.push(`\t\t\terrors.ref_null("${structural.name()}", ${fkStr})`);
          lines.push(`\t\t${refName}[k] = v`);
        }
      }
    }

    // Resolve RefList foreign keys
    for (const fk of foreignKeys) {
      if (isRefList(fk.refKey)) {
        const refList = fk.refKey as RefList;
        const refName = model.refName(fk);
        const refTable = model.fullName(fk.refTableSchema());
        const keyNames = refList.keyNames();
        const localFields = fk.key.fields();
        hasResolveBody = true;
        lines.push(`\tfor v in ${refTable}.all():`);
        if (keyNames.length === 1) {
          const keyField = keyNames[0];
          const localField = localFields[0];
          lines.push(`\t\tif v.${keyField} == ${localField}:`);
          lines.push(`\t\t\t${refName}.append(v)`);
        } else {
          const conditions: string[] = [];
          for (let i = 0; i < keyNames.length; i++) {
            conditions.push(`v.${keyNames[i]} == ${localFields[i]}`);
          }
          lines.push(`\t\tif ${conditions.join(' and ')}:`);
          lines.push(`\t\t\t${refName}.append(v)`);
        }
      }
    }

    if (!hasResolveBody) {
      lines.push('\tpass');
    }
    lines.push('');

    // _resolve_refs (table only)
    if (vTable !== null) {
      lines.push('static func _resolve_refs(errors: ConfigErrors):');
      lines.push('\tfor item in all():');
      lines.push('\t\titem._resolve(errors)');
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// genInterface — GenInterface.jte
// ---------------------------------------------------------------------------

export function genInterface(model: GdInterfaceModel): string {
  const className: string = model.name.className;
  const sInterface = model.sInterface;
  const lines: string[] = [];

  lines.push(`class_name ${className}`);
  lines.push('');

  // Interface comment
  lines.push(`## ${sInterface.name()}`);
  const comment = sInterface.comment();
  if (comment && comment.length > 0) {
    for (const line of comment.split('\n')) {
      lines.push(`## ${line}`);
    }
  }
  lines.push('');

  // get_type if interface has enumRefTable
  if (sInterface.nullableEnumRefTable() !== null) {
    lines.push('# 获取接口类型');
    lines.push('func get_type():');
    lines.push('\tpush_error("Must be implemented by subclass")');
    lines.push('\treturn null');
    lines.push('');
  }

  // _resolve if hasRef
  if (hasRef(sInterface)) {
    lines.push('func _resolve(errors: ConfigErrors):');
    lines.push('\tpass');
    lines.push('');
  }

  // _create static factory
  lines.push('# 创建实例（静态工厂方法）');
  lines.push(`static func _create(stream: ConfigStream) -> ${className}:`);
  lines.push('\tvar type_name = stream.read_string_in_pool()');
  lines.push('\tmatch type_name:');
  for (const impl of sInterface.impls()) {
    lines.push(`\t\t"${impl.name()}":`);
    lines.push(`\t\t\treturn ${model.fullName(impl)}._create(stream)`);
  }
  lines.push('\t\t_:');
  lines.push('\t\t\tpush_error("Unknown type: " + type_name)');
  lines.push('\t\t\treturn null');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// genProcessor — Processor.jte
// ---------------------------------------------------------------------------

export function genProcessor(model: GdProcessorModel): string {
  const lines: string[] = [];

  lines.push('class_name ConfigProcessor');
  lines.push('');

  lines.push('# 从流加载所有配置（新格式）');
  lines.push('func load_from_stream(stream: ConfigStream, _errors: ConfigErrors):');
  lines.push('\tvar config_nulls: Array[String] = []');
  for (const table of model.tableSchemas) {
    lines.push(`\tconfig_nulls.append("${table.name()}")`);
  }
  lines.push('');

  lines.push('\t# 读取表数量');
  lines.push('\tvar table_count = stream.read_int32()');
  lines.push('');

  lines.push('\tfor i in range(table_count):');
  lines.push('\t\t# 读取表名');
  lines.push('\t\tvar table_name = stream.read_string()');
  lines.push('\t\t# 读取表大小');
  lines.push('\t\tvar table_size = stream.read_int32()');
  lines.push('');

  lines.push('\t\tmatch table_name:');
  for (const table of model.tableSchemas) {
    lines.push(`\t\t\t"${table.name()}":`);
    lines.push(`\t\t\t\tconfig_nulls.erase("${table.name()}")`);
    lines.push(`\t\t\t\t${model.fullName(table)}._init_from_stream(stream, _errors)`);
  }
  lines.push('\t\t\t_:');
  lines.push('\t\t\t\t# 未知表，跳过');
  lines.push('\t\t\t\tstream.skip_bytes(table_size)');
  lines.push('');

  lines.push('\t# 检查缺失的配置表');
  lines.push('\tfor table_name in config_nulls:');
  lines.push('\t\t_errors.config_null(table_name)');
  lines.push('');

  lines.push('\t# 解析外键引用');
  for (const table of model.tableSchemas) {
    if (hasRef(table)) {
      lines.push(`\t${model.fullName(table)}._resolve_refs(_errors)`);
    }
  }

  return lines.join('\n');
}
