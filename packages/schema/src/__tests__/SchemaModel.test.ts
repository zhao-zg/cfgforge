import { describe, it, expect } from 'vitest';
import { Primitive, FList, StructRef, FieldType } from '../FieldType';
import { AutoOrPack, Sep, Fix, Block, FieldFormat } from '../FieldFormat';
import { KeySchema } from '../KeySchema';
import { FieldSchema } from '../FieldSchema';
import { ForeignKeySchema } from '../ForeignKeySchema';
import { EntryType, ENo, EEntry, EEnum } from '../EntryType';
import { RefKey, RefPrimary, RefUniq, RefList } from '../RefKey';
import { StructSchema } from '../StructSchema';
import { TableSchema } from '../TableSchema';
import { InterfaceSchema } from '../InterfaceSchema';
import { Metadata_of, Metadata } from '../Metadata';
import { CommentData } from '../CommentData';

function makeField(name: string, type: FieldType = Primitive.INT, fmt: FieldFormat = AutoOrPack.AUTO): FieldSchema {
  return new FieldSchema(name, type, fmt, Metadata_of());
}

describe('StructSchema', () => {
  it('creates with name, fmt, meta, fields, foreignKeys', () => {
    const s = new StructSchema('Foo', AutoOrPack.AUTO, Metadata_of(), [], []);
    expect(s.name()).toBe('Foo');
    expect(s.fmt()).toBe(AutoOrPack.AUTO);
    expect(s.fields()).toEqual([]);
    expect(s.foreignKeys()).toEqual([]);
  });

  it('throws for empty name', () => {
    expect(() => new StructSchema('', AutoOrPack.AUTO, Metadata_of(), [], [])).toThrow();
  });

  it('throws for invalid fmt (Fix not allowed on struct)', () => {
    expect(() => new StructSchema('Foo', new Fix(1), Metadata_of(), [], [])).toThrow();
  });

  it('accepts Sep fmt', () => {
    const s = new StructSchema('Foo', new Sep(','), Metadata_of(), [], []);
    expect(isSepFmt(s.fmt())).toBe(true);
  });

  it('fullName() equals name when no nullableInterface', () => {
    const s = new StructSchema('Foo', AutoOrPack.AUTO, Metadata_of(), [], []);
    expect(s.fullName()).toBe('Foo');
  });

  it('fullName() includes interface name when nullableInterface is set', () => {
    const s = new StructSchema('Impl', AutoOrPack.AUTO, Metadata_of(), [], []);
    const iface = new InterfaceSchema('IFoo', '', '', AutoOrPack.AUTO, Metadata_of(), [s]);
    s.setNullableInterface(iface);
    expect(s.fullName()).toBe('IFoo.Impl');
  });

  it('namespace() returns empty for simple name', () => {
    const s = new StructSchema('Foo', AutoOrPack.AUTO, Metadata_of(), [], []);
    expect(s.namespace()).toBe('');
  });

  it('namespace() returns prefix for dotted name', () => {
    const s = new StructSchema('equip.Weapon', AutoOrPack.AUTO, Metadata_of(), [], []);
    expect(s.namespace()).toBe('equip');
    expect(s.lastName()).toBe('Weapon');
  });

  it('copy() returns deep copy with copied fields and foreignKeys', () => {
    const fields = [makeField('id'), makeField('name', Primitive.STRING)];
    const fks = [new ForeignKeySchema('rid', new KeySchema(['id']), 'Ref', new RefPrimary(false), Metadata_of())];
    const s = new StructSchema('Foo', AutoOrPack.AUTO, Metadata_of(), fields, fks);
    const copy = s.copy();
    expect(copy).not.toBe(s);
    expect(copy.name()).toBe('Foo');
    expect(copy.fields()).not.toBe(fields);
    expect(copy.fields().length).toBe(2);
    expect(copy.foreignKeys()).not.toBe(fks);
    expect(copy.foreignKeys().length).toBe(1);
  });

  it('findField() returns field by name', () => {
    const fields = [makeField('id'), makeField('name', Primitive.STRING)];
    const s = new StructSchema('Foo', AutoOrPack.AUTO, Metadata_of(), fields, []);
    expect(s.findField('id')).toBe(fields[0]);
    expect(s.findField('name')).toBe(fields[1]);
    expect(s.findField('nonexistent')).toBeNull();
  });

  it('findForeignKey() returns fk by name', () => {
    const fk = new ForeignKeySchema('rid', new KeySchema(['id']), 'Ref', new RefPrimary(false), Metadata_of());
    const s = new StructSchema('Foo', AutoOrPack.AUTO, Metadata_of(), [], [fk]);
    expect(s.findForeignKey('rid')).toBe(fk);
    expect(s.findForeignKey('nonexistent')).toBeNull();
  });

  it('addForeignKey() appends to list', () => {
    const s = new StructSchema('Foo', AutoOrPack.AUTO, Metadata_of(), [], []);
    const fk = new ForeignKeySchema('rid', new KeySchema(['id']), 'Ref', new RefPrimary(false), Metadata_of());
    s.addForeignKey(fk);
    expect(s.foreignKeys().length).toBe(1);
    expect(s.foreignKeys()[0]).toBe(fk);
  });

  it('updateFieldType() replaces type of named field', () => {
    const fields = [makeField('id', Primitive.INT)];
    const s = new StructSchema('Foo', AutoOrPack.AUTO, Metadata_of(), fields, []);
    s.updateFieldType('id', Primitive.STRING);
    expect(s.findField('id')!.type).toBe(Primitive.STRING);
  });

  it('fieldNameSet() returns set of field names', () => {
    const fields = [makeField('id'), makeField('name', Primitive.STRING)];
    const s = new StructSchema('Foo', AutoOrPack.AUTO, Metadata_of(), fields, []);
    const names = s.fieldNameSet();
    expect(names.has('id')).toBe(true);
    expect(names.has('name')).toBe(true);
    expect(names.has('other')).toBe(false);
  });
});

describe('TableSchema', () => {
  it('creates with all fields', () => {
    const pk = new KeySchema(['id']);
    const t = new TableSchema(
      'ItemTable', pk, ENo.NO, false, Metadata_of(),
      [makeField('id'), makeField('name', Primitive.STRING)], [], []
    );
    expect(t.name()).toBe('ItemTable');
    expect(t.primaryKey).toBe(pk);
    expect(t.entry).toBe(ENo.NO);
    expect(t.isColumnMode).toBe(false);
    expect(t.fields().length).toBe(2);
  });

  it('throws for empty name', () => {
    expect(() => new TableSchema('', new KeySchema(['id']), ENo.NO, false, Metadata_of(), [], [], [])).toThrow();
  });

  it('fmt() always returns AUTO', () => {
    const t = new TableSchema('T', new KeySchema(['id']), ENo.NO, false, Metadata_of(), [], [], []);
    expect(t.fmt()).toBe(AutoOrPack.AUTO);
  });

  it('copy() returns deep copy', () => {
    const t = new TableSchema(
      'T', new KeySchema(['id']), new EEntry('id'), false, Metadata_of(),
      [makeField('id')], [], [new KeySchema(['name'])]
    );
    const copy = t.copy();
    expect(copy).not.toBe(t);
    expect(copy.name()).toBe('T');
    expect(copy.primaryKey).not.toBe(t.primaryKey);
    expect(copy.fields().length).toBe(1);
    expect(copy.uniqueKeys().length).toBe(1);
  });

  it('findUniqueKey() by field names', () => {
    const uk = new KeySchema(['name']);
    const t = new TableSchema('T', new KeySchema(['id']), ENo.NO, false, Metadata_of(), [], [], [uk]);
    expect(t.findUniqueKey(['name'])).toBe(uk);
    expect(t.findUniqueKey(['nonexistent'])).toBeNull();
  });

  it('findUniqueKey() by KeySchema', () => {
    const uk = new KeySchema(['name']);
    const t = new TableSchema('T', new KeySchema(['id']), ENo.NO, false, Metadata_of(), [], [], [uk]);
    expect(t.findUniqueKey(new KeySchema(['name']))).toBe(uk);
  });

  it('copy() copies EEntry entry', () => {
    const t = new TableSchema('T', new KeySchema(['id']), new EEntry('id'), false, Metadata_of(), [], [], []);
    const copy = t.copy();
    expect(copy.entry).not.toBe(t.entry);
    expect((copy.entry as EEntry).field).toBe('id');
  });
});

describe('InterfaceSchema', () => {
  it('creates with name, enumRef, defaultImpl, fmt, meta, impls', () => {
    const impl = new StructSchema('ImplA', AutoOrPack.AUTO, Metadata_of(), [], []);
    const iface = new InterfaceSchema('IFoo', 'EnumFoo', '', AutoOrPack.PACK, Metadata_of(), [impl]);
    expect(iface.name()).toBe('IFoo');
    expect(iface.enumRef()).toBe('EnumFoo');
    expect(iface.defaultImpl()).toBe('');
    expect(iface.fmt()).toBe(AutoOrPack.PACK);
    expect(iface.impls().length).toBe(1);
  });

  it('throws for empty name', () => {
    expect(() => new InterfaceSchema('', '', '', AutoOrPack.AUTO, Metadata_of(), [])).toThrow();
  });

  it('throws for invalid fmt (Sep not allowed on interface)', () => {
    expect(() => new InterfaceSchema('I', '', '', new Sep(','), Metadata_of(), [])).toThrow();
  });

  it('copy() returns deep copy', () => {
    const impl = new StructSchema('ImplA', AutoOrPack.AUTO, Metadata_of(), [], []);
    const iface = new InterfaceSchema('IFoo', 'EnumFoo', 'ImplA', AutoOrPack.AUTO, Metadata_of(), [impl]);
    const copy = iface.copy();
    expect(copy).not.toBe(iface);
    expect(copy.name()).toBe('IFoo');
    expect(copy.impls().length).toBe(1);
    expect(copy.impls()[0]).not.toBe(impl);
  });

  it('findImpl() returns struct by name', () => {
    const implA = new StructSchema('ImplA', AutoOrPack.AUTO, Metadata_of(), [], []);
    const implB = new StructSchema('ImplB', AutoOrPack.AUTO, Metadata_of(), [], []);
    const iface = new InterfaceSchema('IFoo', '', '', AutoOrPack.AUTO, Metadata_of(), [implA, implB]);
    expect(iface.findImpl('ImplA')).toBe(implA);
    expect(iface.findImpl('ImplB')).toBe(implB);
    expect(iface.findImpl('ImplC')).toBeNull();
  });

  it('defaultImplStruct() returns first impl when no defaultImpl set', () => {
    const implA = new StructSchema('ImplA', AutoOrPack.AUTO, Metadata_of(), [], []);
    const implB = new StructSchema('ImplB', AutoOrPack.AUTO, Metadata_of(), [], []);
    const iface = new InterfaceSchema('IFoo', '', '', AutoOrPack.AUTO, Metadata_of(), [implA, implB]);
    expect(iface.defaultImplStruct()).toBe(implA);
  });

  it('namespace() and lastName() work for dotted names', () => {
    const iface = new InterfaceSchema('task.IReward', '', '', AutoOrPack.AUTO, Metadata_of(), []);
    expect(iface.namespace()).toBe('task');
    expect(iface.lastName()).toBe('IReward');
  });
});

// Helper
function isSepFmt(fmt: FieldFormat): boolean {
  return fmt instanceof Sep;
}

// ===========================================================================
// comment() and isJson() — driven by Metadata
// ===========================================================================

describe('comment() and isJson() via Metadata', () => {
  it('StructSchema.comment() returns encoded comment from meta', () => {
    const meta = Metadata_of();
    meta.putComment(new CommentData('hello world', '', null));
    const s = new StructSchema('Foo', AutoOrPack.AUTO, meta, [], []);
    expect(s.comment()).toBe('hello world\n');
  });

  it('StructSchema.comment() returns empty string when no comment', () => {
    const s = new StructSchema('Foo', AutoOrPack.AUTO, Metadata_of(), [], []);
    expect(s.comment()).toBe('');
  });

  it('TableSchema.comment() returns encoded comment from meta', () => {
    const meta = Metadata_of();
    meta.putComment(new CommentData('table comment', '', null));
    const t = new TableSchema('Bar', new KeySchema(['id']), ENo.NO, false, meta, [], [], []);
    expect(t.comment()).toBe('table comment\n');
  });

  it('TableSchema.isJson() returns true when meta has json tag', () => {
    const meta = Metadata_of();
    meta.data().set('json', 'TAG');
    const t = new TableSchema('Bar', new KeySchema(['id']), ENo.NO, false, meta, [], [], []);
    expect(t.isJson()).toBe(true);
  });

  it('TableSchema.isJson() returns false when meta has no json tag', () => {
    const t = new TableSchema('Bar', new KeySchema(['id']), ENo.NO, false, Metadata_of(), [], [], []);
    expect(t.isJson()).toBe(false);
  });

  it('InterfaceSchema.comment() returns encoded comment from meta', () => {
    const meta = Metadata_of();
    meta.putComment(new CommentData('iface comment', '', null));
    const iface = new InterfaceSchema('IFoo', '', '', AutoOrPack.AUTO, meta, []);
    expect(iface.comment()).toBe('iface comment\n');
  });

  it('FieldSchema.comment() returns encoded comment from meta', () => {
    const meta = Metadata_of();
    meta.putComment(new CommentData('field comment', '', null));
    const f = new FieldSchema('myField', Primitive.INT, AutoOrPack.AUTO, meta);
    expect(f.comment()).toBe('field comment\n');
  });

  it('FieldSchema.comment() returns empty string when no comment', () => {
    const f = new FieldSchema('myField', Primitive.INT, AutoOrPack.AUTO, Metadata_of());
    expect(f.comment()).toBe('');
  });
});
