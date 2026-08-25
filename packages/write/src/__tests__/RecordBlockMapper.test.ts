/**
 * RecordBlockMapper tests — T7.6
 *
 * Tests mirror Java RecordBlockMapperTest, covering 5 mapping rules:
 * - auto: primitive fields flattened horizontally
 * - auto: nested struct flattened
 * - pack: struct serialized to one cell
 * - sep: list joined to one cell
 * - fix: list expanded to fixed columns
 * - block: list expanded to multiple rows
 *
 * Since the TS pipeline isn't fully wired for end-to-end testing,
 * we manually build schema objects + VStruct values with DFile sources.
 */

import { describe, it, expect } from 'vitest';
import { RecordBlockMapper } from '../RecordBlockMapper';
import { RecordBlockTransformed } from '../RecordBlock';
import {
  VBool, VInt, VLong, VFloat, VString, VText,
  VStruct, VInterface, VList, VMap,
} from '@cfggen/value';
import {
  AutoOrPack, Sep, Fix, Block, FList, FMap, StructRef,
  Primitive, FieldSchema, StructSchema, TableSchema, InterfaceSchema,
  Metadata, Metadata_of, KeySchema, ENo, span, simpleTypeSpan,
} from '@cfggen/schema';
import { DFile } from '@cfggen/data';

// -------------------------------------------------------------------------
// Helpers: build schema objects for tests
// -------------------------------------------------------------------------

function emptyMeta(): Metadata {
  return Metadata_of();
}

function makeField(name: string, type: any, fmt: any): FieldSchema {
  return new FieldSchema(name, type, fmt, emptyMeta());
}

function makeStructSchema(name: string, fields: FieldSchema[], fmt: any = AutoOrPack.AUTO): StructSchema {
  return new StructSchema(name, fmt, emptyMeta(), fields, []);
}

function makeTableSchema(name: string, fields: FieldSchema[]): TableSchema {
  const pk = new KeySchema([fields[0].name]);
  return new TableSchema(name, pk, ENo.NO, false, emptyMeta(), fields, [], []);
}

function makeInterfaceSchema(name: string, impls: StructSchema[]): InterfaceSchema {
  const iface = new InterfaceSchema(name, '', '', AutoOrPack.AUTO, emptyMeta(), impls);
  // Wire struct -> interface back-references
  for (const impl of impls) {
    impl.setNullableInterface(iface);
  }
  return iface;
}

// Use a dummy DFile source for test values
const dummySource = DFile.of('test.json', 'test');

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe('RecordBlockMapper', () => {
  describe('auto: simple primitives', () => {
    it('maps primitive fields to a single row', () => {
      const tableSchema = makeTableSchema('simple', [
        makeField('id', Primitive.INT, AutoOrPack.AUTO),
        makeField('name', Primitive.STRING, AutoOrPack.AUTO),
        makeField('age', Primitive.INT, AutoOrPack.AUTO),
      ]);

      // Set span on table (3 fields × 1 each = 3)
      tableSchema.meta().putSpan(3);
      for (const f of tableSchema.fields()) {
        f.meta.putSpan(1);
      }

      const record = new VStruct(
        tableSchema,
        [
          new VInt(10, dummySource),
          new VString('Alice', dummySource),
          new VInt(25, dummySource),
        ],
        dummySource,
      );

      const block = RecordBlockMapper.mapToBlock(record);
      expect(block.getRowCount()).toBe(1);

      const t = new RecordBlockTransformed(block, [0, 1, 2]);
      const row = t.getRow(0)!;
      expect(row[0]).toBe('10');
      expect(row[1]).toBe('Alice');
      expect(row[2]).toBe('25');
    });
  });

  describe('auto: nested struct flattened', () => {
    it('maps nested struct fields horizontally', () => {
      const pointSchema = makeStructSchema('Point', [
        makeField('x', Primitive.INT, AutoOrPack.AUTO),
        makeField('y', Primitive.INT, AutoOrPack.AUTO),
      ]);
      pointSchema.meta().putSpan(2);
      for (const f of pointSchema.fields()) {
        f.meta.putSpan(1);
      }

      const entitySchema = makeTableSchema('entity', [
        makeField('id', Primitive.INT, AutoOrPack.AUTO),
        new FieldSchema('pos', new StructRef('Point'), AutoOrPack.AUTO, emptyMeta()),
        makeField('name', Primitive.STRING, AutoOrPack.AUTO),
      ]);
      entitySchema.meta().putSpan(4);
      entitySchema.fields()[0].meta.putSpan(1);
      entitySchema.fields()[1].meta.putSpan(2);
      entitySchema.fields()[2].meta.putSpan(1);
      // Wire struct ref
      (entitySchema.fields()[1].type as StructRef).obj = pointSchema;

      const record = new VStruct(
        entitySchema,
        [
          new VInt(1, dummySource),
          new VStruct(
            pointSchema,
            [new VInt(100, dummySource), new VInt(200, dummySource)],
            dummySource,
          ),
          new VString('Player', dummySource),
        ],
        dummySource,
      );

      const block = RecordBlockMapper.mapToBlock(record);
      expect(block.getRowCount()).toBe(1);

      const t = new RecordBlockTransformed(block, [0, 1, 2, 3]);
      const row = t.getRow(0)!;
      expect(row[0]).toBe('1');
      expect(row[1]).toBe('100');
      expect(row[2]).toBe('200');
      expect(row[3]).toBe('Player');
    });
  });

  describe('pack: struct serialized to one cell', () => {
    it('maps pack struct to a single cell with packStr', () => {
      const pointSchema = makeStructSchema('Point', [
        makeField('x', Primitive.INT, AutoOrPack.AUTO),
        makeField('y', Primitive.INT, AutoOrPack.AUTO),
      ], AutoOrPack.PACK);
      pointSchema.meta().putSpan(1);

      const entitySchema = makeTableSchema('entity', [
        makeField('id', Primitive.INT, AutoOrPack.AUTO),
        new FieldSchema('pos', new StructRef('Point'), AutoOrPack.AUTO, emptyMeta()),
      ]);
      entitySchema.meta().putSpan(2);
      entitySchema.fields()[0].meta.putSpan(1);
      entitySchema.fields()[1].meta.putSpan(1);
      (entitySchema.fields()[1].type as StructRef).obj = pointSchema;

      // VStruct.packStr() returns schema.name(), so "Point"
      const record = new VStruct(
        entitySchema,
        [
          new VInt(1, dummySource),
          new VStruct(
            pointSchema,
            [new VInt(100, dummySource), new VInt(200, dummySource)],
            dummySource,
          ),
        ],
        dummySource,
      );

      const block = RecordBlockMapper.mapToBlock(record);
      expect(block.getRowCount()).toBe(1);

      const t = new RecordBlockTransformed(block, [0, 1]);
      const row = t.getRow(0)!;
      expect(row[0]).toBe('1');
      expect(row[1]).toBe('Point'); // packStr() = name()
    });
  });

  describe('sep: list joined to one cell', () => {
    it('maps sep list to a single cell with sep-joined string', () => {
      const itemSchema = makeTableSchema('item', [
        makeField('id', Primitive.INT, AutoOrPack.AUTO),
        new FieldSchema('tags', new FList(Primitive.STRING), new Sep(','), emptyMeta()),
      ]);
      itemSchema.meta().putSpan(2);
      itemSchema.fields()[0].meta.putSpan(1);
      itemSchema.fields()[1].meta.putSpan(1);

      const record = new VStruct(
        itemSchema,
        [
          new VInt(1, dummySource),
          new VList(
            [
              new VString('tag1', dummySource),
              new VString('tag2', dummySource),
              new VString('tag3', dummySource),
            ],
            dummySource,
          ),
        ],
        dummySource,
      );

      const block = RecordBlockMapper.mapToBlock(record);
      expect(block.getRowCount()).toBe(1);

      const t = new RecordBlockTransformed(block, [0, 1]);
      const row = t.getRow(0)!;
      expect(row[0]).toBe('1');
      expect(row[1]).toBe('tag1,tag2,tag3');
    });
  });

  describe('fix: list expanded to fixed columns', () => {
    it('maps fix list to multiple columns in one row', () => {
      const itemSchema = makeTableSchema('item', [
        makeField('id', Primitive.INT, AutoOrPack.AUTO),
        new FieldSchema('values', new FList(Primitive.INT), new Fix(3), emptyMeta()),
      ]);
      itemSchema.meta().putSpan(4); // 1 (id) + 3 (fix=3 × span=1)
      itemSchema.fields()[0].meta.putSpan(1);
      itemSchema.fields()[1].meta.putSpan(3); // 3 × simpleTypeSpan(int)=1

      const record = new VStruct(
        itemSchema,
        [
          new VInt(1, dummySource),
          new VList(
            [
              new VInt(10, dummySource),
              new VInt(20, dummySource),
              new VInt(30, dummySource),
            ],
            dummySource,
          ),
        ],
        dummySource,
      );

      const block = RecordBlockMapper.mapToBlock(record);
      expect(block.getRowCount()).toBe(1);

      const t = new RecordBlockTransformed(block, [0, 1, 2, 3]);
      const row = t.getRow(0)!;
      expect(row[0]).toBe('1');
      expect(row[1]).toBe('10');
      expect(row[2]).toBe('20');
      expect(row[3]).toBe('30');
    });
  });

  describe('block: list expanded to multiple rows', () => {
    it('maps block list to multiple rows with 1 column per row', () => {
      const itemSchema = makeTableSchema('item', [
        makeField('id', Primitive.INT, AutoOrPack.AUTO),
        new FieldSchema('values', new FList(Primitive.INT), new Block(1), emptyMeta()),
      ]);
      itemSchema.meta().putSpan(2); // 1 (id) + 1 (block=1 × span=1)
      itemSchema.fields()[0].meta.putSpan(1);
      itemSchema.fields()[1].meta.putSpan(1); // 1 × simpleTypeSpan(int)=1

      const record = new VStruct(
        itemSchema,
        [
          new VInt(1, dummySource),
          new VList(
            [
              new VInt(10, dummySource),
              new VInt(20, dummySource),
              new VInt(30, dummySource),
            ],
            dummySource,
          ),
        ],
        dummySource,
      );

      const block = RecordBlockMapper.mapToBlock(record);
      expect(block.getRowCount()).toBe(3);

      const t = new RecordBlockTransformed(block, [0, 1]);
      // Row 0: id=1, values=10
      expect(t.getRow(0)![0]).toBe('1');
      expect(t.getRow(0)![1]).toBe('10');
      // Row 1: id=null, values=20
      expect(t.getRow(1)![0]).toBeNull();
      expect(t.getRow(1)![1]).toBe('20');
      // Row 2: id=null, values=30
      expect(t.getRow(2)![0]).toBeNull();
      expect(t.getRow(2)![1]).toBe('30');
    });
  });

  describe('auto: interface value', () => {
    it('maps interface with child struct name + fields', () => {
      const implSchema = makeStructSchema('Circle', [
        makeField('radius', Primitive.INT, AutoOrPack.AUTO),
      ]);
      implSchema.meta().putSpan(1);

      const ifaceSchema = makeInterfaceSchema('Shape', [implSchema]);
      ifaceSchema.meta().putSpan(2); // 1 (name) + 1 (radius)

      const entitySchema = makeTableSchema('entity', [
        makeField('id', Primitive.INT, AutoOrPack.AUTO),
        new FieldSchema('shape', new StructRef('Shape'), AutoOrPack.AUTO, emptyMeta()),
      ]);
      entitySchema.meta().putSpan(3); // 1 (id) + 2 (interface)
      entitySchema.fields()[0].meta.putSpan(1);
      entitySchema.fields()[1].meta.putSpan(2);
      (entitySchema.fields()[1].type as StructRef).obj = ifaceSchema;

      const childStruct = new VStruct(
        implSchema,
        [new VInt(5, dummySource)],
        dummySource,
      );

      const record = new VStruct(
        entitySchema,
        [
          new VInt(1, dummySource),
          new VInterface(ifaceSchema, childStruct, dummySource),
        ],
        dummySource,
      );

      const block = RecordBlockMapper.mapToBlock(record);
      expect(block.getRowCount()).toBe(1);

      const t = new RecordBlockTransformed(block, [0, 1, 2]);
      const row = t.getRow(0)!;
      expect(row[0]).toBe('1');
      expect(row[1]).toBe('Circle'); // child.name() = lastName = "Circle"
      expect(row[2]).toBe('5');       // radius
    });
  });
});
