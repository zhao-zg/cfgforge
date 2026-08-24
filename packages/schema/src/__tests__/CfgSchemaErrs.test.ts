import { describe, it, expect } from 'vitest';
import {
  CfgSchemaErrs,
  CfgSchemaException,
  // WeakWarn factories
  filterRefIgnoredByRefTableNotFound,
  filterRefIgnoredByRefKeyNotFound,
  // Warn factories
  nameMayConflictByRef,
  structNotUsed,
  interfaceNotUsed,
  lowercaseNotOnStrOrText,
  suggestTypeUnknown,
  mapKeyNotSupportEnumType,
  // Err factories
  fieldHeaderSpanNotEnough,
  tableNameNotLowerCase,
  implNamespaceNotEmpty,
  interfaceImplNameConflict,
  implNameConflict,
  nameConflict,
  innerNameConflict,
  typeStructNotFound,
  primitiveFieldFmtMustBeAuto,
  structFieldFmtMustBeAutoOrPack,
  listFieldFmtMustBePackOrSepOrFixOrBlock,
  mapFieldFmtMustBePackOrFixOrBlock,
  implFmtNotSupport,
  sepFmtStructHasUnPrimitiveField,
  listStructSepEqual,
  enumRefNotFound,
  interfaceImplEmpty,
  defaultImplNotFound,
  entryNotFound,
  entryFieldTypeNotStr,
  blockTableFirstFieldNotInPrimaryKey,
  blockFirstColOverlap,
  keyNotFound,
  keyTypeNotSupport,
  primaryKeyNotEnumOrIntWhenEnum,
  refTableNotFound,
  refTableKeyNotUniq,
  listRefMultiKeyNotSupport,
  refLocalKeyRemoteKeyCountNotMatch,
  refLocalKeyRemoteKeyTypeNotMatch,
  refContainerNullable,
  dataHeadNameNotIdentifier,
  dataHeadNameDuplicated,
  splitDataHeaderNotEqual,
  jsonTableNotSupportExcel,
  jsonTableNotSupportMap,
  mappingToExcelLoop,
  seqFieldMustBeInt,
} from '../CfgSchemaErrs';

describe('CfgSchemaErrs', () => {

  // =========================================================================
  // 1. of() creates an empty instance
  // =========================================================================

  describe('of()', () => {
    it('creates an instance with empty arrays', () => {
      const errs = CfgSchemaErrs.of();
      expect(errs).toBeInstanceOf(CfgSchemaErrs);
      expect(errs.errs).toEqual([]);
      expect(errs.warns).toEqual([]);
      expect(errs.weakWarns).toEqual([]);
    });
  });

  // =========================================================================
  // 2. addErr / addWarn / addWeakWarn
  // =========================================================================

  describe('addErr / addWarn / addWeakWarn', () => {
    it('addErr appends to errs', () => {
      const errs = CfgSchemaErrs.of();
      const e = tableNameNotLowerCase('T');
      errs.addErr(e);
      expect(errs.errs.length).toBe(1);
      expect(errs.errs[0]).toBe(e);
    });

    it('addWarn appends to warns', () => {
      const errs = CfgSchemaErrs.of();
      const w = structNotUsed('S');
      errs.addWarn(w);
      expect(errs.warns.length).toBe(1);
      expect(errs.warns[0]).toBe(w);
    });

    it('addWeakWarn appends to weakWarns', () => {
      const errs = CfgSchemaErrs.of();
      const ww = filterRefIgnoredByRefTableNotFound('T', 'fk', 'NRT');
      errs.addWeakWarn(ww);
      expect(errs.weakWarns.length).toBe(1);
      expect(errs.weakWarns[0]).toBe(ww);
    });
  });

  // =========================================================================
  // 3. merge()
  // =========================================================================

  describe('merge()', () => {
    it('merges errs, warns, and weakWarns from another instance', () => {
      const a = CfgSchemaErrs.of();
      a.addErr(tableNameNotLowerCase('T1'));
      a.addWarn(structNotUsed('S1'));

      const b = CfgSchemaErrs.of();
      b.addErr(nameConflict('N'));
      b.addWarn(interfaceNotUsed('I'));
      b.addWeakWarn(filterRefIgnoredByRefTableNotFound('T2', 'fk', 'NRT'));

      a.merge(b);

      expect(a.errs.length).toBe(2);
      expect(a.warns.length).toBe(2);
      expect(a.weakWarns.length).toBe(1);
      expect(a.errs[0]._tag).toBe('TableNameNotLowerCase');
      expect(a.errs[1]._tag).toBe('NameConflict');
    });
  });

  // =========================================================================
  // 4. checkErrors() — no errs does not throw
  // =========================================================================

  describe('checkErrors() without errs', () => {
    it('does not throw when only warns and weakWarns', () => {
      const errs = CfgSchemaErrs.of();
      errs.addWarn(structNotUsed('S'));
      errs.addWeakWarn(filterRefIgnoredByRefTableNotFound('T', 'fk', 'NRT'));
      expect(() => errs.checkErrors('test')).not.toThrow();
    });

    it('does not throw when empty', () => {
      const errs = CfgSchemaErrs.of();
      expect(() => errs.checkErrors('test')).not.toThrow();
    });
  });

  // =========================================================================
  // 5. checkErrors() — with errs throws CfgSchemaException
  // =========================================================================

  describe('checkErrors() with errs', () => {
    it('throws CfgSchemaException when errs is non-empty', () => {
      const errs = CfgSchemaErrs.of();
      errs.addErr(tableNameNotLowerCase('T'));
      expect(() => errs.checkErrors('test')).toThrow(CfgSchemaException);
    });
  });

  // =========================================================================
  // 6. CfgSchemaException holds errs reference
  // =========================================================================

  describe('CfgSchemaException', () => {
    it('holds a reference to the CfgSchemaErrs instance', () => {
      const errs = CfgSchemaErrs.of();
      errs.addErr(nameConflict('N'));
      let caught: CfgSchemaException | null = null;
      try {
        errs.checkErrors('test');
      } catch (e) {
        caught = e as CfgSchemaException;
      }
      expect(caught).toBeInstanceOf(CfgSchemaException);
      expect(caught!.getErrs()).toBe(errs);
      expect(caught!.errs).toBe(errs);
    });

    it('is an Error subclass', () => {
      const errs = CfgSchemaErrs.of();
      errs.addErr(nameConflict('N'));
      try {
        errs.checkErrors();
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect((e as CfgSchemaException).name).toBe('CfgSchemaException');
      }
    });
  });

  // =========================================================================
  // 7. msg() format for Err types
  // =========================================================================

  describe('Err msg() format', () => {
    it('TableNameNotLowerCase', () => {
      expect(tableNameNotLowerCase('T').msg()).toBe('TableNameNotLowerCase(T)');
    });

    it('NameConflict', () => {
      expect(nameConflict('N').msg()).toBe('NameConflict(N)');
    });

    it('InnerNameConflict', () => {
      expect(innerNameConflict('item', 'name').msg()).toBe('InnerNameConflict(item, name)');
    });

    it('FieldHeaderSpanNotEnough with number args', () => {
      expect(fieldHeaderSpanNotEnough('t', 'f', 3, 1).msg()).toBe('FieldHeaderSpanNotEnough(t, f, 3, 1)');
    });

    it('RefTableKeyNotUniq with array arg', () => {
      expect(refTableKeyNotUniq('t', 'fk', 'rt', ['a', 'b']).msg()).toBe(
        'RefTableKeyNotUniq(t, fk, rt, [a, b])',
      );
    });

    it('MappingToExcelLoop with array arg', () => {
      expect(mappingToExcelLoop(['a', 'b', 'c']).msg()).toBe('MappingToExcelLoop([a, b, c])');
    });

    it('SplitDataHeaderNotEqual with two arrays', () => {
      expect(splitDataHeaderNotEqual('s1', ['a'], 's2', ['b']).msg()).toBe(
        'SplitDataHeaderNotEqual(s1, [a], s2, [b])',
      );
    });

    it('PrimaryKeyNotEnumOrIntWhenEnum with 4 args', () => {
      expect(primaryKeyNotEnumOrIntWhenEnum('s', 'f', 'str', 'ef').msg()).toBe(
        'PrimaryKeyNotEnumOrIntWhenEnum(s, f, str, ef)',
      );
    });
  });

  // =========================================================================
  // 8. msg() format for Warn types
  // =========================================================================

  describe('Warn msg() format', () => {
    it('NameMayConflictByRef', () => {
      expect(nameMayConflictByRef('a', 'b').msg()).toBe('NameMayConflictByRef(a, b)');
    });

    it('StructNotUsed', () => {
      expect(structNotUsed('S').msg()).toBe('StructNotUsed(S)');
    });

    it('InterfaceNotUsed', () => {
      expect(interfaceNotUsed('I').msg()).toBe('InterfaceNotUsed(I)');
    });

    it('LowercaseNotOnStrOrText', () => {
      expect(lowercaseNotOnStrOrText('s', 'f', 'int').msg()).toBe(
        'LowercaseNotOnStrOrText(s, f, int)',
      );
    });

    it('SuggestTypeUnknown', () => {
      expect(suggestTypeUnknown('t', 'f', 'unk').msg()).toBe('SuggestTypeUnknown(t, f, unk)');
    });

    it('MapKeyNotSupportEnumType', () => {
      expect(mapKeyNotSupportEnumType('s', 'f', 'E').msg()).toBe(
        'MapKeyNotSupportEnumType(s, f, E)',
      );
    });
  });

  // =========================================================================
  // 9. msg() format for WeakWarn types
  // =========================================================================

  describe('WeakWarn msg() format', () => {
    it('FilterRefIgnoredByRefTableNotFound', () => {
      expect(filterRefIgnoredByRefTableNotFound('T', 'fk', 'NRT').msg()).toBe(
        'FilterRefIgnoredByRefTableNotFound(T, fk, NRT)',
      );
    });

    it('FilterRefIgnoredByRefKeyNotFound with array arg', () => {
      expect(filterRefIgnoredByRefKeyNotFound('T', 'fk', 'RT', ['k1', 'k2']).msg()).toBe(
        'FilterRefIgnoredByRefKeyNotFound(T, fk, RT, [k1, k2])',
      );
    });
  });

  // =========================================================================
  // 10. Factory functions produce correct _tag
  // =========================================================================

  describe('factory _tag correctness', () => {
    it('WeakWarn factories', () => {
      expect(filterRefIgnoredByRefTableNotFound('a', 'b', 'c')._tag).toBe(
        'FilterRefIgnoredByRefTableNotFound',
      );
      expect(filterRefIgnoredByRefKeyNotFound('a', 'b', 'c', ['d'])._tag).toBe(
        'FilterRefIgnoredByRefKeyNotFound',
      );
    });

    it('Warn factories', () => {
      expect(nameMayConflictByRef('a', 'b')._tag).toBe('NameMayConflictByRef');
      expect(structNotUsed('a')._tag).toBe('StructNotUsed');
      expect(interfaceNotUsed('a')._tag).toBe('InterfaceNotUsed');
      expect(lowercaseNotOnStrOrText('a', 'b', 'c')._tag).toBe('LowercaseNotOnStrOrText');
      expect(suggestTypeUnknown('a', 'b', 'c')._tag).toBe('SuggestTypeUnknown');
      expect(mapKeyNotSupportEnumType('a', 'b', 'c')._tag).toBe('MapKeyNotSupportEnumType');
    });

    it('Err factories (subset)', () => {
      expect(fieldHeaderSpanNotEnough('a', 'b', 1, 2)._tag).toBe('FieldHeaderSpanNotEnough');
      expect(tableNameNotLowerCase('a')._tag).toBe('TableNameNotLowerCase');
      expect(implNamespaceNotEmpty('a', 'b')._tag).toBe('ImplNamespaceNotEmpty');
      expect(interfaceImplNameConflict('a', 'b')._tag).toBe('InterfaceImplNameConflict');
      expect(implNameConflict('a', 'b', 'c')._tag).toBe('ImplNameConflict');
      expect(nameConflict('a')._tag).toBe('NameConflict');
      expect(innerNameConflict('a', 'b')._tag).toBe('InnerNameConflict');
      expect(typeStructNotFound('a', 'b', 'c')._tag).toBe('TypeStructNotFound');
      expect(primitiveFieldFmtMustBeAuto('a', 'b', 'c', 'd')._tag).toBe(
        'PrimitiveFieldFmtMustBeAuto',
      );
      expect(structFieldFmtMustBeAutoOrPack('a', 'b', 'c', 'd')._tag).toBe(
        'StructFieldFmtMustBeAutoOrPack',
      );
      expect(listFieldFmtMustBePackOrSepOrFixOrBlock('a', 'b', 'c', 'd')._tag).toBe(
        'ListFieldFmtMustBePackOrSepOrFixOrBlock',
      );
      expect(mapFieldFmtMustBePackOrFixOrBlock('a', 'b', 'c', 'd')._tag).toBe(
        'MapFieldFmtMustBePackOrFixOrBlock',
      );
      expect(implFmtNotSupport('a', 'b', 'c')._tag).toBe('ImplFmtNotSupport');
      expect(sepFmtStructHasUnPrimitiveField('a')._tag).toBe('SepFmtStructHasUnPrimitiveField');
      expect(listStructSepEqual('a', 'b')._tag).toBe('ListStructSepEqual');
      expect(enumRefNotFound('a', 'b')._tag).toBe('EnumRefNotFound');
      expect(interfaceImplEmpty('a')._tag).toBe('InterfaceImplEmpty');
      expect(defaultImplNotFound('a', 'b')._tag).toBe('DefaultImplNotFound');
      expect(entryNotFound('a', 'b')._tag).toBe('EntryNotFound');
      expect(entryFieldTypeNotStr('a', 'b', 'c')._tag).toBe('EntryFieldTypeNotStr');
      expect(blockTableFirstFieldNotInPrimaryKey('a')._tag).toBe(
        'BlockTableFirstFieldNotInPrimaryKey',
      );
      expect(blockFirstColOverlap('a', 'b')._tag).toBe('BlockFirstColOverlap');
      expect(keyNotFound('a', 'b')._tag).toBe('KeyNotFound');
      expect(keyTypeNotSupport('a', 'b', 'c')._tag).toBe('KeyTypeNotSupport');
      expect(primaryKeyNotEnumOrIntWhenEnum('a', 'b', 'c', 'd')._tag).toBe(
        'PrimaryKeyNotEnumOrIntWhenEnum',
      );
      expect(refTableNotFound('a', 'b', 'c')._tag).toBe('RefTableNotFound');
      expect(refTableKeyNotUniq('a', 'b', 'c', ['d'])._tag).toBe('RefTableKeyNotUniq');
      expect(listRefMultiKeyNotSupport('a', 'b', ['c'])._tag).toBe('ListRefMultiKeyNotSupport');
      expect(refLocalKeyRemoteKeyCountNotMatch('a', 'b')._tag).toBe(
        'RefLocalKeyRemoteKeyCountNotMatch',
      );
      expect(refLocalKeyRemoteKeyTypeNotMatch('a', 'b', 'c', 'd')._tag).toBe(
        'RefLocalKeyRemoteKeyTypeNotMatch',
      );
      expect(refContainerNullable('a', 'b')._tag).toBe('RefContainerNullable');
      expect(dataHeadNameNotIdentifier('a', 'b')._tag).toBe('DataHeadNameNotIdentifier');
      expect(dataHeadNameDuplicated('a', 'b')._tag).toBe('DataHeadNameDuplicated');
      expect(splitDataHeaderNotEqual('a', ['b'], 'c', ['d'])._tag).toBe(
        'SplitDataHeaderNotEqual',
      );
      expect(jsonTableNotSupportExcel('a', ['b'])._tag).toBe('JsonTableNotSupportExcel');
      expect(jsonTableNotSupportMap('a')._tag).toBe('JsonTableNotSupportMap');
      expect(mappingToExcelLoop(['a'])._tag).toBe('MappingToExcelLoop');
      expect(seqFieldMustBeInt('a', 'b', 'c')._tag).toBe('SeqFieldMustBeInt');
    });
  });

  // =========================================================================
  // 11. checkErrors default prefix
  // =========================================================================

  describe('checkErrors default prefix', () => {
    it('uses "schema" as default prefix', () => {
      const errs = CfgSchemaErrs.of();
      errs.addErr(nameConflict('N'));
      // Should throw with default prefix — just verify it throws
      expect(() => errs.checkErrors()).toThrow(CfgSchemaException);
    });
  });

  // =========================================================================
  // 12. msg() works after adding to CfgSchemaErrs
  // =========================================================================

  describe('msg() after collection', () => {
    it('errs retain msg() after addErr', () => {
      const errs = CfgSchemaErrs.of();
      const e = tableNameNotLowerCase('T');
      errs.addErr(e);
      expect(errs.errs[0].msg()).toBe('TableNameNotLowerCase(T)');
    });

    it('warns retain msg() after addWarn', () => {
      const errs = CfgSchemaErrs.of();
      const w = structNotUsed('S');
      errs.addWarn(w);
      expect(errs.warns[0].msg()).toBe('StructNotUsed(S)');
    });
  });
});
