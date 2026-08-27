import { describe, it, expect } from 'vitest';
import { genPojoClass, genInterfacePojo } from '../JavaMapperTemplates';
import type { PojoModel, InterfacePojoModel } from '../JavaMapperModel';
import { Primitive, FList, FMap, StructRef, type Nameable } from '@cfgforge/schema';
import type { TypeOpts } from '../JavaTypeUtil';

/**
 * javamapper POJO 模板单测 —— golden 字符串断言（Task 3）。
 *
 * 约定（控制者裁决）：
 * - opts.resolveNameable 必须始终注入（模板不做默认兜底）；
 * - fieldKind 显式标注字段语义，模板零 schema 依赖（不 import FieldType 谓词）；
 * - map 为 $entry 数组契约，手写循环；list 元素为 struct/interface 也手写循环；
 * - $type 匹配用 fullName 精确相等；
 * - 仅 getter 无 setter；构造器包私有；静态工厂 _parse 先解析到局部变量再 new。
 */

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

const BEAN_PKG = 'com.jedi.gameServer.mapper.bean';

/** resolveNameable：schema 全名 → bean 包 + 命名空间 + 类名（upperStartSegments 语义由 Task 5 Generator 注入，这里用简单映射模拟） */
const OPTS: TypeOpts = {
  langSwitchText: false,
  resolveNameable: (n) => {
    const ns = n.namespace();
    const cls = n.lastName().charAt(0).toUpperCase() + n.lastName().slice(1);
    return ns ? `${BEAN_PKG}.${ns}.${cls}` : `${BEAN_PKG}.${cls}`;
  },
};

function structRefOf(fullName: string): StructRef {
  const ref = new StructRef(fullName);
  ref.obj = nameableOf(fullName);
  return ref;
}

// ---------------------------------------------------------------------------
// struct POJO：纯基础字段（scalars + 基础 list）
// ---------------------------------------------------------------------------

describe('genPojoClass: struct with scalars + basic list', () => {
  const out = genPojoClass(
    {
      pkg: `${BEAN_PKG}.task`,
      className: 'TestDefaultBean',
      namespacePath: 'task',
      isInterfaceImpl: false,
      interfaceFqn: null,
      enumRefType: null,
      enumRefFieldName: null,
      enumRefConstName: null,
      fields: [
        { name: 'testInt', type: Primitive.INT, comment: '', fieldKind: 'scalar' },
        { name: 'testBool', type: Primitive.BOOL, comment: '', fieldKind: 'scalar' },
        { name: 'testString', type: Primitive.STRING, comment: '', fieldKind: 'scalar' },
        {
          name: 'testList',
          type: new FList(Primitive.INT),
          comment: '',
          fieldKind: 'list',
          elemType: Primitive.INT,
        },
      ],
    },
    OPTS,
  );

  it('package decl + fastjson2 imports', () => {
    expect(out).toContain(`package ${BEAN_PKG}.task;`);
    expect(out).toContain('import com.alibaba.fastjson2.JSON;');
    expect(out).toContain('import com.alibaba.fastjson2.JSONObject;');
    expect(out).not.toContain('TypeReference');
  });

  it('final fields, boxed containers, primitives stay primitive', () => {
    expect(out).toContain('private final int testInt;');
    expect(out).toContain('private final boolean testBool;');
    expect(out).toContain('private final String testString;');
    expect(out).toContain('private final java.util.List<Integer> testList;');
  });

  it('package-private ctor assigns all fields', () => {
    expect(out).toContain('    TestDefaultBean(int testInt, boolean testBool, String testString, java.util.List<Integer> testList) {');
    expect(out).toContain('        this.testInt = testInt;');
    expect(out).toContain('        this.testList = testList;');
  });

  it('_parse: static factory parses scalars + basic list, then news', () => {
    expect(out).toContain('    public static TestDefaultBean _parse(JSONObject o) {');
    expect(out).toContain('        int testInt = o.getIntValue("testInt");');
    expect(out).toContain('        boolean testBool = o.getBooleanValue("testBool");');
    expect(out).toContain('        String testString = o.getString("testString");');
    expect(out).toContain('        java.util.List<Integer> testList = JSON.parseArray(o.getString("testList"), Integer.class);');
    expect(out).toContain('        return new TestDefaultBean(testInt, testBool, testString, testList);');
  });

  it('getters only, no setters', () => {
    expect(out).toContain('    public int getTestInt() {\n        return testInt;\n    }');
    expect(out).toContain('public boolean getTestBool()');
    expect(out).toContain('public String getTestString()');
    expect(out).toContain('public java.util.List<Integer> getTestList()');
    expect(out).not.toContain('setTestInt');
    expect(out).not.toContain('setTestList');
  });

  it('toString joins all fields with commas in parens', () => {
    expect(out).toContain(
      'return "(" + testInt + "," + testBool + "," + testString + "," + testList + ")";',
    );
  });

  it('class is public, not interface impl (toString @Override is expected)', () => {
    expect(out).toContain('public class TestDefaultBean {');
    expect(out).not.toContain(' implements ');
  });
});

// ---------------------------------------------------------------------------
// struct POJO：struct 引用 + $entry map + struct 元素 list（手写循环）
// ---------------------------------------------------------------------------

describe('genPojoClass: struct ref + $entry map + struct-element list', () => {
  const out = genPojoClass(
    {
      pkg: `${BEAN_PKG}.task`,
      className: 'TestDefaultBean',
      namespacePath: 'task',
      isInterfaceImpl: false,
      interfaceFqn: null,
      enumRefType: null,
      enumRefFieldName: null,
      enumRefConstName: null,
      fields: [
        {
          name: 'testSubBean',
          type: structRefOf('Position'),
          comment: '',
          fieldKind: 'struct',
          refClassName: `${BEAN_PKG}.Position`,
        },
        {
          name: 'testMap',
          type: new FMap(Primitive.INT, Primitive.STRING),
          comment: '',
          fieldKind: 'map',
          keyType: Primitive.INT,
          valueType: Primitive.STRING,
        },
        {
          name: 'subBeans',
          type: new FList(structRefOf('Position')),
          comment: '',
          fieldKind: 'list',
          elemType: structRefOf('Position'),
          refClassName: `${BEAN_PKG}.Position`,
        },
      ],
    },
    OPTS,
  );

  it('struct ref field decl uses FQN via resolveNameable', () => {
    expect(out).toContain(`private final ${BEAN_PKG}.Position testSubBean;`);
    expect(out).toContain('private final java.util.Map<Integer, String> testMap;');
    expect(out).toContain(`private final java.util.List<${BEAN_PKG}.Position> subBeans;`);
  });

  it('struct ref parse: FQN Xxx._parse(o.getJSONObject(...)) with local var first (bean 互相引用 FQN 不 import)', () => {
    expect(out).toContain(`        ${BEAN_PKG}.Position testSubBean = ${BEAN_PKG}.Position._parse(o.getJSONObject("testSubBean"));`);
  });

  it('$entry map: LinkedHashMap + toJavaList loop, scalar key/value reads', () => {
    expect(out).toContain('        java.util.LinkedHashMap<Integer, String> testMap = new java.util.LinkedHashMap<>();');
    expect(out).toContain('        for (JSONObject e : o.getJSONArray("testMap").toJavaList(JSONObject.class)) {');
    expect(out).toContain('            testMap.put(e.getIntValue("key"), e.getString("value"));');
    expect(out).toContain('        }');
    expect(out).not.toContain('TypeReference');
  });

  it('struct-element list: ArrayList + loop with Xxx._parse(e)', () => {
    expect(out).toContain(`        java.util.ArrayList<${BEAN_PKG}.Position> subBeans = new java.util.ArrayList<>();`);
    expect(out).toContain('        for (JSONObject e : o.getJSONArray("subBeans").toJavaList(JSONObject.class)) {');
    expect(out).toContain(`            subBeans.add(${BEAN_PKG}.Position._parse(e));`);
  });

  it('ctor passes locals; getters typed with FQN', () => {
    expect(out).toContain(
      `        return new TestDefaultBean(testSubBean, testMap, subBeans);`,
    );
    expect(out).toContain(`    public ${BEAN_PKG}.Position getTestSubBean() {`);
    expect(out).toContain('    public java.util.Map<Integer, String> getTestMap() {');
  });
});

// ---------------------------------------------------------------------------
// map 元素为 struct：value 走 Xxx._parse(e)
// ---------------------------------------------------------------------------

describe('genPojoClass: map with struct value', () => {
  const out = genPojoClass(
    {
      pkg: BEAN_PKG,
      className: 'SubBean',
      namespacePath: '',
      isInterfaceImpl: false,
      interfaceFqn: null,
      enumRefType: null,
      enumRefFieldName: null,
      enumRefConstName: null,
      fields: [
        {
          name: 'beanMap',
          type: new FMap(Primitive.STRING, structRefOf('Position')),
          comment: '',
          fieldKind: 'map',
          keyType: Primitive.STRING,
          valueType: structRefOf('Position'),
          refClassName: `${BEAN_PKG}.Position`,
        },
      ],
    },
    OPTS,
  );

  it('field decl: Map<String, Fqn>', () => {
    expect(out).toContain(`private final java.util.Map<String, ${BEAN_PKG}.Position> beanMap;`);
  });

  it('loop value uses Xxx._parse(e)', () => {
    expect(out).toContain(`        java.util.LinkedHashMap<String, ${BEAN_PKG}.Position> beanMap = new java.util.LinkedHashMap<>();`);
    expect(out).toContain('            beanMap.put(e.getString("key"), ' + `${BEAN_PKG}.Position._parse(e));`);
  });
});

// ---------------------------------------------------------------------------
// interface impl POJO：implements + type()
// ---------------------------------------------------------------------------

describe('genPojoClass: interface impl with enumRef type()', () => {
  const out = genPojoClass(
    {
      pkg: `${BEAN_PKG}.task.completecondition`,
      className: 'KillMonster',
      namespacePath: 'task.completecondition',
      isInterfaceImpl: true,
      interfaceFqn: `${BEAN_PKG}.task.completecondition.Completecondition`,
      enumRefType: `${BEAN_PKG}.raw.RawTaskCompleteconditiontypes`,
      enumRefFieldName: 'KillMonster',
      enumRefConstName: 'KILLMONSTER',
      fields: [
        { name: 'monsterId', type: Primitive.INT, comment: '', fieldKind: 'scalar' },
        { name: 'count', type: Primitive.INT, comment: '', fieldKind: 'scalar' },
      ],
    },
    OPTS,
  );

  it('class implements interface FQN', () => {
    expect(out).toContain(
      `public class KillMonster implements ${BEAN_PKG}.task.completecondition.Completecondition {`,
    );
  });

  it('type() returns model-provided raw class + constant', () => {
    expect(out).toContain(`    public ${BEAN_PKG}.raw.RawTaskCompleteconditiontypes type() {`);
    expect(out).toContain(`        return ${BEAN_PKG}.raw.RawTaskCompleteconditiontypes.KILLMONSTER;`);
  });

  it('type() has @Override, impl class does not add interface import', () => {
    expect(out).toContain('    @Override');
    expect(out).not.toContain(`import ${BEAN_PKG}.task.completecondition.Completecondition;`);
  });
});

// ---------------------------------------------------------------------------
// 无 enumRef 的 interface impl：不生成 type()
// ---------------------------------------------------------------------------

describe('genPojoClass: interface impl without enumRef', () => {
  const out = genPojoClass(
    {
      pkg: `${BEAN_PKG}.task.completecondition`,
      className: 'TalkNpc',
      namespacePath: 'task.completecondition',
      isInterfaceImpl: true,
      interfaceFqn: `${BEAN_PKG}.task.completecondition.Completecondition`,
      enumRefType: null,
      enumRefFieldName: null,
      enumRefConstName: null,
      fields: [{ name: 'npcId', type: Primitive.INT, comment: '', fieldKind: 'scalar' }],
    },
    OPTS,
  );

  it('no type() method generated; toString @Override remains', () => {
    expect(out).not.toContain(' type() {');
  });
  it('still implements interface FQN', () => {
    expect(out).toContain('public class TalkNpc implements');
  });
});

// ---------------------------------------------------------------------------
// 注释 + 空 interface impl（toString 空参形态）
// ---------------------------------------------------------------------------

describe('genPojoClass: comments and empty fields', () => {
  const out = genPojoClass(
    {
      pkg: BEAN_PKG,
      className: 'Empty',
      namespacePath: '',
      isInterfaceImpl: false,
      interfaceFqn: null,
      enumRefType: null,
      enumRefFieldName: null,
      enumRefConstName: null,
      fields: [{ name: 'a', type: Primitive.INT, comment: 'line1\nline2', fieldKind: 'scalar' }],
    },
    OPTS,
  );

  it('multi-line field javadoc rendered', () => {
    expect(out).toContain('    /**');
    expect(out).toContain('     * line1');
    expect(out).toContain('     * line2');
    expect(out).toContain('     */');
    expect(out).toContain('    private final int a;');
  });
});

// ---------------------------------------------------------------------------
// genInterfacePojo：$type 精确匹配分发
// ---------------------------------------------------------------------------

describe('genInterfacePojo: $type dispatch + hasEnumRef', () => {
  const model: InterfacePojoModel = {
    pkg: `${BEAN_PKG}.task.completecondition`,
    className: 'Completecondition',
    hasEnumRef: true,
    enumRefTableFqn: `${BEAN_PKG}.raw.RawTaskCompleteconditiontypes`,
    impls: [
      {
        className: 'KillMonster',
        fullName: 'task.completecondition.KillMonster',
        namespacePath: 'task.completecondition',
      },
      {
        className: 'TalkNpc',
        fullName: 'task.completecondition.TalkNpc',
        namespacePath: 'task.completecondition',
      },
    ],
  };
  const out = genInterfacePojo(model, OPTS);

  it('package + JSONObject import only (no JSON/TypeReference)', () => {
    expect(out).toContain(`package ${BEAN_PKG}.task.completecondition;`);
    expect(out).toContain('import com.alibaba.fastjson2.JSONObject;');
    expect(out).not.toContain('import com.alibaba.fastjson2.JSON;');
    expect(out).not.toContain('TypeReference');
  });

  it('interface + static _parse factory', () => {
    expect(out).toContain('public interface Completecondition {');
    expect(out).toContain('    static Completecondition _parse(JSONObject o) {');
  });

  it('$type matched by exact fullName equality with throw fallback', () => {
    expect(out).toContain('        String type = o.getString("$type");');
    expect(out).toContain(
      '        if (type.equals("task.completecondition.KillMonster")) return com.jedi.gameServer.mapper.bean.task.completecondition.KillMonster._parse(o);',
    );
    expect(out).toContain(
      '        if (type.equals("task.completecondition.TalkNpc")) return com.jedi.gameServer.mapper.bean.task.completecondition.TalkNpc._parse(o);',
    );
    expect(out).not.toContain('endsWith');
    expect(out).toContain(
      '        throw new IllegalArgumentException("Completecondition unknown $type: " + type);',
    );
  });

  it('impl FQNs built from pkg + className (resolveNameable-free path)', () => {
    expect(out).toContain(`${BEAN_PKG}.task.completecondition.KillMonster._parse(o)`);
    expect(out).toContain(`${BEAN_PKG}.task.completecondition.TalkNpc._parse(o)`);
  });
});

// ---------------------------------------------------------------------------
// genInterfacePojo：无 enumRef 的 interface
// ---------------------------------------------------------------------------

describe('genInterfacePojo: without enumRef', () => {
  const out = genInterfacePojo(
    {
      pkg: BEAN_PKG,
      className: 'Reward',
      hasEnumRef: false,
      enumRefTableFqn: null,
      impls: [{ className: 'ItemReward', fullName: 'reward.ItemReward', namespacePath: 'reward' }],
    },
    OPTS,
  );

  it('dispatch still generated; hasEnumRef=false only affects impl type() (Task 5 concern)', () => {
    expect(out).toContain('public interface Reward {');
    expect(out).toContain('if (type.equals("reward.ItemReward")) return');
    expect(out).toContain('throw new IllegalArgumentException("Reward unknown $type: " + type);');
  });
});

// ---------------------------------------------------------------------------
// resolveNameable 必须注入（无注入即 throw）
// ---------------------------------------------------------------------------

describe('resolveNameable contract', () => {
  it('genPojoClass throws without opts.resolveNameable', () => {
    expect(() =>
      genPojoClass(
        {
          pkg: BEAN_PKG,
          className: 'A',
          namespacePath: '',
          isInterfaceImpl: false,
          interfaceFqn: null,
          enumRefType: null,
          enumRefFieldName: null,
          enumRefConstName: null,
          fields: [
            {
              name: 'b',
              type: structRefOf('Position'),
              comment: '',
              fieldKind: 'struct',
              refClassName: `${BEAN_PKG}.Position`,
            },
          ],
        } satisfies PojoModel,
        { langSwitchText: false },
      ),
    ).toThrow(/resolveNameable/);
  });

  it('genInterfacePojo throws without opts.resolveNameable', () => {
    expect(() =>
      genInterfacePojo(
        {
          pkg: BEAN_PKG,
          className: 'C',
          hasEnumRef: false,
          enumRefTableFqn: null,
          impls: [],
        } satisfies InterfacePojoModel,
        { langSwitchText: false },
      ),
    ).toThrow(/resolveNameable/);
  });
});
