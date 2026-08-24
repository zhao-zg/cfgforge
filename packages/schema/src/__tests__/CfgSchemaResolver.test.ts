import { describe, it, expect } from 'vitest';
import { CfgReader } from '../cfg/CfgReader';
import { CfgSchema } from '../CfgSchema';
import { StructSchema } from '../StructSchema';
import { InterfaceSchema } from '../InterfaceSchema';
import { Primitive, isStructRef } from '../FieldType';
import { isEEntry, isEEnum } from '../EntryType';
import { RefPrimary, RefList, isRefPrimary, isRefList } from '../RefKey';
import { CfgSchemaErrs } from '../CfgSchemaErrs';
import { CfgSchemaResolver } from '../CfgSchemaResolver';
import type { CfgSchemaErrs as CfgSchemaErrsType } from '../CfgSchemaErrs';
import { span } from '../Span';

// ---------------------------------------------------------------------------
// Helper: parse + resolve
// ---------------------------------------------------------------------------

function parseAndResolve(src: string, pkgName: string = ''): { schema: CfgSchema; errs: CfgSchemaErrsType } {
  const reader = new CfgReader();
  const schema = reader.read(src, pkgName);
  const errs = schema.resolve();
  return { schema, errs };
}

describe('CfgSchemaResolver', () => {

  // =========================================================================
  // 1. Successful resolution — simple self-contained schema
  // =========================================================================

  describe('successful resolution', () => {
    const src = [
      'struct Position (sep=\';\') {',
      '  x:int;',
      '  y:int;',
      '}',
      '',
      'table monster[id] {',
      '  id:int;',
      '  name:str;',
      '  pos:Position (pack);',
      '  tags:list<str> (pack);',
      '}',
    ].join('\n');

    const { schema, errs } = parseAndResolve(src);

    it('has no errors', () => {
      expect(errs.errs.length).toBe(0);
    });

    it('schema is marked resolved', () => {
      // If resolved, accessing span won't throw
      const table = schema.findTable('monster')!;
      expect(table).toBeDefined();
    });

    it('Position struct ref is resolved (obj set)', () => {
      const table = schema.findTable('monster')!;
      const posField = table.findField('pos')!;
      expect(isStructRef(posField.type)).toBe(true);
      if (isStructRef(posField.type)) {
        expect(posField.type.obj).not.toBeNull();
        expect(posField.type.obj).toBeInstanceOf(StructSchema);
        expect(posField.type.obj!.name()).toBe('Position');
      }
    });

    it('Position impl has nullableInterface set (if in interface)', () => {
      // Position is standalone struct, not in an interface
      const pos = schema.findFieldable('Position');
      expect(pos).toBeInstanceOf(StructSchema);
      const s = pos as StructSchema;
      expect(s.nullableInterface()).toBeNull();
    });

    it('table entry is ENo (no entry specified)', () => {
      const table = schema.findTable('monster')!;
      expect(isEEntry(table.entry)).toBe(false);
    });

    it('primaryKey fieldSchemas is set', () => {
      const table = schema.findTable('monster')!;
      expect(table.primaryKey.fieldSchemas()).not.toBeNull();
      expect(table.primaryKey.fieldSchemas()!.length).toBe(1);
      expect(table.primaryKey.fieldSchemas()![0].name).toBe('id');
    });

    it('span is calculated', () => {
      const table = schema.findTable('monster')!;
      // monster has: id(1) + name(1) + pos(pack=1) + tags(pack=1) = 4
      expect(span(table)).toBe(4);
    });

    it('Position has span 1 (sep fmt)', () => {
      const pos = schema.findFieldable('Position') as StructSchema;
      expect(span(pos)).toBe(1);
    });
  });

  // =========================================================================
  // 2. Interface resolution
  // =========================================================================

  describe('interface resolution', () => {
    const src = [
      'interface IShape (enumRef=\'shapetype\', defaultImpl=\'Circle\') {',
      '  struct Circle { radius:int; }',
      '  struct Square { side:int; }',
      '}',
      '',
      'table shapetype[type] (enum=\'type\') {',
      '  type:str;',
      '  comment:text;',
      '}',
    ].join('\n');

    const { schema, errs } = parseAndResolve(src);

    it('has no errors', () => {
      expect(errs.errs.length).toBe(0);
    });

    it('impl structs have nullableInterface set', () => {
      const iface = schema.findItem('IShape') as InterfaceSchema;
      expect(iface).toBeInstanceOf(InterfaceSchema);
      for (const impl of iface.impls()) {
        expect(impl.nullableInterface()).toBe(iface);
      }
    });

    it('enumRef table is resolved', () => {
      const iface = schema.findItem('IShape') as InterfaceSchema;
      expect(iface.nullableEnumRefTable()).not.toBeNull();
      expect(iface.nullableEnumRefTable()!.name()).toBe('shapetype');
    });

    it('defaultImpl struct is resolved', () => {
      const iface = schema.findItem('IShape') as InterfaceSchema;
      const defaultImpl = iface.defaultImplStruct();
      expect(defaultImpl.name()).toBe('Circle');
    });

    it('impl fullName includes interface name', () => {
      const iface = schema.findItem('IShape') as InterfaceSchema;
      const circle = iface.impls()[0];
      expect(circle.fullName()).toBe('IShape.Circle');
    });
  });

  // =========================================================================
  // 3. Enum → STRING + foreign key conversion
  // =========================================================================

  describe('enum to string + foreign key', () => {
    const src = [
      'enum Color {',
      '  Red;',
      '  Green;',
      '  Blue;',
      '}',
      '',
      'table item[id] {',
      '  id:int;',
      '  color:Color;',
      '}',
    ].join('\n');

    const { schema, errs } = parseAndResolve(src);

    it('has no errors', () => {
      expect(errs.errs.length).toBe(0);
    });

    it('Color enum field is converted to STRING', () => {
      const table = schema.findTable('item')!;
      const colorField = table.findField('color')!;
      expect(colorField.type).toBe(Primitive.STRING);
    });

    it('color field has fromEnumType metadata', () => {
      const table = schema.findTable('item')!;
      const colorField = table.findField('color')!;
      expect(colorField.meta.isFromEnumType()).toBe(true);
      expect(colorField.meta.getFromEnumType()).toBe('Color');
    });

    it('foreign key is created for enum field', () => {
      const table = schema.findTable('item')!;
      // The original foreign keys + 1 auto-created for enum
      const fks = table.foreignKeys();
      const enumFk = fks.find((fk) => fk.name === 'color');
      expect(enumFk).toBeDefined();
      expect(enumFk!.refTable).toBe('Color');
      expect(isRefPrimary(enumFk!.refKey)).toBe(true);
      expect(enumFk!.meta.isFromEnumType()).toBe(true);
    });
  });

  // =========================================================================
  // 4. Foreign key resolution
  // =========================================================================

  describe('foreign key resolution', () => {
    const src = [
      'table monster[id] {',
      '  id:int;',
      '  name:str;',
      '  ref:int -> other;',
      '}',
      '',
      'table other[id] {',
      '  id:int;',
      '  desc:str;',
      '}',
    ].join('\n');

    const { schema, errs } = parseAndResolve(src);

    it('has no errors', () => {
      expect(errs.errs.length).toBe(0);
    });

    it('foreign key refTableSchema is set', () => {
      const table = schema.findTable('monster')!;
      const fk = table.foreignKeys()[0];
      expect(fk.refTableSchema()).not.toBeNull();
      expect(fk.refTableSchema()!.name()).toBe('other');
    });

    it('foreign key keyIndices is set', () => {
      const table = schema.findTable('monster')!;
      const fk = table.foreignKeys()[0];
      expect(fk.keyIndices()).not.toBeNull();
      expect(fk.keyIndices()![0]).toBe(2); // 'ref' is at index 2 (after id=0, name=1)
    });

    it('local key fieldSchemas is set', () => {
      const table = schema.findTable('monster')!;
      const fk = table.foreignKeys()[0];
      expect(fk.key.fieldSchemas()).not.toBeNull();
    });

    it('remote key (RefPrimary) fieldSchemas is set', () => {
      const table = schema.findTable('monster')!;
      const fk = table.foreignKeys()[0];
      expect(isRefPrimary(fk.refKey)).toBe(true);
      if (isRefPrimary(fk.refKey)) {
        expect(fk.refKey.nullable).toBe(false);
      }
    });
  });

  // =========================================================================
  // 5. Error: table name not lowercase
  // =========================================================================

  describe('error: table name not lowercase', () => {
    it('reports TableNameNotLowerCase', () => {
      const src = 'table MyTable[id] { id:int; }';
      const { errs } = parseAndResolve(src);
      expect(errs.errs.length).toBeGreaterThan(0);
      expect(errs.errs.some((e) => e._tag === 'TableNameNotLowerCase')).toBe(true);
    });
  });

  // =========================================================================
  // 6. Error: name conflict
  // =========================================================================

  describe('error: name conflict', () => {
    it('reports NameConflict', () => {
      const src = [
        'struct Foo { x:int; }',
        'struct Foo { y:int; }',
      ].join('\n');
      const { errs } = parseAndResolve(src);
      expect(errs.errs.some((e) => e._tag === 'NameConflict')).toBe(true);
    });
  });

  // =========================================================================
  // 7. Error: inner name conflict
  // =========================================================================

  describe('error: inner name conflict', () => {
    it('reports InnerNameConflict', () => {
      const src = 'struct Foo { x:int; x:int; }';
      const { errs } = parseAndResolve(src);
      expect(errs.errs.some((e) => e._tag === 'InnerNameConflict')).toBe(true);
    });
  });

  // =========================================================================
  // 8. Error: type struct not found
  // =========================================================================

  describe('error: type struct not found', () => {
    it('reports TypeStructNotFound', () => {
      const src = 'table t[id] { id:int; ref:NonExistent; }';
      const { errs } = parseAndResolve(src);
      expect(errs.errs.some((e) => e._tag === 'TypeStructNotFound')).toBe(true);
    });
  });

  // =========================================================================
  // 9. Error: interface impl empty
  // =========================================================================

  describe('error: interface impl empty', () => {
    it('reports InterfaceImplEmpty', () => {
      const src = 'interface IEmpty { }';
      const { errs } = parseAndResolve(src);
      expect(errs.errs.some((e) => e._tag === 'InterfaceImplEmpty')).toBe(true);
    });
  });

  // =========================================================================
  // 10. Error: ref table not found
  // =========================================================================

  describe('error: ref table not found', () => {
    it('reports RefTableNotFound', () => {
      const src = 'table t[id] { id:int; ref:int -> nonexistent[id]; }';
      const { errs } = parseAndResolve(src);
      expect(errs.errs.some((e) => e._tag === 'RefTableNotFound')).toBe(true);
    });
  });

  // =========================================================================
  // 11. Error: enum ref not found
  // =========================================================================

  describe('error: enum ref not found', () => {
    it('reports EnumRefNotFound', () => {
      const src = [
        'interface IShape (enumRef=\'NonExistent\', defaultImpl=\'\') {',
        '  struct Circle { r:int; }',
        '}',
      ].join('\n');
      const { errs } = parseAndResolve(src);
      expect(errs.errs.some((e) => e._tag === 'EnumRefNotFound')).toBe(true);
    });
  });

  // =========================================================================
  // 12. Error: default impl not found
  // =========================================================================

  describe('error: default impl not found', () => {
    it('reports DefaultImplNotFound', () => {
      const src = [
        'interface IShape (defaultImpl=\'NonExistent\') {',
        '  struct Circle { r:int; }',
        '}',
      ].join('\n');
      const { errs } = parseAndResolve(src);
      expect(errs.errs.some((e) => e._tag === 'DefaultImplNotFound')).toBe(true);
    });
  });

  // =========================================================================
  // 13. Error: entry not found
  // =========================================================================

  describe('error: entry not found', () => {
    it('reports EntryNotFound', () => {
      const src = 'table t[id] (entry=\'nonexistent\') { id:int; }';
      const { errs } = parseAndResolve(src);
      expect(errs.errs.some((e) => e._tag === 'EntryNotFound')).toBe(true);
    });
  });

  // =========================================================================
  // 14. Error: entry field type not str
  // =========================================================================

  describe('error: entry field type not str', () => {
    it('reports EntryFieldTypeNotStr', () => {
      const src = 'table t[id] (entry=\'id\') { id:int; }';
      const { errs } = parseAndResolve(src);
      expect(errs.errs.some((e) => e._tag === 'EntryFieldTypeNotStr')).toBe(true);
    });
  });

  // =========================================================================
  // 15. Error: impl fmt not support
  // =========================================================================

  describe('error: impl fmt not support', () => {
    it('reports ImplFmtNotSupport', () => {
      const src = [
        'interface IShape {',
        '  struct Circle (sep=\',\') { r:int; }',
        '}',
      ].join('\n');
      const { errs } = parseAndResolve(src);
      expect(errs.errs.some((e) => e._tag === 'ImplFmtNotSupport')).toBe(true);
    });
  });

  // =========================================================================
  // 16. Error: sep fmt struct has un-primitive field
  // =========================================================================

  describe('error: sep fmt struct has un-primitive field', () => {
    it('reports SepFmtStructHasUnPrimitiveField', () => {
      const src = [
        'struct Inner { x:int; }',
        'struct Outer (sep=\',\') { inner:Inner; }',
      ].join('\n');
      const { errs } = parseAndResolve(src);
      expect(errs.errs.some((e) => e._tag === 'SepFmtStructHasUnPrimitiveField')).toBe(true);
    });
  });

  // =========================================================================
  // 17. Warning: unused struct
  // =========================================================================

  describe('warning: unused struct', () => {
    it('reports StructNotUsed', () => {
      const src = [
        'struct Unused { x:int; }',
        'table t[id] { id:int; name:str; }',
      ].join('\n');
      const { errs } = parseAndResolve(src);
      expect(errs.warns.some((w) => w._tag === 'StructNotUsed')).toBe(true);
    });
  });

  // =========================================================================
  // 18. Warning: unused interface
  // =========================================================================

  describe('warning: unused interface', () => {
    it('reports InterfaceNotUsed', () => {
      const src = [
        'interface IUnused {',
        '  struct A { x:int; }',
        '}',
        'table t[id] { id:int; name:str; }',
      ].join('\n');
      const { errs } = parseAndResolve(src);
      expect(errs.warns.some((w) => w._tag === 'InterfaceNotUsed')).toBe(true);
    });
  });

  // =========================================================================
  // 19. Error: key not found
  // =========================================================================

  describe('error: key not found', () => {
    it('reports KeyNotFound', () => {
      const src = 'table t[nonexistent] { id:int; }';
      const { errs } = parseAndResolve(src);
      expect(errs.errs.some((e) => e._tag === 'KeyNotFound')).toBe(true);
    });
  });

  // =========================================================================
  // 20. Error: list ref multi key not support
  // =========================================================================

  describe('error: list ref multi key', () => {
    it('reports ListRefMultiKeyNotSupport', () => {
      const src = [
        'table t[id] {',
        '  id:int;',
        '  a:int;',
        '  b:int;',
        '  ref:list<int> => other[x, y];',
        '}',
        'table other[id] { id:int; x:int; y:int; }',
      ].join('\n');
      const { errs } = parseAndResolve(src);
      expect(errs.errs.some((e) => e._tag === 'ListRefMultiKeyNotSupport')).toBe(true);
    });
  });

  // =========================================================================
  // 21. Enum with assigned values — primary key validation
  // =========================================================================

  describe('enum with assigned values', () => {
    it('resolves enum with id as primary key', () => {
      const src = [
        'enum Status {',
        '  Idle=1;',
        '  Active=2;',
        '  Dead=3;',
        '}',
      ].join('\n');
      const { schema, errs } = parseAndResolve(src);
      expect(errs.errs.length).toBe(0);
      const table = schema.findTable('Status')!;
      expect(table).toBeDefined();
      expect(isEEnum(table.entry)).toBe(true);
      expect(table.uniqueKeys().length).toBe(1);
      expect(table.uniqueKeys()[0].fields()).toEqual(['id']);
    });
  });

  // =========================================================================
  // 22. Map key with enum — warns
  // =========================================================================

  describe('map key with enum', () => {
    it('warns MapKeyNotSupportEnumType', () => {
      const src = [
        'enum Color { Red; Green; }',
        'table t[id] { id:int; data:map<Color, int> (fix=2); }',
      ].join('\n');
      const { errs } = parseAndResolve(src);
      expect(errs.warns.some((w) => w._tag === 'MapKeyNotSupportEnumType')).toBe(true);
    });
  });

  // =========================================================================
  // 23. Struct ref in local namespace
  // =========================================================================

  describe('struct ref in namespace', () => {
    it('resolves struct ref with namespace prefix', () => {
      const src = [
        'struct equip.Rank { id:int; name:str; }',
       'table item[id] {',
       '  id:int;',
       '  rank:equip.Rank (pack);',
        '}',
      ].join('\n');
      const { schema, errs } = parseAndResolve(src);
      expect(errs.errs.length).toBe(0);
      const table = schema.findTable('item')!;
      const rankField = table.findField('rank')!;
      expect(isStructRef(rankField.type)).toBe(true);
      if (isStructRef(rankField.type)) {
        expect(rankField.type.obj).not.toBeNull();
        expect(rankField.type.obj!.name()).toBe('equip.Rank');
      }
    });
  });

  // =========================================================================
  // 24. List ref (=>) resolution
  // =========================================================================

  describe('list ref resolution', () => {
    it('resolves list ref with RefList', () => {
      const src = [
        'table monster[id] {',
        '  id:int;',
        '  refs:list<int> => other[id] (pack);',
        '}',
        'table other[id] {',
        '  id:int;',
        '}',
      ].join('\n');
      const { schema, errs } = parseAndResolve(src);
      expect(errs.errs.length).toBe(0);
      const table = schema.findTable('monster')!;
      const fk = table.foreignKeys()[0];
      expect(isRefList(fk.refKey)).toBe(true);
      expect(fk.refTableSchema()).not.toBeNull();
      expect(fk.keyIndices()).not.toBeNull();
    });
  });

  // =========================================================================
  // 25. Direct CfgSchemaResolver usage
  // =========================================================================

  describe('direct CfgSchemaResolver usage', () => {
    it('can be instantiated and called directly', () => {
      const reader = new CfgReader();
      const schema = reader.read('table t[id] { id:int; name:str; }');
      const errs = CfgSchemaErrs.of();
      const resolver = new CfgSchemaResolver(schema, errs);
      resolver.resolve();
      expect(errs.errs.length).toBe(0);
      expect(errs.warns.length).toBe(0);
    });
  });

  // =========================================================================
  // 26. Seq field must be int
  // =========================================================================

  describe('error: seq field must be int', () => {
    it('reports SeqFieldMustBeInt', () => {
      const src = 'table t[id] { id:int; name:str (seq); }';
      const { errs } = parseAndResolve(src);
      expect(errs.errs.some((e) => e._tag === 'SeqFieldMustBeInt')).toBe(true);
    });
  });
});
