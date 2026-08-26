/**
 * LuaTypeStr — TypeScript port of Java `configgen.genlua.TypeStr`.
 *
 * Generates Lua metadata strings for:
 * - uniqKeys: unique key definitions
 * - enumIndex: entry/enum column index
 * - refs: foreign key reference definitions
 * - fields: field name list (with optional packBool optimization)
 * - EmmyLua annotation strings
 * - text field definitions
 *
 * Differences from Java:
 * - AContext.getInstance() singleton replaced with passed-in LuaAContext
 * - Java String.format replaced with template literals
 * - Java switch expressions replaced with if/else chains
 */

import type { Structural, FieldSchema, KeySchema, TableSchema } from '@cfggen/schema';
import {
  Primitive, FList, FMap, StructRef,
} from '@cfggen/schema';
import { RefList, RefPrimary, RefUniq } from '@cfggen/schema';
import { isEEntry } from '@cfggen/schema';
import { CfgWriter } from '@cfggen/schema';
import { lower1 } from '@cfggen/shared';
import type { VTable } from '@cfggen/value';
import type { LuaAContext } from './LuaAContext';
import type { LuaCtx } from './LuaCtx';
import {
  luaFullName, luaRefName,
  luaUniqueKeyGetByName, luaUniqueKeyGetByFieldNames,
  luaUniqueKeyMapName,
  primaryKeyMapName, primaryKeyGetName,
} from './LuaName';

// ---------------------------------------------------------------------------
// packBool helpers
// ---------------------------------------------------------------------------

export function isDoPackBool(structural: Structural, aCtx: LuaAContext): boolean {
  let doPack = aCtx.isPackBool();
  if (doPack) {
    const boolCnt = getBoolFieldCount(structural);
    if (boolCnt >= 50) {
      throw new Error('现在不支持pack多余50个bool字段的bean');
    }
    if (boolCnt < 2) {
      doPack = false;
    }
  }
  return doPack;
}

function getBoolFieldCount(structural: Structural): number {
  let c = 0;
  for (const field of structural.fields()) {
    if (field.type === Primitive.BOOL) {
      c++;
    }
  }
  return c;
}

// ---------------------------------------------------------------------------
// Column index calculation
// ---------------------------------------------------------------------------

function getColumnStrOrIndex(field: FieldSchema, structural: Structural, aCtx: LuaAContext): string {
  const idx = findColumnIndex(field, structural, aCtx);
  return String(idx);
}

function findColumnIndex(field: FieldSchema, structural: Structural, aCtx: LuaAContext): number {
  const doPack = isDoPackBool(structural, aCtx);
  if (doPack) {
    let meetBool = false;
    let cnt = 0;
    for (const column of structural.fields()) {
      if (column.type === Primitive.BOOL) {
        if (column === field) {
          throw new Error('现在不支持packbool的同时，bool引用到其他表');
        }
        if (!meetBool) {
          meetBool = true;
          cnt++;
        }
      } else {
        cnt++;
        if (column === field) {
          return cnt;
        }
      }
    }
    throw new Error('不该发生');
  } else {
    let cnt = 0;
    for (const column of structural.fields()) {
      cnt++;
      if (column === field) {
        return cnt;
      }
    }
  }
  throw new Error('未找到field');
}

// ---------------------------------------------------------------------------
// Unique keys string
// ---------------------------------------------------------------------------

export function getLuaUniqKeysString(ctx: LuaCtx, aCtx: LuaAContext): string {
  const table = ctx.vTable().schema;
  const sb: string[] = [];
  sb.push('{ ');
  sb.push(getLuaOneUniqKeyString(ctx, table.primaryKey, true, aCtx));
  for (const uk of table.uniqueKeys()) {
    sb.push(getLuaOneUniqKeyString(ctx, uk, false, aCtx));
  }
  sb.push('}');
  return sb.join('');
}

function getLuaOneUniqKeyString(
  ctx: LuaCtx,
  keySchema: KeySchema,
  isPrimaryKey: boolean,
  aCtx: LuaAContext,
): string {
  const allname = isPrimaryKey ? primaryKeyMapName : luaUniqueKeyMapName(keySchema);
  const getname = isPrimaryKey ? primaryKeyGetName : luaUniqueKeyGetByName(keySchema);

  const table = ctx.vTable().schema;
  const fieldSchemas = keySchema.fieldSchemas();
  if (fieldSchemas === null) {
    throw new Error('fieldSchemas is null for key ' + keySchema.fields().join(','));
  }

  const keystr1 = getColumnStrOrIndex(fieldSchemas[0], table, aCtx);

  if (fieldSchemas.length > 1) {
    if (fieldSchemas.length !== 2) {
      throw new Error('uniqkeys size != 2 ' + table.name());
    }
    const keystr2 = getColumnStrOrIndex(fieldSchemas[1], table, aCtx);
    return `{ '${allname}', '${getname}', ${keystr1}, ${keystr2} }, `;
  } else {
    return `{ '${allname}', '${getname}', ${keystr1} }, `;
  }
}

// ---------------------------------------------------------------------------
// Enum string
// ---------------------------------------------------------------------------

export function getLuaEnumString(ctx: LuaCtx, aCtx: LuaAContext): string {
  const table = ctx.vTable().schema;
  const entry = table.entry;
  if (isEEntry(entry)) {
    if (entry.fieldSchema !== null) {
      return getColumnStrOrIndex(entry.fieldSchema, table, aCtx);
    }
  }
  return 'nil';
}

// ---------------------------------------------------------------------------
// Refs string
// ---------------------------------------------------------------------------

/**
 * {refName, 0, dstTable, dstGetName, thisColumnIdx, [thisColumnIdx2]}, -- 最常见类型
 * {refName, 1, dstTable, dstGetName, thisColumnIdx}, --本身是list
 * {refName, 2, dstTable, dstAllName, thisColumnIdx, dstColumnIdx}, --listRef到别的表
 * {refName, 3, dstTable, dstGetName, thisColumnIdx}, --本身是map
 */
export function getLuaRefsString(structural: Structural, aCtx: LuaAContext): string {
  const fks = structural.foreignKeys();
  if (fks.length === 0) {
    return 'nil';
  }

  const sb: string[] = [];
  sb.push('{ ');

  for (const fk of fks) {
    const refName = luaRefName(fk);
    const refTableSchema = fk.refTableSchema();
    if (refTableSchema === null) {
      throw new Error('refTableSchema is null for fk ' + fk.name);
    }
    const dstTable = luaFullName(refTableSchema, aCtx.getPkgPrefixStr());

    if (fk.refKey instanceof RefList) {
      // {refName, 2, dstTable, dstAllName, thisColumnIdx, dstColumnIdx}
      const dstAllName = primaryKeyMapName;
      const keyFieldSchemas = fk.key.fieldSchemas();
      if (keyFieldSchemas === null || keyFieldSchemas.length === 0) {
        throw new Error('fk key fieldSchemas is null/empty for ' + fk.name);
      }
      const thisColumnIdx = getColumnStrOrIndex(keyFieldSchemas[0], structural, aCtx);

      const refListKeyFieldSchemas = fk.refKey.key.fieldSchemas();
      if (refListKeyFieldSchemas === null || refListKeyFieldSchemas.length === 0) {
        throw new Error('refList key fieldSchemas is null/empty for ' + fk.name);
      }
      const dstColumnIdx = getColumnStrOrIndex(refListKeyFieldSchemas[0], refTableSchema, aCtx);

      sb.push(`\n    { '${refName}', 2, ${dstTable}, '${dstAllName}', ${thisColumnIdx}, ${dstColumnIdx} }, `);
    } else {
      // RefSimple = RefPrimary | RefUniq
      const refSimple = fk.refKey as RefPrimary | RefUniq;
      const keyFieldSchemas = fk.key.fieldSchemas();
      if (keyFieldSchemas === null || keyFieldSchemas.length === 0) {
        throw new Error('fk key fieldSchemas is null/empty for ' + fk.name);
      }
      const firstField = keyFieldSchemas[0];
      const dstGetName = luaUniqueKeyGetByFieldNames(refSimple.keyNames());
      const thisColumnIdx = getColumnStrOrIndex(firstField, structural, aCtx);

      if (firstField.type instanceof FList) {
        // {refName, 1, dstTable, dstGetName, thisColumnIdx}
        sb.push(`\n    { '${refName}', 1, ${dstTable}, '${dstGetName}', ${thisColumnIdx} }, `);
      } else if (firstField.type instanceof FMap) {
        // {refName, 3, dstTable, dstGetName, thisColumnIdx}
        sb.push(`\n    { '${refName}', 3, ${dstTable}, '${dstGetName}', ${thisColumnIdx} }, `);
      } else {
        // SimpleType: {refName, 0, dstTable, dstGetName, thisColumnIdx}
        if (keyFieldSchemas.length > 2) {
          throw new Error('lua最多只支持两列做为索引！，' + structural.name());
        }
        if (keyFieldSchemas.length > 1) {
          const thisColumnIdx2 = getColumnStrOrIndex(keyFieldSchemas[1], structural, aCtx);
          sb.push(`\n    { '${refName}', 0, ${dstTable}, '${dstGetName}', ${thisColumnIdx}, ${thisColumnIdx2} }, `);
        } else {
          sb.push(`\n    { '${refName}', 0, ${dstTable}, '${dstGetName}', ${thisColumnIdx} }, `);
        }
      }
    }
  }
  sb.push('}');
  return sb.join('');
}

// ---------------------------------------------------------------------------
// Fields string (runtime, with packBool optimization)
// ---------------------------------------------------------------------------

export function getLuaFieldsString(structural: Structural, aCtx: LuaAContext): string {
  const sb: string[] = [];
  const fields = structural.fields();
  const cnt = fields.length;
  let i = 0;

  const doPack = isDoPackBool(structural, aCtx);
  let meetBool = false;

  for (const field of fields) {
    if (doPack && field.type === Primitive.BOOL) {
      if (!meetBool) {
        meetBool = true;

        sb.push('\n    {');
        for (const bf of fields) {
          if (bf.type === Primitive.BOOL) {
            i++;
            const c = getCommaDescStr(bf.comment());
            sb.push(`\n    '${lower1(bf.name)}', -- ${CfgWriter.typeStr(bf)}${c}`);
          }
        }
        if (i < cnt) {
          sb.push('\n    },');
        } else {
          sb.push('\n    }');
        }
      }
    } else {
      i++;
      const fieldName = `'${lower1(field.name)}'`;
      const c = getCommaDescStr(field.comment());
      sb.push(`\n    ${fieldName}`);
      if (i < cnt) {
        sb.push(',');
      }
      sb.push(` -- ${CfgWriter.typeStr(field)}${c}`);
    }
  }

  return sb.join('');
}

// ---------------------------------------------------------------------------
// EmmyLua annotation strings
// ---------------------------------------------------------------------------

export function getLuaFieldsStringEmmyLua(structural: Structural): string {
  const sb: string[] = [];
  let has = false;
  for (const field of structural.fields()) {
    const c = getCommaDescStr(field.comment());
    sb.push(`---@field ${lower1(field.name)} ${typeToLuaType(field.type)} ${c}\n`);
    has = true;
  }
  if (has) {
    // Remove trailing \n
    const last = sb[sb.length - 1];
    sb[sb.length - 1] = last.substring(0, last.length - 1);
  }
  return sb.join('');
}

export function getLuaUniqKeysStringEmmyLua(table: TableSchema, aCtx: LuaAContext): string {
  const sb: string[] = [];
  const fullName = luaFullName(table, aCtx.getPkgPrefixStr());
  sb.push(`---@field ${primaryKeyGetName} fun(${getLuaGetParam(table.primaryKey)}):${fullName}\n`);
  for (const uk of table.uniqueKeys()) {
    sb.push(`---@field ${luaUniqueKeyGetByName(uk)} fun(${getLuaGetParam(uk)}):${fullName}\n`);
  }
  // Remove trailing \n
  const last = sb[sb.length - 1];
  sb[sb.length - 1] = last.substring(0, last.length - 1);
  return sb.join('');
}

function getLuaGetParam(primaryOrUniqueKey: KeySchema): string {
  const fieldSchemas = primaryOrUniqueKey.fieldSchemas();
  if (fieldSchemas === null) return '';
  const parts = fieldSchemas.map(f => `${f.name}:${typeToLuaType(f.type)}`);
  return parts.join(',');
}

export function getLuaEnumStringEmmyLua(vTable: VTable, aCtx: LuaAContext): string {
  const sb: string[] = [];
  let has = false;
  if (vTable.enumNames !== null) {
    for (const enumName of vTable.enumNames) {
      sb.push(`---@field ${enumName} ${luaFullName(vTable.schema, aCtx.getPkgPrefixStr())}\n`);
      has = true;
    }
  }
  if (has) {
    const last = sb[sb.length - 1];
    sb[sb.length - 1] = last.substring(0, last.length - 1);
  }
  return sb.join('');
}

export function getLuaRefsStringEmmyLua(structural: Structural, aCtx: LuaAContext): string {
  const sb: string[] = [];
  let hasRef = false;
  for (const fk of structural.foreignKeys()) {
    const refName = luaRefName(fk);
    const refTableSchema = fk.refTableSchema();
    if (refTableSchema === null) {
      throw new Error('refTableSchema is null for fk ' + fk.name);
    }
    const dstTable = luaFullName(refTableSchema, aCtx.getPkgPrefixStr());

    let isList = fk.refKey instanceof RefList;
    if (!isList) {
      const keyFieldSchemas = fk.key.fieldSchemas();
      if (keyFieldSchemas !== null && keyFieldSchemas.length > 0) {
        isList = keyFieldSchemas[0].type instanceof FList;
      }
    }
    if (isList) {
      sb.push(`---@field ${refName} table<number,${dstTable}>\n`);
    } else {
      sb.push(`---@field ${refName} ${dstTable}\n`);
    }
    hasRef = true;
  }

  if (hasRef) {
    const last = sb[sb.length - 1];
    sb[sb.length - 1] = last.substring(0, last.length - 1);
    return sb.join('');
  }
  return '';
}

// ---------------------------------------------------------------------------
// Type to Lua type mapping
// ---------------------------------------------------------------------------

function typeToLuaType(type: typeof Primitive[keyof typeof Primitive] | StructRef | FList | FMap): string {
  if (typeof type === 'string') {
    switch (type) {
      case Primitive.BOOL: return 'boolean';
      case Primitive.INT:
      case Primitive.LONG:
      case Primitive.FLOAT: return 'number';
      case Primitive.STRING: return 'string';
      case Primitive.TEXT: return 'text';
      default: return 'any';
    }
  }
  if (type instanceof StructRef) {
    // Use full name if resolved, otherwise just the name
    return type.obj ? type.obj.name() : type.name;
  }
  if (type instanceof FList) {
    return `table<number,${typeToLuaType(type.item)}>`;
  }
  if (type instanceof FMap) {
    return `table<${typeToLuaType(type.key)},${typeToLuaType(type.value)}>`;
  }
  return 'any';
}

// ---------------------------------------------------------------------------
// Text fields string
// ---------------------------------------------------------------------------

export function getLuaTextFieldsString(structural: Structural): string {
  const texts: string[] = [];
  for (const field of structural.fields()) {
    if (field.type === Primitive.TEXT) {
      texts.push(`${lower1(field.name)} = 1`);
    } else if (field.type instanceof FList) {
      if (field.type.item === Primitive.TEXT) {
        texts.push(`${lower1(field.name)} = 2`);
      }
    }
  }

  if (texts.length === 0) {
    return '';
  }

  return `\n    { ${texts.join(', ')} },`;
}

// ---------------------------------------------------------------------------
// Comment helper
// ---------------------------------------------------------------------------

export function getCommaDescStr(desc: string): string {
  if (desc.length === 0) {
    return '';
  }
  return ', ' + desc.replace(/\n/g, '---');
}


