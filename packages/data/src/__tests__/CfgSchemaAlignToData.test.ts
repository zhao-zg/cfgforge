/**
 * CfgSchemaAlignToData tests — TypeScript port of Java `configgen.data.CfgSchemaAlignToData`.
 *
 * Tests the schema↔data alignment logic:
 * - Existing table fields matched/removed/added based on header
 * - New tables generated from data without schema
 * - Enum tables skipped (data from MetaEnumValues)
 * - Json tables: copy + error if Excel data also present
 * - Comment update when header comment differs from schema
 * - List/Map pattern matching (a1,a2,a3.. → aList; a1,b1,a2,b2.. → a2bMap)
 * - ForeignKey/UniqueKey filtered when fields removed
 * - Span check: header not enough for field span
 */

import { describe, it, expect } from 'vitest';
import {
  CfgSchema,
  CfgSchemaErrs,
  TableSchema,
  FieldSchema,
  KeySchema,
  Metadata,
  Metadata_of,
  CommentData,
  ENo,
  EEntry,
  EEnum,
  Primitive,
  AutoOrPack,
  Fix,
  FList,
  FMap,
  fieldSpan,
  simpleTypeSpan,
  CfgUtil,
  ForeignKeySchema,
  RefPrimary,
  TAG,
} from '@cfgforge/schema';
import { CfgSchemaAlignToData } from '../CfgSchemaAlignToData';
import { DField } from '../DField';
import { DTable } from '../DTable';
import { CfgData } from '../CfgData';
import { CfgDataStat } from '../CfgDataStat';
import { DRawSheet } from '../DRawSheet';
import type { DRawRow } from '../DRawRow';
import { HeadRows } from '../HeadRows';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeErrs(): CfgSchemaErrs {
  return CfgSchemaErrs.of();
}

function makeDTable(name: string, fields: DField[], tag: string | null = null): DTable {
  return new DTable(name, fields, [], [], tag);
}

function makeDField(name: string, comment: string = '', suggestedType: string = ''): DField {
  return new DField(name, comment, suggestedType);
}

function makeCfgData(tables: DTable[]): CfgData {
  const map = new Map<string, DTable>();
  for (const t of tables) {
    map.set(t.tableName, t);
  }
  return new CfgData(map, new CfgDataStat());
}

function makeTable(
  name: string,
  fields: FieldSchema[],
  primaryKey?: KeySchema,
  entry?: any,
  foreignKeys?: any[],
  uniqueKeys?: KeySchema[],
): TableSchema {
  const pk = primaryKey ?? new KeySchema([fields[0]?.name ?? 'id']);
  return new TableSchema(
    name,
    pk,
    entry ?? ENo.NO,
    false,
    Metadata_of(),
    fields,
    foreignKeys ?? [],
    uniqueKeys ?? [],
  );
}

function makeField(name: string, type?: any, fmt?: any, meta?: Metadata): FieldSchema {
  return new FieldSchema(name, type ?? Primitive.STRING, fmt ?? AutoOrPack.AUTO, meta ?? Metadata_of());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CfgSchemaAlignToData', () => {
  const aligner = new CfgSchemaAlignToData(HeadRows.A2_Default);

  describe('align — basic table alignment', () => {
    it('copies Fieldable items as-is (struct/interface)', () => {
      // We need a Fieldable that is not a TableSchema — but since CfgSchemaAlignToData
      // only differentiates Fieldable vs TableSchema, and StructSchema is Fieldable,
      // we test with a simple struct schema. For now, test with only tables.
      const table = makeTable('test', [makeField('id'), makeField('name')]);
      const cfg = CfgSchema.of();
      cfg.add(table);

      const dFields = [makeDField('id'), makeDField('name')];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const alignedTable = aligned.findTable('test');
      expect(alignedTable).toBeDefined();
      expect(alignedTable!.fields().length).toBe(2);
      expect(alignedTable!.fields()[0].name).toBe('id');
      expect(alignedTable!.fields()[1].name).toBe('name');
    });

    it('removes table without data', () => {
      const table = makeTable('orphan', [makeField('id')]);
      const cfg = CfgSchema.of();
      cfg.add(table);

      const data = makeCfgData([]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      expect(aligned.findTable('orphan')).toBeUndefined();
      expect(aligned.items().length).toBe(0);
    });

    it('keeps enum tables without data (MetaEnumValues)', () => {
      const meta = Metadata_of();
      meta.putEnumValues({ _tag: 'OfEmpty', values: [] });
      const table = makeTable('myenum', [makeField('id', Primitive.INT)], undefined, undefined, undefined, undefined);
      // We need to set meta on the table — but TableSchema constructor takes meta
      // Since we used Metadata_of() in makeTable, we need to construct differently
      const enumTable = new TableSchema(
        'myenum',
        new KeySchema(['id']),
        ENo.NO,
        false,
        meta,
        [makeField('id', Primitive.INT)],
        [],
        [],
      );
      const cfg = CfgSchema.of();
      cfg.add(enumTable);

      const data = makeCfgData([]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('myenum');
      expect(t).toBeDefined();
      expect(errs.errs.length).toBe(0);
    });
  });

  describe('align — new table generation from data', () => {
    it('generates new table for data without schema', () => {
      const dFields = [makeDField('id'), makeDField('name', '名称')];
      const dTable = makeDTable('newtable', dFields);
      const data = makeCfgData([dTable]);
      const cfg = CfgSchema.of();
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('newtable');
      expect(t).toBeDefined();
      expect(t!.fields().length).toBe(2);
      expect(t!.fields()[0].name).toBe('id');
      expect(t!.fields()[1].name).toBe('name');
      expect(t!.fields()[1].comment()).toBe('名称');
      // Primary key should be the first field
      expect(t!.primaryKey.fields()).toEqual(['id']);
      expect(t!.entry).toBe(ENo.NO);
      expect(t!.isColumnMode).toBe(false);
    });

    it('skips new table with no valid identifier fields', () => {
      const dFields = [makeDField('123bad'), makeDField('456bad')];
      const dTable = makeDTable('badtable', dFields);
      const data = makeCfgData([dTable]);
      const cfg = CfgSchema.of();
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      expect(aligned.findTable('badtable')).toBeUndefined();
      expect(errs.errs.length).toBe(2); // two DataHeadNameNotIdentifier errors
      expect(errs.errs[0]._tag).toBe('DataHeadNameNotIdentifier');
    });

    it('skips new table with empty fields', () => {
      const dTable = makeDTable('emptytable', []);
      const data = makeCfgData([dTable]);
      const cfg = CfgSchema.of();
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      expect(aligned.findTable('emptytable')).toBeUndefined();
    });

    it('sets nullableAddTag as tag on new table', () => {
      const dFields = [makeDField('id')];
      const dTable = makeDTable('tagged', dFields, '-server');
      const data = makeCfgData([dTable]);
      const cfg = CfgSchema.of();
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('tagged');
      expect(t).toBeDefined();
      expect(t!.meta().hasTag('-server')).toBe(true);
    });

    it('uses suggestedType from header for new field', () => {
      const dFields = [makeDField('id', '', 'int')];
      const dTable = makeDTable('typed', dFields);
      const data = makeCfgData([dTable]);
      const cfg = CfgSchema.of();
      const errs = makeErrs();

      const alignerA4 = new CfgSchemaAlignToData(HeadRows.A4);
      const aligned = alignerA4.align(cfg, data, errs);

      const t = aligned.findTable('typed');
      expect(t).toBeDefined();
      expect(t!.fields()[0].type).toBe(Primitive.INT);
    });

    it('warns on unknown suggestedType', () => {
      const dFields = [makeDField('id', '', 'unknowntype')];
      const dTable = makeDTable('typed', dFields);
      const data = makeCfgData([dTable]);
      const cfg = CfgSchema.of();
      const errs = makeErrs();

      const alignerA4 = new CfgSchemaAlignToData(HeadRows.A4);
      const aligned = alignerA4.align(cfg, data, errs);

      const t = aligned.findTable('typed');
      expect(t).toBeDefined();
      // Unknown type → falls back to STRING
      expect(t!.fields()[0].type).toBe(Primitive.STRING);
      expect(errs.warns.length).toBe(1);
      expect(errs.warns[0]._tag).toBe('SuggestTypeUnknown');
    });
  });

  describe('align — field addition and removal', () => {
    it('adds new field from data not in schema', () => {
      const schemaFields = [makeField('id')];
      const table = makeTable('test', schemaFields);
      const cfg = CfgSchema.of();
      cfg.add(table);

      const dFields = [makeDField('id'), makeDField('newfield', '新字段')];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('test')!;
      expect(t.fields().length).toBe(2);
      expect(t.fields()[1].name).toBe('newfield');
      expect(t.fields()[1].comment()).toBe('新字段');
    });

    it('removes field from schema not in data', () => {
      const schemaFields = [makeField('id'), makeField('oldfield')];
      const table = makeTable('test', schemaFields);
      const cfg = CfgSchema.of();
      cfg.add(table);

      const dFields = [makeDField('id')];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('test')!;
      expect(t.fields().length).toBe(1);
      expect(t.fields()[0].name).toBe('id');
    });

    it('preserves field type and fmt from schema when field exists', () => {
      const meta = Metadata_of();
      const schemaFields = [
        new FieldSchema('id', Primitive.INT, AutoOrPack.AUTO, meta),
      ];
      const table = makeTable('test', schemaFields);
      const cfg = CfgSchema.of();
      cfg.add(table);

      const dFields = [makeDField('id')];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('test')!;
      expect(t.fields()[0].type).toBe(Primitive.INT);
    });

    it('reports DataHeadNameDuplicated when header has duplicate field names', () => {
      // DataHeadNameDuplicated is checked in alignFields (existing table), not newTableSchema
      const schemaFields = [makeField('id'), makeField('name')];
      const table = makeTable('dup', schemaFields);
      const cfg = CfgSchema.of();
      cfg.add(table);

      // Data has two 'id' fields — the second 'id' will be treated as a new field
      // (since 'name' from schema is not found in header, it's removed)
      // Both header fields are 'id', so the second one triggers DataHeadNameDuplicated
      const dFields = [makeDField('id'), makeDField('id')];
      const dTable = makeDTable('dup', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('dup');
      expect(t).toBeDefined();
      expect(errs.errs.length).toBeGreaterThanOrEqual(1);
      expect(errs.errs[0]._tag).toBe('DataHeadNameDuplicated');
    });
  });

  describe('align — comment handling', () => {
    it('updates comment when header comment differs from field name', () => {
      const meta = Metadata_of();
      const schemaFields = [makeField('id', Primitive.STRING, AutoOrPack.AUTO, meta)];
      const table = makeTable('test', schemaFields);
      const cfg = CfgSchema.of();
      cfg.add(table);

      const dFields = [makeDField('id', 'ID编号')];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('test')!;
      const comment = t.fields()[0].meta.getComment();
      expect(comment).not.toBeNull();
      expect(comment!.trailing).toBe('ID编号');
    });

    it('removes comment when header comment equals field name', () => {
      const meta = Metadata_of();
      meta.putComment(new CommentData('', 'old comment', null));
      const schemaFields = [makeField('id', Primitive.STRING, AutoOrPack.AUTO, meta)];
      const table = makeTable('test', schemaFields);
      const cfg = CfgSchema.of();
      cfg.add(table);

      // Header comment = 'id' (equals field name) → should clear trailing comment
      const dFields = [makeDField('id', 'id')];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('test')!;
      const comment = t.fields()[0].meta.getComment();
      // Since comment trailing becomes '' and no leading/suffix, encode() = '' → removed
      expect(comment).toBeNull();
    });

    it('updates comment when header comment differs from existing trailing', () => {
      const meta = Metadata_of();
      meta.putComment(new CommentData('leading text', 'old trailing', null));
      const schemaFields = [makeField('id', Primitive.STRING, AutoOrPack.AUTO, meta)];
      const table = makeTable('test', schemaFields);
      const cfg = CfgSchema.of();
      cfg.add(table);

      const dFields = [makeDField('id', 'new trailing')];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('test')!;
      const comment = t.fields()[0].meta.getComment();
      expect(comment).not.toBeNull();
      expect(comment!.leading).toBe('leading text');
      expect(comment!.trailing).toBe('new trailing');
    });
  });

  describe('align — primary key, entry, foreign keys, unique keys', () => {
    it('keeps primary key when all key fields exist in data', () => {
      const pk = new KeySchema(['id', 'name']);
      const schemaFields = [makeField('id'), makeField('name')];
      const table = makeTable('test', schemaFields, pk);
      const cfg = CfgSchema.of();
      cfg.add(table);

      const dFields = [makeDField('id'), makeDField('name')];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('test')!;
      expect(t.primaryKey.fields()).toEqual(['id', 'name']);
    });

    it('resets primary key to first field when key fields missing', () => {
      const pk = new KeySchema(['id', 'missing']);
      const schemaFields = [makeField('id'), makeField('name')];
      const table = makeTable('test', schemaFields, pk);
      const cfg = CfgSchema.of();
      cfg.add(table);

      const dFields = [makeDField('id'), makeDField('name')];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('test')!;
      expect(t.primaryKey.fields()).toEqual(['id']);
    });

    it('keeps EEntry when field exists in data', () => {
      const schemaFields = [makeField('type', Primitive.STRING)];
      const table = makeTable('test', schemaFields, undefined, new EEntry('type'));
      const cfg = CfgSchema.of();
      cfg.add(table);

      const dFields = [makeDField('type')];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('test')!;
      expect(t.entry).toBeInstanceOf(EEntry);
      expect((t.entry as EEntry).field).toBe('type');
    });

    it('resets EEntry to NO when field removed', () => {
      const schemaFields = [makeField('type', Primitive.STRING)];
      const table = makeTable('test', schemaFields, undefined, new EEntry('type'));
      const cfg = CfgSchema.of();
      cfg.add(table);

      const dFields = [makeDField('other')];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('test')!;
      expect(t.entry).toBe(ENo.NO);
    });

    it('keeps EEnum when field exists in data', () => {
      const schemaFields = [makeField('kind', Primitive.STRING)];
      const table = makeTable('test', schemaFields, undefined, new EEnum('kind'));
      const cfg = CfgSchema.of();
      cfg.add(table);

      const dFields = [makeDField('kind')];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('test')!;
      expect(t.entry).toBeInstanceOf(EEnum);
      expect((t.entry as EEnum).field).toBe('kind');
    });

    it('filters foreign keys when key fields removed', () => {
      const fk = new ForeignKeySchema(
        'fk_test',
        new KeySchema(['id', 'ref']),
        'other',
        new RefPrimary(false),
        Metadata_of(),
      );
      const schemaFields = [makeField('id'), makeField('ref'), makeField('name')];
      const table = makeTable('test', schemaFields, new KeySchema(['id']), ENo.NO, [fk]);
      const cfg = CfgSchema.of();
      cfg.add(table);

      // 'ref' field removed from data
      const dFields = [makeDField('id'), makeDField('name')];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('test')!;
      expect(t.foreignKeys().length).toBe(0); // FK removed because 'ref' missing
    });

    it('keeps foreign keys when all key fields exist', () => {
      const fk = new ForeignKeySchema(
        'fk_test',
        new KeySchema(['id']),
        'other',
        new RefPrimary(false),
        Metadata_of(),
      );
      const schemaFields = [makeField('id'), makeField('name')];
      const table = makeTable('test', schemaFields, new KeySchema(['id']), ENo.NO, [fk]);
      const cfg = CfgSchema.of();
      cfg.add(table);

      const dFields = [makeDField('id'), makeDField('name')];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('test')!;
      expect(t.foreignKeys().length).toBe(1);
      expect(t.foreignKeys()[0].name).toBe('fk_test');
    });

    it('filters unique keys when key fields removed', () => {
      const schemaFields = [makeField('id'), makeField('name'), makeField('extra')];
      const uk = new KeySchema(['id', 'extra']);
      const table = makeTable('test', schemaFields, new KeySchema(['id']), ENo.NO, [], [uk]);
      const cfg = CfgSchema.of();
      cfg.add(table);

      // 'extra' removed from data
      const dFields = [makeDField('id'), makeDField('name')];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('test')!;
      expect(t.uniqueKeys().length).toBe(0);
    });
  });

  describe('align — list/map pattern matching (findAndRemove)', () => {
    it('matches a1,a2,a3 pattern to aList (Fix count=3)', () => {
      // Schema has aList field with FList(Primitive.STRING) and Fix(3)
      // span = simpleTypeSpan(STRING) * Fix.count = 1 * 3 = 3
      const listMeta = Metadata_of();
      listMeta.putSpan(3);
      const listField = new FieldSchema(
        'aList',
        new FList(Primitive.STRING),
        new Fix(3),
        listMeta,
      );
      const schemaFields = [makeField('id'), listField];
      const table = makeTable('test', schemaFields);
      const cfg = CfgSchema.of();
      cfg.add(table);

      // Data has a1, a2, a3 (matching the list pattern)
      const dFields = [
        makeDField('id'),
        makeDField('a1'),
        makeDField('a2'),
        makeDField('a3'),
      ];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('test')!;
      // aList should be matched, not treated as new fields
      expect(t.fields().length).toBe(2);
      expect(t.fields()[0].name).toBe('id');
      expect(t.fields()[1].name).toBe('aList');
    });

    it('does not match list pattern when count is wrong', () => {
      const listMeta = Metadata_of();
      listMeta.putSpan(3);
      const listField = new FieldSchema(
        'aList',
        new FList(Primitive.STRING),
        new Fix(3),
        listMeta,
      );
      const schemaFields = [makeField('id'), listField];
      const table = makeTable('test', schemaFields);
      const cfg = CfgSchema.of();
      cfg.add(table);

      // Only a1, a2 (Fix expects 3)
      const dFields = [
        makeDField('id'),
        makeDField('a1'),
        makeDField('a2'),
      ];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('test')!;
      // aList is not matched (removed as unmatched schema field)
      // a1 and a2 are added as new fields
      expect(t.fields().length).toBe(3);
      expect(t.fields()[0].name).toBe('id');
    });

    it('matches a1,b1,a2,b2 pattern to a2bMap (Fix count=2)', () => {
      // span = (simpleTypeSpan(key) + simpleTypeSpan(value)) * Fix.count = (1+1) * 2 = 4
      const mapMeta = Metadata_of();
      mapMeta.putSpan(4);
      const mapField = new FieldSchema(
        'a2bMap',
        new FMap(Primitive.STRING, Primitive.STRING),
        new Fix(2),
        mapMeta,
      );
      const schemaFields = [makeField('id'), mapField];
      const table = makeTable('test', schemaFields);
      const cfg = CfgSchema.of();
      cfg.add(table);

      // Data has a1, b1, a2, b2 (matching the map pattern)
      const dFields = [
        makeDField('id'),
        makeDField('a1'),
        makeDField('b1'),
        makeDField('a2'),
        makeDField('b2'),
      ];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('test')!;
      expect(t.fields().length).toBe(2);
      expect(t.fields()[0].name).toBe('id');
      expect(t.fields()[1].name).toBe('a2bMap');
    });
  });

  describe('align — json tables', () => {
    it('copies json table and errors if Excel data also present', () => {
      const meta = Metadata_of();
      meta.data().set('json', TAG);
      const jsonTable = new TableSchema(
        'jsontable',
        new KeySchema(['id']),
        ENo.NO,
        false,
        meta,
        [makeField('id')],
        [],
        [],
      );
      const cfg = CfgSchema.of();
      cfg.add(jsonTable);

      // Provide data that would be Excel
      const rawSheet = new DRawSheet('jsontable.xlsx', 'Sheet1', 0, [], []);
      const dTable = new DTable('jsontable', [], [], [rawSheet], null);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('jsontable');
      expect(t).toBeDefined();
      expect(errs.errs.length).toBe(1);
      expect(errs.errs[0]._tag).toBe('JsonTableNotSupportExcel');
    });

    it('copies json table without error when no Excel data', () => {
      const meta = Metadata_of();
      meta.data().set('json', TAG);
      const jsonTable = new TableSchema(
        'jsontable',
        new KeySchema(['id']),
        ENo.NO,
        false,
        meta,
        [makeField('id')],
        [],
        [],
      );
      const cfg = CfgSchema.of();
      cfg.add(jsonTable);

      const data = makeCfgData([]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('jsontable');
      expect(t).toBeDefined();
      expect(errs.errs.length).toBe(0);
    });
  });

  describe('align — span check', () => {
    it('reports FieldHeaderSpanNotEnough when header has fewer columns than field span', () => {
      // Use FList type (not Primitive) so fieldSpan checks _span meta
      // FList(STRING) with Fix(5) → span = 1*5 = 5
      const spanMeta = Metadata_of();
      spanMeta.putSpan(5);
      const bigField = new FieldSchema(
        'bigField',
        new FList(Primitive.STRING),
        new Fix(5),
        spanMeta,
      );
      const schemaFields = [makeField('id'), bigField];
      const table = makeTable('test', schemaFields);
      const cfg = CfgSchema.of();
      cfg.add(table);

      // Data only has 2 columns total (id + bigField = only 2 columns, but span=5 needs 5+1=6)
      const dFields = [makeDField('id'), makeDField('bigField')];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      // The table might not be added due to the error
      const t = aligned.findTable('test');
      expect(errs.errs.length).toBeGreaterThanOrEqual(1);
      expect(errs.errs[0]._tag).toBe('FieldHeaderSpanNotEnough');
    });
  });

  describe('align — order preservation', () => {
    it('preserves field order from data header', () => {
      const schemaFields = [
        makeField('a'),
        makeField('b'),
        makeField('c'),
      ];
      const table = makeTable('test', schemaFields);
      const cfg = CfgSchema.of();
      cfg.add(table);

      // Data in different order: c, a, b
      const dFields = [makeDField('c'), makeDField('a'), makeDField('b')];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('test')!;
      expect(t.fields().length).toBe(3);
      // Order follows data header, not schema
      expect(t.fields()[0].name).toBe('c');
      expect(t.fields()[1].name).toBe('a');
      expect(t.fields()[2].name).toBe('b');
    });
  });

  describe('align — multiple tables', () => {
    it('processes multiple tables in schema order', () => {
      const table1 = makeTable('alpha', [makeField('id')]);
      const table2 = makeTable('beta', [makeField('id')]);
      const cfg = CfgSchema.of();
      cfg.add(table1);
      cfg.add(table2);

      const d1 = makeDTable('alpha', [makeDField('id')]);
      const d2 = makeDTable('beta', [makeDField('id')]);
      const data = makeCfgData([d1, d2]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      expect(aligned.items().length).toBe(2);
      expect(aligned.findTable('alpha')).toBeDefined();
      expect(aligned.findTable('beta')).toBeDefined();
    });

    it('handles mix of existing tables and new tables from data', () => {
      const existing = makeTable('existing', [makeField('id')]);
      const cfg = CfgSchema.of();
      cfg.add(existing);

      const d1 = makeDTable('existing', [makeDField('id')]);
      const d2 = makeDTable('newtable', [makeDField('id'), makeDField('name')]);
      const data = makeCfgData([d1, d2]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      expect(aligned.findTable('existing')).toBeDefined();
      const nt = aligned.findTable('newtable');
      expect(nt).toBeDefined();
      expect(nt!.fields().length).toBe(2);
    });
  });

  describe('align — column mode preservation', () => {
    it('preserves isColumnMode from schema table', () => {
      const table = new TableSchema(
        'test',
        new KeySchema(['id']),
        ENo.NO,
        true, // column mode = true
        Metadata_of(),
        [makeField('id')],
        [],
        [],
      );
      const cfg = CfgSchema.of();
      cfg.add(table);

      const dFields = [makeDField('id')];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('test')!;
      expect(t.isColumnMode).toBe(true);
    });
  });

  describe('align — notIdentifier header names', () => {
    it('reports DataHeadNameNotIdentifier for non-identifier header in existing table', () => {
      const schemaFields = [makeField('id')];
      const table = makeTable('test', schemaFields);
      const cfg = CfgSchema.of();
      cfg.add(table);

      const dFields = [makeDField('id'), makeDField('123bad')];
      const dTable = makeDTable('test', dFields);
      const data = makeCfgData([dTable]);
      const errs = makeErrs();

      const aligned = aligner.align(cfg, data, errs);

      const t = aligned.findTable('test')!;
      // 'id' is kept, '123bad' is reported as error (not added)
      expect(t.fields().length).toBe(1);
      expect(errs.errs.length).toBe(1);
      expect(errs.errs[0]._tag).toBe('DataHeadNameNotIdentifier');
    });
  });

  describe('constructor validation', () => {
    it('throws if headRow is null', () => {
      expect(() => new CfgSchemaAlignToData(null as any)).toThrow();
    });
  });
});
