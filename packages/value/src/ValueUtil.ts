/**
 * DCells + ValueUtil — TypeScript port of:
 *   Java `configgen.value.DCells.java` (32 lines)
 *   Java `configgen.value.ValueUtil.java` (143 lines)
 *
 * DCells: static helpers to decompose a DCell into sub-cells via pack/func/list parsing.
 * ValueUtil: static helpers for value creation, extraction, and inspection.
 */

import { DCell, DCellList, DFile, type Source } from '@cfggen/data';
import { parsePack, parseFunction } from '@cfggen/shared';
import { parseList } from '@cfggen/shared';
import {
  type Value,
  type SimpleValue,
  VList,
  VInt,
  VLong,
  VFloat,
  VString,
  VText,
  VBool,
  VStruct,
  type StringValue,
} from './CfgValue';
import type { ForeignKeySchema, Structural, TableSchema } from '@cfggen/schema';
import { findFieldIndices, findFieldIndexByName } from '@cfggen/schema';
import { RefPrimary, RefUniq, RefList } from '@cfggen/schema';
import type { CfgValue } from './CfgValue';

// ---------------------------------------------------------------------------
// DCells
// ---------------------------------------------------------------------------

export class DCells {
  static parseFunc(cell: DCell): DCell[] {
    return parseFunction(cell.value()).map((sub) => cell.createSub(sub));
  }

  static parsePack(cell: DCell): DCell[] {
    return parsePack(cell.value()).map((sub) => cell.createSub(sub));
  }

  static parseList(cell: DCell, separator: string): DCell[] {
    return parseList(cell.value(), separator).map((sub) => cell.createSub(sub));
  }

  static isFunc(cell: DCell): boolean {
    const v = cell.value().trim();
    if (v.length > 0) {
      const c = v.charAt(0);
      return ('a' <= c && c <= 'z') || ('A' <= c && c <= 'Z');
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// ValueUtil
// ---------------------------------------------------------------------------

export class ValueUtil {
  static createList(valueList: SimpleValue[]): VList {
    if (valueList.length === 0) {
      return new VList(valueList, DCellList.of());
    }

    const first = valueList[0];
    if (first.source instanceof DFile) {
      return new VList(valueList, (first.source as DFile).parent());
    }

    const list: DCell[] = [];
    for (const v of valueList) {
      const src = v.source;
      if (src instanceof DCell) {
        list.push(src);
      } else if (src instanceof DCellList) {
        list.push(...src.cells);
      }
      // DFile: ignored
    }
    return new VList(valueList, DCellList.fromCells(list));
  }

  static extractKeyValue(vStruct: VStruct, keyIndices: number[]): Value {
    if (keyIndices.length === 0) {
      throw new Error('key indices empty');
    }
    if (keyIndices.length === 1) {
      return vStruct.values[keyIndices[0]];
    }

    const values: SimpleValue[] = [];
    for (const keyIndex of keyIndices) {
      values.push(vStruct.values[keyIndex] as SimpleValue);
    }
    return ValueUtil.createList(values);
  }

  static extractPrimaryKeyValue(vStruct: VStruct, tableSchema: TableSchema): Value {
    const keyIndices = findFieldIndices(tableSchema, tableSchema.primaryKey());
    return ValueUtil.extractKeyValue(vStruct, keyIndices);
  }

  static extractFieldValue(vStruct: VStruct, fieldName: string): Value | null {
    const idx = findFieldIndexByName(vStruct.schema, fieldName);
    if (idx === -1) {
      return null;
    }
    return vStruct.values[idx];
  }

  static extractFieldValueStr(vStruct: VStruct, fieldName: string): string | null {
    const fv = ValueUtil.extractFieldValue(vStruct, fieldName);
    if (fv === null) {
      return null;
    }

    if (fv instanceof VString || fv instanceof VText) {
      return (fv as StringValue).value;
    } else {
      return fv.packStr();
    }
  }

  static getForeignKeyValueMap(
    cfgValue: CfgValue,
    fk: ForeignKeySchema,
  ): Map<Value, VStruct> | null {
    const refKey = fk.refKey;
    if (refKey instanceof RefPrimary) {
      const vTable = cfgValue.vTableMap.get(fk.refTableNormalized());
      return vTable ? vTable.primaryKeyMap : null;
    } else if (refKey instanceof RefUniq) {
      const vTable = cfgValue.vTableMap.get(fk.refTableNormalized());
      if (!vTable) return null;
      // Find matching unique key map by key names
      for (const [keyArr, map] of vTable.uniqueKeyMaps.entries()) {
        const refUniqKeyNames = refKey.keyNames();
        if (keyArr.length === refUniqKeyNames.length &&
            keyArr.every((k, i) => k === refUniqKeyNames[i])) {
          return map;
        }
      }
      return null;
    } else if (refKey instanceof RefList) {
      return null;
    }
    return null;
  }

  static isValueCellsNotAllEmpty(value: Value): boolean {
    const src = value.source;
    if (src instanceof DCell) {
      return !src.isCellEmpty();
    } else if (src instanceof DCellList) {
      return src.cells.some((c) => !c.isCellEmpty());
    } else {
      // DFile
      return true;
    }
  }

  static isValueNumber0(value: Value): boolean {
    if (value instanceof VInt) {
      return (value as VInt).value === 0;
    }
    if (value instanceof VLong) {
      return (value as VLong).value === 0;
    }
    if (value instanceof VFloat) {
      return (value as VFloat).value === 0;
    }
    return false;
  }

  static isValueFromPackOrSepOrJson(value: Value): boolean {
    const src = value.source;
    if (src instanceof DCell) {
      return src.isModePackOrSep();
    } else if (src instanceof DCellList) {
      return false;
    } else {
      // DFile
      return true;
    }
  }
}
