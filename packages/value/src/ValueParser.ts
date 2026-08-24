/**
 * ValueParser — TypeScript port of Java `configgen.value.ValueParser`.
 *
 * Core recursive descent parser: converts DCell[] → CfgValue hierarchy.
 *
 * Key types:
 * - CellsWithRowIndex: record holding cells + row index
 * - BlockParser: interface for block-aware parsing (dummy impl included)
 * - ParseContext: record carrying parse state (nameable, pack, canBeEmpty, rowIndex)
 * - ValueParser: the parser itself
 *
 * Java source: configgen.value.ValueParser.java (538 lines)
 */

import { DCell, DCellList, type Source, type HeadRow } from '@cfggen/data';
import { ParseBoolResult } from '@cfggen/data';
import type {
  Structural,
  FieldSchema,
  SimpleType,
  Fieldable,
} from '@cfggen/schema';
import {
  Primitive,
  StructRef,
  FList,
  FMap,
  isPrimitive,
  isStructRef,
  isFList,
  isFMap,
  isSimpleType,
} from '@cfggen/schema';
import { InterfaceSchema, StructSchema } from '@cfggen/schema';
import type { FieldFormat } from '@cfggen/schema';
import { AutoOrPack, Sep, isSep, isBlock } from '@cfggen/schema';
import { span, fieldSpan, simpleTypeSpan } from '@cfggen/schema';
import type { Value, SimpleValue } from './CfgValue';
import {
  VBool,
  VInt,
  VLong,
  VFloat,
  VString,
  VText,
  VStruct,
  VInterface,
  VList,
  VMap,
} from './CfgValue';
import { CfgValueErrs } from './CfgValueErrs';
import * as Errs from './CfgValueErrs';
import { DCells } from './ValueUtil';

// ---------------------------------------------------------------------------
// decodeInt — mimics Java Integer.decode (supports 0x/0X/# hex prefixes)
// ---------------------------------------------------------------------------

function decodeInt(str: string): number {
  let s = str.trim();
  let result: number;
  if (s.startsWith('0x') || s.startsWith('0X')) {
    result = parseInt(s.substring(2), 16);
  } else if (s.startsWith('#')) {
    result = parseInt(s.substring(1), 16);
  } else {
    result = parseInt(s, 10);
  }
  if (isNaN(result)) {
    throw new Error(`Cannot parse as int: ${str}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// simpleValueEquals — for Map key duplicate detection
// (TS Map uses ===, but we need value-based equality like Java's equals/hashCode)
// ---------------------------------------------------------------------------

function simpleValueEquals(a: SimpleValue, b: SimpleValue): boolean {
  if (a instanceof VBool && b instanceof VBool) return a.equals(b);
  if (a instanceof VInt && b instanceof VInt) return a.equals(b);
  if (a instanceof VLong && b instanceof VLong) return a.equals(b);
  if (a instanceof VFloat && b instanceof VFloat) return a.equals(b);
  if ((a instanceof VString || a instanceof VText) &&
      (b instanceof VString || b instanceof VText)) {
    return (a as VString | VText).value === (b as VString | VText).value;
  }
  if (a instanceof VStruct && b instanceof VStruct) return a.equals(b);
  if (a instanceof VInterface && b instanceof VInterface) return a.equals(b);
  return false;
}

// ---------------------------------------------------------------------------
// CellsWithRowIndex
// ---------------------------------------------------------------------------

export class CellsWithRowIndex {
  constructor(
    public readonly cells: DCell[],
    public readonly rowIndex: number,
  ) {}
}

// ---------------------------------------------------------------------------
// BlockParser
// ---------------------------------------------------------------------------

export interface BlockParser {
  parseBlock(cells: DCell[], curRowIndex: number): CellsWithRowIndex[];
}

export const dummyBlockParser: BlockParser = {
  parseBlock(cells: DCell[], curRowIndex: number): CellsWithRowIndex[] {
    return [new CellsWithRowIndex(cells, curRowIndex)];
  },
};

// ---------------------------------------------------------------------------
// ParseContext
// ---------------------------------------------------------------------------

export class ParseContext {
  constructor(
    public readonly nameable: string,
    public readonly pack: boolean,
    public readonly canBeEmpty: boolean,
    public readonly curRowIndex: number,
  ) {
    if (nameable === null || nameable === undefined) {
      throw new Error('ParseContext nameable must not be null');
    }
  }
}

// ---------------------------------------------------------------------------
// ValueParser
// ---------------------------------------------------------------------------

export class ValueParser {
  private readonly errs: CfgValueErrs;
  private readonly headRow: HeadRow;
  private readonly blockParser: BlockParser;
  private currentCells: DCell[] | null = null;
  private readonly fieldMapCache: Map<Structural, Map<string, FieldSchema>> = new Map();

  constructor(errs: CfgValueErrs, headRow: HeadRow, blockParser: BlockParser) {
    if (!errs) throw new Error('errs must not be null');
    if (!headRow) throw new Error('headRow must not be null');
    if (!blockParser) throw new Error('blockParser must not be null');
    this.errs = errs;
    this.headRow = headRow;
    this.blockParser = blockParser;
  }

  // -------------------------------------------------------------------------
  // parseInterface
  // -------------------------------------------------------------------------

  parseInterface(
    subInterface: InterfaceSchema,
    cells: DCell[],
    sInterface: InterfaceSchema,
    parseContext: ParseContext,
  ): VInterface | null {
    let parsed = cells;
    this.currentCells = cells;

    let isEmpty = false;
    let isNumberOrBool = false;
    let canChildBeEmpty = parseContext.canBeEmpty;
    const isPack = parseContext.pack || sInterface.fmt() === AutoOrPack.PACK;

    if (isPack) {
      this.require(cells.length === 1, 'pack应该只占一格');
      const cell = cells[0];
      cell.setModePackOrSep();
      if (parseContext.canBeEmpty && cell.isCellEmpty()) {
        isEmpty = true;
      } else if (sInterface.canBeNumberOrBool()) {
        if (DCells.isFunc(cell)) {
          try {
            parsed = DCells.parseFunc(cell);
          } catch (e) {
            this.errs.addErr(Errs.parsePackErr(cell, sInterface.name(), (e as Error).message));
            return null;
          }
          canChildBeEmpty = false;
        } else {
          isNumberOrBool = true;
        }
      } else {
        try {
          parsed = DCells.parseFunc(cell);
        } catch (e) {
          this.errs.addErr(Errs.parsePackErr(cell, sInterface.name(), (e as Error).message));
          return null;
        }
        canChildBeEmpty = false;
      }
    } else {
      const wanted = span(sInterface);
      this.require(cells.length === wanted, `列宽度应一致, 结构定义宽度=${wanted}, 实际=${cells.length}`);
    }

    let vImpl: VStruct | null;

    if (isEmpty) {
      const impl = sInterface.defaultImplStruct();
      const subImpl = subInterface.defaultImplStruct();
      this.require(subImpl !== null);

      vImpl = this.parseStructural(subImpl, parsed, impl,
        new ParseContext(parseContext.nameable, true, true, parseContext.curRowIndex));
    } else {
      let impl: StructSchema;
      let subImpl: StructSchema;
      let implCells: DCell[];

      if (isNumberOrBool) {
        impl = sInterface.defaultImplStruct();
        subImpl = subInterface.defaultImplStruct();
        this.require(subImpl !== null);
        implCells = parsed;
      } else {
        const implName = parsed[0].value();
        if (implName.length > 0) {
          impl = sInterface.findImpl(implName) as StructSchema | null;
          if (impl === null) {
            this.errs.addErr(Errs.interfaceCellImplNotFound(parsed[0], sInterface.name(), implName));
            return null;
          }
          subImpl = subInterface.findImpl(implName) as StructSchema | null;
        } else {
          impl = sInterface.defaultImplStruct();
          subImpl = subInterface.defaultImplStruct();
        }

        this.require(subImpl !== null);
        const expected = isPack ? 1 : span(impl);
        if (parsed.length - 1 < expected) {
          this.errs.addErr(Errs.internalError(parsed[0].toString() + ' impl span not enough'));
          return null;
        }
        implCells = parsed.slice(1, expected + 1);
      }

      vImpl = this.parseStructural(subImpl, implCells, impl,
        new ParseContext(parseContext.nameable, isPack, canChildBeEmpty, parseContext.curRowIndex));
    }

    if (vImpl === null) {
      return null;
    }

    return new VInterface(subInterface, vImpl, DCellList.fromCells(cells));
  }

  // -------------------------------------------------------------------------
  // parseStructural
  // -------------------------------------------------------------------------

  parseStructural(
    subStructural: Structural,
    cells: DCell[],
    structural: Structural,
    parseContext: ParseContext,
  ): VStruct | null {
    this.currentCells = cells;

    let parsed = cells;
    let isEmpty = false;
    let canChildBeEmpty = parseContext.canBeEmpty;
    const isPack = parseContext.pack || structural.fmt() === AutoOrPack.PACK;
    let isSepFlag = false;

    if (isPack) {
      this.require(cells.length === 1, 'pack应该只占一格');
      const cell = cells[0];
      cell.setModePackOrSep();
      if (parseContext.canBeEmpty && cell.isCellEmpty()) {
        isEmpty = true;
      } else {
        try {
          parsed = DCells.parsePack(cell);
        } catch (e) {
          this.errs.addErr(Errs.parsePackErr(cell, structural.name(), (e as Error).message));
          return null;
        }
        canChildBeEmpty = false;
      }
    } else if (isSep(structural.fmt())) {
      this.require(cells.length === 1, 'sep应该只占一格');
      const cell = cells[0];
      cell.setModePackOrSep();
      if (parseContext.canBeEmpty && cell.isCellEmpty()) {
        isEmpty = true;
      } else {
        const sepChar = (structural.fmt() as Sep).sep;
        parsed = DCells.parseList(cell, sepChar);
        canChildBeEmpty = false;
      }
      isSepFlag = true;
    } else {
      const wanted = span(structural);
      this.require(cells.length === wanted, `列宽度应一致, 结构定义=${wanted}, 实际=${cells.length}`);
    }

    const values: Value[] = [];

    if (isEmpty) {
      for (const subField of subStructural.fields()) {
        const field = this.findFieldCached(structural, subField.name);
        this.require(field !== null);
        const v = this.parseField(subField, parsed, field,
          new ParseContext(structural.name(), true, true, parseContext.curRowIndex));
        if (v !== null) {
          values.push(v);
        } else {
          return null;
        }
      }
    } else {
      let startIdx = 0;
      for (const field of structural.fields()) {
        const expected = isPack || isSepFlag ? 1 : fieldSpan(field);
        const subField = this.findFieldCached(subStructural, field.name);
        if (subField !== null) {
          if (parsed.length < startIdx + expected) {
            this.errs.addErr(Errs.fieldCellSpanNotEnough(
              DCellList.fromCells(cells),
              structural.name(), field.name,
              expected, parsed.length - startIdx));
            return null;
          }

          const fieldCells = parsed.slice(startIdx, startIdx + expected);
          const v = this.parseField(subField, fieldCells, field,
            new ParseContext(structural.name(), isPack || field.fmt === AutoOrPack.PACK,
              canChildBeEmpty, parseContext.curRowIndex));
          if (v !== null) {
            values.push(v);
          } else {
            return null;
          }
        }
        startIdx += expected;
      }

      if (subStructural === structural) {
        if (startIdx < parsed.length) {
          this.errs.addErr(Errs.fieldCellNotUsed(
            DCellList.fromCells(cells),
            structural.name(),
            parsed.slice(startIdx).map((c) => c.value())));
        }
      }
    }

    return new VStruct(subStructural, values, DCellList.fromCells(cells));
  }

  // -------------------------------------------------------------------------
  // parseSimpleType
  // -------------------------------------------------------------------------

  parseSimpleType(
    subType: SimpleType,
    cells: DCell[],
    type: SimpleType,
    parseContext: ParseContext,
    fieldSchema: FieldSchema,
  ): SimpleValue | null {
    this.currentCells = cells;

    if (isPrimitive(type)) {
      this.require(cells.length === 1);
      const cell = cells[0];
      const str = cell.value().trim();

      switch (type) {
        case Primitive.BOOL: {
          const result = this.headRow.parseBool(str);
          if (result === ParseBoolResult.INVALID) {
            this.errs.addErr(Errs.notMatchFieldType(cell, parseContext.nameable, fieldSchema.name, type));
          }
          return new VBool(result === ParseBoolResult.TRUE, cell);
        }

        case Primitive.INT: {
          let v = 0;
          try {
            v = str.length === 0 ? 0 : decodeInt(str);
          } catch {
            this.errs.addErr(Errs.notMatchFieldType(cell, parseContext.nameable, fieldSchema.name, type));
          }
          return new VInt(v, cell);
        }

        case Primitive.LONG: {
          let v = 0n;
          try {
            v = BigInt(this.headRow.parseLong(str));
          } catch {
            this.errs.addErr(Errs.notMatchFieldType(cell, parseContext.nameable, fieldSchema.name, type));
          }
          return new VLong(v, cell);
        }

        case Primitive.FLOAT: {
          let v = 0;
          if (str.length > 0) {
            v = parseFloat(str);
            if (isNaN(v)) {
              this.errs.addErr(Errs.notMatchFieldType(cell, parseContext.nameable, fieldSchema.name, type));
              v = 0;
            }
          }
          return new VFloat(v, cell);
        }

        case Primitive.STRING: {
          let s = str;
          if (fieldSchema.isLowercase()) {
            s = s.toLowerCase();
          }
          return new VString(s, cell);
        }

        case Primitive.TEXT: {
          let s = str;
          if (fieldSchema.isLowercase()) {
            s = s.toLowerCase();
          }
          return new VText(s, cell);
        }
      }
    }

    if (isStructRef(type)) {
      const obj = type.obj;
      if (!obj) return null;

      if (obj instanceof InterfaceSchema) {
        const subObj = (subType as StructRef).obj;
        const subInterface = subObj as InterfaceSchema;
        return this.parseInterface(subInterface, cells, obj, parseContext);
      }

      if (obj instanceof StructSchema) {
        const subObj = (subType as StructRef).obj;
        const subStruct = subObj as StructSchema;
        return this.parseStructural(subStruct, cells, obj, parseContext);
      }
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // parseField — entry point: dispatches by field type
  // -------------------------------------------------------------------------

  parseField(
    subField: FieldSchema,
    cells: DCell[],
    field: FieldSchema,
    parseContext: ParseContext,
  ): Value | null {
    this.currentCells = cells;

    const type = field.type;

    if (isSimpleType(type)) {
      const subType = subField.type as SimpleType;
      const v = this.parseSimpleType(subType, cells, type, parseContext, field);
      if (field.isMustFill() && cells.every((c) => c.isCellEmpty())) {
        this.errs.addErr(Errs.mustFillButCellEmpty(v!));
      }
      return v;
    }

    if (isFList(type)) {
      const vList = this.parseList(subField, cells, field, parseContext);
      if (vList === null) return null;
      if (field.isMustFill() && vList.valueList.length === 0) {
        this.errs.addErr(Errs.mustFillButCellEmpty(vList));
      }
      return vList;
    }

    if (isFMap(type)) {
      const vMap = this.parseMap(subField, cells, field, parseContext);
      if (vMap === null) return null;
      if (field.isMustFill() && vMap.valueMap.size === 0) {
        this.errs.addErr(Errs.mustFillButCellEmpty(vMap));
      }
      return vMap;
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // parseMap
  // -------------------------------------------------------------------------

  parseMap(
    subField: FieldSchema,
    cells: DCell[],
    field: FieldSchema,
    parseContext: ParseContext,
  ): VMap | null {
    this.currentCells = cells;

    const subType = subField.type as FMap;
    const type = field.type as FMap;

    const blocks = this.parseToBlocks(cells, field, parseContext, false);
    if (blocks === null) return null;

    const valueMap = new Map<SimpleValue, SimpleValue>();

    const kc = parseContext.pack ? 1 : simpleTypeSpan(type.key);
    const vc = parseContext.pack ? 1 : simpleTypeSpan(type.value);
    const itemSpan = kc + vc;

    this.forEachItem(blocks, itemSpan, field, parseContext, (itemCells, rowIndex) => {
      const keyCells = itemCells.slice(0, kc);
      const valueCells = itemCells.slice(kc, itemSpan);

      const ctx = new ParseContext(parseContext.nameable, parseContext.pack, false, rowIndex);
      const key = this.parseSimpleType(subType.key, keyCells, type.key, ctx, field);
      const value = this.parseSimpleType(subType.value, valueCells, type.value, ctx, field);

      if (key !== null && value !== null) {
        // Check for duplicate key (TS Map uses ===, need value-based equality)
        let existingKey: SimpleValue | null = null;
        for (const k of valueMap.keys()) {
          if (simpleValueEquals(key, k)) {
            existingKey = k;
            break;
          }
        }
        if (existingKey !== null) {
          this.errs.addErr(Errs.mapKeyDuplicated(
            DCellList.fromCells(keyCells), parseContext.nameable, field.name));
          valueMap.delete(existingKey);
        }
        valueMap.set(key, value);
      }
    });

    return new VMap(valueMap, DCellList.fromCells(cells));
  }

  // -------------------------------------------------------------------------
  // parseList
  // -------------------------------------------------------------------------

  parseList(
    subField: FieldSchema,
    cells: DCell[],
    field: FieldSchema,
    parseContext: ParseContext,
  ): VList | null {
    this.currentCells = cells;

    const subType = subField.type as FList;
    const type = field.type as FList;

    const blocks = this.parseToBlocks(cells, field, parseContext, true);
    if (blocks === null) return null;

    const valueList: SimpleValue[] = [];
    const itemSpan = parseContext.pack ? 1 : simpleTypeSpan(type.item);

    this.forEachItem(blocks, itemSpan, field, parseContext, (itemCells, rowIndex) => {
      const value = this.parseSimpleType(subType.item, itemCells, type.item,
        new ParseContext(parseContext.nameable, parseContext.pack, false, rowIndex),
        field);
      if (value !== null) {
        valueList.push(value);
      }
    });

    return new VList(valueList, DCellList.fromCells(cells));
  }

  // -------------------------------------------------------------------------
  // parseToBlocks (private)
  // -------------------------------------------------------------------------

  private parseToBlocks(
    cells: DCell[],
    field: FieldSchema,
    parseContext: ParseContext,
    allowSep: boolean,
  ): CellsWithRowIndex[] | null {
    let parsed: DCell[] | null = null;
    let blocks: CellsWithRowIndex[] | null = null;

    if (parseContext.pack) {
      this.require(cells.length === 1);
      const cell = cells[0];
      cell.setModePackOrSep();
      try {
        parsed = DCells.parsePack(cell);
      } catch (e) {
        this.errs.addErr(Errs.parsePackErr(cell, field.type.toString(), (e as Error).message));
        return null;
      }
    } else if (isBlock(field.fmt)) {
      blocks = this.blockParser.parseBlock(cells, parseContext.curRowIndex);
    } else if (allowSep && isSep(field.fmt)) {
      this.require(cells.length === 1);
      const cell = cells[0];
      cell.setModePackOrSep();
      const sepChar = (field.fmt as Sep).sep;
      parsed = DCells.parseList(cell, sepChar);
    } else {
      this.require(cells.length === fieldSpan(field));
      parsed = cells;
    }

    if (blocks === null) {
      blocks = [new CellsWithRowIndex(parsed!, parseContext.curRowIndex)];
    }
    return blocks;
  }

  // -------------------------------------------------------------------------
  // forEachItem (private)
  // -------------------------------------------------------------------------

  private forEachItem(
    blocks: CellsWithRowIndex[],
    itemSpan: number,
    field: FieldSchema,
    parseContext: ParseContext,
    itemHandler: (itemCells: DCell[], rowIndex: number) => void,
  ): void {
    for (const block of blocks) {
      const curLineParsed = block.cells;
      for (let startIdx = 0; startIdx < curLineParsed.length; startIdx += itemSpan) {
        if (startIdx + itemSpan > curLineParsed.length) {
          this.errs.addErr(Errs.fieldCellSpanNotEnough(
            DCellList.fromCells(curLineParsed.slice(startIdx)),
            parseContext.nameable, field.name, itemSpan, curLineParsed.length - startIdx));
          continue;
        }
        const itemCells = curLineParsed.slice(startIdx, startIdx + itemSpan);
        if (ValueParser.isCellNotAllEmpty(itemCells)) {
          itemHandler(itemCells, block.rowIndex);
        }
      }
    }
  }

  private static isCellNotAllEmpty(cells: DCell[]): boolean {
    for (const c of cells) {
      if (!c.isCellEmpty()) {
        return true;
      }
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // findFieldCached (private) — cached field lookup by name
  // -------------------------------------------------------------------------

  private findFieldCached(s: Structural, name: string): FieldSchema | null {
    let m = this.fieldMapCache.get(s);
    if (!m) {
      m = new Map<string, FieldSchema>();
      for (const f of s.fields()) {
        m.set(f.name, f);
      }
      this.fieldMapCache.set(s, m);
    }
    return m.get(name) ?? null;
  }

  // -------------------------------------------------------------------------
  // require (private) — internal assertion
  // -------------------------------------------------------------------------

  private require(cond: boolean, err?: string): void {
    if (!cond) {
      const msg = err ? `${err}:${this.currentCellStr()}` : this.currentCellStr();
      throw new Error(`AssertionError: ${msg}`);
    }
  }

  private currentCellStr(): string {
    let err = '';
    if (this.currentCells) {
      for (const c of this.currentCells) {
        err += `DCell{value=${c.value()}, row=${c.rowId().row}, col=${c.col()}, mode=${c.mode()}}\n`;
      }
    }
    return err;
  }
}
