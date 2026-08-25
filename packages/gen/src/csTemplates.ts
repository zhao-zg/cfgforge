/**
 * csTemplates — TypeScript equivalents of the 7 JTE templates in `jte/cs/`.
 *
 * Each function returns a string that becomes part of the generated .cs files.
 * The templates use CsStructModel, CsInterfaceModel, CsModuleModel, CsProcessorModel
 * for type/code generation.
 *
 * Java templates ported:
 * 1. GenStruct.jte        → genStruct (struct/table/enum class definition)
 * 2. GenInterface.jte     → genInterface (partial interface definition)
 * 3. GenMapGetBy.jte      → genMapGetBy (static Get/GetBy methods + Key class)
 * 4. Processor.jte        → genProcessor (Processor.cs table dispatch)
 * 5. ServerText.jte       → genServerText (server-side multi-language Text class)
 * 6. ClientText.jte       → genClientText (client-side Text class with TextPool)
 * 7. GenModuleLoader.jte  → genModuleLoader (module loader with Initialize/Resolve/_create)
 */

import {
  Primitive,
  isPrimitive,
  isStructRef,
  isFList,
  isFMap,
  isSimpleType,
  type FieldType,
  type FList as FListType,
  type FMap as FMapType,
} from '@cfggen/schema';
import {
  hasRef,
  hasRefFieldType,
  isEEnum,
  isEEntry,
  isRefList,
  isRefPrimary,
  isRefUniq,
  type RefSimple,
  type TableSchema,
  type StructSchema,
  type InterfaceSchema,
  type FieldSchema,
  type ForeignKeySchema,
  type KeySchema,
  type Nameable,
} from '@cfggen/schema';
import { StructSchema as StructSchemaClass, EEntry, EEnum } from '@cfggen/schema';
import { removeLineSep, upper1, lower1 } from '@cfggen/shared';
import type { CsCodeGenerator } from './CsCodeGenerator';
import { CsStructModel } from './CsStructModel';
import { CsInterfaceModel } from './CsInterfaceModel';
import { CsModuleModel, NamespaceGroup } from './CsModuleModel';
import { CsProcessorModel } from './CsProcessorModel';
import { CsName } from './CsName';

// ---------------------------------------------------------------------------
// 1. genMapGetBy (GenMapGetBy.jte)
// ---------------------------------------------------------------------------

export function genMapGetBy(
  model: CsStructModel,
  keySchema: KeySchema,
  isPrimaryKey: boolean,
): string {
  const lines: string[] = [];

  // Multi-field key: generate Key class
  const fieldSchemas = keySchema.fieldSchemas()!;
  if (fieldSchemas.length > 1) {
    const keyClassName = model.keyClassName(keySchema);
    lines.push(`    class ${keyClassName}`);
    lines.push(`    {`);
    for (const field of fieldSchemas) {
      lines.push(`        readonly ${model.type(field.type)} ${upper1(field.name)};`);
    }
    lines.push(``);
    lines.push(`        public ${keyClassName}(${model.formalParams(fieldSchemas)})`);
    lines.push(`        {`);
    for (const field of fieldSchemas) {
      lines.push(`            ${upper1(field.name)} = ${lower1(field.name)};`);
    }
    lines.push(`        }`);
    lines.push(``);
    lines.push(`        public override int GetHashCode()`);
    lines.push(`        {`);
    lines.push(`            return ${model.hashCodes(fieldSchemas)};`);
    lines.push(`        }`);
    lines.push(``);
    lines.push(`        public override bool Equals(object? obj)`);
    lines.push(`        {`);
    lines.push(`            if (obj == null) return false;`);
    lines.push(`            if (obj == this) return true;`);
    lines.push(`            var o = obj as ${keyClassName};`);
    lines.push(`            return o != null && ${model.equals(fieldSchemas)};`);
    lines.push(`        }`);
    lines.push(`    }`);
    lines.push(``);
  }

  const className = model.dictValueType();
  const mapName = isPrimaryKey ? '_all' : model.uniqueKeyMapName(keySchema);
  const getByName = isPrimaryKey ? 'Get' : model.uniqueKeyGetByName(keySchema);

  if (model.isSeqKey(keySchema)) {
    lines.push(`    private static ${model.dictValueType()}[] ${mapName} = null!;`);
    lines.push(``);
    lines.push(`    public static ${className}? ${getByName}(${model.formalParams(fieldSchemas)})`);
    lines.push(`    {`);
    lines.push(`        var key = ${model.actualParamsKey(keySchema)};`);
    lines.push(`        return key >= 0 && key < ${mapName}.Length ? ${mapName}[key] : null;`);
    lines.push(`    }`);
  } else {
    const allType = model.dictType(keySchema);
    lines.push(`    private static ${allType} ${mapName} = null!;`);
    lines.push(``);
    lines.push(`    public static ${className}? ${getByName}(${model.formalParams(fieldSchemas)})`);
    lines.push(`    {`);
    lines.push(`        return ${mapName}.GetValueOrDefault(${model.actualParamsKey(keySchema)});`);
    lines.push(`    }`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 2. genStruct (GenStruct.jte)
// ---------------------------------------------------------------------------

export function genStruct(model: CsStructModel): string {
  const className = model.name.className;
  const structural = model.structural;
  const lines: string[] = [];

  // Check if this struct is an interface impl
  let nullableInterface: InterfaceSchema | null = null;
  if (structural instanceof StructSchemaClass) {
    nullableInterface = structural.nullableInterface();
  }
  const isImpl = nullableInterface !== null;
  const isEnum = model.isEnum();

  // using statements (unity only)
  if (model.unity) {
    lines.push('using System;');
    lines.push('using System.Collections.Generic;');
    lines.push('');
  }

  // namespace line
  lines.push(model.nsLine());
  lines.push('');

  if (isImpl) {
    // Interface impl class
    lines.push(`    public partial class ${className} : ${model.fullName(nullableInterface!)}`);
    lines.push(`    {`);
    const enumRefTable = nullableInterface!.nullableEnumRefTable();
    if (enumRefTable !== null) {
      lines.push(`        public ${model.fullName(enumRefTable)} type() {`);
      lines.push(`            return ${model.fullName(enumRefTable)}.${upper1(structural.name())};`);
      lines.push(`        }`);
      lines.push(``);
    }
  } else if (isEnum) {
    // Enum definition
    lines.push(`    public enum ${className}`);
    lines.push(`    {`);
    if (model.vTable!.enumNames !== null) {
      for (const enumName of model.vTable!.enumNames) {
        lines.push(`        ${upper1(enumName)},`);
      }
    }
    lines.push(`    }`);
    lines.push(``);
    lines.push(`    public partial class ${className}Info`);
    lines.push(`    {`);
  } else {
    // Regular struct/table class
    lines.push(`    public partial class ${className}`);
    lines.push(`    {`);
    const hasEntry = model.hasEntry();
    if (hasEntry && model.vTable!.enumNames !== null) {
      for (const enumName of model.vTable!.enumNames) {
        lines.push(`        public static ${className} ${upper1(enumName)} { get; private set; } = null!;`);
      }
      lines.push(``);
      lines.push(``);
    }
  }

  // Field properties
  for (const field of structural.fields()) {
    const comment = field.comment().length > 0 ? ` /* ${removeLineSep(field.comment())} */` : '';
    lines.push(`        public ${model.requiredKeyword()}${model.type(field.type)} ${upper1(field.name)} { get; init; }${model.nullInit(field.type)}${comment}`);
  }

  // EEnum property for enum tables
  if (isEnum) {
    lines.push(`        public ${model.requiredKeyword()}${className} EEnum { get; init; }`);
  }

  // Ref properties
  for (const fk of structural.foreignKeys()) {
    const refInit = CsStructModel.refInit(fk);
    lines.push(`        public ${model.refType(fk)} ${model.refName(fk)} { get; private set; }${refInit}`);
  }

  // Table static Get/All
  if (model.vTable !== null) {
    const table = model.vTable.schema;
    const primarySeq = model.isSeqKey(table.primaryKey);
    if (model.unity && !primarySeq) {
      lines.push(`        private static IReadOnlyList<${model.dictValueType()}> _allList = null!;`);
    }
    lines.push(genMapGetBy(model, table.primaryKey, true));
    for (const uk of table.uniqueKeys()) {
      lines.push(genMapGetBy(model, uk, false));
    }

    // All() method
    const allReturnType = `${className}${isEnum ? 'Info' : ''}`;
    lines.push(``);
    lines.push(`        public static IReadOnlyList<${allReturnType}> All()`);
    lines.push(`        {`);
    if (primarySeq) {
      lines.push(`            return _all;`);
    } else {
      if (model.unity) {
        lines.push(`            return _allList;`);
      } else {
        lines.push(`            return _all.Values;`);
      }
    }
    lines.push(`        }`);
  }

  lines.push(`    }`);

  // Enum extensions class
  if (isEnum) {
    lines.push(``);
    lines.push(``);
    lines.push(`public static class ${className}Extensions`);
    lines.push(`{`);
    const enumCount = model.vTable!.enumNames !== null ? model.vTable!.enumNames.size : 0;
    lines.push(`    internal static readonly ${className}Info[] _infos = new ${className}Info[${enumCount}];`);
    lines.push(``);
    lines.push(`    public static ${className}Info Info(this ${className} e)`);
    lines.push(`    {`);
    lines.push(`        return _infos[(int)e];`);
    lines.push(`    }`);
    lines.push(`}`);
  }

  // Close namespace (unity only)
  if (model.unity) {
    lines.push(`}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 3. genInterface (GenInterface.jte)
// ---------------------------------------------------------------------------

export function genInterface(model: CsInterfaceModel): string {

  const lines: string[] = [];

  if (model.unity) {
    lines.push('using System;');
    lines.push('using System.Collections.Generic;');
    lines.push('');
  }

  lines.push(model.nsLine());
  lines.push('');
  lines.push(`public partial interface ${model.name.className}`);
  lines.push(`{`);
  const enumRefTable = model.sInterface.nullableEnumRefTable();
  if (enumRefTable !== null) {
    lines.push(`    public ${model.fullName(enumRefTable)} type();`);
  }
  lines.push(`}`);

  if (model.unity) {
    lines.push(`}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 4. genProcessor (Processor.jte)
// ---------------------------------------------------------------------------

export function genProcessor(model: CsProcessorModel): string {
  const lines: string[] = [];

  if (model.unity) {
    lines.push('using System;');
    lines.push('using System.Collections.Generic;');
    lines.push('');
  }

  lines.push(model.nsLine());
  lines.push('');
  lines.push(`public static class Processor`);
  lines.push(`{`);
  lines.push(`    // 从 bytes 文件加载（新格式）`);
  lines.push(`    public static void Process(ConfigReader reader)`);
  lines.push(`    {`);
  lines.push(`        var configNulls = new List<string>`);
  lines.push(`        {`);
  for (const table of model.tableSchemas) {
    lines.push(`            "${table.name()}",`);
  }
  lines.push(`        };`);
  lines.push(``);
  lines.push(`        // 读取表数量`);
  lines.push(`        int tableCount = reader.ReadInt32();`);
  lines.push(``);
  lines.push(`        for (int i = 0; i < tableCount; i++)`);
  lines.push(`        {`);
  lines.push(`            // 读取表名`);
  lines.push(`            string tableName = reader.ReadTableName();`);
  lines.push(`            // 读取表大小`);
  lines.push(`            int tableSize = reader.ReadInt32();`);
  lines.push(``);
  lines.push(`            // 根据表名分发到对应的 Initialize 方法`);
  lines.push(`            switch(tableName)`);
  lines.push(`            {`);
  for (const table of model.tableSchemas) {
    lines.push(`                case "${table.name()}":`);
    lines.push(`                    configNulls.Remove(tableName);`);
    lines.push(`                    ${model.fullName(table)}.Initialize(reader);`);
    lines.push(`                    break;`);
  }
  lines.push(`                default:`);
  lines.push(`                    // 未知表，跳过`);
  lines.push(`                    reader.SkipBytes(tableSize);`);
  lines.push(`                    break;`);
  lines.push(`            }`);
  lines.push(`        }`);
  lines.push(`        foreach (var t in configNulls)`);
  lines.push(`            reader.TableNotInData(t);`);
  lines.push(`        // 解析外键引用`);
  for (const table of model.tableSchemas) {
    if (hasRef(table)) {
      lines.push(`        ${model.fullName(table)}.Resolve(reader);`);
    }
  }
  lines.push(`    }`);
  lines.push(`}`);

  if (model.unity) {
    lines.push(`}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 5. genServerText (ServerText.jte)
// ---------------------------------------------------------------------------

export function genServerText(pkg: string, languages: string[], unity: boolean): string {
  const lines: string[] = [];

  if (unity) {
    lines.push('using System;');
    lines.push('using System.Collections.Generic;');
  }

  lines.push(unity ? `namespace ${pkg}\n{` : `namespace ${pkg};`);
  lines.push('');
  lines.push(`public partial class Text`);
  lines.push(`{`);
  for (const lang of languages) {
    if (unity) {
      lines.push(`    public string ${lang} { get; init; } = null!;`);
    } else {
      lines.push(`    public required string ${lang} { get; init; }`);
    }
  }
  lines.push(`    private Text() {}`);
  lines.push('');
  lines.push(`    public override string ToString()`);
  lines.push(`    {`);
  lines.push(`        return "(" + ${languages.map(l => 'this.' + l).join(' + "," + ')} + ")";`);
  lines.push(`    }`);
  lines.push('');
  lines.push(`    internal static Text _create(ConfigReader reader)`);
  lines.push(`    {`);
  lines.push(`        string[] texts = reader.ReadTextsInPool();`);
  lines.push(`        return new Text`);
  lines.push(`        {`);
  for (let i = 0; i < languages.length; i++) {
    lines.push(`            ${languages[i]} = texts[${i}],`);
  }
  lines.push(`        };`);
  lines.push(`    }`);
  lines.push(`}`);
  if (unity) {
    lines.push(`}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 6. genClientText (ClientText.jte)
// ---------------------------------------------------------------------------

export function genClientText(pkg: string, unity: boolean): string {
  const lines: string[] = [];

  if (unity) {
    lines.push('using System;');
    lines.push('using System.Collections.Generic;');
  }

  lines.push(unity ? `namespace ${pkg}\n{` : `namespace ${pkg};`);
  lines.push('');

  if (unity) {
    lines.push(`public partial class Text`);
    lines.push(`{`);
    lines.push(`    private readonly int _index;`);
    lines.push('');
    lines.push(`    public Text(int index)`);
    lines.push(`    {`);
    lines.push(`        _index = index;`);
    lines.push(`    }`);
    lines.push('');
    lines.push(`    // 对外接口：从全局文本数组获取文本`);
    lines.push(`    public string T => TextPoolManager.GetText(_index);`);
  } else {
    lines.push(`public partial class Text(int index)`);
    lines.push(`{`);
    lines.push(`    // 对外接口：从全局文本数组获取文本`);
    lines.push(`    public string T => TextPoolManager.GetText(index);`);
  }

  lines.push('');
  lines.push(`    public override string ToString()`);
  lines.push(`    {`);
  lines.push(`        return T;`);
  lines.push(`    }`);
  lines.push('');
  lines.push(`    internal static Text _create(ConfigReader reader)`);
  lines.push(`    {`);
  lines.push(`        return new Text(reader.ReadTextIndex());`);
  lines.push(`    }`);
  lines.push(`}`);
  if (unity) {
    lines.push(`}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 7. genModuleLoader (GenModuleLoader.jte)
// ---------------------------------------------------------------------------

export function genModuleLoader(model: CsModuleModel): string {
  const lines: string[] = [];

  // using statements
  if (model.unity) {
    lines.push('using System;');
    lines.push('using System.Collections.Generic;');
  } else {
    if (model.hasTable()) {
      lines.push('    using System.Collections.Frozen;');
      lines.push('');
    }
  }

  for (const group of model.groupsList()) {
    lines.push('');
    lines.push(`namespace ${group.ns}`);
    lines.push(`{`);

    for (const sm of group.structs) {
      genStructLoaderPart(lines, model, sm);
    }

    for (const im of group.interfaces) {
      genInterfaceLoaderPart(lines, model, im);
    }

    lines.push(`}`);
  }

  return lines.join('\n');
}

function genStructLoaderPart(
  lines: string[],
  model: CsModuleModel,
  sm: CsStructModel,
): void {
  const className = sm.name.className + (sm.isEnum() ? 'Info' : '');
  const nullableInterface =
    sm.structural instanceof StructSchemaClass ? sm.structural.nullableInterface() : null;
  const isImpl = nullableInterface !== null;

  lines.push('');
  lines.push(`    public partial class ${className}`);
  lines.push(`    {`);

  if (sm.vTable !== null) {
    const table = sm.vTable.schema;
    const primarySeq = sm.isSeqKey(table.primaryKey);

    lines.push(`        internal static void Initialize(ConfigReader reader)`);
    lines.push(`        {`);
    lines.push(`            int count = reader.ReadInt32();`);
    lines.push(`            var list = new List<${className}>(count);`);
    lines.push(`            for (int i = 0; i < count; i++)`);
    lines.push(`                list.Add(_create(reader));`);
    lines.push(`            InitializeAll(list, reader);`);
    lines.push(`        }`);
    lines.push('');
    lines.push(`        internal static void InitializeAll(List<${className}> list, IIssueHandler handler)`);
    lines.push(`        {`);
    lines.push(`            int count = list.Count;`);

    if (primarySeq) {
      lines.push(`            var s_all = new ${sm.dictValueType()}[count];`);
    } else {
      lines.push(`            var s_all = new ${sm.dictTypeWhenInit(table.primaryKey)}(count);`);
    }

    for (const uk of table.uniqueKeys()) {
      if (sm.isSeqKey(uk)) {
        lines.push(`            var s${sm.uniqueKeyMapName(uk)} = new ${sm.dictValueType()}[count];`);
      } else {
        lines.push(`            var s${sm.uniqueKeyMapName(uk)} = new ${sm.dictTypeWhenInit(uk)}(count);`);
      }
    }

    // EEntry enum names
    if (isEEntry(table.entry)) {
      if (sm.vTable.enumNames !== null) {
        for (const enumName of sm.vTable.enumNames) {
          lines.push(`            ${className}? e${sm.upper1Fn(enumName)} = null;`);
        }
      }
    }

    lines.push('');
    lines.push(`            foreach (var self in list)`);
    lines.push(`            {`);
    if (primarySeq) {
      lines.push(`                s_all[${sm.actualParamsKeySelf(table.primaryKey)}] = self;`);
    } else {
      lines.push(`                s_all.Add(${sm.actualParamsKeySelf(table.primaryKey)}, self);`);
    }
    for (const uk of table.uniqueKeys()) {
      if (sm.isSeqKey(uk)) {
        lines.push(`                s${sm.uniqueKeyMapName(uk)}[${sm.actualParamsKeySelf(uk)}] = self;`);
      } else {
        lines.push(`                s${sm.uniqueKeyMapName(uk)}.Add(${sm.actualParamsKeySelf(uk)}, self);`);
      }
    }
    if (sm.isEnum()) {
      lines.push(`                ${sm.name.className}Extensions._infos[(int)self.EEnum] = self;`);
    }

    // EEntry switch
    if (isEEntry(table.entry)) {
      const eEntry = table.entry as EEntry;
      const ef = sm.upper1Fn(eEntry.field);
      lines.push('');
      lines.push(`                if (self.${ef}.Length == 0)`);
      lines.push(`                    continue;`);
      lines.push(`                switch(self.${ef})`);
      lines.push(`                {`);
      if (sm.vTable.enumNames !== null) {
        for (const enumName of sm.vTable.enumNames) {
          lines.push(`                    case "${enumName}":`);
          lines.push(`                        if (e${sm.upper1Fn(enumName)} != null)`);
          lines.push(`                            handler.EnumDuplicateInData("${enumName}");`);
          lines.push(`                        e${sm.upper1Fn(enumName)} = self;`);
          lines.push(`                        break;`);
        }
      }
      lines.push(`                    default:`);
      lines.push(`                        handler.EnumNotInCode(self.${ef});`);
      lines.push(`                        break;`);
      lines.push(`                }`);
    }

    lines.push(`            }`);

    // Assign to static fields
    if (primarySeq) {
      lines.push(`            _all = s_all;`);
    } else {
      if (sm.unity) {
        lines.push(`            _all = s_all;`);
        lines.push(`            _allList = list;`);
      } else {
        lines.push(`            _all = s_all.ToFrozenDictionary();`);
      }
    }
    for (const uk of table.uniqueKeys()) {
      const mapName = sm.uniqueKeyMapName(uk);
      if (sm.unity) {
        lines.push(`            ${mapName} = s${mapName};`);
      } else {
        if (sm.isSeqKey(uk)) {
          lines.push(`            ${mapName} = s${mapName};`);
        } else {
          lines.push(`            ${mapName} = s${mapName}.ToFrozenDictionary();`);
        }
      }
    }

    // EEntry enum name assignment
    if (isEEntry(table.entry)) {
      if (sm.vTable.enumNames !== null) {
        for (const enumName of sm.vTable.enumNames) {
          lines.push(`            if (e${sm.upper1Fn(enumName)} == null) handler.EnumNotInData("${enumName}");`);
          lines.push(`            else ${sm.upper1Fn(enumName)} = e${sm.upper1Fn(enumName)};`);
        }
      }
    }

    lines.push(`        }`);

    // Resolve method
    if (hasRef(sm.structural)) {
      lines.push('');
      lines.push(`        internal static void Resolve(IIssueHandler h)`);
      lines.push(`        {`);
      lines.push(`            foreach (var v in All())`);
      lines.push(`                v._resolve(h);`);
      lines.push(`        }`);
    }
  }

  // _create method
  lines.push('');
  lines.push(`        internal static ${className} _create(ConfigReader reader)`);
  lines.push(`        {`);
  const fields = sm.structural.fields();
  for (const field of fields) {
    const n = CsStructModel.lower1Static(field.name);
    const t = field.type;
    if (isFList(t)) {
      const item = (t as FListType).item;
      lines.push(`            int Count_${n} = reader.ReadInt32();`);
      lines.push(`            var ${n} = new ${sm.type(t)}(Count_${n});`);
      lines.push(`            for (int i = 0; i < Count_${n}; i++)`);
      lines.push(`                ${n}.Add(${sm.create(item)});`);
    } else if (isFMap(t)) {
      const fmap = t as FMapType;
      lines.push(`            int Count_${n} = reader.ReadInt32();`);
      lines.push(`            var ${n} = new ${sm.type(t)}(Count_${n});`);
      lines.push(`            for (int i = 0; i < Count_${n}; i++)`);
      lines.push(`                ${n}.Add(${sm.create(fmap.key)}, ${sm.create(fmap.value)});`);
    } else {
      lines.push(`            var ${n} = ${sm.create(t)};`);
    }
  }
  if (fields.length === 0) {
    lines.push(`            return new ${className}();`);
  } else {
    lines.push(`            return new ${className} {`);
    for (const field of fields) {
      lines.push(`                ${sm.upper1Fn(field.name)} = ${CsStructModel.lower1Static(field.name)},`);
    }
    if (sm.isEnum()) {
      const eEnum = sm.vTable!.schema.entry as EEnum;
      if (sm.unity) {
        lines.push(`                EEnum = (${sm.name.className})Enum.Parse(typeof(${sm.name.className}), StringUtil.UpperFirstChar(${CsStructModel.lower1Static(eEnum.field)}))`);
      } else {
        lines.push(`                EEnum = Enum.Parse<${sm.name.className}>(StringUtil.UpperFirstChar(${CsStructModel.lower1Static(eEnum.field)}))`);
      }
    }
    lines.push(`            };`);
  }
  lines.push(`        }`);

  // hash, equal, toString
  const hasFields = fields.length > 0;
  lines.push('');
  if (!hasFields) {
    lines.push(`        public override int GetHashCode()`);
    lines.push(`        {`);
    lines.push(`            return this.GetType().GetHashCode();`);
    lines.push(`        }`);
    lines.push('');
    lines.push(`        public override bool Equals(object? obj)`);
    lines.push(`        {`);
    lines.push(`            if (obj == null) return false;`);
    lines.push(`            if (obj == this) return true;`);
    lines.push(`            var o = obj as ${className};`);
    lines.push(`            return o != null;`);
    lines.push(`        }`);
  } else {
    const keys = sm.vTable !== null ? sm.vTable.schema.primaryKey.fieldSchemas()! : fields;
    lines.push(`        public override int GetHashCode()`);
    lines.push(`        {`);
    lines.push(`            return ${sm.hashCodes(keys)};`);
    lines.push(`        }`);
    lines.push('');
    lines.push(`        public override bool Equals(object? obj)`);
    lines.push(`        {`);
    lines.push(`            if (obj == null) return false;`);
    lines.push(`            if (obj == this) return true;`);
    lines.push(`            var o = obj as ${className};`);
    lines.push(`            return o != null && ${sm.equals(keys)};`);
    lines.push(`        }`);
    lines.push('');
    lines.push(`        public override string ToString()`);
    lines.push(`        {`);
    lines.push(`            return "(" + ${sm.toStrings(fields)} + ")";`);
    lines.push(`        }`);
  }

  // _resolve method
  if (hasRef(sm.structural)) {
    lines.push('');
    lines.push(`        ${isImpl ? 'public' : 'internal'} void _resolve(IIssueHandler h)`);
    lines.push(`        {`);
    // Resolve struct refs in fields
    for (const field of fields) {
      const type = field.type;
      if (hasRefFieldType(type)) {
        if (isStructRef(type)) {
          lines.push(`            ${sm.upper1Fn(field.name)}._resolve(h);`);
        } else if (isFList(type)) {
          lines.push(`            foreach(var e in ${sm.upper1Fn(field.name)})`);
          lines.push(`                e._resolve(h);`);
        } else if (isFMap(type)) {
          lines.push(`            foreach(var e in ${sm.upper1Fn(field.name)}.OrderedValues)`);
          lines.push(`                e._resolve(h);`);
        }
      }
    }

    // Resolve foreign keys
    for (const fk of sm.structural.foreignKeys()) {
      if (isRefPrimary(fk.refKey) || isRefUniq(fk.refKey)) {
        const refSimple = fk.refKey as RefSimple;
        const firstField = fk.key.fieldSchemas()![0];
        const refName = sm.refName(fk);
        const fkStr = fk.name;

        if (isSimpleType(firstField.type)) {
          if (refSimple.nullable) {
            lines.push(`            ${refName} = ${sm.tableGet(fk.refTableSchema()!, refSimple, sm.actualParams(fk.key))}${CsStructModel.isEnum(fk.refTableSchema()!) ? '?.EEnum' : ''};`);
          } else {
            lines.push(`            var r${refName} = ${sm.tableGet(fk.refTableSchema()!, refSimple, sm.actualParams(fk.key))};`);
            lines.push(`            if (r${refName} == null) h.RefNotFound("${sm.structural.name()}", "${fkStr}", ${model.upper1Fn(firstField.name)}${sm.toStringOrNot(firstField.type)});`);
            lines.push(`            else ${refName} = r${refName}${CsStructModel.isEnum(fk.refTableSchema()!) ? '.EEnum' : ''};`);
          }
        } else if (isFList(firstField.type)) {
          const flist = firstField.type as FListType;
          lines.push(`            ${refName} = ${sm.refAssignExpr(fk)};`);
          lines.push(`            foreach(var e in ${sm.upper1Fn(firstField.name)})`);
          lines.push(`            {`);
          lines.push(`                var r = ${sm.tableGet(fk.refTableSchema()!, refSimple, 'e')};`);
          lines.push(`                if (r == null) h.RefNotFound("${sm.structural.name()}", "${fkStr}", e${sm.toStringOrNot(flist.item)});`);
          lines.push(`                else ${refName}.Add(r${CsStructModel.isEnum(fk.refTableSchema()!) ? '.EEnum' : ''});`);
          lines.push(`            }`);
        } else if (isFMap(firstField.type)) {
          const fmap = firstField.type as FMapType;
          lines.push(`            ${refName} = ${sm.refAssignExpr(fk)};`);
          lines.push(`            foreach(var kv in ${sm.upper1Fn(firstField.name)})`);
          lines.push(`            {`);
          lines.push(`                var k = kv.Key;`);
          lines.push(`                var v = ${sm.tableGet(fk.refTableSchema()!, refSimple, 'kv.Value')};`);
          lines.push(`                if (v == null) h.RefNotFound("${sm.structural.name()}", "${fkStr}", kv.Value${sm.toStringOrNot(fmap.value)});`);
          lines.push(`                else ${refName}.Add(k, v${CsStructModel.isEnum(fk.refTableSchema()!) ? '.EEnum' : ''});`);
          lines.push(`            }`);
        }
      } else if (isRefList(fk.refKey)) {
        const refName = sm.refName(fk);
        lines.push(`            ${refName} = ${sm.refAssignExpr(fk)};`);
        lines.push(`            foreach (var v in ${sm.fullName(fk.refTableSchema()!)}.All())`);
        lines.push(`            {`);
        const refList = fk.refKey;
        const keyNames = refList.keyNames();
        const keyFields = fk.key.fields();
        const eqs: string[] = [];
        for (let i = 0; i < keyNames.length; i++) {
          eqs.push(`v.${sm.upper1Fn(keyNames[i])}.Equals(${sm.upper1Fn(keyFields[i])})`);
        }
        lines.push(`                if (${eqs.join(' && ')})`);
        lines.push(`                    ${refName}.Add(v);`);
        lines.push(`            }`);
      }
    }

    lines.push(`        }`);
  }

  lines.push(`    }`);
}

function genInterfaceLoaderPart(
  lines: string[],
  model: CsModuleModel,
  im: CsInterfaceModel,
): void {
  const className = im.name.className;

  lines.push('');
  lines.push(`    public partial interface ${className}`);
  lines.push(`    {`);
  if (hasRef(im.sInterface)) {
    lines.push(`        void _resolve(IIssueHandler h)`);
    lines.push(`        {`);
    lines.push(`        }`);
  }
  lines.push('');
  lines.push(`        internal static ${className} _create(ConfigReader reader)`);
  lines.push(`        {`);
  lines.push(`            var impl = reader.ReadStringInPool();`);
  lines.push(`            switch(impl)`);
  lines.push(`            {`);
  for (const implSchema of im.sInterface.impls()) {
    lines.push(`                case "${implSchema.name()}":`);
    lines.push(`                    return ${im.fullName(implSchema)}._create(reader);`);
  }
  lines.push(`            }`);
  lines.push(`            throw reader.NotFoundImpl(impl, "${im.sInterface.name()}");`);
  lines.push(`        }`);
  lines.push(`    }`);
}
