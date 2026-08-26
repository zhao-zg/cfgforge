/**
 * Tests for DCells + ValueUtil (T4.2b).
 * Java sources: configgen.value.DCells.java (32 lines), ValueUtil.java (143 lines)
 */

import { describe, it, expect } from 'vitest';
import { DCells, ValueUtil } from '../ValueUtil';
import {
  VBool, VInt, VLong, VFloat, VString, VText, VStruct, VInterface, VList, VMap,
  type Value, type SimpleValue,
} from '../CfgValue';
import { DCell, DCellList, DFile, DRowId } from '@cfgforge/data';
import type { Structural, TableSchema, CfgSchema } from '@cfgforge/schema';
import { RefPrimary, RefUniq, RefList, KeySchema, ForeignKeySchema, Metadata_of } from '@cfgforge/schema';
import { findFieldIndexByName } from '@cfgforge/schema';

// Helper: create a DCell with simple defaults
function makeCell(value: string, row = 0, col = 0): DCell {
  return new DCell(value, new DRowId('test.csv', '', row), col, 0);
}

// Helper: create a mock VStruct with given field values
function makeMockVStruct(values: Value[]): VStruct {
  const mockSchema: Structural = {
    name: () => 'TestStruct',
    fields: () => [],
  } as unknown as Structural;
  return new VStruct(mockSchema, values, makeCell('test'));
}

// Helper: create a mock TableSchema with primaryKey
function makeMockTableSchema(pkFieldNames: string[]): TableSchema {
  const keySchema = new KeySchema(pkFieldNames, []);
  const mockSchema: TableSchema = {
    name: () => 'TestTable',
    primaryKey: () => keySchema,
    fields: () => [],
  } as unknown as TableSchema;
  return mockSchema;
}

describe('DCells', () => {
  describe('parseFunc', () => {
    it('parses function call "a(b,c)" into sub-cells', () => {
      const cell = makeCell('a(b,c)');
      const result = DCells.parseFunc(cell);
      expect(result.length).toBe(2);
      expect(result[0].value()).toBe('a');
      expect(result[1].value()).toBe('b,c');
    });

    it('parses function call "func(x)" into sub-cells', () => {
      const cell = makeCell('func(x)');
      const result = DCells.parseFunc(cell);
      expect(result.length).toBe(2);
      expect(result[0].value()).toBe('func');
      expect(result[1].value()).toBe('x');
    });
  });

  describe('parsePack', () => {
    it('parses pack "a,b,c" into sub-cells', () => {
      const cell = makeCell('a,b,c');
      const result = DCells.parsePack(cell);
      expect(result.length).toBe(3);
      expect(result[0].value()).toBe('a');
      expect(result[1].value()).toBe('b');
      expect(result[2].value()).toBe('c');
    });

    it('parses pack "a,(b,c)" into sub-cells', () => {
      const cell = makeCell('a,(b,c)');
      const result = DCells.parsePack(cell);
      expect(result.length).toBe(2);
      expect(result[0].value()).toBe('a');
      expect(result[1].value()).toBe('b,c');
    });
  });

  describe('parseList', () => {
    it('parses list with comma separator', () => {
      const cell = makeCell('a,b,c');
      const result = DCells.parseList(cell, ',');
      expect(result.length).toBe(3);
      expect(result[0].value()).toBe('a');
      expect(result[1].value()).toBe('b');
      expect(result[2].value()).toBe('c');
    });

    it('parses list with semicolon separator', () => {
      const cell = makeCell('a;b;c');
      const result = DCells.parseList(cell, ';');
      expect(result.length).toBe(3);
      expect(result[0].value()).toBe('a');
      expect(result[1].value()).toBe('b');
      expect(result[2].value()).toBe('c');
    });
  });

  describe('isFunc', () => {
    it('returns true for cell starting with letter', () => {
      expect(DCells.isFunc(makeCell('func(x)'))).toBe(true);
      expect(DCells.isFunc(makeCell('ABC'))).toBe(true);
    });

    it('returns false for cell starting with non-letter', () => {
      expect(DCells.isFunc(makeCell('(args)'))).toBe(false);
      expect(DCells.isFunc(makeCell('123'))).toBe(false);
    });

    it('returns false for empty cell', () => {
      expect(DCells.isFunc(makeCell(''))).toBe(false);
      expect(DCells.isFunc(makeCell('  '))).toBe(false);
    });
  });
});

describe('ValueUtil', () => {
  describe('createList', () => {
    it('creates VList with empty source when list is empty', () => {
      const vl = ValueUtil.createList([]);
      expect(vl).toBeInstanceOf(VList);
      expect(vl.valueList.length).toBe(0);
      expect(vl.source).toBeInstanceOf(DCellList);
      expect((vl.source as DCellList).cells.length).toBe(0);
    });

    it('creates VList with DFile parent source when values come from DFile', () => {
      const dfile = new DFile('data.json', 'MyStruct');
      dfile.child('field1'); // ensure child works
      const v = new VString('hello', dfile);
      const vl = ValueUtil.createList([v]);
      expect(vl.source).toBeInstanceOf(DFile);
      // source should be parent of first value's source
      expect((vl.source as DFile).fileName).toBe('data.json');
    });

    it('creates VList with DCellList source from DCell values', () => {
      const cell1 = makeCell('a', 0, 0);
      const cell2 = makeCell('b', 0, 1);
      const v1 = new VString('a', cell1);
      const v2 = new VString('b', cell2);
      const vl = ValueUtil.createList([v1, v2]);
      expect(vl.source).toBeInstanceOf(DCellList);
      expect((vl.source as DCellList).cells.length).toBe(2);
    });

    it('creates VList with DCellList source from DCellList values', () => {
      const cell1 = makeCell('a', 0, 0);
      const cell2 = makeCell('b', 0, 1);
      const cellList = new DCellList([cell1, cell2]);
      const v = new VString('ab', cellList);
      const vl = ValueUtil.createList([v]);
      expect(vl.source).toBeInstanceOf(DCellList);
      expect((vl.source as DCellList).cells.length).toBe(2);
    });
  });

  describe('extractKeyValue', () => {
    it('throws on empty key indices', () => {
      expect(() => ValueUtil.extractKeyValue(makeMockVStruct([]), [])).toThrow();
    });

    it('extracts single key value', () => {
      const v0 = new VInt(42, makeCell('42'));
      const vs = makeMockVStruct([v0]);
      const result = ValueUtil.extractKeyValue(vs, [0]);
      expect(result).toBe(v0);
    });

    it('extracts multiple key values as VList', () => {
      const v0 = new VInt(1, makeCell('1', 0, 0));
      const v1 = new VString('name', makeCell('name', 0, 1));
      const vs = makeMockVStruct([v0, v1]);
      const result = ValueUtil.extractKeyValue(vs, [0, 1]);
      expect(result).toBeInstanceOf(VList);
      const vl = result as VList;
      expect(vl.valueList.length).toBe(2);
    });
  });

  describe('extractFieldValue', () => {
    it('returns null when field not found', () => {
      const vs = makeMockVStruct([new VInt(1, makeCell('1'))]);
      expect(ValueUtil.extractFieldValue(vs, 'nonexistent')).toBeNull();
    });

    it('returns field value when found', () => {
      const v0 = new VInt(42, makeCell('42'));
      // Mock schema that reports field at index 0 with name 'age'
      const mockSchema: Structural = {
        name: () => 'TestStruct',
        fields: () => [{ name: 'age' }],
      } as unknown as Structural;
      const vs = new VStruct(mockSchema, [v0], makeCell('test'));
      const result = ValueUtil.extractFieldValue(vs, 'age');
      expect(result).toBe(v0);
    });
  });

  describe('extractFieldValueStr', () => {
    it('returns null when field not found', () => {
      const vs = makeMockVStruct([new VInt(1, makeCell('1'))]);
      expect(ValueUtil.extractFieldValueStr(vs, 'nonexistent')).toBeNull();
    });

    it('returns string value for StringValue', () => {
      const v0 = new VString('hello', makeCell('hello'));
      const mockSchema: Structural = {
        name: () => 'TestStruct',
        fields: () => [{ name: 'name' }],
      } as unknown as Structural;
      const vs = new VStruct(mockSchema, [v0], makeCell('test'));
      expect(ValueUtil.extractFieldValueStr(vs, 'name')).toBe('hello');
    });

    it('returns packStr for non-StringValue', () => {
      const v0 = new VInt(42, makeCell('42'));
      const mockSchema: Structural = {
        name: () => 'TestStruct',
        fields: () => [{ name: 'age' }],
      } as unknown as Structural;
      const vs = new VStruct(mockSchema, [v0], makeCell('test'));
      expect(ValueUtil.extractFieldValueStr(vs, 'age')).toBe('42');
    });
  });

  describe('isValueCellsNotAllEmpty', () => {
    it('returns false for empty DCell', () => {
      const v = new VString('', makeCell(''));
      expect(ValueUtil.isValueCellsNotAllEmpty(v)).toBe(false);
    });

    it('returns true for non-empty DCell', () => {
      const v = new VString('hello', makeCell('hello'));
      expect(ValueUtil.isValueCellsNotAllEmpty(v)).toBe(true);
    });

    it('returns true if any cell in DCellList is non-empty', () => {
      const cellList = new DCellList([makeCell(''), makeCell('data')]);
      const v = new VString('data', cellList);
      expect(ValueUtil.isValueCellsNotAllEmpty(v)).toBe(true);
    });

    it('returns false if all cells in DCellList are empty', () => {
      const cellList = new DCellList([makeCell(''), makeCell('')]);
      const v = new VString('', cellList);
      expect(ValueUtil.isValueCellsNotAllEmpty(v)).toBe(false);
    });

    it('returns true for DFile source', () => {
      const dfile = new DFile('data.json', 'MyStruct');
      const v = new VString('hello', dfile);
      expect(ValueUtil.isValueCellsNotAllEmpty(v)).toBe(true);
    });
  });

  describe('isValueNumber0', () => {
    it('returns true for VInt 0', () => {
      expect(ValueUtil.isValueNumber0(new VInt(0, makeCell('0')))).toBe(true);
    });

    it('returns false for VInt non-zero', () => {
      expect(ValueUtil.isValueNumber0(new VInt(42, makeCell('42')))).toBe(false);
    });

    it('returns true for VLong 0', () => {
      expect(ValueUtil.isValueNumber0(new VLong(0n, makeCell('0')))).toBe(true);
    });

    it('returns true for VFloat 0', () => {
      expect(ValueUtil.isValueNumber0(new VFloat(0, makeCell('0')))).toBe(true);
    });

    it('returns false for VString', () => {
      expect(ValueUtil.isValueNumber0(new VString('hello', makeCell('hello')))).toBe(false);
    });

    it('returns false for VBool', () => {
      expect(ValueUtil.isValueNumber0(new VBool(false, makeCell('false')))).toBe(false);
    });
  });

  describe('isValueFromPackOrSepOrJson', () => {
    it('returns true for DCell with pack/sep mode', () => {
      const cell = makeCell('a,b');
      cell.setModePackOrSep();
      const v = new VString('a', cell);
      expect(ValueUtil.isValueFromPackOrSepOrJson(v)).toBe(true);
    });

    it('returns false for DCell without pack/sep mode', () => {
      const cell = makeCell('hello');
      const v = new VString('hello', cell);
      expect(ValueUtil.isValueFromPackOrSepOrJson(v)).toBe(false);
    });

    it('returns false for DCellList source', () => {
      const cellList = new DCellList([makeCell('a')]);
      const v = new VString('a', cellList);
      expect(ValueUtil.isValueFromPackOrSepOrJson(v)).toBe(false);
    });

    it('returns true for DFile source', () => {
      const dfile = new DFile('data.json', 'MyStruct');
      const v = new VString('hello', dfile);
      expect(ValueUtil.isValueFromPackOrSepOrJson(v)).toBe(true);
    });
  });
});
