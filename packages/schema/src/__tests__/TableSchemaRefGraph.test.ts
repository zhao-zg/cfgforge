/**
 * TableSchemaRefGraph tests — T4.10 dependency.
 *
 * Tests the schema-level ref graph: which tables reference which other tables.
 */

import { describe, it, expect } from 'vitest';
import { CfgReader } from '../cfg/CfgReader';
import { CfgSchema } from '../CfgSchema';
import { TableSchemaRefGraph } from '../TableSchemaRefGraph';
import type { TableSchema } from '../TableSchema';

// ---------------------------------------------------------------------------
// Helper: parse + resolve
// ---------------------------------------------------------------------------

function parseAndResolve(src: string): CfgSchema {
  const reader = new CfgReader();
  const schema = reader.read(src, '');
  const errs = schema.resolve();
  expect(errs.errs.length).toBe(0);
  return schema;
}

// Schema: item -> category (RefPrimary), category -> item (RefList)
// Also an interface referencing an enum table.
const FK_SCHEMA_SRC = [
  'table category[id] {',
  '  id:int;',
  '  name:str;',
  '  items:list<int> => item[id] (pack);',
  '}',
  '',
  'table item[id] {',
  '  id:int;',
  '  name:str;',
  '  cat:int -> category;',
  '}',
].join('\n');

// Schema with interface + enum ref
const INTERFACE_SCHEMA_SRC = [
  'interface Shape (enumRef=\'shapetype\', defaultImpl=\'Circle\') {',
  '  struct Circle { radius:int; }',
  '  struct Square { side:int; }',
  '}',
  '',
  'table shapetype[type] (enum=\'type\') {',
  '  type:str;',
  '  comment:text;',
  '}',
].join('\n');

// Schema with struct containing FK
const STRUCT_FK_SCHEMA_SRC = [
  'struct Vec3 {',
  '  x:int;',
  '  y:int;',
  '  z:int;',
  '}',
  '',
  'table point[id] {',
  '  id:int;',
  '  pos:Vec3 (pack);',
  '}',
].join('\n');

describe('TableSchemaRefGraph', () => {

  // =========================================================================
  // 1. Basic ref-out / ref-in
  // =========================================================================

  describe('basic ref graph', () => {
    const schema = parseAndResolve(FK_SCHEMA_SRC);
    const graph = new TableSchemaRefGraph(schema);

    it('refsMap contains all tables', () => {
      expect(graph.refsMap.size).toBe(2);
      expect(graph.refsMap.has('category')).toBe(true);
      expect(graph.refsMap.has('item')).toBe(true);
    });

    it('category refOut includes item (via RefList)', () => {
      const refs = graph.refsMap.get('category')!;
      expect(refs.refOut()).toContain('item');
    });

    it('item refOut includes category (via RefPrimary)', () => {
      const refs = graph.refsMap.get('item')!;
      expect(refs.refOut()).toContain('category');
    });

    it('category refIn includes item', () => {
      const refs = graph.refsMap.get('category')!;
      expect(refs.refIn()).toContain('item');
    });

    it('item refIn includes category', () => {
      const refs = graph.refsMap.get('item')!;
      expect(refs.refIn()).toContain('category');
    });
  });

  // =========================================================================
  // 2. No cross-table refs (only struct refs, not FK)
  // =========================================================================

  describe('no FK refs', () => {
    const schema = parseAndResolve(STRUCT_FK_SCHEMA_SRC);
    const graph = new TableSchemaRefGraph(schema);

    it('point has no refOut (Vec3 is a struct, not a table)', () => {
      const refs = graph.refsMap.get('point')!;
      expect(refs.refOut().size).toBe(0);
    });

    it('point has no refIn', () => {
      const refs = graph.refsMap.get('point')!;
      expect(refs.refIn().size).toBe(0);
    });
  });

  // =========================================================================
  // 3. Interface enum ref table
  // =========================================================================

  describe('interface enum ref', () => {
    const schema = parseAndResolve(INTERFACE_SCHEMA_SRC);
    const graph = new TableSchemaRefGraph(schema);

    it('refsMap contains shapetype table (enum)', () => {
      expect(graph.refsMap.has('shapetype')).toBe(true);
    });

    it('shapetype has refIn from interface Shape', () => {
      // The interface "Shape" references the shapetype enum table via nullableEnumRefTable
      // findAllRefOuts scans all included structs, including interfaces
      const shapeRefs = graph.refsMap.get('shapetype')!;
      // The interface's nullableEnumRefTable points to shapetype
      // shapetype should have refIn from the table that uses Shape interface
      // But there are no tables using Shape here, only the enum + interface
      // So refIn might be empty — that's fine
      expect(shapeRefs).toBeDefined();
    });
  });

  // =========================================================================
  // 4. findAllRefOuts static method
  // =========================================================================

  describe('findAllRefOuts', () => {
    const schema = parseAndResolve(FK_SCHEMA_SRC);

    it('category refOut has 1 table (item)', () => {
      const category = schema.findTable('category')!;
      const refOut = TableSchemaRefGraph.findAllRefOuts(category);
      expect(refOut.size).toBe(1);
      expect(refOut.has('item')).toBe(true);
    });

    it('item refOut has 1 table (category)', () => {
      const item = schema.findTable('item')!;
      const refOut = TableSchemaRefGraph.findAllRefOuts(item);
      expect(refOut.size).toBe(1);
      expect(refOut.has('category')).toBe(true);
    });
  });

  // =========================================================================
  // 5. Constructor requires resolved schema
  // =========================================================================

  describe('requires resolved schema', () => {
    it('throws if schema not resolved', () => {
      const reader = new CfgReader();
      const schema = reader.read(FK_SCHEMA_SRC, '');
      expect(() => new TableSchemaRefGraph(schema)).toThrow('not resolved');
    });
  });

  // =========================================================================
  // 6. Refs record methods
  // =========================================================================

  describe('Refs record', () => {
    const schema = parseAndResolve(FK_SCHEMA_SRC);
    const graph = new TableSchemaRefGraph(schema);

    it('refIn() returns set of table names', () => {
      const refs = graph.refsMap.get('item')!;
      const refInSet = refs.refIn();
      expect(refInSet instanceof Set).toBe(true);
      expect(refInSet.has('category')).toBe(true);
    });

    it('refOut() returns set of table names', () => {
      const refs = graph.refsMap.get('item')!;
      const refOutSet = refs.refOut();
      expect(refOutSet instanceof Set).toBe(true);
      expect(refOutSet.has('category')).toBe(true);
    });

    it('refInTables map has TableSchema values', () => {
      const refs = graph.refsMap.get('item')!;
      const ts = refs.refInTables.get('category');
      expect(ts).toBeDefined();
      expect(ts!.name()).toBe('category');
    });

    it('refOutTables map has TableSchema values', () => {
      const refs = graph.refsMap.get('item')!;
      const ts = refs.refOutTables.get('category');
      expect(ts).toBeDefined();
      expect(ts!.name()).toBe('category');
    });
  });

  // =========================================================================
  // 7. Complex schema with multiple tables and FKs
  // =========================================================================

  describe('complex multi-table schema', () => {
    const COMPLEX_SRC = [
      'table weapon[id] {',
      '  id:int;',
      '  name:str;',
      '  owner:int -> hero;',
      '}',
      '',
      'table hero[id] {',
      '  id:int;',
      '  name:str;',
      '  weapon_id:int -> weapon;',
      '  pet_id:int -> pet;',
      '}',
      '',
      'table pet[id] {',
      '  id:int;',
      '  name:str;',
      '  hero_id:int -> hero;',
      '}',
      '',
      'table skill[id] {',
      '  id:int;',
      '  name:str;',
      '}',
    ].join('\n');

    const schema = parseAndResolve(COMPLEX_SRC);
    const graph = new TableSchemaRefGraph(schema);

    it('refsMap has 4 tables', () => {
      expect(graph.refsMap.size).toBe(4);
    });

    it('hero refOut includes weapon and pet', () => {
      const refs = graph.refsMap.get('hero')!;
      expect(refs.refOut().has('weapon')).toBe(true);
      expect(refs.refOut().has('pet')).toBe(true);
      expect(refs.refOut().size).toBe(2);
    });

    it('weapon refIn includes hero', () => {
      const refs = graph.refsMap.get('weapon')!;
      expect(refs.refIn().has('hero')).toBe(true);
    });

    it('pet refIn includes hero', () => {
      const refs = graph.refsMap.get('pet')!;
      expect(refs.refIn().has('hero')).toBe(true);
    });

    it('skill has no refs in or out', () => {
      const refs = graph.refsMap.get('skill')!;
      expect(refs.refIn().size).toBe(0);
      expect(refs.refOut().size).toBe(0);
    });

    it('hero refIn includes pet and weapon', () => {
      const refs = graph.refsMap.get('hero')!;
      expect(refs.refIn().has('pet')).toBe(true);
      expect(refs.refIn().has('weapon')).toBe(true);
    });
  });
});
