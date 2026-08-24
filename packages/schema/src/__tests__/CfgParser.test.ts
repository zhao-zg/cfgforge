import { describe, it, expect } from 'vitest';
import { CfgParser, ParseError } from '../cfg/CfgParser';
import { CfgLexer } from '../cfg/CfgLexer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function parse(src: string) {
  return CfgParser.parse(src);
}

describe('CfgParser', () => {
  describe('Struct parsing', () => {
    it('should parse a simple struct with two fields', () => {
      const ast = parse(`struct Award { itemId:int; count:int; }`);
      expect(ast.elements).toHaveLength(1);
      const s = ast.elements[0];
      expect(s).toHaveProperty('fields');
      const struct = s as any;
      expect(struct.name).toBe('Award');
      expect(struct.fields).toHaveLength(2);
      expect(struct.fields[0].name).toBe('itemId');
      expect(struct.fields[0].type).toEqual({ kind: 'primitive', name: 'int' });
      expect(struct.fields[1].name).toBe('count');
    });

    it('should parse struct with namespace', () => {
      const ast = parse(`struct trigger.Condition { x:int; }`);
      const s = ast.elements[0] as any;
      expect(s.name).toBe('trigger.Condition');
    });

    it('should parse struct with metadata', () => {
      const ast = parse(`struct Position (sep=';') { x:int; y:int; z:int; }`);
      const s = ast.elements[0] as any;
      expect(s.metadata.entries).toHaveLength(1);
      expect(s.metadata.entries[0].key).toBe('sep');
      expect(s.metadata.entries[0].value).toEqual({ kind: 'string', value: ';' });
    });

    it('should parse struct with leading comment', () => {
      const ast = parse(`// this is a leading comment\nstruct Foo { x:int; }`);
      const s = ast.elements[0] as any;
      expect(s.comment.leading).toBe('this is a leading comment');
    });

    it('should parse struct with inline comment on brace', () => {
      const ast = parse(`struct Foo { // brace comment\n x:int; }`);
      const s = ast.elements[0] as any;
      expect(s.comment.trailing).toBe('brace comment');
    });

    it('should parse struct with suffix comment', () => {
      const ast = parse(`struct Foo { x:int; // suffix\n }`);
      const s = ast.elements[0] as any;
      // The // suffix is attached to the SEMI_COMMENT token as trailing, not a separate COMMENT
      // So suffix is empty (no comment between last member and RC)
      // Actually the // suffix is the trailing comment of the SEMI_COMMENT
      expect(s.fields[0].comment.trailing).toBe('suffix');
    });

    it('should parse struct with multiple leading comments', () => {
      const ast = parse(`// comment 1\n// comment 2\nstruct Foo { x:int; }`);
      const s = ast.elements[0] as any;
      expect(s.comment.leading).toBe('comment 1\ncomment 2');
    });

    it('should parse struct with field trailing comment', () => {
      const ast = parse(`struct Foo { x:int; // field comment\n y:int; }`);
      const s = ast.elements[0] as any;
      expect(s.fields[0].comment.trailing).toBe('field comment');
    });

    it('should parse struct with field leading comment', () => {
      const ast = parse(`struct Foo {\n// field leading\n x:int; }`);
      const s = ast.elements[0] as any;
      expect(s.fields[0].comment.leading).toBe('field leading');
    });

    it('should parse struct with Chinese comments', () => {
      const ast = parse(`struct LevelRank {\n\tLevel:int; // 等级\n\tRank:int; // 品质\n}`);
      const s = ast.elements[0] as any;
      expect(s.fields[0].comment.trailing).toBe('等级');
      expect(s.fields[1].comment.trailing).toBe('品质');
    });
  });

  describe('Type system parsing', () => {
    it('should parse list type', () => {
      const ast = parse(`struct S { f:list<int>; }`);
      const s = ast.elements[0] as any;
      expect(s.fields[0].type).toEqual({
        kind: 'list',
        elementType: { kind: 'primitive', name: 'int' }
      });
    });

    it('should parse map type', () => {
      const ast = parse(`struct S { f:map<str,int>; }`);
      const s = ast.elements[0] as any;
      expect(s.fields[0].type).toEqual({
        kind: 'map',
        keyType: { kind: 'primitive', name: 'str' },
        valueType: { kind: 'primitive', name: 'int' }
      });
    });

    it('should parse struct reference type', () => {
      const ast = parse(`struct S { f:Range; }`);
      const s = ast.elements[0] as any;
      expect(s.fields[0].type).toEqual({
        kind: 'structRef',
        namespace: 'Range'
      });
    });

    it('should parse namespaced struct reference type', () => {
      const ast = parse(`struct S { f:trigger.Condition; }`);
      const s = ast.elements[0] as any;
      expect(s.fields[0].type).toEqual({
        kind: 'structRef',
        namespace: 'trigger.Condition'
      });
    });

    it('should parse list of struct references', () => {
      const ast = parse(`struct S { f:list<Range>; }`);
      const s = ast.elements[0] as any;
      expect(s.fields[0].type).toEqual({
        kind: 'list',
        elementType: { kind: 'structRef', namespace: 'Range' }
      });
    });

    it('should parse all base types', () => {
      const types = ['bool', 'int', 'long', 'float', 'str', 'text'];
      for (const t of types) {
        const ast = parse(`struct S { f:${t}; }`);
        const s = ast.elements[0] as any;
        expect(s.fields[0].type).toEqual({ kind: 'primitive', name: t });
      }
    });
  });

  describe('Ref parsing', () => {
    it('should parse single value ref (->)', () => {
      const ast = parse(`table t[id] { id:int; ref:int ->buff.skill; }`);
      const t = ast.elements[0] as any;
      expect(t.fields[1].ref).toEqual({
        refTable: 'buff.skill',
        remoteKey: null,
        isListRef: false,
      });
    });

    it('should parse list ref (=>)', () => {
      const ast = parse(`table t[id] { lootid:int =>lootitem[lootid]; }`);
      const t = ast.elements[0] as any;
      expect(t.fields[0].ref).toEqual({
        refTable: 'lootitem',
        remoteKey: ['lootid'],
        isListRef: true,
      });
    });

    it('should parse ref with remote key', () => {
      const ast = parse(`table t[id] { ref:int ->table [key1,key2]; }`);
      const t = ast.elements[0] as any;
      expect(t.fields[0].ref).toEqual({
        refTable: 'table',
        remoteKey: ['key1', 'key2'],
        isListRef: false,
      });
    });

    it('should parse foreign key declaration (->Name:[key] ->table)', () => {
      const ast = parse(`table t[id] { \n->Loot:[lootId] ->loot; }`);
      const t = ast.elements[0] as any;
      expect(t.foreignKeys).toHaveLength(1);
      expect(t.foreignKeys[0]).toEqual({
        name: 'Loot',
        localKey: { names: ['lootId'] },
        ref: { refTable: 'loot', remoteKey: null, isListRef: false },
        metadata: { entries: [] },
        comment: expect.objectContaining({ leading: '', trailing: '' }),
      });
    });

    it('should parse foreign key with listref', () => {
      const ast = parse(`table t[id] { \n->Items:[id] =>itemTable[itemId]; }`);
      const t = ast.elements[0] as any;
      expect(t.foreignKeys[0].ref.isListRef).toBe(true);
      expect(t.foreignKeys[0].ref.refTable).toBe('itemTable');
      expect(t.foreignKeys[0].ref.remoteKey).toEqual(['itemId']);
    });
  });

  describe('Metadata parsing', () => {
    it('should parse empty metadata', () => {
      const ast = parse(`struct S { x:int; }`);
      const s = ast.elements[0] as any;
      expect(s.metadata.entries).toHaveLength(0);
    });

    it('should parse tag (no value)', () => {
      const ast = parse(`struct S (pack) { x:int; }`);
      const s = ast.elements[0] as any;
      expect(s.metadata.entries[0].key).toBe('pack');
      expect(s.metadata.entries[0].value).toBeNull();
    });

    it('should parse key=value pairs', () => {
      const ast = parse(`struct S (sep=';', n=42, f=3.14, b=true) { x:int; }`);
      const s = ast.elements[0] as any;
      const entries = s.metadata.entries;
      expect(entries).toHaveLength(4);
      expect(entries[0]).toEqual({ key: 'sep', value: { kind: 'string', value: ';' } });
      expect(entries[1]).toEqual({ key: 'n', value: { kind: 'int', value: 42 } });
      expect(entries[2]).toEqual({ key: 'f', value: { kind: 'float', value: 3.14 } });
      expect(entries[3]).toEqual({ key: 'b', value: { kind: 'bool', value: 'true' } });
    });

    it('should parse minus tag', () => {
      const ast = parse(`struct S (-tag3) { x:int; }`);
      const s = ast.elements[0] as any;
      expect(s.metadata.entries[0].key).toBe('-tag3');
      expect(s.metadata.entries[0].isMinus).toBe(true);
    });

    it('should parse mixed metadata', () => {
      const ast = parse(`struct S (tag1, tag2='hello', -tag3, n=42) { x:int; }`);
      const s = ast.elements[0] as any;
      expect(s.metadata.entries).toHaveLength(4);
      expect(s.metadata.entries[0].key).toBe('tag1');
      expect(s.metadata.entries[1].value).toEqual({ kind: 'string', value: 'hello' });
      expect(s.metadata.entries[2].isMinus).toBe(true);
      expect(s.metadata.entries[3].value).toEqual({ kind: 'int', value: 42 });
    });

    it('should parse hex value', () => {
      const ast = parse(`struct S (v=0xFF) { x:int; }`);
      const s = ast.elements[0] as any;
      expect(s.metadata.entries[0].value).toEqual({ kind: 'int', value: 255 });
    });
  });

  describe('Table parsing', () => {
    it('should parse simple table', () => {
      const ast = parse(`table test[id] { id:int; name:str; }`);
      const t = ast.elements[0] as any;
      expect(t.name).toBe('test');
      expect(t.primaryKey).toEqual({ names: ['id'] });
      expect(t.fields).toHaveLength(2);
    });

    it('should parse table with metadata', () => {
      const ast = parse(`table test[id] (json) { id:int; }`);
      const t = ast.elements[0] as any;
      expect(t.metadata.entries[0].key).toBe('json');
    });

    it('should parse table with compound primary key', () => {
      const ast = parse(`table t[id1,id2] { id1:int; id2:long; }`);
      const t = ast.elements[0] as any;
      expect(t.primaryKey).toEqual({ names: ['id1', 'id2'] });
    });

    it('should parse table with unique keys', () => {
      const ast = parse(`table keytest[id1,id2] {\n[id1,id3];\n[id2];\n[id2,id3];\nid1:int;\nid2:long;\nid3:int;\n}`);
      const t = ast.elements[0] as any;
      expect(t.uniqueKeys).toHaveLength(3);
      expect(t.uniqueKeys[0].key.names).toEqual(['id1', 'id3']);
      expect(t.uniqueKeys[1].key.names).toEqual(['id2']);
      expect(t.uniqueKeys[2].key.names).toEqual(['id2', 'id3']);
    });

    it('should parse table with brace inline comment', () => {
      const ast = parse(`table test[id] (json){ // 副本逻辑\nid:int; }`);
      const t = ast.elements[0] as any;
      expect(t.comment.trailing).toBe('副本逻辑');
    });

    it('should parse table with leading comment', () => {
      const ast = parse(`// 任务完成条件类型\ntable cc[id] { id:int; }`);
      const t = ast.elements[0] as any;
      expect(t.comment.leading).toBe('任务完成条件类型');
    });
  });

  describe('Interface parsing', () => {
    it('should parse interface with structs', () => {
      const ast = parse(`interface Condition {\nstruct KillMonster {\nmonsterid:int;\ncount:int;\n}\nstruct TalkNpc {\nnpcid:int;\n}\n}`);
      const iface = ast.elements[0] as any;
      expect(iface.name).toBe('Condition');
      expect(iface.structs).toHaveLength(2);
      expect(iface.structs[0].name).toBe('KillMonster');
      expect(iface.structs[1].name).toBe('TalkNpc');
    });

    it('should parse interface with metadata', () => {
      const ast = parse(`interface TriggerTick (defaultImpl='ConstValue', pack) {\nstruct ConstValue {\nvalue:int;\n}\n}`);
      const iface = ast.elements[0] as any;
      expect(iface.metadata.entries).toHaveLength(2);
      expect(iface.metadata.entries[0].key).toBe('defaultImpl');
      expect(iface.metadata.entries[0].value).toEqual({ kind: 'string', value: 'ConstValue' });
      expect(iface.metadata.entries[1].key).toBe('pack');
    });

    it('should parse interface with struct that has refs', () => {
      const ast = parse(`interface CC {\nstruct KillMonster {\nmonsterid:int ->other.monster;\ncount:int;\n}\n}`);
      const iface = ast.elements[0] as any;
      expect(iface.structs[0].fields[0].ref).toEqual({
        refTable: 'other.monster',
        remoteKey: null,
        isListRef: false,
      });
    });
  });

  describe('Enum parsing', () => {
    it('should parse enum with assigned values', () => {
      const ast = parse(`enum Color { Red = 1; Blue = 2; }`);
      const e = ast.elements[0] as any;
      expect(e.name).toBe('Color');
      expect(e.enumValuesAssigned).toHaveLength(2);
      expect(e.enumValuesAssigned[0].name).toBe('Red');
      expect(e.enumValuesAssigned[0].number).toBe(1);
      expect(e.enumValuesAssigned[1].name).toBe('Blue');
      expect(e.enumValuesAssigned[1].number).toBe(2);
      expect(e.enumValuesEmpty).toHaveLength(0);
    });

    it('should parse enum with empty values', () => {
      const ast = parse(`enum Direction { North; South; }`);
      const e = ast.elements[0] as any;
      expect(e.enumValuesEmpty).toHaveLength(2);
      expect(e.enumValuesEmpty[0].name).toBe('North');
      expect(e.enumValuesEmpty[1].name).toBe('South');
      expect(e.enumValuesAssigned).toHaveLength(0);
    });

    it('should parse enum with comments on values', () => {
      const ast = parse(`enum Color { Red = 1; // 红色\nBlue = 2; // 蓝色\n}`);
      const e = ast.elements[0] as any;
      expect(e.enumValuesAssigned[0].comment.trailing).toBe('红色');
      expect(e.enumValuesAssigned[1].comment.trailing).toBe('蓝色');
    });

    it('should parse enum with hex values', () => {
      const ast = parse(`enum Flags { A = 0x01; B = 0x02; }`);
      const e = ast.elements[0] as any;
      expect(e.enumValuesAssigned[0].number).toBe(1);
      expect(e.enumValuesAssigned[1].number).toBe(2);
    });

    it('should parse empty enum', () => {
      const ast = parse(`enum Empty { }`);
      const e = ast.elements[0] as any;
      expect(e.enumValuesEmpty).toHaveLength(0);
      expect(e.enumValuesAssigned).toHaveLength(0);
    });
  });

  describe('Full file parsing', () => {
    it('should parse config.cfg (simple structs)', () => {
      const src = readFileSync(join(__dirname, '../../../..', 'example/config/config.cfg'), 'utf-8');
      const ast = parse(src);
      expect(ast.elements).toHaveLength(3);
      expect(ast.elements[0]).toHaveProperty('fields');
      expect((ast.elements[0] as any).name).toBe('LevelRank');
      expect((ast.elements[1] as any).name).toBe('Position');
      expect((ast.elements[2] as any).name).toBe('Range');
    });

    it('should parse samples/test/test.cfg', () => {
      const src = readFileSync(join(__dirname, '../../../..', 'samples/test/test.cfg'), 'utf-8');
      const ast = parse(src);
      expect(ast.elements).toHaveLength(2);
      const t1 = ast.elements[0] as any;
      expect(t1.name).toBe('test');
      expect(t1.fields).toHaveLength(12); // id, name, testBools, testInts, testFloats, testStrs, enumInt, testEnumInts, enumStr, testEnumStrs, ref, testRefs
      expect(t1.fields[5].type).toEqual({
        kind: 'list',
        elementType: { kind: 'primitive', name: 'str' }
      });
      expect(t1.fields[6].ref).toEqual({
        refTable: 'buff.buffclass',
        remoteKey: null,
        isListRef: false,
      });

      const t2 = ast.elements[1] as any;
      expect(t2.name).toBe('test2');
      expect(t2.fields[2].metadata.entries[0]).toEqual({
        key: 'fix', value: { kind: 'int', value: 3 }
      });
      expect(t2.fields[3].type).toEqual({
        kind: 'structRef', namespace: 'trigger.Condition'
      });
      expect(t2.fields[3].metadata.entries[0]).toEqual({
        key: 'pack', value: null
      });
    });

    it('should parse equip.cfg', () => {
      const src = readFileSync(join(__dirname, '../../../..', 'example/config/equip/equip.cfg'), 'utf-8');
      const ast = parse(src);
      expect(ast.elements.length).toBeGreaterThanOrEqual(5);
      // First should be a struct
      expect((ast.elements[0] as any).name).toBe('TestPackBean');
      // Should have tables
      const tables = ast.elements.filter((e: any) => e.primaryKey !== undefined);
      expect(tables.length).toBeGreaterThanOrEqual(5);
    });

    it('should parse task.cfg (with interface)', () => {
      const src = readFileSync(join(__dirname, '../../../..', 'example/config/task/task.cfg'), 'utf-8');
      const ast = parse(src);
      expect(ast.elements.length).toBeGreaterThanOrEqual(4);

      // Find the interface
      const iface = ast.elements.find((e: any) => e.structs !== undefined) as any;
      expect(iface).toBeDefined();
      expect(iface.name).toBe('completecondition');
      expect(iface.structs.length).toBeGreaterThanOrEqual(5);

      // Find task table
      const taskTable = ast.elements.find((e: any) => e.name === 'task') as any;
      expect(taskTable).toBeDefined();
      expect(taskTable.fields.length).toBeGreaterThanOrEqual(5);
    });

    it('should parse other.cfg (with enum and foreign keys)', () => {
      const src = readFileSync(join(__dirname, '../../../..', 'example/config/other/other.cfg'), 'utf-8');
      const ast = parse(src);
      expect(ast.elements.length).toBeGreaterThanOrEqual(5);

      // Find enum
      const enumDecl = ast.elements.find((e: any) => e.enumValuesAssigned !== undefined && e.enumValuesAssigned.length > 0) as any;
      expect(enumDecl).toBeDefined();
      expect(enumDecl.name).toBe('ArgCaptureMode');
      expect(enumDecl.enumValuesAssigned).toHaveLength(2);
      expect(enumDecl.enumValuesAssigned[0].name).toBe('Snapshot');
      expect(enumDecl.enumValuesAssigned[0].number).toBe(1);

      // Find table with foreign keys (monster table has ->Loot and ->AllLoot)
      const monsterTable = ast.elements.find((e: any) => e.name === 'monster') as any;
      expect(monsterTable).toBeDefined();
      expect(monsterTable.foreignKeys.length).toBeGreaterThanOrEqual(2);

      // Find table with listref (loot table has =>lootitem)
      const lootTable = ast.elements.find((e: any) => e.name === 'loot') as any;
      expect(lootTable).toBeDefined();
      expect(lootTable.fields[0].ref.isListRef).toBe(true);
    });

    it('should parse ai.cfg', () => {
      const src = readFileSync(join(__dirname, '../../../..', 'example/config/ai_行为/ai.cfg'), 'utf-8');
      const ast = parse(src);
      expect(ast.elements.length).toBeGreaterThanOrEqual(4);

      // Find interface
      const iface = ast.elements.find((e: any) => e.structs !== undefined) as any;
      expect(iface).toBeDefined();
      expect(iface.name).toBe('TriggerTick');
      expect(iface.metadata.entries.find((e: any) => e.key === 'defaultImpl')).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should throw on missing closing brace', () => {
      expect(() => parse(`struct Foo { x:int;`)).toThrow(ParseError);
    });

    it('should throw on missing colon', () => {
      expect(() => parse(`struct Foo { x int; }`)).toThrow(ParseError);
    });

    it('should throw on unexpected token', () => {
      expect(() => parse(`invalid`)).toThrow(ParseError);
    });
  });

  describe('Comment preservation', () => {
    it('should preserve leading comment with dashes', () => {
      const src = readFileSync(join(__dirname, '../../../..', 'example/config/ai_行为/ai.cfg'), 'utf-8');
      const ast = parse(src);
      const aiTable = ast.elements.find((e: any) => e.name === 'ai') as any;
      // Desc field has a comment with dashes: 描述----这里测试下多行效果--再来一行
      const descField = aiTable.fields.find((f: any) => f.name === 'Desc');
      expect(descField.comment.trailing).toContain('描述');
      expect(descField.comment.trailing).toContain('----');
    });
  });
});
