/**
 * HeadRow / HeadRows — TypeScript port of Java `configgen.data.HeadRow`/`HeadRows`.
 *
 * HeadRow is an interface that defines how to interpret the header rows of
 * an Excel/CSV table: which row is the comment row, which is the name row,
 * and which (optional) row carries suggested types.
 *
 * HeadRows provides the standard implementations:
 *   - A2_Default: 2 header rows (comment=0, name=1, no type suggestion)
 *   - A3: 3 header rows (same layout as A2 but with an extra row)
 *   - A4: 4 header rows (name=0, type=1, data=2, comment=3)
 */

import { Primitive, type FieldType } from '@cfgforge/schema';

export enum ParseBoolResult {
  TRUE,
  FALSE,
  INVALID,
}

export interface HeadRow {
  rowCount(): number;
  commentRow(): number;
  nameRow(): number;
  suggestedTypeRow(): number;
  parseType(type: string): FieldType | null;
  parseLong(str: string): number;
  parseBool(str: string): ParseBoolResult;
}

// ---------------------------------------------------------------------------
// Shared default implementation logic
// ---------------------------------------------------------------------------

function parseLongImpl(str: string): number {
  if (str.length === 0) {
    return 0;
  }
  // Avoid Excel scientific notation: strip leading '*'
  let s = str;
  if (s.charAt(0) === '*') {
    s = s.substring(1);
  }
  // Hex (0x/0X/# prefix) via hex parse, decimal otherwise
  if (s.startsWith('0x') || s.startsWith('0X') || s.startsWith('#')) {
    let hexStr = s;
    if (hexStr.startsWith('0x') || hexStr.startsWith('0X')) {
      hexStr = hexStr.substring(2);
    } else if (hexStr.startsWith('#')) {
      hexStr = hexStr.substring(1);
    }
    const result = parseInt(hexStr, 16);
    if (isNaN(result)) {
      throw new Error(`Cannot parse as number: ${str}`);
    }
    return result;
  }
  const result = parseInt(s, 10);
  if (isNaN(result)) {
    throw new Error(`Cannot parse as number: ${str}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Default base class (A2_Default and A3 share this)
// ---------------------------------------------------------------------------

abstract class DefaultHeadRow implements HeadRow {
  commentRow(): number { return 0; }
  nameRow(): number { return 1; }
  suggestedTypeRow(): number { return -1; }
  parseType(_type: string): FieldType | null {
    return Primitive.STRING as FieldType;
  }
  parseLong(str: string): number {
    return parseLongImpl(str);
  }
  parseBool(str: string): ParseBoolResult {
    if (str == null || str.length === 0) {
      return ParseBoolResult.FALSE;
    }
    switch (str.toLowerCase()) {
      case '1':
      case 'true':
        return ParseBoolResult.TRUE;
      case '0':
      case 'false':
        return ParseBoolResult.FALSE;
      default:
        return ParseBoolResult.INVALID;
    }
  }
  abstract rowCount(): number;
}

// ---------------------------------------------------------------------------
// A2_Default
// ---------------------------------------------------------------------------

class A2DefaultImpl extends DefaultHeadRow {
  rowCount(): number { return 2; }
}

// ---------------------------------------------------------------------------
// A3
// ---------------------------------------------------------------------------

class A3Impl extends DefaultHeadRow {
  rowCount(): number { return 3; }
}

// ---------------------------------------------------------------------------
// A4 (different layout: name=0, type=1, data=2, comment=3)
// ---------------------------------------------------------------------------

class A4Impl implements HeadRow {
  rowCount(): number { return 4; }
  commentRow(): number { return 3; }
  nameRow(): number { return 0; }
  suggestedTypeRow(): number { return 1; }

  parseType(type: string): FieldType | null {
    const t = type.toUpperCase();
    switch (t) {
      case 'INT':
      case 'SHORT':
      case 'BYTE':
        return Primitive.INT as FieldType;
      case 'LONG':
      case 'INT64':
        return Primitive.LONG as FieldType;
      case 'FLOAT':
        return Primitive.FLOAT as FieldType;
      case 'BOOL':
        return Primitive.BOOL as FieldType;
      case 'STRING':
      case 'SLICEBYTE':
      case 'HASHID':
        return Primitive.STRING as FieldType;
      default:
        return null;
    }
  }

  parseLong(str: string): number {
    return parseLongImpl(str);
  }

  parseBool(str: string): ParseBoolResult {
    if (str.length === 0) {
      return ParseBoolResult.FALSE;
    }
    return (str === '0' || str.toLowerCase() === 'false')
      ? ParseBoolResult.FALSE
      : ParseBoolResult.TRUE;
  }
}

// ---------------------------------------------------------------------------
// HeadRows: registry of standard implementations
// ---------------------------------------------------------------------------

export class HeadRows {
  static readonly A2_Default: HeadRow = new A2DefaultImpl();
  static readonly A3: HeadRow = new A3Impl();
  static readonly A4: HeadRow = new A4Impl();

  static getById(name: string): HeadRow {
    switch (name) {
      case '2': return HeadRows.A2_Default;
      case '3': return HeadRows.A3;
      case '4': return HeadRows.A4;
      default:
        throw new Error(`Unknown HeadRow name: ${name}`);
    }
  }
}
