/**
 * RecordBlockMapper — TypeScript port of Java `configgen.write.RecordBlockMapper`.
 *
 * Maps a VStruct (record) to a RecordBlock (2D string grid) using 5 mapping rules:
 * - auto: flatten struct fields horizontally (recursing into sub-structs/interfaces)
 * - pack: serialize entire value to one cell via packStr()
 * - sep: serialize VList or VStruct to a single sep-joined string
 * - fix: fixed-count list/map, elements laid out in a row (wrap to next row if overflow)
 * - block: variable-count list/map, elements laid out in rows of `fix` columns
 *
 * Java source: configgen.write.RecordBlockMapper.java (310 lines)
 */

import {
  type Value,
  VStruct,
  VInterface,
  VList,
  VMap,
  VBool, VInt, VLong, VFloat, VString, VText,
  type SimpleValue,
  type PrimitiveValue,
} from '@cfggen/value';
import {
  type FieldSchema,
  type Structural,
  type SimpleType,
  type FieldType,
  type FieldFormat,
  Sep,
  AutoOrPack,
  Fix,
  Block,
  FList,
  FMap,
  StructRef,
  isSep,
  isFix,
  isBlock,
  isPrimitive,
  isFList,
  isFMap,
  isStructRef,
  span,
  fieldSpan,
  simpleTypeSpan,
} from '@cfggen/schema';
import { RecordBlock } from './RecordBlock';
import { ValueToSepStr } from './ValueToSepStr';

/**
 * Return type for the internal mapping methods.
 * nextCol: the next available column index after mapping.
 * useRow: the number of rows consumed by this mapping (at least 1).
 */
interface NextColAndUseRow {
  nextCol: number;
  useRow: number;
}

/**
 * Parsed fix/block format info.
 * fix: the count (for Fix) or fixed count (for Block).
 * isBlock: true if Block, false if Fix.
 */
interface FixAndBlock {
  fix: number;
  isBlock: boolean;
}

/**
 * Element mapper function type (Java functional interface ElementMapper).
 */
type ElementMapper = (elemIdx: number, row: number, col: number) => number;

export class RecordBlockMapper {
  private readonly _record: VStruct;
  private readonly _block: RecordBlock;

  /**
   * Static entry point: map a VStruct to a RecordBlock.
   * This is the function injected into VTableStorage.mapToBlockFn.
   */
  static mapToBlock(record: VStruct): RecordBlock {
    const mapper = new RecordBlockMapper(record);
    mapper.map();
    return mapper._block;
  }

  constructor(record: VStruct) {
    this._record = record;
    this._block = new RecordBlock(span(record.schema as Structural));
  }

  map(): void {
    this._mapStructuralAuto(this._record, 0, 0);
  }

  // -------------------------------------------------------------------------
  // auto: map struct/table fields to block cells
  // -------------------------------------------------------------------------

  /**
   * Map a VStruct in AUTO format: iterate fields, dispatch by field fmt
   * and value type.
   */
  private _mapStructuralAuto(vStruct: VStruct, startRow: number, startCol: number): NextColAndUseRow {
    let idx = 0;
    let nextCol = startCol;
    let maxUseRow = 1;
    const schema = vStruct.schema as Structural;

    for (const field of schema.fields()) {
      const value = vStruct.values[idx];
      const fmt = field.fmt;

      if (fmt === AutoOrPack.PACK) {
        this._block.setCell(startRow, nextCol, value.packStr());
        nextCol++;
      } else if (fmt instanceof Sep) {
        // Sep format: must be VList
        if (!(value instanceof VList)) {
          throw new Error('Value is not VList for Sep format');
        }
        const sepStr = ValueToSepStr.toSepStrForList(value, field);
        this._block.setCell(startRow, nextCol, sepStr);
        nextCol++;
      } else {
        // auto format: dispatch by value type
        const result = this._mapAutoValue(value, field, startRow, nextCol);
        nextCol = result.nextCol;
        if (result.useRow > maxUseRow) {
          maxUseRow = result.useRow;
        }
      }
      idx++;
    }

    return { nextCol, useRow: maxUseRow };
  }

  /**
   * Dispatch an auto-format value to the appropriate mapping method.
   * `field` is the FieldSchema for this value (needed for fix/block VList/VMap).
   */
  private _mapAutoValue(value: Value, field: FieldSchema, startRow: number, startCol: number): NextColAndUseRow {
    if (RecordBlockMapper._isPrimitiveValue(value)) {
      this._block.setCell(startRow, startCol, value.toStr());
      return { nextCol: startCol + 1, useRow: 1 };
    }

    if (value instanceof VStruct) {
      return this._mapStruct(value, startRow, startCol);
    }

    if (value instanceof VInterface) {
      return this._mapInterface(value, startRow, startCol);
    }

    if (value instanceof VList) {
      // fmt is fix or block
      return this._mapListListOrBlock(value, field, startRow, startCol);
    }

    if (value instanceof VMap) {
      // fmt is fix or block
      return this._mapMapListOrBlock(value, field, startRow, startCol);
    }

    throw new Error('Unexpected value type in _mapAutoValue');
  }

  // -------------------------------------------------------------------------
  // mapStruct: map a sub-struct (field is auto, or list/map element is struct)
  // -------------------------------------------------------------------------

  private _mapStruct(vStruct: VStruct, startRow: number, startCol: number): NextColAndUseRow {
    const schema = vStruct.schema as Structural;
    const fmt = schema.fmt();
    let nextCol = startCol;
    let maxUseRow = 1;

    if (fmt === AutoOrPack.PACK) {
      this._block.setCell(startRow, nextCol, vStruct.packStr());
      nextCol++;
    } else if (fmt instanceof Sep) {
      const sepStr = ValueToSepStr.toSepStrForStruct(vStruct);
      this._block.setCell(startRow, nextCol, sepStr);
      nextCol++;
    } else if (fmt === AutoOrPack.AUTO) {
      const result = this._mapStructuralAuto(vStruct, startRow, nextCol);
      nextCol = result.nextCol;
      if (result.useRow > maxUseRow) {
        maxUseRow = result.useRow;
      }
    } else {
      throw new Error(`SHOULD NOT HAPPEN, Unsupported struct format: ${fmt}`);
    }

    return { nextCol, useRow: maxUseRow };
  }

  // -------------------------------------------------------------------------
  // mapInterface: map a sub-interface
  // -------------------------------------------------------------------------

  private _mapInterface(vInterface: VInterface, startRow: number, startCol: number): NextColAndUseRow {
    const fmt = vInterface.schema.fmt();
    let nextCol = startCol;
    let maxUseRow = 1;

    if (fmt === AutoOrPack.PACK) {
      this._block.setCell(startRow, nextCol, vInterface.packStr());
      nextCol++;
    } else if (fmt === AutoOrPack.AUTO) {
      const child = vInterface.child;
      this._block.setCell(startRow, nextCol, child.name());
      nextCol++;
      const result = this._mapStruct(child, startRow, nextCol);
      nextCol = result.nextCol;
      if (result.useRow > maxUseRow) {
        maxUseRow = result.useRow;
      }
    } else {
      throw new Error(`SHOULD NOT HAPPEN, Unsupported interface format: ${fmt}`);
    }

    return { nextCol, useRow: maxUseRow };
  }

  // -------------------------------------------------------------------------
  // mapList (fix/block): map a VList with fix or block fmt
  // -------------------------------------------------------------------------

  private _mapListListOrBlock(vList: VList, field: FieldSchema, startRow: number, startCol: number): NextColAndUseRow {
    const fb = RecordBlockMapper._parseFixOrBlock(field, 'VList');

    if (!(field.type instanceof FList)) {
      throw new Error('SHOULD NOT HAPPEN, FieldType is not FList for VList');
    }

    const values = vList.valueList;
    if (!fb.isBlock && values.length > fb.fix) {
      throw new Error(`VList size exceeds fixed length, size=${values.length}, fix=${fb.fix}`);
    }

    const item = field.type.item;
    const elemSpan = simpleTypeSpan(item);

    return this._mapElementsListOrBlock(
      values.length, fb.fix, elemSpan, startRow, startCol,
      (elemIdx, row, col) => this._mapSimpleValue(values[elemIdx], row, col),
    );
  }

  // -------------------------------------------------------------------------
  // mapMap (fix/block): map a VMap with fix or block fmt
  // -------------------------------------------------------------------------

  private _mapMapListOrBlock(vMap: VMap, field: FieldSchema, startRow: number, startCol: number): NextColAndUseRow {
    const fb = RecordBlockMapper._parseFixOrBlock(field, 'VMap');

    if (!(field.type instanceof FMap)) {
      throw new Error('SHOULD NOT HAPPEN, FieldType is not FMap for VMap');
    }

    const map = vMap.valueMap;
    if (!fb.isBlock && map.size > fb.fix) {
      throw new Error(`VMap size exceeds fixed length, size=${map.size}, fix=${fb.fix}`);
    }

    const entries = Array.from(map.entries());
    const keySpan = simpleTypeSpan(field.type.key);
    const valueSpan = simpleTypeSpan(field.type.value);
    const elemSpan = keySpan + valueSpan;

    return this._mapElementsListOrBlock(
      entries.length, fb.fix, elemSpan, startRow, startCol,
      (elemIdx, row, col) => {
        const entry = entries[elemIdx];
        const useRow1 = this._mapSimpleValue(entry[0], row, col);
        const useRow2 = this._mapSimpleValue(entry[1], row, col + keySpan);
        return Math.max(useRow1, useRow2);
      },
    );
  }

  // -------------------------------------------------------------------------
  // mapSimpleValue: map a SimpleValue (primitive, struct, or interface)
  // -------------------------------------------------------------------------

  private _mapSimpleValue(value: SimpleValue, row: number, col: number): number {
    if (RecordBlockMapper._isPrimitiveValue(value)) {
      this._block.setCell(row, col, value.toStr());
      return 1;
    }

    if (value instanceof VStruct) {
      return this._mapStruct(value, row, col).useRow;
    }

    if (value instanceof VInterface) {
      return this._mapInterface(value, row, col).useRow;
    }

    throw new Error('Unexpected SimpleValue type');
  }

  // -------------------------------------------------------------------------
  // mapElements: fix/block row-column skeleton
  // -------------------------------------------------------------------------

  /**
   * Lay out elements in a grid: `fix` elements per logical row, each
   * occupying `elemSpan` columns. For Fix format, exactly `fix` elements
   * in one row. For Block format, wrap to next row after `fix` elements.
   *
   * Returns nextCol (= startCol + fix * elemSpan) and useRow.
   */
  private _mapElementsListOrBlock(
    elemCount: number,
    fix: number,
    elemSpan: number,
    startRow: number,
    startCol: number,
    mapper: ElementMapper,
  ): NextColAndUseRow {
    const logicRowCount = Math.ceil(elemCount / fix);
    let nextRow = startRow;

    for (let logicRowIdx = 0; logicRowIdx < logicRowCount; logicRowIdx++) {
      let maxUseRow = 1;

      for (let logicColIdx = 0; logicColIdx < fix; logicColIdx++) {
        const elemIdx = logicRowIdx * fix + logicColIdx;
        if (elemIdx >= elemCount) {
          break;
        }
        const col = startCol + logicColIdx * elemSpan;
        const useRow = mapper(elemIdx, nextRow, col);

        if (useRow > maxUseRow) {
          maxUseRow = useRow;
        }
      }

      nextRow += maxUseRow;
    }

    return {
      nextCol: startCol + fix * elemSpan,
      useRow: Math.max(1, nextRow - startRow),
    };
  }

  // -------------------------------------------------------------------------
  // Static helpers
  // -------------------------------------------------------------------------

  private static _parseFixOrBlock(field: FieldSchema, valueKind: string): FixAndBlock {
    if (field.fmt instanceof Fix) {
      return { fix: field.fmt.count, isBlock: false };
    }
    if (field.fmt instanceof Block) {
      return { fix: field.fmt.fix, isBlock: true };
    }
    throw new Error(`SHOULD NOT HAPPEN, FieldFormat is not Fix or Block for ${valueKind}`);
  }

  private static _isPrimitiveValue(v: unknown): v is PrimitiveValue {
    return v instanceof VBool ||
      v instanceof VInt ||
      v instanceof VLong ||
      v instanceof VFloat ||
      v instanceof VString ||
      v instanceof VText;
  }
}
