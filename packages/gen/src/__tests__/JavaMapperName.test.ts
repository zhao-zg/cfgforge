import { describe, it, expect } from 'vitest';
import {
  mapperNames,
  rowReadExpr,
  parseExpr,
  mapperFieldType,
} from '../JavaMapperName';
import {
  Primitive,
  FList,
  FMap,
  StructRef,
  type Nameable,
} from '@cfgforge/schema';
import type { TypeOpts } from '../JavaTypeUtil';

/** 测试用 Nameable stub：name 可带命名空间点号 */
function nameableOf(name: string): Nameable {
  const idx = name.lastIndexOf('.');
  const lastName = idx === -1 ? name : name.substring(idx + 1);
  return {
    name: () => name,
    fmt: () => ({}) as never,
    meta: () => ({}) as never,
    copy: () => nameableOf(name),
    comment: () => '',
    namespace: () => (idx === -1 ? '' : name.substring(0, idx)),
    lastName: () => lastName,
    fullName: () => name,
  };
}

/** javamapper 恒定 langSwitchText:false；resolveNameable 注入 bean 包名映射 */
const opts: TypeOpts = {
  langSwitchText: false,
  resolveNameable: (n) => 'com.example.bean.' + n.lastName(),
};

// ---------------------------------------------------------------------------
// mapperNames
// ---------------------------------------------------------------------------

describe('mapperNames', () => {
  it('simple table', () => {
    const n = mapperNames('task');
    expect(n).toEqual({
      rawClass: 'RawTasks',
      rowClass: 'RawTask',
      keyClass: 'RawTaskKey',
      childClass: 'Tasks',
      sqlTable: 'cfg_task',
    });
  });

  it('namespaced table', () => {
    const n = mapperNames('task.completeconditiontype');
    expect(n.rawClass).toBe('RawTaskCompleteconditiontypes');
    expect(n.childClass).toBe('TaskCompleteconditiontypes');
    expect(n.sqlTable).toBe('cfg_task_completeconditiontype');
  });

  it('underscore table name', () => {
    const n = mapperNames('task_extra');
    expect(n.rawClass).toBe('RawTaskExtras');
    expect(n.rowClass).toBe('RawTaskExtra');
    expect(n.keyClass).toBe('RawTaskExtraKey');
    expect(n.childClass).toBe('TaskExtras');
    expect(n.sqlTable).toBe('cfg_task_extra');
  });
});

// ---------------------------------------------------------------------------
// rowReadExpr — SQL 列类型语义（bool = tinyint 0/1）
// ---------------------------------------------------------------------------

describe('rowReadExpr', () => {
  it('int', () => {
    expect(rowReadExpr('taskid', Primitive.INT)).toBe('recored.getIntValue("taskid")');
  });
  it('bool from tinyint', () => {
    expect(rowReadExpr('ok', Primitive.BOOL)).toBe('(recored.getIntValue("ok") != 0)');
  });
  it('long', () => {
    expect(rowReadExpr('t', Primitive.LONG)).toBe('recored.getLongValue("t")');
  });
  it('float', () => {
    expect(rowReadExpr('f', Primitive.FLOAT)).toBe('recored.getFloatValue("f")');
  });
  it('str', () => {
    expect(rowReadExpr('name', Primitive.STRING)).toBe('recored.getString("name")');
  });
  it('text via string', () => {
    expect(rowReadExpr('desc', Primitive.TEXT)).toBe('recored.getString("desc")');
  });
  it('struct via string', () => {
    const ref = new StructRef('TestDefaultBean');
    ref.obj = nameableOf('TestDefaultBean');
    expect(rowReadExpr('bean', ref)).toBe('recored.getString("bean")');
  });
  it('list via string', () => {
    expect(rowReadExpr('list', new FList(Primitive.INT))).toBe('recored.getString("list")');
  });
  it('map via string', () => {
    expect(rowReadExpr('m', new FMap(Primitive.INT, Primitive.STRING))).toBe('recored.getString("m")');
  });
});

// ---------------------------------------------------------------------------
// parseExpr — POJO _parse 内 JSON 值语义
// ---------------------------------------------------------------------------

describe('parseExpr', () => {
  it('bool', () => {
    expect(parseExpr('b', Primitive.BOOL, opts)).toBe('o.getBooleanValue("b")');
  });
  it('int', () => {
    expect(parseExpr('i', Primitive.INT, opts)).toBe('o.getIntValue("i")');
  });
  it('long', () => {
    expect(parseExpr('l', Primitive.LONG, opts)).toBe('o.getLongValue("l")');
  });
  it('float', () => {
    expect(parseExpr('f', Primitive.FLOAT, opts)).toBe('o.getFloatValue("f")');
  });
  it('str', () => {
    expect(parseExpr('s', Primitive.STRING, opts)).toBe('o.getString("s")');
  });
  it('text via getString', () => {
    expect(parseExpr('t', Primitive.TEXT, opts)).toBe('o.getString("t")');
  });
  it('primitive list -> JSON.parseArray with boxed element class', () => {
    expect(parseExpr('list', new FList(Primitive.INT), opts)).toBe(
      'JSON.parseArray(o.getString("list"), Integer.class)',
    );
    expect(parseExpr('list', new FList(Primitive.BOOL), opts)).toBe(
      'JSON.parseArray(o.getString("list"), Boolean.class)',
    );
    expect(parseExpr('list', new FList(Primitive.STRING), opts)).toBe(
      'JSON.parseArray(o.getString("list"), String.class)',
    );
  });
  it('struct -> Bean._parse(o.getJSONObject(...))', () => {
    const ref = new StructRef('TestDefaultBean');
    ref.obj = nameableOf('TestDefaultBean');
    expect(parseExpr('bean', ref, opts)).toBe('TestDefaultBean._parse(o.getJSONObject("bean"))');
  });
  it('struct with namespace -> resolveNameable resolves class name', () => {
    const ref = new StructRef('Completecondition');
    ref.obj = nameableOf('task.Completecondition');
    expect(parseExpr('cc', ref, opts)).toBe('Completecondition._parse(o.getJSONObject("cc"))');
  });
  it('map throws (handled by template loop)', () => {
    expect(() => parseExpr('m', new FMap(Primitive.INT, Primitive.STRING), opts)).toThrow();
  });
  it('struct-element list throws (handled by template loop)', () => {
    const ref = new StructRef('TestDefaultBean');
    ref.obj = nameableOf('TestDefaultBean');
    expect(() => parseExpr('list', new FList(ref), opts)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// mapperFieldType — Java 字段声明类型（box + langSwitchText 恒 false）
// ---------------------------------------------------------------------------

describe('mapperFieldType', () => {
  it('primitive fields are boxed', () => {
    expect(mapperFieldType(Primitive.BOOL, opts)).toBe('Boolean');
    expect(mapperFieldType(Primitive.INT, opts)).toBe('Integer');
    expect(mapperFieldType(Primitive.LONG, opts)).toBe('Long');
    expect(mapperFieldType(Primitive.FLOAT, opts)).toBe('Float');
    expect(mapperFieldType(Primitive.STRING, opts)).toBe('String');
  });
  it('text is String even if opts.langSwitchText=true (forced false)', () => {
    expect(mapperFieldType(Primitive.TEXT, { ...opts, langSwitchText: true })).toBe('String');
  });
  it('list of boxed elements', () => {
    expect(mapperFieldType(new FList(Primitive.INT), opts)).toBe('java.util.List<Integer>');
  });
  it('map of boxed entries', () => {
    expect(mapperFieldType(new FMap(Primitive.INT, Primitive.STRING), opts)).toBe(
      'java.util.Map<Integer, String>',
    );
  });
  it('struct ref via resolveNameable', () => {
    const ref = new StructRef('TestDefaultBean');
    ref.obj = nameableOf('TestDefaultBean');
    expect(mapperFieldType(ref, opts)).toBe('com.example.bean.TestDefaultBean');
  });
  it('works without resolveNameable (bare class name)', () => {
    const ref = new StructRef('Completecondition');
    ref.obj = nameableOf('task.Completecondition');
    // 与 parseExpr 一致：强制类名路径（命名空间由 import 处理）
    expect(mapperFieldType(ref, { langSwitchText: false })).toBe('Completecondition');
  });
});
