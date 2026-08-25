/**
 * ValueToSepStr tests — T7.6
 *
 * Tests cover:
 * - toSepStrForList: VList with Sep format → sep-joined string
 * - toSepStrForStruct: VStruct with Sep schema → sep-joined string
 * - Error cases: wrong fmt, wrong type
 */

import { describe, it, expect } from 'vitest';
import { ValueToSepStr } from '../ValueToSepStr';
import {
  VInt, VString, VStruct, VList, VInterface,
} from '@cfggen/value';
import {
  AutoOrPack, Sep, Fix, FList, Primitive, FieldSchema, StructSchema, StructRef,
  Metadata, Metadata_of,
} from '@cfggen/schema';
import { DFile } from '@cfggen/data';

const dummySource = DFile.of('test.json', 'test');

function emptyMeta(): Metadata {
  return Metadata_of();
}

describe('ValueToSepStr', () => {
  describe('toSepStrForList', () => {
    it('joins primitive values with separator', () => {
      const field = new FieldSchema(
        'tags', new FList(Primitive.STRING), new Sep(','), emptyMeta(),
      );

      const vList = new VList(
        [
          new VString('a', dummySource),
          new VString('b', dummySource),
          new VString('c', dummySource),
        ],
        dummySource,
      );

      const result = ValueToSepStr.toSepStrForList(vList, field);
      expect(result).toBe('a,b,c');
    });

    it('joins with custom separator', () => {
      const field = new FieldSchema(
        'values', new FList(Primitive.INT), new Sep(';'), emptyMeta(),
      );

      const vList = new VList(
        [
          new VInt(1, dummySource),
          new VInt(2, dummySource),
          new VInt(3, dummySource),
        ],
        dummySource,
      );

      const result = ValueToSepStr.toSepStrForList(vList, field);
      expect(result).toBe('1;2;3');
    });

    it('returns empty string for empty list', () => {
      const field = new FieldSchema(
        'tags', new FList(Primitive.STRING), new Sep(','), emptyMeta(),
      );

      const vList = new VList([], dummySource);
      const result = ValueToSepStr.toSepStrForList(vList, field);
      expect(result).toBe('');
    });

    it('joins pack struct elements via packStr', () => {
      const pointSchema = new StructSchema(
        'Point', AutoOrPack.PACK, emptyMeta(),
        [
          new FieldSchema('x', Primitive.INT, AutoOrPack.AUTO, emptyMeta()),
          new FieldSchema('y', Primitive.INT, AutoOrPack.AUTO, emptyMeta()),
        ],
        [],
      );

      const field = new FieldSchema(
        'points', new FList(new StructRef('Point')), new Sep(','), emptyMeta(),
      );
      // Wire struct ref
      (field.type as any).item.obj = pointSchema;

      const vList = new VList(
        [
          new VStruct(
            pointSchema,
            [new VInt(1, dummySource), new VInt(2, dummySource)],
            dummySource,
          ),
          new VStruct(
            pointSchema,
            [new VInt(3, dummySource), new VInt(4, dummySource)],
            dummySource,
          ),
        ],
        dummySource,
      );

      const result = ValueToSepStr.toSepStrForList(vList, field);
      // packStr() = name() = "Point"
      expect(result).toBe('Point,Point');
    });

    it('throws if field fmt is not Sep', () => {
      const field = new FieldSchema(
        'tags', new FList(Primitive.STRING), AutoOrPack.AUTO, emptyMeta(),
      );

      const vList = new VList([], dummySource);
      expect(() => ValueToSepStr.toSepStrForList(vList, field)).toThrow('not Sep');
    });

    it('throws if field type is not FList', () => {
      const field = new FieldSchema(
        'tags', Primitive.STRING, new Sep(','), emptyMeta(),
      );

      const vList = new VList([], dummySource);
      expect(() => ValueToSepStr.toSepStrForList(vList, field)).toThrow('not FList');
    });
  });

  describe('toSepStrForStruct', () => {
    it('joins all field values with separator', () => {
      const structSchema = new StructSchema(
        'Vec3', new Sep(','),
        emptyMeta(),
        [
          new FieldSchema('x', Primitive.INT, AutoOrPack.AUTO, emptyMeta()),
          new FieldSchema('y', Primitive.INT, AutoOrPack.AUTO, emptyMeta()),
          new FieldSchema('z', Primitive.INT, AutoOrPack.AUTO, emptyMeta()),
        ],
        [],
      );

      const vStruct = new VStruct(
        structSchema,
        [
          new VInt(10, dummySource),
          new VInt(20, dummySource),
          new VInt(30, dummySource),
        ],
        dummySource,
      );

      const result = ValueToSepStr.toSepStrForStruct(vStruct);
      expect(result).toBe('10,20,30');
    });

    it('joins with custom separator', () => {
      const structSchema = new StructSchema(
        'Pair', new Sep('|'),
        emptyMeta(),
        [
          new FieldSchema('a', Primitive.STRING, AutoOrPack.AUTO, emptyMeta()),
          new FieldSchema('b', Primitive.STRING, AutoOrPack.AUTO, emptyMeta()),
        ],
        [],
      );

      const vStruct = new VStruct(
        structSchema,
        [
          new VString('hello', dummySource),
          new VString('world', dummySource),
        ],
        dummySource,
      );

      const result = ValueToSepStr.toSepStrForStruct(vStruct);
      expect(result).toBe('hello|world');
    });

    it('throws if struct fmt is not Sep', () => {
      const structSchema = new StructSchema(
        'NotSep', AutoOrPack.AUTO,
        emptyMeta(),
        [new FieldSchema('x', Primitive.INT, AutoOrPack.AUTO, emptyMeta())],
        [],
      );

      const vStruct = new VStruct(
        structSchema,
        [new VInt(1, dummySource)],
        dummySource,
      );

      expect(() => ValueToSepStr.toSepStrForStruct(vStruct)).toThrow('not Sep');
    });
  });
});
