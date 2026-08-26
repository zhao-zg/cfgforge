/**
 * Tests for CfgValueErrs + CfgValueException (T4.2a).
 * Java source: configgen.value.CfgValueErrs.java (239 lines)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CfgValueErrs,
  CfgValueException,
  EType,
  type VErr,
  type VWarn,
  // VErr factories
  parsePackErr,
  interfaceCellImplNotFound,
  internalError,
  fieldCellSpanNotEnough,
  fieldCellNotUsed,
  notMatchFieldType,
  mapKeyDuplicated,
  primaryOrUniqueKeyDuplicated,
  enumEmpty,
  entryContainsSpace,
  entryDuplicated,
  mustFillButCellEmpty,
  refNotNullableButCellEmpty,
  foreignValueNotFound,
  jsonFileReadErr,
  jsonStrEmpty,
  jsonParseException,
  jsonTypeNotExist,
  jsonTypeNotMatch,
  jsonValueNotMatchType,
  seqValueNotContinuous,
  // VWarn factory
  jsonHasExtraFields,
} from '../CfgValueErrs';
import { DFile, DCell } from '@cfgforge/data';
import type { Value } from '../CfgValue';

// Helper: create a minimal mock Value for error records
function mockValue(name: string): Value {
  return {
    source: new DCell(0, 0, name),
    packStr: () => name,
  } as unknown as Value;
}

describe('CfgValueErrs', () => {
  let errs: CfgValueErrs;

  beforeEach(() => {
    errs = CfgValueErrs.of();
  });

  describe('construction and basic ops', () => {
    it('of() creates empty instance', () => {
      expect(errs.errs).toEqual([]);
      expect(errs.warns).toEqual([]);
    });

    it('addErr adds to errs list', () => {
      const e = internalError('something went wrong');
      errs.addErr(e);
      expect(errs.errs.length).toBe(1);
      expect(errs.errs[0]).toBe(e);
    });

    it('addWarn adds to warns list', () => {
      const w = jsonHasExtraFields(new DFile('test.json', 'MyStruct'), 'MyStruct', new Set(['extra']));
      errs.addWarn(w);
      expect(errs.warns.length).toBe(1);
      expect(errs.warns[0]).toBe(w);
    });

    it('merge combines errors and warnings', () => {
      const e1 = internalError('err1');
      const e2 = internalError('err2');
      const w1 = jsonHasExtraFields(new DFile('a.json', 'A'), 'A', new Set(['x']));
      const w2 = jsonHasExtraFields(new DFile('b.json', 'B'), 'B', new Set(['y']));

      errs.addErr(e1);
      errs.addWarn(w1);

      const other = CfgValueErrs.of();
      other.addErr(e2);
      other.addWarn(w2);

      errs.merge(other);
      expect(errs.errs.length).toBe(2);
      expect(errs.warns.length).toBe(2);
    });
  });

  describe('checkErrors', () => {
    it('does not throw when no errors and no warns', () => {
      expect(() => errs.checkErrors('test', false)).not.toThrow();
    });

    it('does not throw when only warnings (allowErr=false)', () => {
      errs.addWarn(jsonHasExtraFields(new DFile('a.json', 'A'), 'A', new Set(['x'])));
      expect(() => errs.checkErrors('test', false)).not.toThrow();
    });

    it('throws CfgValueException when errors exist and allowErr=false', () => {
      errs.addErr(internalError('boom'));
      expect(() => errs.checkErrors('test', false)).toThrow(CfgValueException);
    });

    it('does not throw when errors exist but allowErr=true', () => {
      errs.addErr(internalError('boom'));
      expect(() => errs.checkErrors('test', true)).not.toThrow();
    });

    it('throws when allowErr=false (default param)', () => {
      errs.addErr(internalError('boom'));
      // checkErrors(prefix) defaults to allowErr=false
      expect(() => errs.checkErrors('test')).toThrow(CfgValueException);
    });

    it('exception holds reference to errs', () => {
      errs.addErr(internalError('boom'));
      try {
        errs.checkErrors('test', false);
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(CfgValueException);
        const ex = e as CfgValueException;
        expect(ex.getErrs()).toBe(errs);
        expect(ex.errs).toBe(errs);
      }
    });
  });

  describe('VErr factory functions and msg()', () => {
    it('parsePackErr', () => {
      const src = new DCell(1, 2, 'value');
      const e = parsePackErr(src, 'myField', 'bad pack format');
      expect(e._tag).toBe('ParsePackErr');
      expect(e.source).toBe(src);
      expect(e.nameable).toBe('myField');
      expect(e.err).toBe('bad pack format');
      expect(e.msg()).toContain('ParsePackErr');
      expect(e.msg()).toContain('myField');
      expect(e.msg()).toContain('bad pack format');
    });

    it('interfaceCellImplNotFound', () => {
      const src = new DCell(1, 2, 'value');
      const e = interfaceCellImplNotFound(src, 'IAction', 'Unknown');
      expect(e._tag).toBe('InterfaceCellImplNotFound');
      expect(e.interfaceName).toBe('IAction');
      expect(e.notFoundImpl).toBe('Unknown');
      expect(e.msg()).toContain('IAction');
      expect(e.msg()).toContain('Unknown');
    });

    it('internalError', () => {
      const e = internalError('should not happen');
      expect(e._tag).toBe('InternalError');
      expect(e.internal).toBe('should not happen');
      expect(e.msg()).toContain('should not happen');
    });

    it('fieldCellSpanNotEnough', () => {
      const src = new DCell(1, 2, 'value');
      const e = fieldCellSpanNotEnough(src, 'myField', 'items', 3, 1);
      expect(e._tag).toBe('FieldCellSpanNotEnough');
      expect(e.field).toBe('items');
      expect(e.expected).toBe(3);
      expect(e.notEnoughDataSpan).toBe(1);
      expect(e.msg()).toContain('items');
      expect(e.msg()).toContain('3');
    });

    it('fieldCellNotUsed', () => {
      const src = new DCell(1, 2, 'value');
      const e = fieldCellNotUsed(src, 'myField', ['col1', 'col2']);
      expect(e._tag).toBe('FieldCellNotUsed');
      expect(e.unused).toEqual(['col1', 'col2']);
      expect(e.msg()).toContain('col1');
      expect(e.msg()).toContain('col2');
    });

    it('notMatchFieldType', () => {
      const src = new DCell(1, 2, 'value');
      const e = notMatchFieldType(src, 'myField', 'age', 'int');
      expect(e._tag).toBe('NotMatchFieldType');
      expect(e.field).toBe('age');
      expect(e.expectedType).toBe('int');
      expect(e.msg()).toContain('age');
      expect(e.msg()).toContain('int');
    });

    it('mapKeyDuplicated', () => {
      const src = new DCell(1, 2, 'value');
      const e = mapKeyDuplicated(src, 'myField', 'myMap');
      expect(e._tag).toBe('MapKeyDuplicated');
      expect(e.field).toBe('myMap');
      expect(e.msg()).toContain('myMap');
    });

    it('primaryOrUniqueKeyDuplicated', () => {
      const v = mockValue('someValue');
      const e = primaryOrUniqueKeyDuplicated(v, 'myTable', ['id', 'name']);
      expect(e._tag).toBe('PrimaryOrUniqueKeyDuplicated');
      expect(e.table).toBe('myTable');
      expect(e.keys).toEqual(['id', 'name']);
      expect(e.msg()).toContain('myTable');
    });

    it('enumEmpty', () => {
      const src = new DCell(1, 2, 'value');
      const e = enumEmpty(src, 'myEnum');
      expect(e._tag).toBe('EnumEmpty');
      expect(e.table).toBe('myEnum');
    });

    it('entryContainsSpace', () => {
      const src = new DCell(1, 2, 'value');
      const e = entryContainsSpace(src, 'myEnum');
      expect(e._tag).toBe('EntryContainsSpace');
      expect(e.table).toBe('myEnum');
    });

    it('entryDuplicated', () => {
      const src = new DCell(1, 2, 'value');
      const e = entryDuplicated(src, 'myEnum');
      expect(e._tag).toBe('EntryDuplicated');
      expect(e.table).toBe('myEnum');
    });

    it('mustFillButCellEmpty', () => {
      const v = mockValue('requiredField');
      const e = mustFillButCellEmpty(v);
      expect(e._tag).toBe('MustFillButCellEmpty');
      expect(e.value).toBe(v);
    });

    it('refNotNullableButCellEmpty', () => {
      const v = mockValue('refField');
      const e = refNotNullableButCellEmpty(v, 'rec1');
      expect(e._tag).toBe('RefNotNullableButCellEmpty');
      expect(e.recordId).toBe('rec1');
    });

    it('foreignValueNotFound', () => {
      const v = mockValue('refField');
      const e = foreignValueNotFound(v, 'rec1', 'otherTable', 'id');
      expect(e._tag).toBe('ForeignValueNotFound');
      expect(e.recordId).toBe('rec1');
      expect(e.foreignTable).toBe('otherTable');
      expect(e.foreignKey).toBe('id');
    });

    it('jsonFileReadErr', () => {
      const e = jsonFileReadErr('data.json', 'file not found');
      expect(e._tag).toBe('JsonFileReadErr');
      expect(e.jsonFile).toBe('data.json');
      expect(e.errMsg).toBe('file not found');
    });

    it('jsonStrEmpty', () => {
      const dfile = new DFile('empty.json', 'Empty');
      const e = jsonStrEmpty(dfile);
      expect(e._tag).toBe('JsonStrEmpty');
      expect(e.source).toBe(dfile);
    });

    it('jsonParseException', () => {
      const dfile = new DFile('bad.json', 'Bad');
      const e = jsonParseException(dfile, 'unexpected token');
      expect(e._tag).toBe('JsonParseException');
      expect(e.err).toBe('unexpected token');
    });

    it('jsonTypeNotExist', () => {
      const dfile = new DFile('data.json', 'S');
      const e = jsonTypeNotExist(dfile, 'UnknownType');
      expect(e._tag).toBe('JsonTypeNotExist');
      expect(e.expected).toBe('UnknownType');
    });

    it('jsonTypeNotMatch', () => {
      const dfile = new DFile('data.json', 'S');
      const e = jsonTypeNotMatch(dfile, 'Actual', 'Expected');
      expect(e._tag).toBe('JsonTypeNotMatch');
      expect(e.type).toBe('Actual');
      expect(e.expected).toBe('Expected');
    });

    it('jsonValueNotMatchType', () => {
      const dfile = new DFile('data.json', 'S');
      const e = jsonValueNotMatchType(dfile, 'hello', EType.INT);
      expect(e._tag).toBe('JsonValueNotMatchType');
      expect(e.value).toBe('hello');
      expect(e.expectedType).toBe(EType.INT);
    });

    it('seqValueNotContinuous', () => {
      const src = new DCell(1, 2, 'value');
      const e = seqValueNotContinuous(src, 'myTable', 'seq', 5);
      expect(e._tag).toBe('SeqValueNotContinuous');
      expect(e.field).toBe('seq');
      expect(e.expectedValue).toBe(5);
    });
  });

  describe('VWarn factory', () => {
    it('jsonHasExtraFields', () => {
      const dfile = new DFile('data.json', 'MyStruct');
      const w = jsonHasExtraFields(dfile, 'MyStruct', new Set(['extra1', 'extra2']));
      expect(w._tag).toBe('JsonHasExtraFields');
      expect(w.source).toBe(dfile);
      expect(w.type).toBe('MyStruct');
      expect(w.extraFields.size).toBe(2);
      expect(w.extraFields.has('extra1')).toBe(true);
      expect(w.extraFields.has('extra2')).toBe(true);
      expect(w.msg()).toContain('extra1');
      expect(w.msg()).toContain('extra2');
    });
  });

  describe('EType enum', () => {
    it('has all 9 type values', () => {
      expect(EType.BOOL).toBe('BOOL');
      expect(EType.INT).toBe('INT');
      expect(EType.LONG).toBe('LONG');
      expect(EType.FLOAT).toBe('FLOAT');
      expect(EType.STR).toBe('STR');
      expect(EType.ARRAY).toBe('ARRAY');
      expect(EType.MAP).toBe('MAP');
      expect(EType.MAP_ENTRY).toBe('MAP_ENTRY');
      expect(EType.STRUCT).toBe('STRUCT');
    });

    it('Object.values has 9 entries', () => {
      expect(Object.keys(EType).length).toBe(9);
    });
  });
});
