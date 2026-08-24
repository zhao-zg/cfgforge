import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CfgReader } from '../cfg/CfgReader';
import { CfgWriter } from '../cfg/CfgWriter';
import { CfgSchema } from '../CfgSchema';
import { StructSchema } from '../StructSchema';
import { TableSchema } from '../TableSchema';
import { InterfaceSchema } from '../InterfaceSchema';
import { FieldSchema } from '../FieldSchema';
import { ForeignKeySchema } from '../ForeignKeySchema';
import { KeySchema } from '../KeySchema';
import { Primitive, FList, FMap, StructRef } from '../FieldType';
import { AutoOrPack, Sep, Fix, Block } from '../FieldFormat';
import { ENo, EEntry, EEnum } from '../EntryType';
import { RefPrimary, RefUniq, RefList } from '../RefKey';
import { Metadata, Metadata_of, TAG } from '../Metadata';
import { CommentData } from '../CommentData';

// ---------------------------------------------------------------------------
// Helper: read fixture file
// ---------------------------------------------------------------------------

function readFixture(relativePath: string): string {
  const root = process.cwd();
  return readFileSync(join(root, relativePath), 'utf-8');
}

describe('CfgWriter', () => {

  // =========================================================================
  // 1. Static helper methods
  // =========================================================================

  describe('static helpers', () => {

    it('keyStr formats a single-field key', () => {
      const key = new KeySchema(['id']);
      expect(CfgWriter.keyStr(key)).toBe('[id]');
    });

    it('keyStr formats a multi-field key', () => {
      const key = new KeySchema(['a', 'b', 'c']);
      expect(CfgWriter.keyStr(key)).toBe('[a,b,c]');
    });

    it('simpleTypeStr formats primitives', () => {
      expect(CfgWriter.simpleTypeStr(Primitive.BOOL)).toBe('bool');
      expect(CfgWriter.simpleTypeStr(Primitive.INT)).toBe('int');
      expect(CfgWriter.simpleTypeStr(Primitive.LONG)).toBe('long');
      expect(CfgWriter.simpleTypeStr(Primitive.FLOAT)).toBe('float');
      expect(CfgWriter.simpleTypeStr(Primitive.STRING)).toBe('str');
    });

    it('simpleTypeStr formats StructRef', () => {
      const ref = new StructRef('Foo');
      expect(CfgWriter.simpleTypeStr(ref)).toBe('Foo');
    });

    it('typeStr formats primitive field', () => {
      const f = new FieldSchema('x', Primitive.INT, AutoOrPack.AUTO, Metadata_of());
      expect(CfgWriter.typeStr(f)).toBe('int');
    });

    it('typeStr formats str field', () => {
      const f = new FieldSchema('name', Primitive.STRING, AutoOrPack.AUTO, Metadata_of());
      expect(CfgWriter.typeStr(f)).toBe('str');
    });

    it('typeStr formats text field', () => {
      const f = new FieldSchema('desc', Primitive.TEXT, AutoOrPack.AUTO, Metadata_of());
      expect(CfgWriter.typeStr(f)).toBe('text');
    });

    it('typeStr formats StructRef field', () => {
      const ref = new StructRef('Foo');
      const f = new FieldSchema('obj', ref, AutoOrPack.AUTO, Metadata_of());
      expect(CfgWriter.typeStr(f)).toBe('Foo');
    });

    it('typeStr formats list field', () => {
      const list = new FList(Primitive.INT);
      const f = new FieldSchema('nums', list, AutoOrPack.AUTO, Metadata_of());
      expect(CfgWriter.typeStr(f)).toBe('list<int>');
    });

    it('typeStr formats list of str field', () => {
      const list = new FList(Primitive.STRING);
      const f = new FieldSchema('names', list, AutoOrPack.AUTO, Metadata_of());
      expect(CfgWriter.typeStr(f)).toBe('list<str>');
    });

    it('typeStr formats list of StructRef field', () => {
      const ref = new StructRef('Foo');
      const list = new FList(ref);
      const f = new FieldSchema('items', list, AutoOrPack.AUTO, Metadata_of());
      expect(CfgWriter.typeStr(f)).toBe('list<Foo>');
    });

    it('typeStr formats map field', () => {
      const map = new FMap(Primitive.STRING, Primitive.INT);
      const f = new FieldSchema('data', map, AutoOrPack.AUTO, Metadata_of());
      expect(CfgWriter.typeStr(f)).toBe('map<str,int>');
    });

    it('typeStr formats str field with fromEnumType', () => {
      const meta = Metadata_of();
      meta.putFromEnumType('Color');
      const f = new FieldSchema('color', Primitive.STRING, AutoOrPack.AUTO, meta);
      expect(CfgWriter.typeStr(f)).toBe('Color');
    });

    it('typeStrWithFullName formats primitive', () => {
      expect(CfgWriter.typeStrWithFullName(Primitive.INT)).toBe('int');
      expect(CfgWriter.typeStrWithFullName(Primitive.STRING)).toBe('str');
    });

    it('typeStrWithFullName formats list', () => {
      const list = new FList(Primitive.INT);
      expect(CfgWriter.typeStrWithFullName(list)).toBe('list<int>');
    });

    it('typeStrWithFullName formats map', () => {
      const map = new FMap(Primitive.STRING, Primitive.LONG);
      expect(CfgWriter.typeStrWithFullName(map)).toBe('map<str,long>');
    });

    it('fmtStr formats AUTO as empty', () => {
      expect(CfgWriter.fmtStr(AutoOrPack.AUTO)).toBe('');
    });

    it('fmtStr formats PACK', () => {
      expect(CfgWriter.fmtStr(AutoOrPack.PACK)).toBe('pack');
    });

    it('fmtStr formats Sep', () => {
      expect(CfgWriter.fmtStr(new Sep(';'))).toBe("sep=';'");
    });

    it('fmtStr formats Fix', () => {
      expect(CfgWriter.fmtStr(new Fix(3))).toBe('fix=3');
    });

    it('fmtStr formats Block', () => {
      expect(CfgWriter.fmtStr(new Block(2))).toBe('block=2');
    });
  });

  // =========================================================================
  // 2. Stringify basic schemas (exact output)
  // =========================================================================

  describe('stringify exact output', () => {

    it('writes a simple struct', () => {
      const src = 'struct Foo { x:int; y:int; }';
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toBe('struct Foo {\n\tx:int;\n\ty:int;\n}\n\n');
    });

    it('writes a struct with sep format', () => {
      const src = "struct Pos (sep=';') { x:int; y:int; }";
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain("struct Pos (sep=';') {");
      expect(output).toContain('\tx:int;');
      expect(output).toContain('\ty:int;');
    });

    it('writes a struct with pack format', () => {
      const src = 'struct Foo (pack) { x:int; }';
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain('struct Foo (pack) {');
    });

    it('writes a table with json tag', () => {
      const src = 'table test[id] (json) { id:int; name:str; }';
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain('table test[id] (json) {');
      expect(output).toContain('\tid:int;');
      expect(output).toContain('\tname:str;');
    });

    it('writes a table with entry', () => {
      const src = "table T[id] (entry='id') { id:int; }";
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain("(entry='id')");
    });

    it('writes a table with enum entry', () => {
      const src = "table T[id] (enum='type') { id:int; type:str; }";
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain("(enum='type')");
    });

    it('writes a table with columnMode', () => {
      const src = 'table T[id] (columnMode) { id:int; }';
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain('columnMode');
    });

    it('writes a table with unique keys', () => {
      const src = 'table T[id] { id:int; name:str; [name]; }';
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain('\t[name];');
    });

    it('writes a struct field with trailing comment', () => {
      const src = 'struct Foo { x:int; // hello\n }';
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      // trailing comment should appear on same line
      expect(output).toContain('\tx:int; // hello');
    });

    it('writes a struct field with leading comment', () => {
      const src = 'struct Foo {\n// leading comment\nx:int;\n }';
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain('// leading comment');
      expect(output).toContain('\tx:int;');
    });

    it('writes a table with field foreign key ->', () => {
      const src = 'table T[id] { id:int; ref:int -> other[name]; }';
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain('ref:int ->other[name];');
    });

    it('writes a table with field foreign key =>', () => {
      const src = 'table T[id] { id:int; refs:list<int> => other[fieldId]; }';
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain('refs:list<int> =>other[fieldId];');
    });

    it('writes a table with field foreign key -> (primary)', () => {
      const src = 'table T[id] { id:int; ref:int -> other; }';
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain('ref:int ->other;');
    });

    it('writes a table with standalone foreign key', () => {
      const src = 'table T[id] { id:int; -> ref:[id] -> other[id]; }';
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain('->ref:[id] ->other[id];');
    });

    it('writes a table with field fix format', () => {
      const src = 'table T[id] { id:int; vals:list<int> (fix=3); }';
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain('vals:list<int> (fix=3);');
    });

    it('writes a table with field block format', () => {
      const src = 'table T[id] { id:int; vals:list<int> (block=2); }';
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain('vals:list<int> (block=2);');
    });

    it('writes a table with field sep format', () => {
      const src = "table T[id] { id:int; vals:list<str> (sep=','); }";
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain("vals:list<str> (sep=',');");
    });

    it('writes a table with field pack format on StructRef', () => {
      const src = 'table T[id] { id:int; cond: Foo (pack); }';
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain('cond:Foo (pack);');
    });

    it('writes an empty enum', () => {
      const src = 'enum Color { Red; Green; Blue; }';
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain('enum Color {');
      expect(output).toContain('\tRed;');
      expect(output).toContain('\tGreen;');
      expect(output).toContain('\tBlue;');
    });

    it('writes an assigned enum', () => {
      const src = 'enum Status { Idle=1; Active=2; }';
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain('enum Status {');
      expect(output).toContain('\tIdle = 1;');
      expect(output).toContain('\tActive = 2;');
    });

    it('writes an enum with value comments', () => {
      const src = 'enum Color { Red; // 红色\n Green; }';
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain('Red; // 红色');
    });

    it('writes an interface with impls', () => {
      const src = [
        "interface IShape (enumRef='ShapeType', defaultImpl='Circle') {",
        '  struct Circle { radius:int; }',
        '  struct Square { side:int; }',
        '}',
      ].join('\n');
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain('interface IShape');
      expect(output).toContain("enumRef='ShapeType'");
      expect(output).toContain("defaultImpl='Circle'");
      expect(output).toContain('struct Circle {');
      expect(output).toContain('struct Square {');
    });

    it('writes an interface with fmt auto', () => {
      const src = [
        "interface IFoo (enumRef='T') {",
        '  struct A { x:int; }',
        '}',
      ].join('\n');
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      // interface fmt auto → no fmt tag in metadata
      expect(output).toContain('interface IFoo');
      expect(output).not.toContain('(auto)');
    });

    it('writes an interface with fmt pack', () => {
      const src = [
        "interface IPack (enumRef='T', defaultImpl='A', pack) {",
        '  struct A { x:int; }',
        '}',
      ].join('\n');
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain('pack');
    });

    it('writes file end comments', () => {
      const src = 'struct Foo { x:int; }\n// end of file\n';
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain('// end of file');
    });

    it('writes nullable foreign key', () => {
      const src = 'table T[id] { id:int; ref:int -> other[name] (nullable); }';
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      expect(output).toContain('nullable');
      expect(output).toContain('->other[name]');
    });
  });

  // =========================================================================
  // 3. Round-trip tests (parse → write → re-parse → compare)
  // =========================================================================

  describe('round-trip', () => {

    it('round-trip config.cfg: re-parsed schema equals original', () => {
      const src = readFixture('example/config/config.cfg');
      const schema1 = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema1);
      const schema2 = CfgReader.parse(output);

      // Compare item count
      expect(schema2.items().length).toBe(schema1.items().length);

      // Compare each item's name and type
      for (let i = 0; i < schema1.items().length; i++) {
        const a = schema1.items()[i];
        const b = schema2.items()[i];
        expect(b.name()).toBe(a.name());
        expect(b.fullName()).toBe(a.fullName());

        // If both are StructSchema
        if (a instanceof StructSchema && b instanceof StructSchema) {
          expect(b.fields().length).toBe(a.fields().length);
          for (let j = 0; j < a.fields().length; j++) {
            expect(b.fields()[j].name).toBe(a.fields()[j].name);
          }
          expect(b.foreignKeys().length).toBe(a.foreignKeys().length);
        }
      }
    });

    it('round-trip test.cfg: re-parsed schema equals original', () => {
      const src = readFixture('samples/test/test.cfg');
      const schema1 = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema1);
      const schema2 = CfgReader.parse(output);

      // Compare tables
      expect(schema2.items().length).toBe(schema1.items().length);

      for (let i = 0; i < schema1.items().length; i++) {
        const a = schema1.items()[i] as TableSchema;
        const b = schema2.items()[i] as TableSchema;
        expect(b.name()).toBe(a.name());
        expect(b.fields().length).toBe(a.fields().length);
        expect(b.foreignKeys().length).toBe(a.foreignKeys().length);
        expect(b.uniqueKeys().length).toBe(a.uniqueKeys().length);
        expect(b.isJson()).toBe(a.isJson());
        expect(b.isColumnMode).toBe(a.isColumnMode);
      }
    });

    it('round-trip preserves foreign key types', () => {
      const src = readFixture('samples/test/test.cfg');
      const schema1 = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema1);
      const schema2 = CfgReader.parse(output);

      const t1 = schema1.items()[0] as TableSchema;
      const t2 = schema2.items()[0] as TableSchema;

      for (let i = 0; i < t1.foreignKeys().length; i++) {
        const fk1 = t1.foreignKeys()[i];
        const fk2 = t2.foreignKeys()[i];
        expect(fk2.name).toBe(fk1.name);
        expect(fk2.refTable).toBe(fk1.refTable);
        // RefKey type should match
        expect(fk2.refKey.constructor).toBe(fk1.refKey.constructor);
      }
    });

    it('round-trip preserves field types', () => {
      const src = readFixture('samples/test/test.cfg');
      const schema1 = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema1);
      const schema2 = CfgReader.parse(output);

      const t1 = schema1.items()[0] as TableSchema;
      const t2 = schema2.items()[0] as TableSchema;

      for (let i = 0; i < t1.fields().length; i++) {
        const f1 = t1.fields()[i];
        const f2 = t2.fields()[i];
        expect(f2.name).toBe(f1.name);
        // Compare type strings
        expect(CfgWriter.typeStr(f2)).toBe(CfgWriter.typeStr(f1));
      }
    });

    it('round-trip preserves comments', () => {
      const src = readFixture('example/config/config.cfg');
      const schema1 = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema1);
      const schema2 = CfgReader.parse(output);

      // Range struct has field comments
      const s1 = schema1.items()[2] as StructSchema;
      const s2 = schema2.items()[2] as StructSchema;
      expect(s2.fields()[0].comment()).toBe(s1.fields()[0].comment());
      expect(s2.fields()[1].comment()).toBe(s1.fields()[1].comment());
    });

    it('round-trip preserves entry types', () => {
      const src = "table T[id] (entry='id') { id:int; name:str; }";
      const schema1 = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema1);
      const schema2 = CfgReader.parse(output);
      const t1 = schema1.items()[0] as TableSchema;
      const t2 = schema2.items()[0] as TableSchema;
      expect(t2.entry).toEqual(t1.entry);
    });

    it('round-trip preserves enum entry', () => {
      const src = "table T[id] (enum='type') { id:int; type:str; }";
      const schema1 = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema1);
      const schema2 = CfgReader.parse(output);
      const t1 = schema1.items()[0] as TableSchema;
      const t2 = schema2.items()[0] as TableSchema;
      expect(t2.entry).toEqual(t1.entry);
    });

    it('round-trip preserves enum declarations', () => {
      const src = 'enum Color { Red; Green; Blue; }';
      const schema1 = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema1);
      const schema2 = CfgReader.parse(output);
      const t1 = schema1.items()[0] as TableSchema;
      const t2 = schema2.items()[0] as TableSchema;
      expect(t2.name()).toBe(t1.name());
      // Both should have enumValues
      expect(t2.meta().hasEnumValues()).toBe(true);
    });

    it('round-trip preserves assigned enums', () => {
      const src = 'enum Status { Idle=1; Active=2; Dead=3; }';
      const schema1 = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema1);
      const schema2 = CfgReader.parse(output);
      const t1 = schema1.items()[0] as TableSchema;
      const t2 = schema2.items()[0] as TableSchema;
      expect(t2.name()).toBe(t1.name());
      expect(t2.meta().hasEnumValues()).toBe(true);
    });

    it('round-trip preserves interfaces', () => {
      const src = [
        "interface IShape (enumRef='ShapeType', defaultImpl='Circle') {",
        '  struct Circle { radius:int; }',
        '  struct Square { side:int; }',
        '}',
      ].join('\n');
      const schema1 = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema1);
      const schema2 = CfgReader.parse(output);
      const i1 = schema1.items()[0] as InterfaceSchema;
      const i2 = schema2.items()[0] as InterfaceSchema;
      expect(i2.name()).toBe(i1.name());
      expect(i2.enumRef()).toBe(i1.enumRef());
      expect(i2.defaultImpl()).toBe(i1.defaultImpl());
      expect(i2.impls().length).toBe(i1.impls().length);
      expect(i2.impls()[0].name()).toBe(i1.impls()[0].name());
      expect(i2.impls()[1].name()).toBe(i1.impls()[1].name());
    });

    it('round-trip with package name prefix', () => {
      const reader = new CfgReader();
      const src = 'struct Foo { x:int; }';
      const schema1 = reader.read(src, 'equip.');
      const output = CfgWriter.stringify(schema1);
      const schema2 = CfgReader.parse(output);
      const s1 = schema1.items()[0] as StructSchema;
      const s2 = schema2.items()[0] as StructSchema;
      expect(s2.name()).toBe(s1.name());
    });

    it('round-trip preserves map fields', () => {
      const src = 'struct Foo { data:map<str, int>; }';
      const schema1 = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema1);
      const schema2 = CfgReader.parse(output);
      const s1 = schema1.items()[0] as StructSchema;
      const s2 = schema2.items()[0] as StructSchema;
      expect(s2.fields().length).toBe(s1.fields().length);
      expect(CfgWriter.typeStr(s2.fields()[0])).toBe(CfgWriter.typeStr(s1.fields()[0]));
    });

    it('round-trip preserves list of StructRef fields', () => {
      const src = 'struct Foo { items:list<Bar>; }';
      const schema1 = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema1);
      const schema2 = CfgReader.parse(output);
      const s1 = schema1.items()[0] as StructSchema;
      const s2 = schema2.items()[0] as StructSchema;
      expect(CfgWriter.typeStr(s2.fields()[0])).toBe('list<Bar>');
    });
  });

  // =========================================================================
  // 4. useLastName option
  // =========================================================================

  describe('useLastName option', () => {

    it('writes last name when useLastName=true', () => {
      const reader = new CfgReader();
      const schema = reader.read('struct Foo { x:int; }', 'equip.');
      const output = CfgWriter.stringifyWithOptions(schema, true, false);
      // useLastName → name should be "Foo" (last segment of "equip.Foo")
      expect(output).toContain('struct Foo {');
      expect(output).not.toContain('struct equip.Foo {');
    });

    it('writes full name when useLastName=false (default)', () => {
      const reader = new CfgReader();
      const schema = reader.read('struct Foo { x:int; }', 'equip.');
      const output = CfgWriter.stringifyWithOptions(schema, false, false);
      expect(output).toContain('struct equip.Foo {');
    });
  });

  // =========================================================================
  // 5. includeMetaStartWith_ option
  // =========================================================================

  describe('includeMetaStartWith_ option', () => {

    it('excludes _ tags by default', () => {
      const src = 'table T[id] (json) { id:int; }';
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringify(schema);
      // json is not a _ tag, should be included
      expect(output).toContain('(json)');
      // _fromCfgFilePATH should be excluded
      expect(output).not.toContain('_fromCfgFile');
    });

    it('includes _ tags when includeMetaStartWith_=true', () => {
      const src = 'table T[id] (json) { id:int; }';
      const schema = CfgReader.parse(src);
      const output = CfgWriter.stringifyWithOptions(schema, false, true);
      // _fromCfgFilePATH should be included
      expect(output).toContain('_fromCfgFile');
    });
  });
});
