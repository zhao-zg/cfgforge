/**
 * javaTemplates — TypeScript port of Java JTE templates in `jte/java/`.
 *
 * 13 template functions:
 * - genStructuralClass(model)       — GenStructuralClass.jte (169 lines)
 * - genStructuralClassTablePart(model) — GenStructuralClassTablePart.jte (82 lines)
 * - genInterface(model)             — GenInterface.jte (31 lines)
 * - genEntryOrEnumClass(model)      — GenEntryOrEnumClass.jte (153 lines)
 * - genConfigMgr(pkg, tableDataNames) — ConfigMgr.jte (91 lines)
 * - genConfigLoader(pkg)            — ConfigLoader.jte (10 lines)
 * - genConfigMgrLoader(model)       — ConfigMgrLoader.jte (102 lines)
 * - genKeyClass(keySchema)          — GenKeyClass.jte (31 lines)
 * - genMapGetBy(keySchema, name, isPrimaryKey, codeTopPkg) — GenMapGetBy.jte (15 lines)
 * - genResolve(codeTopPkg, structural) — GenResolve.jte (29 lines)
 * - genResolveDirect(codeTopPkg, structural) — GenResolveDirect.jte (94 lines)
 * - genTableBuilder(table, name)    — GenTableBuilder.jte (33 lines)
 * - genText(model)                  — Text.jte (40 lines)
 *
 * Java templates: app/src/main/resources/jte/java/*.jte
 */

import {
  isPrimitive,
  isStructRef,
  isFList,
  isFMap,
  isEEnum,
  isRefPrimary,
  isRefUniq,
  isRefList,
  hasRefFieldType,
  type KeySchema,
  type TableSchema,
  type Structural,
} from '@cfgforge/schema';
import { upper1, lower1 } from '@cfgforge/shared';

import {
  NameableName,
  enumFieldName,
  pascalName,
  type,
  boxType,
  readValue,
  defaultValue,
  isJavaPrimitive,
  refTypeFromFK,
  refName,
  refType as refTypeOf,
  keyClassName,
  GetByKeyFunctionNameInConfigMgr,
  GetByKeyFunctionName,
  uniqueKeyMapName,
  tableDataFullName,
  isEnumAndHasOnlyPrimaryKeyAndEnumStr,
  formalParams,
  actualParams,
  actualParamsKey,
  actualParamsKeyRaw,
  keyDisplayExpr,
  hashCodes,
  equalsExpr,
  equal,
  tableGet,
} from './JavaName.js';
import type { JavaStructuralClassModel } from './JavaStructuralClassModel.js';
import type { JavaInterfaceModel } from './JavaInterfaceModel.js';
import type { JavaEntryOrEnumModel } from './JavaEntryOrEnumModel.js';
import type { JavaConfigMgrLoaderModel } from './JavaConfigMgrLoaderModel.js';
import type { JavaTextModel } from './JavaTextModel.js';

// ---------------------------------------------------------------------------
// genStructuralClass — GenStructuralClass.jte
// ---------------------------------------------------------------------------

export function genStructuralClass(model: JavaStructuralClassModel): string {
  const L: string[] = [];

  L.push(`package ${model.pkg};`);
  L.push('');

  if (model.sourceComment.length > 0) {
    L.push(model.sourceComment);
  }

  if (model.isImpl) {
    const finalKeyword = model.isSealedInterface ? 'final ' : '';
    L.push(`    public ${finalKeyword}class ${model.className} implements ${model.nullableInterfaceFullName} {`);
    if (model.enumRefTable) {
      const refTypeStr = refTypeOf(model.enumRefTable);
      L.push(`        @Override`);
      L.push(`        public ${refTypeStr} type() {`);
      L.push(`            return ${refTypeStr}.${enumFieldName(model.structural.name())};`);
      L.push(`        }`);
      L.push('');
    }
  } else {
    L.push(`    public class ${model.className} {`);
  }

  // Field declarations
  for (const field of model.fields) {
    L.push(`        private ${field.type} ${field.name};`);
  }

  if (!model.isTableAndNeedBuilder) {
    L.push('');
    for (const fk of model.foreignKeys) {
      L.push(`        private ${fk.type} ${fk.name};`);
    }
    L.push('');
  }

  if (!model.isStructAndHasNoField) {
    L.push(`        private ${model.className}() {`);
    L.push(`        }`);
    L.push('');
  }

  if (!model.isTable) {
    L.push(`        public ${model.className}(${model.formalParams()}) {`);
    for (const field of model.fields) {
      L.push(`            this.${field.name} = ${field.name};`);
    }
    L.push(`        }`);
    L.push('');
  } else if (model.isTableAndNeedBuilder) {
    L.push(`        ${model.className}(${model.className}Builder b) {`);
    for (const field of model.fields) {
      L.push(`            this.${field.name} = b.${field.name};`);
    }
    L.push(`        }`);
    L.push('');
  }

  // _create method
  L.push(`        public static ${model.className} _create(configgen.genjava.ConfigInput input) {`);
  L.push(`            ${model.className} self = new ${model.className}();`);
  for (const field of model.structural.fields()) {
    const ln = lower1(field.name);
    const ft = field.type;
    if (isPrimitive(ft) || isStructRef(ft)) {
      L.push(`            self.${ln} = ${readValue(ft)};`);
    } else if (isFList(ft)) {
      L.push(`            {`);
      L.push(`                int c = input.readInt();`);
      L.push(`                if (c == 0) {`);
      L.push(`                    self.${ln} = java.util.Collections.emptyList();`);
      L.push(`                } else {`);
      L.push(`                    self.${ln} = new java.util.ArrayList<>(c);`);
      L.push(`                    for (; c > 0; c--) {`);
      L.push(`                        self.${ln}.add(${readValue(ft.item)});`);
      L.push(`                    }`);
      L.push(`                }`);
      L.push(`            }`);
    } else if (isFMap(ft)) {
      L.push(`            {`);
      L.push(`                int c = input.readInt();`);
      L.push(`                if (c == 0) {`);
      L.push(`                    self.${ln} = java.util.Collections.emptyMap();`);
      L.push(`                } else {`);
      L.push(`                    self.${ln} = new java.util.LinkedHashMap<>(c);`);
      L.push(`                    for (; c > 0; c--) {`);
      L.push(`                        self.${ln}.put(${readValue(ft.key)}, ${readValue(ft.value)});`);
      L.push(`                    }`);
      L.push(`                }`);
      L.push(`            }`);
    }
  }
  L.push(`            return self;`);
  L.push(`        }`);
  L.push('');

  // Getters
  for (const field of model.fields) {
    if (field.comment.length > 0) {
      L.push(`        /**`);
      for (const line of field.comment.split('\n')) {
        L.push(`         * ${line}`);
      }
      L.push(`         */`);
    }
    L.push(`        public ${field.type} get${upper1(field.name)}() {`);
    L.push(`            return ${field.name};`);
    L.push(`        }`);
    L.push('');
  }

  // Foreign key getters
  if (!model.isTableAndNeedBuilder) {
    for (const fk of model.foreignKeys) {
      L.push(`        public ${fk.type} ${lower1(fk.name)}() {`);
      L.push(`            return ${fk.name};`);
      L.push(`        }`);
      L.push('');
    }
  }

  // hashCode/equals
  if (model.isStructAndHasNoField) {
    L.push(`        @Override`);
    L.push(`        public int hashCode() {`);
    L.push(`            return ${model.className}.class.hashCode();`);
    L.push(`        }`);
    L.push('');
    L.push(`        @Override`);
    L.push(`        public boolean equals(Object other) {`);
    L.push(`            return other instanceof ${model.className};`);
    L.push(`        }`);
    L.push('');
  } else if (!model.isTable) {
    L.push(`        @Override`);
    L.push(`        public int hashCode() {`);
    L.push(`            return ${model.hashCodes()};`);
    L.push(`        }`);
    L.push('');
    L.push(`        @Override`);
    L.push(`        public boolean equals(Object other) {`);
    L.push(`            if (!(other instanceof ${model.className}))`);
    L.push(`                return false;`);
    L.push(`            ${model.className} o = (${model.className}) other;`);
    L.push(`            return ${model.equals()};`);
    L.push(`        }`);
    L.push('');
  }

  // toString
  L.push(`        @Override`);
  L.push(`        public String toString() {`);
  if (model.isStructAndHasNoField) {
    L.push(`            return "${model.isImpl ? model.className : ''}";`);
  } else {
    L.push(`            return "${model.isImpl ? model.className : ''}(" + ${model.toStringParams()} + ")";`);
  }
  L.push(`        }`);

  // _resolve
  if (model.hasRef && !model.isTableAndNeedBuilder) {
    if (model.structural.foreignKeys().length > 0) {
      L.push('');
      L.push(genResolveDirect(model.codeTopPkg, model.structural));
    }

    if (model.nullableInterface) {
      L.push(`        @Override`);
    }
    L.push(genResolve(model.codeTopPkg, model.structural));
  }

  // Table part
  if (model.isTable) {
    L.push(genStructuralClassTablePart(model));
  }

  L.push(`}`);
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// genStructuralClassTablePart — GenStructuralClassTablePart.jte
// ---------------------------------------------------------------------------

export function genStructuralClassTablePart(model: JavaStructuralClassModel): string {
  const L: string[] = [];
  const table = model.structural as TableSchema;
  const pkfs = table.primaryKey.fieldSchemas()!;
  const primarySeq = pkfs.length === 1 && pkfs[0].isSeq();

  // GenKeyClass for primary key if multi-field
  if (table.primaryKey.fields().length > 1) {
    L.push(genKeyClass(table.primaryKey));
  }

  // GenMapGetBy for primary key
  L.push(genMapGetBy(table.primaryKey, model.name, true, model.codeTopPkg));

  // Unique keys
  for (const uk of table.uniqueKeys()) {
    if (uk.fields().length > 1) {
      L.push(genKeyClass(uk));
    }
    L.push(genMapGetBy(uk, model.name, false, model.codeTopPkg));
  }

  // all() method
  const primaryMapName = model.name.containerPrefix + 'All';
  const functionAllName =
    'all' + model.structural.name().split('.').map(pascalName).join('');

  if (primarySeq) {
    L.push(`    public static java.util.List<${model.className}> all() {`);
    L.push(`        ${model.codeTopPkg}.ConfigMgr mgr = ${model.codeTopPkg}.ConfigMgr.getMgr();`);
    L.push(`        return mgr.${functionAllName}();`);
    L.push(`    }`);
  } else {
    L.push(`    public static java.util.Collection<${model.className}> all() {`);
    L.push(`        ${model.codeTopPkg}.ConfigMgr mgr = ${model.codeTopPkg}.ConfigMgr.getMgr();`);
    L.push(`        return mgr.${functionAllName}();`);
    L.push(`    }`);
  }
  L.push('');

  // _ConfigLoader
  L.push(`        public static class _ConfigLoader implements ${model.codeTopPkg}.ConfigLoader {`);
  L.push('');
  L.push(`            @Override`);
  L.push(`            public void createAll(${model.codeTopPkg}.ConfigMgr mgr, configgen.genjava.ConfigInput input) {`);
  L.push(`                int c = input.readInt();`);
  if (primarySeq) {
    L.push(`                mgr.${primaryMapName} = new ${model.className}[c];`);
  } else {
    L.push(`                mgr.${primaryMapName} = new java.util.LinkedHashMap<>(c);`);
  }
  for (const uk of table.uniqueKeys()) {
    const ukSeqInit = uk.fieldSchemas()!.length === 1 && uk.fieldSchemas()![0].isSeq();
    const ukMapName = model.name.containerPrefix + uniqueKeyMapName(uk);
    if (ukSeqInit) {
      L.push(`                mgr.${ukMapName} = new ${model.className}[c];`);
    } else {
      L.push(`                mgr.${ukMapName} = new java.util.LinkedHashMap<>(c);`);
    }
  }
  L.push(`                for (; c > 0; c--) {`);
  L.push(`                    ${model.className} self = ${model.className}._create(input);`);
  if (primarySeq) {
    L.push(`                    mgr.${primaryMapName}[${actualParamsKeyRaw(table.primaryKey, 'self.')}] = self;`);
  } else {
    L.push(`                    mgr.${primaryMapName}.put(${actualParamsKey(table.primaryKey, 'self.', null)}, self);`);
  }
  for (const uk of table.uniqueKeys()) {
    const ukSeq2 = uk.fieldSchemas()!.length === 1 && uk.fieldSchemas()![0].isSeq();
    const ukMapName = model.name.containerPrefix + uniqueKeyMapName(uk);
    if (ukSeq2) {
      L.push(`                    mgr.${ukMapName}[${actualParamsKeyRaw(uk, 'self.')}] = self;`);
    } else {
      L.push(`                    mgr.${ukMapName}.put(${actualParamsKey(uk, 'self.', null)}, self);`);
    }
  }
  L.push(`                }`);
  L.push(`            }`);
  L.push('');
  L.push(`            @Override`);
  L.push(`            public void resolveAll(${model.codeTopPkg}.ConfigMgr mgr) {`);
  if (model.hasRef && !model.isTableAndNeedBuilder) {
    L.push(`                for (${model.className} e : mgr.${primaryMapName}${primarySeq ? '' : '.values()'}) {`);
    L.push(`                    e._resolve(mgr);`);
    L.push(`                }`);
  } else {
    L.push(`                // no resolve`);
  }
  L.push(`            }`);
  L.push('');
  L.push(`        }`);

  return L.join('\n');
}

// ---------------------------------------------------------------------------
// genInterface — GenInterface.jte
// ---------------------------------------------------------------------------

export function genInterface(model: JavaInterfaceModel): string {
  const L: string[] = [];

  L.push(`package ${model.pkg};`);
  L.push('');

  if (model.isSealedInterface) {
    const permits = model.impls.map((impl) => impl.upper1Name).join(', ');
    L.push(`public sealed interface ${model.className} permits ${permits} {`);
  } else {
    L.push(`public interface ${model.className} {`);
  }

  if (model.nullableEnumRefTable) {
    L.push(`    ${model.nullableEnumRefTable} type();`);
    L.push('');
  }

  if (model.hasRef) {
    L.push(`    default void _resolve(${model.codeTopPkg}.ConfigMgr mgr) {`);
    L.push(`    }`);
    L.push('');
  }

  L.push(`    static ${model.className} _create(configgen.genjava.ConfigInput input) {`);
  L.push(`        String tag = input.readStringInPool();`);
  L.push(`        switch (tag) {`);
  for (const impl of model.impls) {
    L.push(`            case "${impl.name}":`);
    L.push(`                return ${impl.fullName}._create(input);`);
  }
  L.push(`        }`);
  L.push(`        throw new IllegalArgumentException(tag + " not found");`);
  L.push(`    }`);
  L.push(`}`);

  return L.join('\n');
}

// ---------------------------------------------------------------------------
// genEntryOrEnumClass — GenEntryOrEnumClass.jte
// ---------------------------------------------------------------------------

export function genEntryOrEnumClass(model: JavaEntryOrEnumModel): string {
  const L: string[] = [];

  L.push(`package ${model.pkg};`);
  L.push('');

  if (model.sourceComment.length > 0) {
    L.push(model.sourceComment);
  }

  const classKeyword = model.isEnum ? 'enum' : 'class';
  L.push(`public ${classKeyword} ${model.className} {`);

  if (model.hasNoIntValue) {
    // No int value — just string-based enum/entry
    const enumNamesList = model.enumNames ? [...model.enumNames] : [];
    const len = enumNamesList.length;
    let c = 0;
    for (const enumName of enumNamesList) {
      c++;
      const fix = c === len ? ';' : ',';
      if (model.isEnum) {
        L.push(`    ${enumFieldName(enumName)}("${enumName}")${fix}`);
      } else {
        L.push(`    public static final ${model.className} ${enumFieldName(enumName)} = new ${model.className}("${enumName}");${fix}`);
      }
    }
    if (model.isEnum && c === 0) {
      L.push(`    ;`);
    }
    L.push('');
    L.push(`    private final String value;`);
    if (model.isNeedReadData) {
      L.push(`    private volatile ${model.dataNameFullName} ref;`);
    }
    L.push('');
    L.push(`    ${model.className}(String value) {`);
    L.push(`        this.value = value;`);
    L.push(`    }`);
  } else {
    // Has int value
    const entries = model.enumNameToIntegerValueMap
      ? [...model.enumNameToIntegerValueMap.entries()]
      : [];
    const len = entries.length;
    let c = 0;
    for (const [enumName, value] of entries) {
      c++;
      const fix = c === len ? ';' : ',';
      if (model.isEnum) {
        L.push(`    ${enumFieldName(enumName)}("${enumName}", ${value})${fix}`);
      } else {
        L.push(`    public static final ${model.className} ${enumFieldName(enumName)} = new ${model.className}("${enumName}", ${value});${fix}`);
      }
    }
    if (model.isEnum && c === 0) {
      L.push(`    ;`);
    }
    L.push('');
    L.push(`    private final String name;`);
    L.push(`    private final int value;`);
    if (model.isNeedReadData) {
      L.push(`    private volatile ${model.dataNameFullName} ref;`);
    }
    L.push('');
    L.push(`    ${model.className}(String name, int value) {`);
    L.push(`        this.name = name;`);
    L.push(`        this.value = value;`);
    L.push(`    }`);
  }

  // Enum-specific: get(), map, getters, fk methods
  if (model.isEnum) {
    const keyType = model.hasNoIntValue ? 'String' : 'Integer';
    const paramType = model.hasNoIntValue ? 'String' : 'int';
    L.push('');
    L.push(`    public static final java.util.Map<${keyType}, ${model.className}> map = new java.util.HashMap<>();`);
    L.push('');
    L.push(`    static {`);
    L.push(`        for(${model.className} e : ${model.className}.values()) {`);
    L.push(`            map.put(e.value, e);`);
    L.push(`        }`);
    L.push(`    }`);
    L.push('');
    L.push(`    public static ${model.className} get(${paramType} value) {`);
    L.push(`        return map.get(value);`);
    L.push(`    }`);
    L.push('');

    // Field getters
    for (const field of model.table.fields()) {
      if (field.comment().length > 0) {
        L.push(`    /**`);
        for (const line of field.comment().split('\n')) {
          L.push(`     * ${line}`);
        }
        L.push(`     */`);
      }
      L.push(`    public ${type(field.type)} get${upper1(field.name)}() {`);
      const pkfs = model.table.primaryKey.fieldSchemas()!;
      if (field === pkfs[0]) {
        L.push(`        return value;`);
      } else if (field === (model.entryBase as any).fieldSchema) {
        L.push(`        return name;`);
      } else {
        L.push(`        return ref.get${upper1(field.name)}();`);
      }
      L.push(`    }`);
      L.push('');
    }

    // Foreign key methods
    for (const fk of model.table.foreignKeys()) {
      const fkRefType = refTypeFromFK(fk);
      const fkRefName = refName(fk);
      L.push(`    public ${fkRefType} ${lower1(fkRefName)}() {`);
      L.push(`        return ref.${lower1(fkRefName)}();`);
      L.push(`    }`);
      L.push('');
    }
  }

  // setRef / setAllRefs
  if (model.isNeedReadData) {
    L.push(`    public ${model.dataNameFullName} ref() {`);
    L.push(`        return ref;`);
    L.push(`    }`);
    L.push('');
    L.push(`    void setRef(${model.codeTopPkg}.ConfigMgr mgr) {`);
    const pkfs = model.table.primaryKey.fieldSchemas()!;
    const isSeq = pkfs.length === 1 && pkfs[0].isSeq();
    if (isSeq) {
      L.push(`        ref = mgr.${model.name.containerPrefix}All[value];`);
    } else {
      L.push(`        ref = mgr.${model.name.containerPrefix}All.get(value);`);
    }
    L.push(`        configgen.genjava.LoadValueErrs.requireNonNull(ref, "${model.table.name()}.setRef", value);`);
    L.push(`    }`);
    L.push('');

    if (model.isEnum) {
      L.push(`    public static void setAllRefs(${model.codeTopPkg}.ConfigMgr mgr) {`);
      L.push(`        for(${model.className} e : ${model.className}.values()) {`);
      L.push(`            e.setRef(mgr);`);
      L.push(`        }`);
      L.push(`    }`);
    } else {
      L.push(`    public static void setAllRefs(${model.codeTopPkg}.ConfigMgr mgr) {`);
      const enumNamesList = model.enumNames ? [...model.enumNames] : [];
      for (const enumName of enumNamesList) {
        L.push(`        ${enumFieldName(enumName)}.setRef(mgr);`);
      }
      L.push(`    }`);
    }
  }

  L.push(`}`);
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// genConfigMgr — ConfigMgr.jte
// ---------------------------------------------------------------------------

export function genConfigMgr(pkg: string, tableDataNames: NameableName[]): string {
  const L: string[] = [];

  L.push(`package ${pkg};`);
  L.push('');
  L.push(`public class ConfigMgr {`);
  L.push(`    private static volatile ConfigMgr mgr;`);
  L.push('');
  L.push(`    public static ConfigMgr getMgr() {`);
  L.push(`        return mgr;`);
  L.push(`    }`);
  L.push('');
  L.push(`    public static void setMgr(ConfigMgr newMgr) {`);
  L.push(`        mgr = newMgr;`);
  L.push(`        ConfigMgrLoader.applySetAllRefs(mgr);`);
  L.push(`    }`);

  const copyFields: string[] = [];

  for (const name of tableDataNames) {
    const table = name.nameable as TableSchema;
    const primaryKey = table.primaryKey;
    const mapName = name.containerPrefix + 'All';
    const pkfs = primaryKey.fieldSchemas()!;
    const seq = pkfs.length === 1 && pkfs[0].isSeq();
    const keyTypeName = keyClassName(primaryKey, name);
    const methodName = GetByKeyFunctionNameInConfigMgr(primaryKey, true, name.nameable);

    copyFields.push(mapName);

    if (seq) {
      L.push('');
      L.push(`    public ${name.fullName}[] ${mapName};`);
      L.push('');
      L.push(`    public ${name.fullName} ${methodName}(${formalParams(pkfs)}) { return ${actualParamsKeyRaw(primaryKey, '')} >= 0 && ${actualParamsKeyRaw(primaryKey, '')} < ${mapName}.length ? ${mapName}[${actualParamsKeyRaw(primaryKey, '')}] : null; }`);
    } else {
      L.push('');
      L.push(`    public java.util.Map<${keyTypeName}, ${name.fullName}> ${mapName};`);
      L.push('');
      L.push(`    public ${name.fullName} ${methodName}(${formalParams(pkfs)}) { return ${mapName}.get(${actualParamsKey(primaryKey, '', name)}); }`);
    }

    for (const uk of table.uniqueKeys()) {
      const ukMapName = name.containerPrefix + uniqueKeyMapName(uk);
      const ukSeq = uk.fieldSchemas()!.length === 1 && uk.fieldSchemas()![0].isSeq();
      const ukKeyTypeName = keyClassName(uk, name);
      const ukMethodName = GetByKeyFunctionNameInConfigMgr(uk, false, name.nameable);

      copyFields.push(ukMapName);

      if (ukSeq) {
        L.push('');
        L.push(`    public ${name.fullName}[] ${ukMapName};`);
        L.push('');
        L.push(`    public ${name.fullName} ${ukMethodName}(${formalParams(uk.fieldSchemas()!)}) { return ${actualParamsKeyRaw(uk, '')} >= 0 && ${actualParamsKeyRaw(uk, '')} < ${ukMapName}.length ? ${ukMapName}[${actualParamsKeyRaw(uk, '')}] : null; }`);
      } else {
        L.push('');
        L.push(`    public java.util.Map<${ukKeyTypeName}, ${name.fullName}> ${ukMapName};`);
        L.push('');
        L.push(`    public ${name.fullName} ${ukMethodName}(${formalParams(uk.fieldSchemas()!)}) { return ${ukMapName}.get(${actualParamsKey(uk, '', name)}); }`);
      }
    }

    const functionAllName = 'all' + name.nameable.name().split('.').map(pascalName).join('');
    if (seq) {
      L.push('');
      L.push(`    public java.util.List<${name.fullName}> ${functionAllName}() { return java.util.Arrays.asList(${mapName}); }`);
    } else {
      L.push('');
      L.push(`    public java.util.Collection<${name.fullName}> ${functionAllName}() { return ${mapName}.values(); }`);
    }
  }

  // copyFrom
  L.push('');
  L.push(`    public void copyFrom(${pkg}.ConfigMgr src) {`);
  for (const f of copyFields) {
    L.push(`        this.${f} = src.${f};`);
  }
  L.push(`    }`);

  L.push(`}`);
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// genConfigLoader — ConfigLoader.jte
// ---------------------------------------------------------------------------

export function genConfigLoader(pkg: string): string {
  return `package ${pkg};

public interface ConfigLoader {

    void createAll(ConfigMgr mgr, configgen.genjava.ConfigInput input);

    void resolveAll(ConfigMgr mgr);

}`;
}

// ---------------------------------------------------------------------------
// genConfigMgrLoader — ConfigMgrLoader.jte
// ---------------------------------------------------------------------------

export function genConfigMgrLoader(model: JavaConfigMgrLoaderModel): string {
  const L: string[] = [];

  L.push(`package ${model.pkg};`);
  L.push('');
  L.push(`import java.util.LinkedHashMap;`);
  L.push(`import java.util.Map;`);
  L.push(`import java.util.Set;`);
  L.push('');
  L.push(`public class ConfigMgrLoader {`);
  L.push('');
  L.push(`    public static configgen.genjava.SchemaInterface loadSchema(configgen.genjava.ConfigInput input) {`);
  L.push(`        int schemaLength = input.readInt();`);
  L.push(`        if (schemaLength <= 0) {`);
  L.push(`            return null;`);
  L.push(`        } else {`);
  L.push(`            return (configgen.genjava.SchemaInterface) configgen.genjava.SchemaDeserializer.deserialize(input);`);
  L.push(`        }`);
  L.push(`    }`);
  L.push('');
  L.push(`    public static ConfigMgr load(configgen.genjava.ConfigInput input) {`);
  L.push(`        ConfigMgr mgr = new ConfigMgr();`);
  L.push(`        return load(mgr, input);`);
  L.push(`    }`);
  L.push('');
  L.push(`    public static ConfigMgr load(ConfigMgr mgr, configgen.genjava.ConfigInput input) {`);
  L.push(`        input.readStringPool();`);
  L.push(`        input.readLangTextPool();`);
  L.push('');
  L.push(`        int c = input.readInt();`);
  L.push(`        if (c < ${model.tables.length}) {`);
  L.push(`            throw new IllegalArgumentException();`);
  L.push(`        }`);
  L.push('');
  L.push(`        Map<String, ConfigLoader> allConfigLoaders = getAllConfigLoaders();`);
  L.push(`        for (int i = 0; i < c; i++) {`);
  L.push(`            String tableName = input.readString();`);
  L.push(`            int tableSize = input.readInt();`);
  L.push(`            ConfigLoader configLoader = allConfigLoaders.get(tableName);`);
  L.push(`            if (configLoader != null) {`);
  L.push(`                configLoader.createAll(mgr, input);`);
  L.push(`            } else {`);
  L.push(`                input.skipBytes(tableSize);`);
  L.push(`            }`);
  L.push(`        }`);
  L.push('');
  L.push(`        for (var configLoader : allConfigLoaders.values()) {`);
  L.push(`            configLoader.resolveAll(mgr);`);
  L.push(`        }`);
  L.push('');
  L.push(`        return mgr;`);
  L.push(`    }`);
  L.push('');
  L.push(`    public static void loadPartialAndSetMgr(configgen.genjava.ConfigInput input, ConfigMgr oldMgr, Set<String> tableNames) {`);
  L.push(`        ConfigMgr newMgr = new ConfigMgr();`);
  L.push(`        newMgr.copyFrom(oldMgr);`);
  L.push('');
  L.push(`        input.readStringPool();`);
  L.push(`        input.readLangTextPool();`);
  L.push('');
  L.push(`        int c = input.readInt();`);
  L.push('');
  L.push(`        Map<String, ConfigLoader> allConfigLoaders = getAllConfigLoaders();`);
  L.push(`        for (int i = 0; i < c; i++) {`);
  L.push(`            String tableName = input.readString();`);
  L.push(`            int tableSize = input.readInt();`);
  L.push(`            if (tableNames.contains(tableName)) {`);
  L.push(`                ConfigLoader configLoader = allConfigLoaders.get(tableName);`);
  L.push(`                if (configLoader != null) {`);
  L.push(`                    configLoader.createAll(newMgr, input);`);
  L.push(`                } else {`);
  L.push(`                    input.skipBytes(tableSize);`);
  L.push(`                }`);
  L.push(`            } else {`);
  L.push(`                input.skipBytes(tableSize);`);
  L.push(`            }`);
  L.push(`        }`);
  L.push('');
  L.push(`        for (var configLoader : allConfigLoaders.values()) {`);
  L.push(`            configLoader.resolveAll(newMgr);`);
  L.push(`        }`);
  L.push('');
  L.push(`        ConfigMgr.setMgr(newMgr);`);
  L.push(`    }`);
  L.push('');
  L.push(`    public static void applySetAllRefs(ConfigMgr mgr) {`);
  for (const fc of model.setAllRefs_FullClassNames) {
    L.push(`        ${fc}.setAllRefs(mgr);`);
  }
  L.push(`    }`);
  L.push('');
  L.push(`    public static Map<String, ConfigLoader> getAllConfigLoaders() {`);
  L.push(`        Map<String, ConfigLoader> allConfigLoaders = new LinkedHashMap<>();`);
  for (const t of model.tables) {
    L.push(`        allConfigLoaders.put("${t.name}", new ${t.fullName}._ConfigLoader());`);
  }
  L.push('');
  L.push(`        return allConfigLoaders;`);
  L.push(`    }`);
  L.push(`}`);

  return L.join('\n');
}

// ---------------------------------------------------------------------------
// genKeyClass — GenKeyClass.jte
// ---------------------------------------------------------------------------

export function genKeyClass(keySchema: KeySchema): string {
  const L: string[] = [];
  const klsName = keyClassName(keySchema);
  const fs = keySchema.fieldSchemas()!;

  L.push(`    public static class ${klsName} {`);
  for (const f of fs) {
    L.push(`        private final ${type(f.type)} ${lower1(f.name)};`);
  }
  L.push('');
  L.push('');
  L.push(`        public ${klsName}(${formalParams(fs)}) {`);
  for (const f of fs) {
    L.push(`            this.${lower1(f.name)} = ${lower1(f.name)};`);
  }
  L.push(`        }`);
  L.push('');
  L.push(`        @Override`);
  L.push(`        public int hashCode() {`);
  L.push(`            return ${hashCodes(fs)};`);
  L.push(`        }`);
  L.push('');
  L.push(`        @Override`);
  L.push(`        public boolean equals(Object other) {`);
  L.push(`            if (!(other instanceof ${klsName}))`);
  L.push(`                return false;`);
  L.push(`            ${klsName} o = (${klsName}) other;`);
  L.push(`            return ${equalsExpr(fs)};`);
  L.push(`        }`);
  L.push(`    }`);

  return L.join('\n');
}

// ---------------------------------------------------------------------------
// genMapGetBy — GenMapGetBy.jte
// ---------------------------------------------------------------------------

export function genMapGetBy(
  keySchema: KeySchema,
  name: NameableName,
  isPrimaryKey: boolean,
  codeTopPkg: string,
): string {
  const methodName = GetByKeyFunctionNameInConfigMgr(keySchema, isPrimaryKey, name.nameable);
  const getByName = GetByKeyFunctionName(keySchema, isPrimaryKey);
  const fs = keySchema.fieldSchemas()!;

  return `    public static ${name.className} ${getByName}(${formalParams(fs)}) {
        ${codeTopPkg}.ConfigMgr mgr = ${codeTopPkg}.ConfigMgr.getMgr();
        return mgr.${methodName}(${actualParamsKeyRaw(keySchema, '')});
    }`;
}

// ---------------------------------------------------------------------------
// genResolve — GenResolve.jte
// ---------------------------------------------------------------------------

export function genResolve(codeTopPkg: string, structural: Structural): string {
  const L: string[] = [];

  L.push(`    public void _resolve(${codeTopPkg}.ConfigMgr mgr) {`);
  for (const field of structural.fields()) {
    if (hasRefFieldType(field.type)) {
      const ln = lower1(field.name);
      const ft = field.type;
      if (isStructRef(ft)) {
        L.push(`        ${ln}._resolve(mgr);`);
      } else if (isFList(ft)) {
        L.push(`        for (${boxType(ft.item)} e : ${ln}) {`);
        L.push(`            e._resolve(mgr);`);
        L.push(`        }`);
      } else if (isFMap(ft)) {
        L.push(`        for (${boxType(ft.value)} v : ${ln}.values()) {`);
        L.push(`            v._resolve(mgr);`);
        L.push(`        }`);
      }
    }
  }
  if (structural.foreignKeys().length > 0) {
    L.push(`        _resolveDirect(mgr);`);
  }
  L.push(`    }`);

  return L.join('\n');
}

// ---------------------------------------------------------------------------
// genResolveDirect — GenResolveDirect.jte
// ---------------------------------------------------------------------------

export function genResolveDirect(codeTopPkg: string, structural: Structural): string {
  const L: string[] = [];

  L.push(`    public void _resolveDirect(${codeTopPkg}.ConfigMgr mgr) {`);
  for (const fk of structural.foreignKeys()) {
    if (isRefPrimary(fk.refKey) || isRefUniq(fk.refKey)) {
      // RefSimple
      const refSimple = fk.refKey;
      const firstField = fk.key.fieldSchemas()![0];
      const rn = refName(fk);
      const refTable = fk.refTableSchema()!;
      const firstType = firstField.type;

      if (isPrimitive(firstType) || isStructRef(firstType)) {
        const paramExpr = actualParams(fk.key.fields());
        L.push(`        ${rn} = ${tableGet(refTable, refSimple, paramExpr)};`);
        if (!(refSimple as any).nullable) {
          L.push(`        configgen.genjava.LoadValueErrs.requireNonNull(${rn}, "${structural.name()}.${fk.name} -> ${refTable.name()}", ${keyDisplayExpr(fk.key)});`);
        }
      } else if (isFList(firstType)) {
        const firstFieldName = lower1(firstField.name);
        L.push(`        if (${firstFieldName}.isEmpty()) {`);
        L.push(`            ${rn} = java.util.Collections.emptyList();`);
        L.push(`        } else {`);
        L.push(`            ${rn} = new java.util.ArrayList<>(${firstFieldName}.size());`);
        L.push(`            for (${boxType((firstType as any).item)} e : ${firstFieldName}) {`);
        L.push(`                ${refTypeOf(refTable)} r = ${tableGet(refTable, refSimple, 'e')};`);
        L.push(`                configgen.genjava.LoadValueErrs.requireNonNull(r, "${structural.name()}.${fk.name} -> ${refTable.name()}", e);`);
        L.push(`                ${rn}.add(r);`);
        L.push(`            }`);
        L.push(`        }`);
      } else if (isFMap(firstType)) {
        const firstFieldName = lower1(firstField.name);
        L.push(`        if (${firstFieldName}.isEmpty()) {`);
        L.push(`            ${rn} = java.util.Collections.emptyMap();`);
        L.push(`        } else {`);
        L.push(`            ${rn} = new java.util.LinkedHashMap<>(${firstFieldName}.size());`);
        L.push(`            for (java.util.Map.Entry<${boxType((firstType as any).key)}, ${boxType((firstType as any).value)}> e : ${firstFieldName}.entrySet()) {`);
        L.push(`                ${refTypeOf(refTable)} rv = ${tableGet(refTable, refSimple, 'e.getValue()')};`);
        L.push(`                configgen.genjava.LoadValueErrs.requireNonNull(rv, "${structural.name()}.${fk.name} -> ${refTable.name()}", e.getValue());`);
        L.push(`                ${rn}.put(e.getKey(), rv);`);
        L.push(`            }`);
        L.push(`        }`);
      }
    } else if (isRefList(fk.refKey)) {
      // RefList
      const refList = fk.refKey;
      const rn = refName(fk);
      const refTable = fk.refTableSchema()!;
      const refN = new NameableName(refTable);
      const isEnumAndNoDetail = isEnumAndHasOnlyPrimaryKeyAndEnumStr(refTable);
      const isEnum = isEEnum(refTable.entry) && !isEnumAndNoDetail;

      L.push(`        ${rn} = new java.util.ArrayList<>();`);

      if (isEnumAndNoDetail) {
        L.push(`        for (${refN.fullName} v : ${refN.fullName}.values()) {`);
      } else if (isEnum) {
        L.push(`        for (${refN.fullName} vv : ${refN.fullName}.values()) {`);
        const pkfs = refTable.primaryKey.fieldSchemas()!;
        if (pkfs.length === 1 && pkfs[0].isSeq()) {
          L.push(`            ${tableDataFullName(refTable)} v = mgr.${refN.containerPrefix}All[vv.get${upper1(refTable.primaryKey.fields()[0])}()];`);
        } else {
          L.push(`            ${tableDataFullName(refTable)} v = mgr.${refN.containerPrefix}All.get(vv.get${upper1(refTable.primaryKey.fields()[0])}());`);
        }
      } else {
        const pkfs = refTable.primaryKey.fieldSchemas()!;
        if (pkfs.length === 1 && pkfs[0].isSeq()) {
          L.push(`        for (${refTypeOf(refTable)} v : java.util.Arrays.asList(mgr.${refN.containerPrefix}All)) {`);
        } else {
          L.push(`        for (${refTypeOf(refTable)} v : mgr.${refN.containerPrefix}All.values()) {`);
        }
      }

      // Build equality condition
      const eqs: string[] = [];
      const keyFields = fk.key.fields();
      const refKeyNames = refList.keyNames();
      for (let i = 0; i < keyFields.length; i++) {
        const k = fk.key.fieldSchemas()![i];
        const rk = refKeyNames[i];
        eqs.push(equal(`v.get${upper1(rk)}()`, lower1(k.name), k.type));
      }
      L.push(`            if (${eqs.join(' && ')}) {`);
      if (isEnumAndNoDetail) {
        L.push(`                ${rn}.add(v);`);
      } else if (isEnum) {
        L.push(`                ${rn}.add(vv);`);
      } else {
        L.push(`                ${rn}.add(v);`);
      }
      L.push(`            }`);
      L.push(`        }`);
      L.push(`        ${rn} = ${rn}.isEmpty() ? java.util.Collections.emptyList() : new java.util.ArrayList<>(${rn});`);
    }
  }
  L.push(`    }`);

  return L.join('\n');
}

// ---------------------------------------------------------------------------
// genTableBuilder — GenTableBuilder.jte
// ---------------------------------------------------------------------------

export function genTableBuilder(table: TableSchema, name: NameableName): string {
  const L: string[] = [];

  L.push(`package ${name.pkg};`);
  L.push('');
  L.push(`public class ${name.className}Builder {`);

  for (const field of table.fields()) {
    L.push(`    public ${type(field.type)} ${lower1(field.name)};`);
  }
  L.push('');
  L.push('');
  L.push(`    public ${name.className} build() {`);
  for (const field of table.fields()) {
    if (!isJavaPrimitive(field.type)) {
      const fn = lower1(field.name);
      if (isStructRef(field.type)) {
        L.push(`        java.util.Objects.requireNonNull(${fn});`);
      } else {
        L.push(`        if (${fn} == null) {`);
        L.push(`            ${fn} = ${defaultValue(field.type)};`);
        L.push(`        }`);
      }
    }
  }
  L.push(`        return new ${name.className}(this);`);
  L.push(`    }`);
  L.push('');
  L.push(`}`);

  return L.join('\n');
}

// ---------------------------------------------------------------------------
// genText — Text.jte
// ---------------------------------------------------------------------------

export function genText(model: JavaTextModel): string {
  const L: string[] = [];

  L.push(`package ${model.pkg};`);
  L.push('');
  L.push(`public class Text {`);
  for (const lang of model.languages) {
    L.push(`    private String ${lang};`);
  }
  L.push('');
  L.push(`    private Text() {`);
  L.push(`    }`);
  L.push('');

  // Constructor with all languages
  const ctorParams = model.languages.map((l) => `String ${l}`).join(', ');
  L.push(`    public Text(${ctorParams}) {`);
  for (const lang of model.languages) {
    L.push(`        this.${lang} = ${lang};`);
  }
  L.push(`    }`);
  L.push('');

  // _create
  L.push(`    public static Text _create(configgen.genjava.ConfigInput input) {`);
  L.push(`        Text self = new Text();`);
  L.push(`        String[] texts = input.readTextsInPool();`);
  for (let i = 0; i < model.languages.length; i++) {
    L.push(`        self.${model.languages[i]} = texts[${i}];`);
  }
  L.push(`        return self;`);
  L.push(`    }`);
  L.push('');

  // Getters
  for (const lang of model.languages) {
    L.push(`    public String get${upper1(lang)}() {`);
    L.push(`        return ${lang};`);
    L.push(`    }`);
    L.push('');
  }

  L.push(`    @Override`);
  L.push(`    public String toString() {`);
  L.push(`        return "Text(" + ${model.join()} + ")";`);
  L.push(`    }`);
  L.push(`}`);

  return L.join('\n');
}
