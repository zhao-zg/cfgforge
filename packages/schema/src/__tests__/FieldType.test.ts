import { describe, it, expect } from 'vitest';
import {
  Primitive,
  FList,
  FMap,
  StructRef,
  isSimpleType,
  isContainerType,
  isPrimitive,
  isFList,
  isFMap,
  isStructRef,
} from '../FieldType';
import { AutoOrPack, Sep, Fix, Block, isAutoOrPack, isSep, isFix, isBlock } from '../FieldFormat';

describe('FieldType', () => {
  // ---------------------------------------------------------------------------
  // Primitive
  // ---------------------------------------------------------------------------
  describe('Primitive', () => {
    it('should have 6 primitive types', () => {
      expect(Primitive.BOOL).toBe('bool');
      expect(Primitive.INT).toBe('int');
      expect(Primitive.LONG).toBe('long');
      expect(Primitive.FLOAT).toBe('float');
      expect(Primitive.STRING).toBe('str');
      expect(Primitive.TEXT).toBe('text');
    });

    it('primitive is a SimpleType', () => {
      expect(isSimpleType(Primitive.INT)).toBe(true);
      expect(isContainerType(Primitive.INT)).toBe(false);
    });

    it('isPrimitive returns true for primitives', () => {
      expect(isPrimitive(Primitive.BOOL)).toBe(true);
      expect(isPrimitive(Primitive.STRING)).toBe(true);
      expect(isPrimitive(Primitive.TEXT)).toBe(true);
    });

    it('isPrimitive returns false for non-primitives', () => {
      expect(isPrimitive(new FList(Primitive.INT))).toBe(false);
      expect(isPrimitive(new StructRef('Foo'))).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // FList
  // ---------------------------------------------------------------------------
  describe('FList', () => {
    it('should create FList with a SimpleType item', () => {
      const list = new FList(Primitive.INT);
      expect(list.item).toBe(Primitive.INT);
    });

    it('should be a ContainerType', () => {
      const list = new FList(Primitive.STRING);
      expect(isContainerType(list)).toBe(true);
      expect(isSimpleType(list)).toBe(false);
    });

    it('isFList returns true only for FList', () => {
      expect(isFList(new FList(Primitive.INT))).toBe(true);
      expect(isFList(Primitive.INT)).toBe(false);
      expect(isFList(new FMap(Primitive.STRING, Primitive.INT))).toBe(false);
    });

    it('can nest FList (list<list<int>>)', () => {
      const inner = new FList(Primitive.INT);
      const outer = new FList(inner);
      expect(isFList(outer)).toBe(true);
      expect(isFList(outer.item)).toBe(true);
      expect((outer.item as FList).item).toBe(Primitive.INT);
    });

    it('copy() returns deep copy', () => {
      const list = new FList(Primitive.INT);
      const copy = list.copy();
      expect(copy).not.toBe(list);
      expect(copy.item).toBe(Primitive.INT);
    });

    it('toString() returns readable representation', () => {
      const list = new FList(Primitive.INT);
      expect(list.toString()).toBe('FList(item=int)');
    });
  });

  // ---------------------------------------------------------------------------
  // FMap
  // ---------------------------------------------------------------------------
  describe('FMap', () => {
    it('should create FMap with key and value', () => {
      const map = new FMap(Primitive.STRING, Primitive.INT);
      expect(map.key).toBe(Primitive.STRING);
      expect(map.value).toBe(Primitive.INT);
    });

    it('should be a ContainerType', () => {
      const map = new FMap(Primitive.STRING, Primitive.INT);
      expect(isContainerType(map)).toBe(true);
      expect(isSimpleType(map)).toBe(false);
    });

    it('isFMap returns true only for FMap', () => {
      expect(isFMap(new FMap(Primitive.STRING, Primitive.INT))).toBe(true);
      expect(isFMap(Primitive.INT)).toBe(false);
      expect(isFMap(new FList(Primitive.INT))).toBe(false);
    });

    it('copy() returns deep copy', () => {
      const map = new FMap(Primitive.STRING, Primitive.INT);
      const copy = map.copy();
      expect(copy).not.toBe(map);
      expect(copy.key).toBe(Primitive.STRING);
      expect(copy.value).toBe(Primitive.INT);
    });

    it('toString() returns readable representation', () => {
      const map = new FMap(Primitive.STRING, Primitive.INT);
      expect(map.toString()).toBe('FMap(key=str, value=int)');
    });
  });

  // ---------------------------------------------------------------------------
  // StructRef
  // ---------------------------------------------------------------------------
  describe('StructRef', () => {
    it('should create StructRef with a name', () => {
      const ref = new StructRef('Foo');
      expect(ref.name).toBe('Foo');
      expect(ref.obj).toBeNull();
    });

    it('is a SimpleType', () => {
      const ref = new StructRef('Foo');
      expect(isSimpleType(ref)).toBe(true);
      expect(isContainerType(ref)).toBe(false);
    });

    it('isStructRef returns true only for StructRef', () => {
      expect(isStructRef(new StructRef('Foo'))).toBe(true);
      expect(isStructRef(Primitive.INT)).toBe(false);
      expect(isStructRef(new FList(Primitive.INT))).toBe(false);
    });

    it('copy() returns new StructRef with same name but null obj', () => {
      const ref = new StructRef('Foo');
      const copy = ref.copy();
      expect(copy).not.toBe(ref);
      expect(copy.name).toBe('Foo');
      expect(copy.obj).toBeNull();
    });

    it('equals() compares by name only', () => {
      const ref1 = new StructRef('Foo');
      const ref2 = new StructRef('Foo');
      const ref3 = new StructRef('Bar');
      expect(ref1.equals(ref2)).toBe(true);
      expect(ref1.equals(ref3)).toBe(false);
    });

    it('equals() returns false for non-StructRef', () => {
      const ref = new StructRef('Foo');
      expect(ref.equals(Primitive.INT as any)).toBe(false);
      expect(ref.equals(null as any)).toBe(false);
      expect(ref.equals(undefined as any)).toBe(false);
    });

    it('toString() returns readable representation', () => {
      const ref = new StructRef('Foo');
      expect(ref.toString()).toBe('StructRef(name=Foo)');
    });
  });

  // ---------------------------------------------------------------------------
  // Type guard helpers
  // ---------------------------------------------------------------------------
  describe('Type guards', () => {
    it('isSimpleType returns true for Primitive and StructRef', () => {
      expect(isSimpleType(Primitive.INT)).toBe(true);
      expect(isSimpleType(new StructRef('Foo'))).toBe(true);
    });

    it('isSimpleType returns false for containers', () => {
      expect(isSimpleType(new FList(Primitive.INT))).toBe(false);
      expect(isSimpleType(new FMap(Primitive.STRING, Primitive.INT))).toBe(false);
    });

    it('isContainerType returns true for FList and FMap', () => {
      expect(isContainerType(new FList(Primitive.INT))).toBe(true);
      expect(isContainerType(new FMap(Primitive.STRING, Primitive.INT))).toBe(true);
    });

    it('isContainerType returns false for simple types', () => {
      expect(isContainerType(Primitive.INT)).toBe(false);
      expect(isContainerType(new StructRef('Foo'))).toBe(false);
    });
  });
});

describe('FieldFormat', () => {
  // ---------------------------------------------------------------------------
  // AutoOrPack
  // ---------------------------------------------------------------------------
  describe('AutoOrPack', () => {
    it('should have AUTO and PACK values', () => {
      expect(AutoOrPack.AUTO).toBe('auto');
      expect(AutoOrPack.PACK).toBe('pack');
    });

    it('isAutoOrPack returns true for AUTO and PACK', () => {
      expect(isAutoOrPack(AutoOrPack.AUTO)).toBe(true);
      expect(isAutoOrPack(AutoOrPack.PACK)).toBe(true);
    });

    it('isAutoOrPack returns false for other formats', () => {
      expect(isAutoOrPack(new Sep(','))).toBe(false);
      expect(isAutoOrPack(new Fix(3))).toBe(false);
      expect(isAutoOrPack(new Block(2))).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Sep
  // ---------------------------------------------------------------------------
  describe('Sep', () => {
    it('should create Sep with a char', () => {
      const sep = new Sep(',');
      expect(sep.sep).toBe(',');
    });

    it('can create Sep with various separators', () => {
      expect(new Sep(':').sep).toBe(':');
      expect(new Sep('=').sep).toBe('=');
      expect(new Sep('$').sep).toBe('$');
    });

    it('isSep returns true only for Sep', () => {
      expect(isSep(new Sep(','))).toBe(true);
      expect(isSep(AutoOrPack.AUTO)).toBe(false);
      expect(isSep(new Fix(2))).toBe(false);
    });

    it('equals() compares by separator char', () => {
      const sep1 = new Sep(',');
      const sep2 = new Sep(',');
      const sep3 = new Sep(':');
      expect(sep1.equals(sep2)).toBe(true);
      expect(sep1.equals(sep3)).toBe(false);
    });

    it('equals() returns false for non-Sep', () => {
      const sep = new Sep(',');
      expect(sep.equals(AutoOrPack.AUTO as any)).toBe(false);
      expect(sep.equals(null as any)).toBe(false);
    });

    it('toString() returns readable representation', () => {
      const sep = new Sep(',');
      expect(sep.toString()).toBe('Sep(sep=,)');
    });
  });

  // ---------------------------------------------------------------------------
  // Fix
  // ---------------------------------------------------------------------------
  describe('Fix', () => {
    it('should create Fix with count >= 1', () => {
      const fix = new Fix(1);
      expect(fix.count).toBe(1);
    });

    it('should accept large counts', () => {
      const fix = new Fix(100);
      expect(fix.count).toBe(100);
    });

    it('should throw for count < 1', () => {
      expect(() => new Fix(0)).toThrow();
      expect(() => new Fix(-1)).toThrow();
    });

    it('isFix returns true only for Fix', () => {
      expect(isFix(new Fix(1))).toBe(true);
      expect(isFix(new Block(1))).toBe(false);
      expect(isFix(AutoOrPack.AUTO)).toBe(false);
    });

    it('equals() compares by count', () => {
      const fix1 = new Fix(3);
      const fix2 = new Fix(3);
      const fix3 = new Fix(5);
      expect(fix1.equals(fix2)).toBe(true);
      expect(fix1.equals(fix3)).toBe(false);
    });

    it('toString() returns readable representation', () => {
      const fix = new Fix(3);
      expect(fix.toString()).toBe('Fix(count=3)');
    });
  });

  // ---------------------------------------------------------------------------
  // Block
  // ---------------------------------------------------------------------------
  describe('Block', () => {
    it('should create Block with fix >= 1', () => {
      const block = new Block(1);
      expect(block.fix).toBe(1);
    });

    it('should accept large fix values', () => {
      const block = new Block(50);
      expect(block.fix).toBe(50);
    });

    it('should throw for fix < 1', () => {
      expect(() => new Block(0)).toThrow();
      expect(() => new Block(-5)).toThrow();
    });

    it('isBlock returns true only for Block', () => {
      expect(isBlock(new Block(1))).toBe(true);
      expect(isBlock(new Fix(1))).toBe(false);
      expect(isBlock(AutoOrPack.PACK)).toBe(false);
    });

    it('equals() compares by fix', () => {
      const b1 = new Block(2);
      const b2 = new Block(2);
      const b3 = new Block(4);
      expect(b1.equals(b2)).toBe(true);
      expect(b1.equals(b3)).toBe(false);
    });

    it('toString() returns readable representation', () => {
      const block = new Block(2);
      expect(block.toString()).toBe('Block(fix=2)');
    });
  });
});
