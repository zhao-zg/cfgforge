/**
 * XmlReader tests — T2.22: XML → CfgSchema reader.
 *
 * Tests that reading XML configuration produces equivalent CfgSchema objects.
 * Uses fast-xml-parser instead of Java DOM.
 *
 * No Java test exists for XmlReader, so these tests are written from scratch
 * based on the Java source code semantics.
 */

import { describe, it, expect } from 'vitest';
import { XmlReader } from '../cfg/XmlReader';
import { CfgSchema } from '../CfgSchema';
import { TableSchema } from '../TableSchema';
import { StructSchema } from '../StructSchema';
import { InterfaceSchema } from '../InterfaceSchema';
import { Primitive, StructRef, FList, FMap, isFList, isFMap, isStructRef } from '../FieldType';
import { AutoOrPack, isSep, isBlock, isFix } from '../FieldFormat';
import { ENo, EEntry, EEnum, isENo, isEEntry, isEEnum } from '../EntryType';
import { isRefPrimary, isRefUniq, isRefList } from '../RefKey';

describe('XmlReader', () => {

  // =========================================================================
  // 1. Read a simple table
  // =========================================================================
  it('reads a simple table with primary key', () => {
    const xml = `
      <config>
        <table name="item" primaryKey="id">
          <column name="id" type="int"/>
          <column name="name" type="string"/>
          <column name="price" type="int"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    expect(schema.items().length).toBe(1);

    const tab = schema.items()[0] as TableSchema;
    expect(tab).toBeInstanceOf(TableSchema);
    expect(tab.name()).toBe('item');
    expect(tab.primaryKey.fields()).toEqual(['id']);
    expect(isENo(tab.entry)).toBe(true);
    expect(tab.isColumnMode).toBe(false);
    expect(tab.fields().length).toBe(3);
    expect(tab.fields()[0].name).toBe('id');
    expect(tab.fields()[0].type).toBe(Primitive.INT);
    expect(tab.fields()[1].name).toBe('name');
    expect(tab.fields()[1].type).toBe(Primitive.STRING);
    expect(tab.fields()[2].name).toBe('price');
    expect(tab.fields()[2].type).toBe(Primitive.INT);
  });

  // =========================================================================
  // 2. Read a table with entry (enum / entry field)
  // =========================================================================
  it('reads table with enum entry', () => {
    const xml = `
      <config>
        <table name="quality" primaryKey="id" enum="id">
          <column name="id" type="int"/>
          <column name="name" type="string"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    expect(isEEnum(tab.entry)).toBe(true);
    if (isEEnum(tab.entry)) {
      expect(tab.entry.field).toBe('id');
    }
  });

  it('reads table with entry (EEntry)', () => {
    const xml = `
      <config>
        <table name="reward" primaryKey="id" entry="code">
          <column name="id" type="int"/>
          <column name="code" type="string"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    expect(isEEntry(tab.entry)).toBe(true);
    if (isEEntry(tab.entry)) {
      expect(tab.entry.field).toBe('code');
    }
  });

  it('reads table with isColumnMode', () => {
    const xml = `
      <config>
        <table name="data" primaryKey="id" isColumnMode="true">
          <column name="id" type="int"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    expect(tab.isColumnMode).toBe(true);
  });

  it('reads table with extraSplit', () => {
    const xml = `
      <config>
        <table name="big" primaryKey="id" extraSplit="5">
          <column name="id" type="int"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    expect(tab.meta().get('extraSplit')).toBeDefined();
    const extraSplit = tab.meta().get('extraSplit');
    expect(extraSplit).toEqual({ _tag: 'MetaInt', value: 5 });
  });

  // =========================================================================
  // 3. Read a struct (bean without enumRef)
  // =========================================================================
  it('reads a simple struct', () => {
    const xml = `
      <config>
        <bean name="pos">
          <column name="x" type="int"/>
          <column name="y" type="int"/>
        </bean>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    expect(schema.items().length).toBe(1);

    const s = schema.items()[0] as StructSchema;
    expect(s).toBeInstanceOf(StructSchema);
    expect(s.name()).toBe('pos');
    expect(s.fields().length).toBe(2);
    expect(s.fields()[0].name).toBe('x');
    expect(s.fields()[0].type).toBe(Primitive.INT);
    expect(s.fields()[1].name).toBe('y');
    expect(s.fields()[1].type).toBe(Primitive.INT);
  });

  // =========================================================================
  // 4. Read struct with pack format
  // =========================================================================
  it('reads struct with packSep', () => {
    const xml = `
      <config>
        <bean name="vec" packSep=",">
          <column name="x" type="int"/>
          <column name="y" type="int"/>
        </bean>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const s = schema.items()[0] as StructSchema;
    expect(isSep(s.fmt())).toBe(true);
    if (isSep(s.fmt())) {
      expect(s.fmt().sep).toBe(',');
    }
  });

  it('reads struct with compress attribute (legacy packSep)', () => {
    const xml = `
      <config>
        <bean name="vec" compress=";">
          <column name="x" type="int"/>
          <column name="y" type="int"/>
        </bean>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const s = schema.items()[0] as StructSchema;
    expect(isSep(s.fmt())).toBe(true);
    if (isSep(s.fmt())) {
      expect(s.fmt().sep).toBe(';');
    }
  });

  // =========================================================================
  // 5. Read an interface (bean with enumRef)
  // =========================================================================
  it('reads an interface with impls', () => {
    const xml = `
      <config>
        <bean name="shape" enumRef="shapetype" defaultBeanName="circle">
          <bean name="circle">
            <column name="radius" type="int"/>
          </bean>
          <bean name="square">
            <column name="side" type="int"/>
          </bean>
        </bean>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    expect(schema.items().length).toBe(1);

    const iface = schema.items()[0] as InterfaceSchema;
    expect(iface).toBeInstanceOf(InterfaceSchema);
    expect(iface.name()).toBe('shape');
    expect(iface.enumRef()).toBe('shapetype');
    expect(iface.defaultImpl()).toBe('circle');
    expect(iface.impls().length).toBe(2);
    expect(iface.impls()[0].name()).toBe('circle');
    expect(iface.impls()[0].fields().length).toBe(1);
    expect(iface.impls()[0].fields()[0].name).toBe('radius');
    expect(iface.impls()[1].name()).toBe('square');
    expect(iface.impls()[1].fields()[0].name).toBe('side');
  });

  // =========================================================================
  // 6. Read field types: list, map
  // =========================================================================
  it('reads list field type', () => {
    const xml = `
      <config>
        <table name="t" primaryKey="id">
          <column name="id" type="int"/>
          <column name="items" type="list,int"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    const itemsField = tab.fields()[1];
    expect(isFList(itemsField.type)).toBe(true);
    if (isFList(itemsField.type)) {
      expect(itemsField.type.item).toBe(Primitive.INT);
    }
  });

  it('reads list field with fixed count', () => {
    const xml = `
      <config>
        <table name="t" primaryKey="id">
          <column name="id" type="int"/>
          <column name="pos" type="list,int,3"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    const posField = tab.fields()[1];
    expect(isFList(posField.type)).toBe(true);
    expect(isFix(posField.fmt)).toBe(true);
    if (isFix(posField.fmt)) {
      expect(posField.fmt.count).toBe(3);
    }
  });

  it('reads map field type', () => {
    const xml = `
      <config>
        <table name="t" primaryKey="id">
          <column name="id" type="int"/>
          <column name="attrs" type="map,int,string"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    const attrsField = tab.fields()[1];
    expect(isFMap(attrsField.type)).toBe(true);
    if (isFMap(attrsField.type)) {
      expect(attrsField.type.key).toBe(Primitive.INT);
      expect(attrsField.type.value).toBe(Primitive.STRING);
    }
  });

  // =========================================================================
  // 7. Read field formats: block, pack, packSep on columns
  // =========================================================================
  it('reads field with block format', () => {
    const xml = `
      <config>
        <table name="t" primaryKey="id">
          <column name="id" type="int"/>
          <column name="data" type="list,int" block="true"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    const dataField = tab.fields()[1];
    expect(isBlock(dataField.fmt)).toBe(true);
  });

  it('reads field with pack format', () => {
    const xml = `
      <config>
        <table name="t" primaryKey="id">
          <column name="id" type="int"/>
          <column name="tags" type="list,string" pack="true"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    const tagsField = tab.fields()[1];
    expect(tagsField.fmt).toBe(AutoOrPack.PACK);
  });

  it('reads field with packSep format', () => {
    const xml = `
      <config>
        <table name="t" primaryKey="id">
          <column name="id" type="int"/>
          <column name="tags" type="list,string" packSep="|"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    const tagsField = tab.fields()[1];
    expect(isSep(tagsField.fmt)).toBe(true);
    if (isSep(tagsField.fmt)) {
      expect(tagsField.fmt.sep).toBe('|');
    }
  });

  // =========================================================================
  // 8. Read foreign keys
  // =========================================================================
  it('reads column-based foreign key (RefPrimary)', () => {
    const xml = `
      <config>
        <table name="item" primaryKey="id">
          <column name="id" type="int"/>
          <column name="ownerId" type="int" ref="user"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    expect(tab.foreignKeys().length).toBe(1);
    const fk = tab.foreignKeys()[0];
    expect(fk.name).toBe('ownerId');
    expect(fk.refTable).toBe('user');
    expect(isRefPrimary(fk.refKey)).toBe(true);
    if (isRefPrimary(fk.refKey)) {
      expect(fk.refKey.nullable).toBe(false);
    }
  });

  it('reads column-based foreign key with refType nullable', () => {
    const xml = `
      <config>
        <table name="item" primaryKey="id">
          <column name="id" type="int"/>
          <column name="ownerId" type="int" ref="user" refType="nullable"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    const fk = tab.foreignKeys()[0];
    expect(isRefPrimary(fk.refKey)).toBe(true);
    if (isRefPrimary(fk.refKey)) {
      expect(fk.refKey.nullable).toBe(true);
    }
  });

  it('reads column-based foreign key with refType list', () => {
    const xml = `
      <config>
        <table name="item" primaryKey="id">
          <column name="id" type="int"/>
          <column name="tags" type="list,int" ref="tag,key" refType="list"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    const fk = tab.foreignKeys()[0];
    expect(isRefList(fk.refKey)).toBe(true);
  });

  it('reads standalone foreignKey element (RefUniq)', () => {
    const xml = `
      <config>
        <table name="item" primaryKey="id">
          <column name="id" type="int"/>
          <column name="type" type="int"/>
          <column name="subType" type="int"/>
          <foreignKey name="type_subType" keys="type,subType" ref="category,type,subType"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    expect(tab.foreignKeys().length).toBe(1);
    const fk = tab.foreignKeys()[0];
    expect(fk.name).toBe('type_subType');
    expect(fk.key.fields()).toEqual(['type', 'subType']);
    expect(fk.refTable).toBe('category');
    expect(isRefUniq(fk.refKey)).toBe(true);
    if (isRefUniq(fk.refKey)) {
      expect(fk.refKey.key.fields()).toEqual(['type', 'subType']);
      expect(fk.refKey.nullable).toBe(false);
    }
  });

  // =========================================================================
  // 9. Read unique keys
  // =========================================================================
  it('reads unique keys', () => {
    const xml = `
      <config>
        <table name="item" primaryKey="id">
          <column name="id" type="int"/>
          <column name="name" type="string"/>
          <uniqueKey keys="name"/>
          <uniqueKey keys="id,name"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    expect(tab.uniqueKeys().length).toBe(2);
    expect(tab.uniqueKeys()[0].fields()).toEqual(['name']);
    expect(tab.uniqueKeys()[1].fields()).toEqual(['id', 'name']);
  });

  // =========================================================================
  // 10. Read comments (desc attribute)
  // =========================================================================
  it('reads field comment from desc attribute', () => {
    const xml = `
      <config>
        <table name="item" primaryKey="id">
          <column name="id" type="int" desc="item id"/>
          <column name="name" type="string" desc="item name"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    const idField = tab.fields()[0];
    expect(idField.meta.getComment()).not.toBeNull();
    expect(idField.meta.getComment()!.trailing).toBe('item id');
  });

  it('does not create comment when desc equals field name', () => {
    const xml = `
      <config>
        <table name="item" primaryKey="id">
          <column name="id" type="int" desc="id"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    const idField = tab.fields()[0];
    expect(idField.meta.getComment()).toBeNull();
  });

  // =========================================================================
  // 11. Read field with range attribute
  // =========================================================================
  it('reads field with range attribute', () => {
    const xml = `
      <config>
        <table name="t" primaryKey="id">
          <column name="id" type="int"/>
          <column name="level" type="int" range="1,100"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    const levelField = tab.fields()[1];
    const rangeVal = levelField.meta.get('range');
    expect(rangeVal).toBeDefined();
    expect(rangeVal).toEqual({ _tag: 'MetaStr', value: '1,100' });
  });

  // =========================================================================
  // 12. Read struct ref type
  // =========================================================================
  it('reads struct reference type', () => {
    const xml = `
      <config>
        <bean name="pos">
          <column name="x" type="int"/>
          <column name="y" type="int"/>
        </bean>
        <table name="entity" primaryKey="id">
          <column name="id" type="int"/>
          <column name="position" type="pos"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    expect(schema.items().length).toBe(2);
    const tab = schema.items()[1] as TableSchema;
    const posField = tab.fields()[1];
    expect(isStructRef(posField.type)).toBe(true);
    if (isStructRef(posField.type)) {
      expect(posField.type.name).toBe('pos');
    }
  });

  // =========================================================================
  // 13. Read with namespace (pkgNameDot)
  // =========================================================================
  it('reads with namespace prefix', () => {
    const xml = `
      <config>
        <table name="item" primaryKey="id">
          <column name="id" type="int"/>
        </table>
        <bean name="vec">
          <column name="x" type="int"/>
        </bean>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, 'equip.');
    // beans are parsed first, then tables
    const s = schema.items()[0] as StructSchema;
    expect(s.name()).toBe('equip.vec');
    const tab = schema.items()[1] as TableSchema;
    expect(tab.name()).toBe('equip.item');
  });

  // =========================================================================
  // 14. Read with own tags (table/struct level)
  // =========================================================================
  it('reads table with own tags', () => {
    const xml = `
      <config>
        <table name="item" primaryKey="id" own="s1,s2">
          <column name="id" type="int" own="s1"/>
          <column name="name" type="string" own="s1"/>
          <column name="extra" type="string" own="s2"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    // Table meta should have s1 and s2 tags (both own tags on table)
    expect(tab.meta().hasTag('s1')).toBe(true);
    expect(tab.meta().hasTag('s2')).toBe(true);

    // Fields: s1 appears on 2/3 fields = 66.7% → USE_TAG → field with s1 gets tag
    // s2 appears on 1/3 fields = 33.3% → USE_TAG → field with s2 gets tag
    const idField = tab.fields()[0];
    expect(idField.meta.hasTag('s1')).toBe(true); // USE_TAG, field has s1
    expect(idField.meta.hasTag('s2')).toBe(false);

    const nameField = tab.fields()[1];
    expect(nameField.meta.hasTag('s1')).toBe(true); // USE_TAG, field has s1
    expect(nameField.meta.hasTag('s2')).toBe(false);

    const extraField = tab.fields()[2];
    expect(extraField.meta.hasTag('s1')).toBe(false);
    expect(extraField.meta.hasTag('s2')).toBe(true); // USE_TAG, field has s2
  });

  it('reads table with own tags using minus tag (USE_MINUS_TAG)', () => {
    const xml = `
      <config>
        <table name="item" primaryKey="id" own="s1">
          <column name="id" type="int" own="s1"/>
          <column name="name" type="string" own="s1"/>
          <column name="extra" type="string"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    expect(tab.meta().hasTag('s1')).toBe(true);

    // s1 appears on 2/3 fields = 66.7% < 70% → USE_TAG
    const idField = tab.fields()[0];
    expect(idField.meta.hasTag('s1')).toBe(true);

    const extraField = tab.fields()[2];
    expect(extraField.meta.hasTag('s1')).toBe(false);
    expect(extraField.meta.hasTag('-s1')).toBe(false); // USE_TAG, not USE_MINUS_TAG
  });

  // =========================================================================
  // 15. Read multiple beans and tables
  // =========================================================================
  it('reads multiple beans and tables', () => {
    const xml = `
      <config>
        <bean name="pos">
          <column name="x" type="int"/>
          <column name="y" type="int"/>
        </bean>
        <bean name="color">
          <column name="r" type="int"/>
          <column name="g" type="int"/>
          <column name="b" type="int"/>
        </bean>
        <table name="item" primaryKey="id">
          <column name="id" type="int"/>
          <column name="pos" type="pos"/>
          <column name="color" type="color"/>
        </table>
        <table name="user" primaryKey="uid">
          <column name="uid" type="long"/>
          <column name="name" type="string"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    expect(schema.items().length).toBe(4);
    expect(schema.items()[0].name()).toBe('pos');
    expect(schema.items()[1].name()).toBe('color');
    expect(schema.items()[2].name()).toBe('item');
    expect(schema.items()[3].name()).toBe('user');

    const userTab = schema.items()[3] as TableSchema;
    expect(userTab.fields()[0].type).toBe(Primitive.LONG);
  });

  // =========================================================================
  // 16. Read boolean and float types
  // =========================================================================
  it('reads bool and float types', () => {
    const xml = `
      <config>
        <table name="t" primaryKey="id">
          <column name="id" type="int"/>
          <column name="active" type="bool"/>
          <column name="rate" type="float"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    expect(tab.fields()[1].type).toBe(Primitive.BOOL);
    expect(tab.fields()[2].type).toBe(Primitive.FLOAT);
  });

  // =========================================================================
  // 17. Read text type
  // =========================================================================
  it('reads text type', () => {
    const xml = `
      <config>
        <table name="t" primaryKey="id">
          <column name="id" type="int"/>
          <column name="desc" type="text"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    expect(tab.fields()[1].type).toBe(Primitive.TEXT);
  });

  // =========================================================================
  // 18. Read long type
  // =========================================================================
  it('reads long type', () => {
    const xml = `
      <config>
        <table name="t" primaryKey="id">
          <column name="id" type="long"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    expect(tab.fields()[0].type).toBe(Primitive.LONG);
  });

  // =========================================================================
  // 19. Empty config
  // =========================================================================
  it('reads empty config', () => {
    const xml = `<config></config>`;
    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    expect(schema.items().length).toBe(0);
  });

  // =========================================================================
  // 20. Read interface with own tags
  // =========================================================================
  it('reads interface with own tags', () => {
    const xml = `
      <config>
        <bean name="shape" enumRef="shapetype" defaultBeanName="circle" own="s1">
          <bean name="circle" own="s1">
            <column name="radius" type="int" own="s1"/>
          </bean>
          <bean name="square" own="s1">
            <column name="side" type="int" own="s1"/>
          </bean>
        </bean>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const iface = schema.items()[0] as InterfaceSchema;
    expect(iface.impls().length).toBe(2);

    // Interface owns: s1
    expect(iface.meta().hasTag('s1')).toBe(true);

    // circle impl: all fields have s1 → ALL → no tag on impl meta
    const circle = iface.impls()[0];
    expect(circle.meta().hasTag('s1')).toBe(false); // ALL → skip

    // square impl: all fields have s1 → ALL → no tag on impl meta
    const square = iface.impls()[1];
    expect(square.meta().hasTag('s1')).toBe(false);
  });

  // =========================================================================
  // 21. Read map with fixed count
  // =========================================================================
  it('reads map with fixed count', () => {
    const xml = `
      <config>
        <table name="t" primaryKey="id">
          <column name="id" type="int"/>
          <column name="slots" type="map,int,string,2"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    const slotsField = tab.fields()[1];
    expect(isFMap(slotsField.type)).toBe(true);
    expect(isFix(slotsField.fmt)).toBe(true);
    if (isFix(slotsField.fmt)) {
      expect(slotsField.fmt.count).toBe(2);
    }
  });

  // =========================================================================
  // 22. Non-identifier field name is skipped
  // =========================================================================
  it('skips non-identifier field name', () => {
    const xml = `
      <config>
        <table name="t" primaryKey="id">
          <column name="id" type="int"/>
          <column name="123bad" type="int"/>
          <column name="valid" type="int"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    // 123bad is not a valid identifier → skipped
    expect(tab.fields().length).toBe(2);
    expect(tab.fields()[0].name).toBe('id');
    expect(tab.fields()[1].name).toBe('valid');
  });

  // =========================================================================
  // 23. Round-trip: XML → CfgSchema → resolve
  // =========================================================================
  it('XML schema can be resolved', () => {
    const xml = `
      <config>
        <bean name="pos">
          <column name="x" type="int"/>
          <column name="y" type="int"/>
        </bean>
        <table name="item" primaryKey="id">
          <column name="id" type="int"/>
          <column name="pos" type="pos"/>
          <column name="ownerId" type="int" ref="user"/>
        </table>
        <table name="user" primaryKey="uid">
          <column name="uid" type="int"/>
          <column name="name" type="string"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const errs = schema.resolve();
    expect(errs.errs.length).toBe(0);
  });

  // =========================================================================
  // 24. Read interface impl struct names (no namespace prefix)
  // =========================================================================
  it('interface impl structs have no namespace prefix', () => {
    const xml = `
      <config>
        <bean name="shape" enumRef="shapetype" defaultBeanName="circle">
          <bean name="circle">
            <column name="radius" type="int"/>
          </bean>
        </bean>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, 'test.');
    const iface = schema.items()[0] as InterfaceSchema;
    expect(iface.name()).toBe('test.shape');
    // Impl structs have no namespace prefix (empty string passed)
    expect(iface.impls()[0].name()).toBe('circle');
  });

  // =========================================================================
  // 25. compressAsOne attribute (legacy pack)
  // =========================================================================
  it('reads field with compressAsOne (legacy pack)', () => {
    const xml = `
      <config>
        <table name="t" primaryKey="id">
          <column name="id" type="int"/>
          <column name="tags" type="list,string" compressAsOne="true"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    const tagsField = tab.fields()[1];
    expect(tagsField.fmt).toBe(AutoOrPack.PACK);
  });

  // =========================================================================
  // 26. Foreign key with refType list on standalone element
  // =========================================================================
  it('reads standalone foreignKey with refType list', () => {
    const xml = `
      <config>
        <table name="t" primaryKey="id">
          <column name="id" type="int"/>
          <column name="a" type="int"/>
          <column name="b" type="int"/>
          <foreignKey name="ab" keys="a,b" ref="target,a,b" refType="list"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    const fk = tab.foreignKeys()[0];
    expect(isRefList(fk.refKey)).toBe(true);
    if (isRefList(fk.refKey)) {
      expect(fk.refKey.key.fields()).toEqual(['a', 'b']);
    }
  });

  // =========================================================================
  // 27. Foreign key with refType nullable on standalone element
  // =========================================================================
  it('reads standalone foreignKey with refType nullable', () => {
    const xml = `
      <config>
        <table name="t" primaryKey="id">
          <column name="id" type="int"/>
          <column name="a" type="int"/>
          <foreignKey name="a" keys="a" ref="target,a" refType="nullable"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    const fk = tab.foreignKeys()[0];
    expect(isRefUniq(fk.refKey)).toBe(true);
    if (isRefUniq(fk.refKey)) {
      expect(fk.refKey.nullable).toBe(true);
    }
  });

  // =========================================================================
  // 28. Standalone foreignKey with RefPrimary (no extra key fields)
  // =========================================================================
  it('reads standalone foreignKey with RefPrimary (single ref name)', () => {
    const xml = `
      <config>
        <table name="t" primaryKey="id">
          <column name="id" type="int"/>
          <column name="a" type="int"/>
          <foreignKey name="a" keys="a" ref="target"/>
        </table>
      </config>
    `;

    const schema = new CfgSchema();
    XmlReader.readTo(schema, xml, '');
    const tab = schema.items()[0] as TableSchema;
    const fk = tab.foreignKeys()[0];
    expect(isRefPrimary(fk.refKey)).toBe(true);
    if (isRefPrimary(fk.refKey)) {
      expect(fk.refKey.nullable).toBe(false);
    }
  });
});
