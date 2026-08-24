import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CfgReader, decodeComment } from '../cfg/CfgReader';
import { CfgSchema } from '../CfgSchema';
import { StructSchema } from '../StructSchema';
import { TableSchema } from '../TableSchema';
import { InterfaceSchema } from '../InterfaceSchema';
import { Primitive, isFList, isFMap, isStructRef } from '../FieldType';
import { AutoOrPack, Sep, isSep } from '../FieldFormat';
import { ENo, EEntry, EEnum, isENo, isEEntry, isEEnum } from '../EntryType';
import { RefPrimary, RefUniq, RefList, isRefPrimary, isRefUniq, isRefList } from '../RefKey';
import { CommentData } from '../CommentData';
import { TAG } from '../Metadata';

// ---------------------------------------------------------------------------
// Helper: read fixture file
// ---------------------------------------------------------------------------

function readFixture(relativePath: string): string {
  // cwd is packages/schema — need to go up 2 levels to reach repo root
  const root = join(process.cwd(), '..', '..');
  return readFileSync(join(root, relativePath), 'utf-8');
}

describe('CfgReader', () => {

  // =========================================================================
  // 1. Parse config.cfg (3 structs)
  // =========================================================================

  describe('parse config.cfg', () => {
    const src = readFixture('example/config/config.cfg');
    const schema = CfgReader.parse(src);

    it('creates a CfgSchema with 3 items', () => {
      expect(schema).toBeInstanceOf(CfgSchema);
      expect(schema.items().length).toBe(3);
    });

    it('parses LevelRank struct', () => {
      const s = schema.items()[0] as StructSchema;
      expect(s).toBeInstanceOf(StructSchema);
      expect(s.name()).toBe('LevelRank');
      expect(s.fields().length).toBe(2);
      expect(s.fields()[0].name).toBe('Level');
      expect(s.fields()[0].type).toBe(Primitive.INT);
      expect(s.fields()[1].name).toBe('Rank');
      expect(s.fields()[1].type).toBe(Primitive.INT);
    });

    it('parses Rank foreign key (-> equip.rank)', () => {
      const s = schema.items()[0] as StructSchema;
      expect(s.foreignKeys().length).toBe(1);
      const fk = s.foreignKeys()[0];
      expect(fk.name).toBe('Rank');
      expect(fk.refTable).toBe('equip.rank');
      expect(isRefPrimary(fk.refKey)).toBe(true);
      if (isRefPrimary(fk.refKey)) {
        expect(fk.refKey.nullable).toBe(false);
      }
    });

    it('parses Position struct with sep format', () => {
      const s = schema.items()[1] as StructSchema;
      expect(s.name()).toBe('Position');
      expect(isSep(s.fmt())).toBe(true);
      if (isSep(s.fmt())) {
        expect(s.fmt().sep).toBe(';');
      }
      expect(s.fields().length).toBe(3);
      expect(s.fields()[0].name).toBe('x');
      expect(s.fields()[1].name).toBe('y');
      expect(s.fields()[2].name).toBe('z');
    });

    it('parses Range struct', () => {
      const s = schema.items()[2] as StructSchema;
      expect(s.name()).toBe('Range');
      expect(s.fields().length).toBe(2);
      expect(s.fields()[0].name).toBe('Min');
      expect(s.fields()[1].name).toBe('Max');
    });

    it('parses comments on Range fields', () => {
      const s = schema.items()[2] as StructSchema;
      expect(s.fields()[0].comment()).toBe('最小');
      expect(s.fields()[1].comment()).toBe('最大');
    });
  });

  // =========================================================================
  // 2. Parse test.cfg (2 tables)
  // =========================================================================

  describe('parse test.cfg', () => {
    const src = readFixture('samples/test/test.cfg');
    const schema = CfgReader.parse(src);

    it('creates a CfgSchema with 2 tables', () => {
      expect(schema.items().length).toBe(2);
    });

    it('parses test table with json tag', () => {
      const t = schema.items()[0] as TableSchema;
      expect(t).toBeInstanceOf(TableSchema);
      expect(t.name()).toBe('test');
      expect(t.primaryKey.fields()).toEqual(['id']);
      expect(t.isJson()).toBe(true);
    });

    it('test table has entry ENo.NO', () => {
      const t = schema.items()[0] as TableSchema;
      expect(isENo(t.entry)).toBe(true);
      expect(t.entry).toBe(ENo.NO);
    });

    it('test table has correct fields', () => {
      const t = schema.items()[0] as TableSchema;
      expect(t.fields().length).toBe(12);
      expect(t.fields()[0].name).toBe('id');
      expect(t.fields()[0].type).toBe(Primitive.INT);
      expect(t.fields()[1].name).toBe('name');
      expect(t.fields()[1].type).toBe(Primitive.STRING);
    });

    it('test table has list fields', () => {
      const t = schema.items()[0] as TableSchema;
      const testBools = t.fields()[2];
      expect(isFList(testBools.type)).toBe(true);
      if (isFList(testBools.type)) {
        expect(testBools.type.item).toBe(Primitive.BOOL);
      }
    });

    it('test table has foreign keys with refs', () => {
      const t = schema.items()[0] as TableSchema;
      // enumInt:int -> buff.buffclass
      expect(t.foreignKeys().length).toBe(6);
      const fk0 = t.foreignKeys()[0];
      expect(fk0.name).toBe('enumInt');
      expect(fk0.refTable).toBe('buff.buffclass');
      expect(isRefPrimary(fk0.refKey)).toBe(true);
    });

    it('test table has trailing comment', () => {
      const t = schema.items()[0] as TableSchema;
      expect(t.comment()).toBe('副本逻辑');
    });

    it('parses test2 table', () => {
      const t = schema.items()[1] as TableSchema;
      expect(t.name()).toBe('test2');
      expect(t.primaryKey.fields()).toEqual(['id']);
      expect(t.isJson()).toBe(false);
    });

    it('test2 table has fix format on testBools', () => {
      const t = schema.items()[1] as TableSchema;
      const testBools = t.fields()[2];
      // fix=3 was stored as metadata, should have been removed and converted to fmt
      expect(testBools.fmt).toBeDefined();
    });

    it('test2 table has pack format on cond field', () => {
      const t = schema.items()[1] as TableSchema;
      const cond = t.fields()[3];
      expect(cond.type).toBeDefined();
      // cond: trigger.Condition (pack) → type is StructRef, fmt is PACK
      expect(isStructRef(cond.type)).toBe(true);
      if (isStructRef(cond.type)) {
        expect(cond.type.name).toBe('trigger.Condition');
      }
      expect(cond.fmt).toBe(AutoOrPack.PACK);
    });

    it('test2 table has name field with trailing comment', () => {
      const t = schema.items()[1] as TableSchema;
      expect(t.fields()[1].comment()).toBe('名称');
    });
  });

  // =========================================================================
  // 3. Parse inline strings
  // =========================================================================

  describe('parse inline strings', () => {
    it('parses a simple struct', () => {
      const src = 'struct Foo { x:int; y:int; }';
      const schema = CfgReader.parse(src);
      expect(schema.items().length).toBe(1);
      const s = schema.items()[0] as StructSchema;
      expect(s.name()).toBe('Foo');
      expect(s.fields().length).toBe(2);
    });

    it('parses a table with entry', () => {
      const src = 'table MyTable[id] (entry=\'id\') { id:int; name:str; }';
      const schema = CfgReader.parse(src);
      const t = schema.items()[0] as TableSchema;
      expect(t.name()).toBe('MyTable');
      expect(isEEntry(t.entry)).toBe(true);
      if (isEEntry(t.entry)) {
        expect(t.entry.field).toBe('id');
      }
    });

    it('parses a table with enum entry', () => {
      const src = 'table MyTable[id] (enum=\'type\') { id:int; type:str; }';
      const schema = CfgReader.parse(src);
      const t = schema.items()[0] as TableSchema;
      expect(isEEnum(t.entry)).toBe(true);
      if (isEEnum(t.entry)) {
        expect(t.entry.field).toBe('type');
      }
    });

    it('parses an enum declaration', () => {
      const src = 'enum Color { Red; Green; Blue; }';
      const schema = CfgReader.parse(src);
      const t = schema.items()[0] as TableSchema;
      expect(t.name()).toBe('Color');
      expect(isEEnum(t.entry)).toBe(true);
      expect(t.fields().length).toBe(2); // name + comment
      expect(t.fields()[0].name).toBe('name');
      expect(t.fields()[0].type).toBe(Primitive.STRING);
      expect(t.fields()[1].name).toBe('comment');
      expect(t.fields()[1].type).toBe(Primitive.TEXT);
    });

    it('parses an enum with assigned values', () => {
      const src = 'enum Status { Idle=1; Active=2; Dead=3; }';
      const schema = CfgReader.parse(src);
      const t = schema.items()[0] as TableSchema;
      expect(t.name()).toBe('Status');
      // Has 3 fields: name, id, comment
      expect(t.fields().length).toBe(3);
      // Has unique key [id]
      expect(t.uniqueKeys().length).toBe(1);
      expect(t.uniqueKeys()[0].fields()).toEqual(['id']);
    });

    it('parses an interface with struct impls', () => {
      const src = [
        'interface IShape (enumRef=\'ShapeType\', defaultImpl=\'Circle\') {',
        '  struct Circle { radius:int; }',
        '  struct Square { side:int; }',
        '}',
      ].join('\n');
      const schema = CfgReader.parse(src);
      const iface = schema.items()[0] as InterfaceSchema;
      expect(iface.name()).toBe('IShape');
      expect(iface.enumRef()).toBe('ShapeType');
      expect(iface.defaultImpl()).toBe('Circle');
      expect(iface.impls().length).toBe(2);
      expect(iface.impls()[0].name()).toBe('Circle');
      expect(iface.impls()[1].name()).toBe('Square');
    });

    it('parses a struct with map field', () => {
      const src = 'struct Foo { data:map<str, int>; }';
      const schema = CfgReader.parse(src);
      const s = schema.items()[0] as StructSchema;
      const data = s.fields()[0];
      expect(isFMap(data.type)).toBe(true);
      if (isFMap(data.type)) {
        expect(data.type.key).toBe(Primitive.STRING);
        expect(data.type.value).toBe(Primitive.INT);
      }
    });

    it('parses a struct with foreign key => (list ref)', () => {
      const src = 'table Foo[id] { id:int; refs:list<int> => other.field[fieldId]; }';
      const schema = CfgReader.parse(src);
      const t = schema.items()[0] as TableSchema;
      expect(t.foreignKeys().length).toBe(1);
      const fk = t.foreignKeys()[0];
      expect(fk.name).toBe('refs');
      expect(fk.refTable).toBe('other.field');
      expect(isRefList(fk.refKey)).toBe(true);
    });

    it('parses a struct with foreign key -> (uniq ref)', () => {
      const src = 'table Foo[id] { id:int; ref:int -> other[name]; }';
      const schema = CfgReader.parse(src);
      const t = schema.items()[0] as TableSchema;
      expect(t.foreignKeys().length).toBe(1);
      const fk = t.foreignKeys()[0];
      expect(fk.refTable).toBe('other');
      expect(isRefUniq(fk.refKey)).toBe(true);
      if (isRefUniq(fk.refKey)) {
        expect(fk.refKey.key.fields()).toEqual(['name']);
      }
    });

    it('parses columnMode tag', () => {
      const src = 'table Foo[id] (columnMode) { id:int; name:str; }';
      const schema = CfgReader.parse(src);
      const t = schema.items()[0] as TableSchema;
      expect(t.isColumnMode).toBe(true);
    });

    it('parses unique keys', () => {
      const src = 'table Foo[id] { id:int; name:str; [name]; }';
      const schema = CfgReader.parse(src);
      const t = schema.items()[0] as TableSchema;
      expect(t.uniqueKeys().length).toBe(1);
      expect(t.uniqueKeys()[0].fields()).toEqual(['name']);
    });

    it('parses foreign_decl', () => {
      const src = 'table Foo[id] { id:int; -> ref: [id] -> other[id]; }';
      const schema = CfgReader.parse(src);
      const t = schema.items()[0] as TableSchema;
      expect(t.foreignKeys().length).toBe(1);
      const fk = t.foreignKeys()[0];
      expect(fk.name).toBe('ref');
      expect(fk.key.fields()).toEqual(['id']);
      expect(fk.refTable).toBe('other');
      expect(isRefUniq(fk.refKey)).toBe(true);
    });

    it('parses with package name prefix', () => {
      const reader = new CfgReader();
      const schema = reader.read('struct Foo { x:int; }', 'equip.');
      const s = schema.items()[0] as StructSchema;
      expect(s.name()).toBe('equip.Foo');
    });

    it('stores file end comments', () => {
      const src = 'struct Foo { x:int; }\n// end of file\n';
      const schema = CfgReader.parse(src);
      expect(schema.getFileEndComment('')).toBe('end of file');
    });
  });

  // =========================================================================
  // 4. decodeComment (CommentUtil.decode port)
  // =========================================================================

  describe('decodeComment', () => {
    it('returns empty CommentData for null/blank', () => {
      const cd = decodeComment(null);
      expect(cd.leading).toBe('');
      expect(cd.trailing).toBe('');

      const cd2 = decodeComment('   ');
      expect(cd2.leading).toBe('');
      expect(cd2.trailing).toBe('');
    });

    it('decodes trailing-only comment', () => {
      const cd = decodeComment('hello');
      expect(cd.leading).toBe('');
      expect(cd.trailing).toBe('hello');
      expect(cd.suffix).toBe('');
    });

    it('decodes leading-only comment (with newline)', () => {
      const cd = decodeComment('line1\nline2\n');
      expect(cd.leading).toBe('line1\nline2\n');
      expect(cd.trailing).toBe('');
    });

    it('decodes leading+trailing with >>>', () => {
      const cd = decodeComment('leading>>>trailing');
      expect(cd.leading).toBe('leading');
      expect(cd.trailing).toBe('trailing');
    });

    it('decodes suffix with <<<', () => {
      const cd = decodeComment('trailing<<<suffix text');
      expect(cd.trailing).toBe('trailing');
      expect(cd.suffix).toBe('suffix text');
    });

    it('decodes full leading>>>trailing<<<suffix', () => {
      const cd = decodeComment('lead text>>>trail<<<suffix');
      expect(cd.leading).toBe('lead text');
      expect(cd.trailing).toBe('trail');
      expect(cd.suffix).toBe('suffix');
    });
  });
});
