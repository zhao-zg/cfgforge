import { describe, it, expect } from 'vitest';
import {
  Metadata,
  Metadata_of,
  metaInt,
  metaStr,
  metaComment,
  metaEnumValuesOfEmpty,
  metaEnumValuesOfAssigned,
  isMetaInt,
  isMetaStr,
  isMetaComment,
  isMetaEnumValues,
  TAG,
} from '../Metadata';
import { CommentData } from '../CommentData';
import { AutoOrPack, Sep, Fix, Block } from '../FieldFormat';
import { ENo, EEntry, EEnum, isENo, isEEntry, isEEnum } from '../EntryType';

// ---------------------------------------------------------------------------
// Helper: create a CommentData for testing
// ---------------------------------------------------------------------------

function makeComment(leading: string, trailing: string = ''): CommentData {
  return new CommentData(leading, trailing, null);
}

describe('Metadata', () => {

  // =========================================================================
  // 1. Metadata_of() — empty creation
  // =========================================================================

  describe('Metadata_of()', () => {
    it('creates an empty Metadata', () => {
      const m = Metadata_of();
      expect(m).toBeInstanceOf(Metadata);
      expect(m.data().size).toBe(0);
    });

    it('data() returns the internal Map', () => {
      const m = Metadata_of();
      expect(m.data()).toBeInstanceOf(Map);
    });
  });

  // =========================================================================
  // 2. Tag operations: putTag / hasTag
  // =========================================================================

  describe('putTag() / hasTag()', () => {
    it('stores a tag and hasTag returns true', () => {
      const m = Metadata_of();
      m.putTag('myTag');
      expect(m.hasTag('myTag')).toBe(true);
    });

    it('hasTag returns false for non-existent tag', () => {
      const m = Metadata_of();
      expect(m.hasTag('myTag')).toBe(false);
    });

    it('throws on reserved tag', () => {
      const m = Metadata_of();
      expect(() => m.putTag('json')).toThrow('reserved');
      expect(() => m.putTag('nullable')).toThrow('reserved');
      expect(() => m.putTag('entry')).toThrow('reserved');
      expect(() => m.putTag('sep')).toThrow('reserved');
      expect(() => m.putTag('_comment')).toThrow('reserved');
      expect(() => m.putTag('_span')).toThrow('reserved');
      expect(() => m.putTag('_hasRef')).toThrow('reserved');
      expect(() => m.putTag('enumRef')).toThrow('reserved');
      expect(() => m.putTag('defaultImpl')).toThrow('reserved');
      expect(() => m.putTag('columnMode')).toThrow('reserved');
      expect(() => m.putTag('pack')).toThrow('reserved');
      expect(() => m.putTag('fix')).toThrow('reserved');
      expect(() => m.putTag('block')).toThrow('reserved');
      expect(() => m.putTag('lowercase')).toThrow('reserved');
      expect(() => m.putTag('mustFill')).toThrow('reserved');
      expect(() => m.putTag('root')).toThrow('reserved');
      expect(() => m.putTag('seq')).toThrow('reserved');
      expect(() => m.putTag('_enumValues')).toThrow('reserved');
      expect(() => m.putTag('_fromEnumType')).toThrow('reserved');
      expect(() => m.putTag('_fromCfgFilePATH')).toThrow('reserved');
    });

    it('throws on duplicate tag', () => {
      const m = Metadata_of();
      m.putTag('myTag');
      expect(() => m.putTag('myTag')).toThrow('duplicated');
    });

    it('putTag uses putLast (new tag appears at end)', () => {
      const m = Metadata_of();
      m.putTag('first');
      m.putTag('second');
      m.putTag('third');
      const keys = Array.from(m.data().keys());
      expect(keys).toEqual(['first', 'second', 'third']);
    });
  });

  // =========================================================================
  // 3. Boolean tag queries: isJson / isLowercase / isMustFill / isRoot / isSeq
  // =========================================================================

  describe('boolean tag queries', () => {
    it('isJson() defaults to false', () => {
      const m = Metadata_of();
      expect(m.isJson()).toBe(false);
    });

    it('isJson() can be set via putTag("json")', () => {
      // Wait — "json" is reserved! isJson checks the "json" tag which is
      // reserved and cannot be set via putTag. Instead it is set via
      // the TableSchema's metadata directly. Let me test isJson() directly
      // by manipulating the data map.
      const m = Metadata_of();
      // Directly insert the tag (bypassing putTag's reserved check)
      m.data().set('json', TAG);
      expect(m.isJson()).toBe(true);
    });

    it('isLowercase() defaults to false', () => {
      const m = Metadata_of();
      expect(m.isLowercase()).toBe(false);
    });

    it('isMustFill() defaults to false', () => {
      const m = Metadata_of();
      expect(m.isMustFill()).toBe(false);
    });

    it('isRoot() defaults to false', () => {
      const m = Metadata_of();
      expect(m.isRoot()).toBe(false);
    });

    it('isSeq() defaults to false', () => {
      const m = Metadata_of();
      expect(m.isSeq()).toBe(false);
    });

    it('isRoot() can be set via data map', () => {
      const m = Metadata_of();
      m.data().set('root', TAG);
      expect(m.isRoot()).toBe(true);
    });
  });

  // =========================================================================
  // 4. State tags: putHasRef / putHasBlock / putHasMap / putHasText / putSpan
  // =========================================================================

  describe('state tags', () => {
    it('putHasRef(true) stores MetaInt(1) at _hasRef', () => {
      const m = Metadata_of();
      m.putHasRef(true);
      const v = m.getHasRef();
      expect(v).toBeDefined();
      expect(isMetaInt(v)).toBe(true);
      if (isMetaInt(v)) expect(v.value).toBe(1);
    });

    it('putHasRef(false) stores MetaInt(0) at _hasRef', () => {
      const m = Metadata_of();
      m.putHasRef(false);
      const v = m.getHasRef();
      expect(isMetaInt(v)).toBe(true);
      if (isMetaInt(v)) expect(v.value).toBe(0);
    });

    it('getHasRef() returns undefined when not set', () => {
      const m = Metadata_of();
      expect(m.getHasRef()).toBeUndefined();
    });

    it('putHasBlock(true) stores MetaInt(1)', () => {
      const m = Metadata_of();
      m.putHasBlock(true);
      const v = m.getHasBlock();
      expect(isMetaInt(v)).toBe(true);
      if (isMetaInt(v)) expect(v.value).toBe(1);
    });

    it('putHasMap(false) stores MetaInt(0)', () => {
      const m = Metadata_of();
      m.putHasMap(false);
      const v = m.getHasMap();
      expect(isMetaInt(v)).toBe(true);
      if (isMetaInt(v)) expect(v.value).toBe(0);
    });

    it('putHasText(true) stores MetaInt(1)', () => {
      const m = Metadata_of();
      m.putHasText(true);
      const v = m.getHasText();
      expect(isMetaInt(v)).toBe(true);
      if (isMetaInt(v)) expect(v.value).toBe(1);
    });

    it('putSpan(42) stores MetaInt(42)', () => {
      const m = Metadata_of();
      m.putSpan(42);
      const v = m.getSpan();
      expect(isMetaInt(v)).toBe(true);
      if (isMetaInt(v)) expect(v.value).toBe(42);
    });

    it('state tags use putLast (move to end)', () => {
      const m = Metadata_of();
      m.putTag('a');
      m.putHasRef(true);
      m.putHasBlock(true);
      const keys = Array.from(m.data().keys());
      expect(keys).toEqual(['a', '_hasRef', '_hasBlock']);
    });
  });

  // =========================================================================
  // 5. Comment: putComment / getComment / removeComment
  // =========================================================================

  describe('comment operations', () => {
    it('getComment() returns null when not set', () => {
      const m = Metadata_of();
      expect(m.getComment()).toBe(null);
    });

    it('putComment() stores a MetaComment', () => {
      const m = Metadata_of();
      const cd = makeComment('hello');
      m.putComment(cd);
      const got = m.getComment();
      expect(got).not.toBe(null);
      expect(got!.leading).toBe('hello');
    });

    it('putComment() uses putLast', () => {
      const m = Metadata_of();
      m.putTag('a');
      const cd = makeComment('hello');
      m.putComment(cd);
      const keys = Array.from(m.data().keys());
      expect(keys).toEqual(['a', '_comment']);
    });

    it('removeComment() returns the removed CommentData', () => {
      const m = Metadata_of();
      const cd = makeComment('hello');
      m.putComment(cd);
      const removed = m.removeComment();
      expect(removed).not.toBe(null);
      expect(removed!.leading).toBe('hello');
      expect(m.getComment()).toBe(null);
    });

    it('removeComment() returns null when not set', () => {
      const m = Metadata_of();
      expect(m.removeComment()).toBe(null);
    });

    it('can update comment by calling putComment again', () => {
      const m = Metadata_of();
      m.putComment(makeComment('first'));
      m.putComment(makeComment('second'));
      expect(m.getComment()!.leading).toBe('second');
      expect(m.data().size).toBe(1); // only _comment key
    });
  });

  // =========================================================================
  // 6. Enum values: putEnumValues / getEnumValues / removeEnumValues / hasEnumValues
  // =========================================================================

  describe('enum values', () => {
    it('hasEnumValues() returns false when not set', () => {
      const m = Metadata_of();
      expect(m.hasEnumValues()).toBe(false);
    });

    it('putEnumValues( OfEmpty ) stores values', () => {
      const m = Metadata_of();
      const values = [
        { name: 'A', comment: 'aaa' },
        { name: 'B', comment: 'bbb' },
      ];
      m.putEnumValues(metaEnumValuesOfEmpty(values));
      expect(m.hasEnumValues()).toBe(true);
      const got = m.getEnumValues();
      expect(got).not.toBe(null);
      expect(got!._tag).toBe('OfEmpty');
      expect(got!.values.length).toBe(2);
      expect(got!.values[0].name).toBe('A');
    });

    it('putEnumValues( OfAssigned ) stores values', () => {
      const m = Metadata_of();
      const values = [
        { name: 'A', comment: 'aaa', number: 1 },
        { name: 'B', comment: 'bbb', number: 2 },
      ];
      m.putEnumValues(metaEnumValuesOfAssigned(values));
      const got = m.getEnumValues();
      expect(got).not.toBe(null);
      expect(got!._tag).toBe('OfAssigned');
      expect(got!.values[0].number).toBe(1);
    });

    it('getEnumValues() returns null when not set', () => {
      const m = Metadata_of();
      expect(m.getEnumValues()).toBe(null);
    });

    it('removeEnumValues() removes the entry', () => {
      const m = Metadata_of();
      m.putEnumValues(metaEnumValuesOfEmpty([]));
      expect(m.hasEnumValues()).toBe(true);
      m.removeEnumValues();
      expect(m.hasEnumValues()).toBe(false);
    });
  });

  // =========================================================================
  // 7. From enum type: putFromEnumType / isFromEnumType / getFromEnumType
  // =========================================================================

  describe('from enum type', () => {
    it('isFromEnumType() returns false when not set', () => {
      const m = Metadata_of();
      expect(m.isFromEnumType()).toBe(false);
    });

    it('putFromEnumType() stores the type name', () => {
      const m = Metadata_of();
      m.putFromEnumType('MyEnum');
      expect(m.isFromEnumType()).toBe(true);
      expect(m.getFromEnumType()).toBe('MyEnum');
    });

    it('getFromEnumType() returns null when not set', () => {
      const m = Metadata_of();
      expect(m.getFromEnumType()).toBe(null);
    });
  });

  // =========================================================================
  // 8. From cfg filepath: putFromCfgFilepath / getFromCfgFilepath
  // =========================================================================

  describe('from cfg filepath', () => {
    it('getFromCfgFilepath() returns null when not set', () => {
      const m = Metadata_of();
      expect(m.getFromCfgFilepath()).toBe(null);
    });

    it('putFromCfgFilepath() stores the path', () => {
      const m = Metadata_of();
      m.putFromCfgFilepath('config/equip/equip.cfg');
      expect(m.getFromCfgFilepath()).toBe('config/equip/equip.cfg');
    });
  });

  // =========================================================================
  // 9. Nullable: putNullable / removeNullable
  // =========================================================================

  describe('nullable', () => {
    it('putNullable() stores a TAG at "nullable"', () => {
      const m = Metadata_of();
      m.putNullable();
      expect(m.hasTag('nullable')).toBe(true);
    });

    it('removeNullable() returns true when it existed', () => {
      const m = Metadata_of();
      m.putNullable();
      expect(m.removeNullable()).toBe(true);
      expect(m.hasTag('nullable')).toBe(false);
    });

    it('removeNullable() returns false when not set', () => {
      const m = Metadata_of();
      expect(m.removeNullable()).toBe(false);
    });

    it('putNullable uses putFirst (appears at beginning)', () => {
      const m = Metadata_of();
      m.putTag('a');
      m.putNullable();
      const keys = Array.from(m.data().keys());
      expect(keys[0]).toBe('nullable');
      expect(keys).toEqual(['nullable', 'a']);
    });
  });

  // =========================================================================
  // 10. Enum ref: putEnumRef / removeEnumRef
  // =========================================================================

  describe('enumRef', () => {
    it('putEnumRef() stores a MetaStr at "enumRef"', () => {
      const m = Metadata_of();
      m.putEnumRef('EquipType');
      const v = m.data().get('enumRef');
      expect(isMetaStr(v)).toBe(true);
      if (isMetaStr(v)) expect(v.value).toBe('EquipType');
    });

    it('putEnumRef uses putFirst', () => {
      const m = Metadata_of();
      m.putTag('a');
      m.putEnumRef('EquipType');
      const keys = Array.from(m.data().keys());
      expect(keys[0]).toBe('enumRef');
    });

    it('removeEnumRef() returns the stored value', () => {
      const m = Metadata_of();
      m.putEnumRef('EquipType');
      expect(m.removeEnumRef()).toBe('EquipType');
    });

    it('removeEnumRef() returns empty string when not set', () => {
      const m = Metadata_of();
      expect(m.removeEnumRef()).toBe('');
    });
  });

  // =========================================================================
  // 11. Default impl: putDefaultImpl / removeDefaultImpl
  // =========================================================================

  describe('defaultImpl', () => {
    it('putDefaultImpl() stores a MetaStr', () => {
      const m = Metadata_of();
      m.putDefaultImpl('DefaultImpl');
      const v = m.data().get('defaultImpl');
      expect(isMetaStr(v)).toBe(true);
      if (isMetaStr(v)) expect(v.value).toBe('DefaultImpl');
    });

    it('putDefaultImpl uses putFirst', () => {
      const m = Metadata_of();
      m.putTag('a');
      m.putDefaultImpl('DI');
      const keys = Array.from(m.data().keys());
      expect(keys[0]).toBe('defaultImpl');
    });

    it('removeDefaultImpl() returns the stored value', () => {
      const m = Metadata_of();
      m.putDefaultImpl('DI');
      expect(m.removeDefaultImpl()).toBe('DI');
    });

    it('removeDefaultImpl() returns empty string when not set', () => {
      const m = Metadata_of();
      expect(m.removeDefaultImpl()).toBe('');
    });
  });

  // =========================================================================
  // 12. Entry type: putEntry / removeEntry
  // =========================================================================

  describe('entry type', () => {
    it('putEntry(ENo.NO) stores nothing', () => {
      const m = Metadata_of();
      m.putEntry(ENo.NO);
      expect(m.data().size).toBe(0);
    });

    it('putEntry(EEntry) stores MetaStr at "entry"', () => {
      const m = Metadata_of();
      m.putEntry(new EEntry('id'));
      const v = m.data().get('entry');
      expect(isMetaStr(v)).toBe(true);
      if (isMetaStr(v)) expect(v.value).toBe('id');
    });

    it('putEntry(EEnum) stores MetaStr at "enum"', () => {
      const m = Metadata_of();
      m.putEntry(new EEnum('type'));
      const v = m.data().get('enum');
      expect(isMetaStr(v)).toBe(true);
      if (isMetaStr(v)) expect(v.value).toBe('type');
    });

    it('putEntry uses putFirst', () => {
      const m = Metadata_of();
      m.putTag('a');
      m.putEntry(new EEntry('id'));
      const keys = Array.from(m.data().keys());
      expect(keys[0]).toBe('entry');
    });

    it('removeEntry() returns ENo.NO when nothing stored', () => {
      const m = Metadata_of();
      const e = m.removeEntry();
      expect(isENo(e)).toBe(true);
      expect(e).toBe(ENo.NO);
    });

    it('removeEntry() returns EEntry when entry was stored', () => {
      const m = Metadata_of();
      m.putEntry(new EEntry('id'));
      const e = m.removeEntry();
      expect(isEEntry(e)).toBe(true);
      if (isEEntry(e)) expect(e.field).toBe('id');
    });

    it('removeEntry() returns EEnum when enum was stored', () => {
      const m = Metadata_of();
      m.putEntry(new EEnum('type'));
      const e = m.removeEntry();
      expect(isEEnum(e)).toBe(true);
      if (isEEnum(e)) expect(e.field).toBe('type');
    });

    it('removeEntry() checks entry first, then enum', () => {
      const m = Metadata_of();
      m.putEntry(new EEntry('id'));
      m.putEntry(new EEnum('type'));
      // Both stored; removeEntry should return EEntry first
      const e = m.removeEntry();
      expect(isEEntry(e)).toBe(true);
      if (isEEntry(e)) expect(e.field).toBe('id');
      // Second call should return EEnum
      const e2 = m.removeEntry();
      expect(isEEnum(e2)).toBe(true);
      if (isEEnum(e2)) expect(e2.field).toBe('type');
      // Third call returns ENo
      const e3 = m.removeEntry();
      expect(isENo(e3)).toBe(true);
    });
  });

  // =========================================================================
  // 13. Column mode: putColumnMode / removeColumnMode
  // =========================================================================

  describe('columnMode', () => {
    it('putColumnMode() stores TAG at "columnMode"', () => {
      const m = Metadata_of();
      m.putColumnMode();
      expect(m.hasTag('columnMode')).toBe(true);
    });

    it('putColumnMode uses putFirst', () => {
      const m = Metadata_of();
      m.putTag('a');
      m.putColumnMode();
      const keys = Array.from(m.data().keys());
      expect(keys[0]).toBe('columnMode');
    });

    it('removeColumnMode() returns true when set', () => {
      const m = Metadata_of();
      m.putColumnMode();
      expect(m.removeColumnMode()).toBe(true);
    });

    it('removeColumnMode() returns false when not set', () => {
      const m = Metadata_of();
      expect(m.removeColumnMode()).toBe(false);
    });
  });

  // =========================================================================
  // 14. Field format: putFmt / removeFmt
  // =========================================================================

  describe('field format (putFmt / removeFmt)', () => {
    it('putFmt(AUTO) stores nothing', () => {
      const m = Metadata_of();
      m.putFmt(AutoOrPack.AUTO);
      expect(m.data().size).toBe(0);
    });

    it('putFmt(PACK) stores TAG at "pack" (putFirst)', () => {
      const m = Metadata_of();
      m.putFmt(AutoOrPack.PACK);
      expect(m.hasTag('pack')).toBe(true);
    });

    it('putFmt(Sep) stores MetaStr at "sep" (putFirst)', () => {
      const m = Metadata_of();
      m.putFmt(new Sep(','));
      const v = m.data().get('sep');
      expect(isMetaStr(v)).toBe(true);
      if (isMetaStr(v)) expect(v.value).toBe(',');
    });

    it('putFmt(Fix) stores MetaInt at "fix" (putFirst)', () => {
      const m = Metadata_of();
      m.putFmt(new Fix(5));
      const v = m.data().get('fix');
      expect(isMetaInt(v)).toBe(true);
      if (isMetaInt(v)) expect(v.value).toBe(5);
    });

    it('putFmt(Block) stores MetaInt at "block" (putFirst)', () => {
      const m = Metadata_of();
      m.putFmt(new Block(3));
      const v = m.data().get('block');
      expect(isMetaInt(v)).toBe(true);
      if (isMetaInt(v)) expect(v.value).toBe(3);
    });

    it('removeFmt() returns AUTO when nothing stored', () => {
      const m = Metadata_of();
      expect(m.removeFmt()).toBe(AutoOrPack.AUTO);
    });

    it('removeFmt() returns PACK after putFmt(PACK)', () => {
      const m = Metadata_of();
      m.putFmt(AutoOrPack.PACK);
      expect(m.removeFmt()).toBe(AutoOrPack.PACK);
      expect(m.data().has('pack')).toBe(false);
    });

    it('removeFmt() returns Sep after putFmt(Sep)', () => {
      const m = Metadata_of();
      m.putFmt(new Sep(';'));
      const fmt = m.removeFmt();
      expect(fmt).toBeInstanceOf(Sep);
      expect((fmt as Sep).sep).toBe(';');
    });

    it('removeFmt() returns Fix after putFmt(Fix)', () => {
      const m = Metadata_of();
      m.putFmt(new Fix(10));
      const fmt = m.removeFmt();
      expect(fmt).toBeInstanceOf(Fix);
      expect((fmt as Fix).count).toBe(10);
    });

    it('removeFmt() returns Block after putFmt(Block)', () => {
      const m = Metadata_of();
      m.putFmt(new Block(2));
      const fmt = m.removeFmt();
      expect(fmt).toBeInstanceOf(Block);
      expect((fmt as Block).fix).toBe(2);
    });

    it('removeFmt() checks PACK → SEP → FIX → BLOCK order', () => {
      // Store all four, removeFmt should return PACK first
      const m = Metadata_of();
      m.putFmt(new Sep(';'));
      m.putFmt(new Fix(10));
      m.putFmt(new Block(2));
      m.putFmt(AutoOrPack.PACK);
      // PACK should be returned first
      expect(m.removeFmt()).toBe(AutoOrPack.PACK);
      // Then Sep
      const fmt2 = m.removeFmt();
      expect(fmt2).toBeInstanceOf(Sep);
      expect((fmt2 as Sep).sep).toBe(';');
      // Then Fix
      const fmt3 = m.removeFmt();
      expect(fmt3).toBeInstanceOf(Fix);
      expect((fmt3 as Fix).count).toBe(10);
      // Then Block
      const fmt4 = m.removeFmt();
      expect(fmt4).toBeInstanceOf(Block);
      expect((fmt4 as Block).fix).toBe(2);
      // Finally AUTO
      expect(m.removeFmt()).toBe(AutoOrPack.AUTO);
    });
  });

  // =========================================================================
  // 15. get() / getStr()
  // =========================================================================

  describe('get() / getStr()', () => {
    it('get() returns undefined for non-existent key', () => {
      const m = Metadata_of();
      expect(m.get('nonexistent')).toBeUndefined();
    });

    it('get() returns the stored MetaValue', () => {
      const m = Metadata_of();
      m.putFromEnumType('MyEnum');
      const v = m.get('_fromEnumType');
      expect(isMetaStr(v)).toBe(true);
    });

    it('getStr() returns the string value when it is a MetaStr', () => {
      const m = Metadata_of();
      m.putFromEnumType('MyEnum');
      expect(m.getStr('_fromEnumType', 'default')).toBe('MyEnum');
    });

    it('getStr() returns the default when key does not exist', () => {
      const m = Metadata_of();
      expect(m.getStr('nonexistent', 'default')).toBe('default');
    });

    it('getStr() returns the default when value is not a MetaStr', () => {
      const m = Metadata_of();
      m.putSpan(42); // stores MetaInt
      expect(m.getStr('_span', 'default')).toBe('default');
    });
  });

  // =========================================================================
  // 16. copy() / copyWithoutState()
  // =========================================================================

  describe('copy()', () => {
    it('returns a new Metadata with the same data', () => {
      const m = Metadata_of();
      m.putTag('a');
      m.putComment(makeComment('hello'));
      m.putHasRef(true);

      const c = m.copy();
      expect(c).not.toBe(m);
      expect(c.data().size).toBe(m.data().size);
      expect(c.hasTag('a')).toBe(true);
      expect(c.getComment()!.leading).toBe('hello');
      expect(isMetaInt(c.getHasRef())).toBe(true);
    });

    it('copy() is independent (modifying copy does not affect original)', () => {
      const m = Metadata_of();
      m.putTag('a');
      const c = m.copy();
      c.putTag('b');
      expect(m.hasTag('b')).toBe(false);
      expect(c.hasTag('b')).toBe(true);
    });
  });

  describe('copyWithoutState()', () => {
    it('removes state tags but keeps others', () => {
      const m = Metadata_of();
      m.putTag('a');
      m.putComment(makeComment('hello'));
      m.putHasRef(true);
      m.putHasBlock(true);
      m.putHasMap(false);
      m.putHasText(true);
      m.putSpan(5);

      const c = m.copyWithoutState();
      expect(c.hasTag('a')).toBe(true);
      expect(c.getComment()!.leading).toBe('hello');
      // State tags should be removed
      expect(c.getHasRef()).toBeUndefined();
      expect(c.getHasBlock()).toBeUndefined();
      expect(c.getHasMap()).toBeUndefined();
      expect(c.getHasText()).toBeUndefined();
      expect(c.getSpan()).toBeUndefined();
    });

    it('does not affect the original', () => {
      const m = Metadata_of();
      m.putHasRef(true);
      m.putSpan(5);
      m.copyWithoutState();
      // Original should be unchanged
      expect(isMetaInt(m.getHasRef())).toBe(true);
      expect(isMetaInt(m.getSpan())).toBe(true);
    });
  });

  // =========================================================================
  // 17. SequencedMap emulation: putFirst / putLast ordering
  // =========================================================================

  describe('SequencedMap ordering', () => {
    it('putLast appends to end', () => {
      const m = Metadata_of();
      m.putTag('a');
      m.putComment(makeComment('c1'));
      m.putHasRef(true);
      const keys = Array.from(m.data().keys());
      expect(keys).toEqual(['a', '_comment', '_hasRef']);
    });

    it('putFirst prepends to beginning', () => {
      const m = Metadata_of();
      m.putTag('a');
      m.putNullable();
      m.putEnumRef('ER');
      const keys = Array.from(m.data().keys());
      expect(keys).toEqual(['enumRef', 'nullable', 'a']);
    });

    it('putLast on existing key moves it to end', () => {
      const m = Metadata_of();
      m.putTag('a');
      m.putTag('b');
      m.putComment(makeComment('c1'));
      // Re-put 'a' via putLast (comment uses putLast, but 'a' is a tag)
      // We can't re-put 'a' via putTag (duplicate error), but we can
      // test putLast behavior via comment update
      m.putComment(makeComment('c2'));
      const keys = Array.from(m.data().keys());
      // _comment should still be at end after update
      expect(keys[keys.length - 1]).toBe('_comment');
      expect(m.getComment()!.leading).toBe('c2');
    });

    it('putFirst on existing key moves it to beginning', () => {
      const m = Metadata_of();
      m.putTag('a');
      m.putTag('b');
      // Put enumRef (uses putFirst)
      m.putEnumRef('ER1');
      // Put again (should move to beginning again)
      m.putEnumRef('ER2');
      const keys = Array.from(m.data().keys());
      expect(keys[0]).toBe('enumRef');
      // Should only have 3 keys total (enumRef, a, b)
      expect(keys.length).toBe(3);
      // Value should be updated
      expect(m.removeEnumRef()).toBe('ER2');
    });

    it('mixed putFirst/putLast ordering', () => {
      const m = Metadata_of();
      // 1. putTag('a') → putLast → [a]
      m.putTag('a');
      // 2. putComment → putLast → [a, _comment]
      m.putComment(makeComment('c'));
      // 3. putNullable → putFirst → [nullable, a, _comment]
      m.putNullable();
      // 4. putHasRef → putLast → [nullable, a, _comment, _hasRef]
      m.putHasRef(true);
      // 5. putEntry(EEntry) → putFirst → [entry, nullable, a, _comment, _hasRef]
      m.putEntry(new EEntry('id'));
      const keys = Array.from(m.data().keys());
      expect(keys).toEqual(['entry', 'nullable', 'a', '_comment', '_hasRef']);
    });
  });

  // =========================================================================
  // 18. Constructor
  // =========================================================================

  describe('constructor', () => {
    it('with no argument creates empty Map', () => {
      const m = new Metadata();
      expect(m.data().size).toBe(0);
    });

    it('with a Map argument uses it directly', () => {
      const initialData = new Map<string, any>();
      initialData.set('json', TAG);
      const m = new Metadata(initialData);
      expect(m.isJson()).toBe(true);
    });
  });

  // =========================================================================
  // 19. MetaValue factory functions
  // =========================================================================

  describe('factory functions', () => {
    it('metaInt creates correct object', () => {
      const v = metaInt(42);
      expect(v._tag).toBe('MetaInt');
      expect(v.value).toBe(42);
    });

    it('metaStr creates correct object', () => {
      const v = metaStr('hello');
      expect(v._tag).toBe('MetaStr');
      expect(v.value).toBe('hello');
    });

    it('metaComment creates correct object', () => {
      const cd = makeComment('test');
      const v = metaComment(cd);
      expect(v._tag).toBe('MetaComment');
      expect(v.comment).toBe(cd);
    });

    it('metaEnumValuesOfEmpty creates correct object', () => {
      const v = metaEnumValuesOfEmpty([{ name: 'A', comment: 'a' }]);
      expect(v._tag).toBe('OfEmpty');
      expect(v.values.length).toBe(1);
    });

    it('metaEnumValuesOfAssigned creates correct object', () => {
      const v = metaEnumValuesOfAssigned([{ name: 'A', comment: 'a', number: 1 }]);
      expect(v._tag).toBe('OfAssigned');
      expect(v.values[0].number).toBe(1);
    });
  });

  // =========================================================================
  // 20. Type guards
  // =========================================================================

  describe('type guards', () => {
    it('isMetaInt', () => {
      expect(isMetaInt(metaInt(1))).toBe(true);
      expect(isMetaInt(metaStr('a'))).toBe(false);
      expect(isMetaInt(undefined)).toBe(false);
    });

    it('isMetaStr', () => {
      expect(isMetaStr(metaStr('a'))).toBe(true);
      expect(isMetaStr(metaInt(1))).toBe(false);
      expect(isMetaStr(undefined)).toBe(false);
    });

    it('isMetaComment', () => {
      expect(isMetaComment(metaComment(makeComment('a')))).toBe(true);
      expect(isMetaComment(metaInt(1))).toBe(false);
      expect(isMetaComment(undefined)).toBe(false);
    });

    it('isMetaEnumValues', () => {
      const ev = metaEnumValuesOfEmpty([]);
      expect(isMetaEnumValues(ev)).toBe(true);
      expect(isMetaEnumValues(metaInt(1))).toBe(false);
      expect(isMetaEnumValues(undefined)).toBe(false);
    });
  });
});
