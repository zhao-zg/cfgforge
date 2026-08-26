/**
 * goTemplates — TypeScript port of Java JTE templates in `jte/go/`.
 *
 * 7 template functions:
 * - genStruct(model)       — GenStruct.jte (301 lines, most complex)
 * - genInterface(model)    — GenInterface.jte (21 lines)
 * - genCfgMgr(model)       — GenCfgMgr.jte (67 lines)
 * - genListRef(name, fk)   — GenListRef.jte (26 lines)
 * - genMapRef(name, fk)    — GenMapRef.jte (26 lines)
 * - genServerText(pkg, languages) — ServerText.jte (36 lines)
 * - genClientText(pkg)     — ClientText.jte (48 lines)
 *
 * Java templates: app/src/main/resources/jte/go/*.jte
 */

import {
  isStructRef,
  isFList,
  isFMap,
  isEEntry,
  isEEnum,
  isRefPrimary,
  isRefList,
  type StructRef,
  type FList as FListType,
  type FMap as FMapType,
} from '@cfgforge/schema';
import type {
  ForeignKeySchema,
  KeySchema,
  TableSchema,
  Structural,
} from '@cfgforge/schema';
import { upper1, lower1, removeLineSep } from '@cfgforge/shared';
import type { VTable } from '@cfgforge/value';

import { GoName } from './GoName';
import { GoStructModel } from './GoStructModel';
import type { GoInterfaceModel } from './GoInterfaceModel';
import type { GoCfgMgrModel } from './GoCfgMgrModel';

// ---------------------------------------------------------------------------
// genStruct — GenStruct.jte
// ---------------------------------------------------------------------------

export function genStruct(model: GoStructModel): string {
  const structural: Structural = model.structural;
  const className: string = model.name.className;
  const name: GoName = model.name;
  const vTable: VTable | null = model.vTable;
  const table: TableSchema | null = vTable ? vTable.schema : null;
  const lines: string[] = [];

  // package
  lines.push(`package ${model.pkg}`);
  lines.push('');

  // import "fmt" if fields non-empty
  if (structural.fields().length > 0) {
    lines.push('import "fmt"');
    lines.push('');
  }

  // struct definition
  lines.push(`type ${className} struct {`);
  // field properties
  for (const fieldSchema of structural.fields()) {
    const comment = fieldSchema.comment();
    const suffix = comment != null && comment.length > 0 ? ' //' + removeLineSep(comment) : '';
    lines.push(`    ${lower1(fieldSchema.name)} ${model.type(fieldSchema.type)}${suffix}`);
  }
  // ref properties
  for (const fk of structural.foreignKeys()) {
    lines.push(`    ${GoStructModel.refName(fk)} ${GoStructModel.refType(fk)}`);
  }
  lines.push('}');
  lines.push('');

  // create instance
  const streamIf = structural.fields().length === 0 ? '_' : 'stream';
  lines.push(`func create${className}(${streamIf} *Stream) *${className} {`);
  lines.push(`    v := &${className}{}`);
  for (const fieldSchema of structural.fields()) {
    const t = fieldSchema.type;
    const n = lower1(fieldSchema.name);
    if (isStructRef(t)) {
      const structRef = t as StructRef;
      lines.push(`    v.${n} = create${GoStructModel.ClassName(structRef.obj!)}(stream)`);
    } else if (isFList(t)) {
      const fList = t as FListType;
      const item = fList.item;
      lines.push(`    ${n}Size := stream.ReadInt32()`);
      lines.push(`    v.${n} = make([]${model.type(item)}, ${n}Size)`);
      lines.push(`    for i := 0; i < int(${n}Size); i++ {`);
      lines.push(`        v.${n}[i] = ${model.genReadField(item)}`);
      lines.push(`    }`);
    } else if (isFMap(t)) {
      const fMap = t as FMapType;
      const key = fMap.key;
      const value = fMap.value;
      lines.push(`    ${n}Size := stream.ReadInt32()`);
      lines.push(`    v.${n} = make(map[${model.type(key)}]${model.type(value)}, ${n}Size)`);
      lines.push(`    for i := 0; i < int(${n}Size); i++ {`);
      lines.push(`        var k = ${model.genReadField(key)}`);
      lines.push(`        v.${n}[k] = ${model.genReadField(value)}`);
      lines.push(`    }`);
    } else {
      lines.push(`    v.${n} = ${model.genReadField(t)}`);
    }
  }
  lines.push(`    return v`);
  lines.push('}');
  lines.push('');

  // String method
  const fields = structural.fields();
  lines.push(`func (t *${className}) String() string {`);
  if (fields.length === 0) {
    lines.push(`    return "${className}{}"`);
  } else {
    const formatParts = fields.map((f) => `${lower1(f.name)}=%v`).join(', ');
    const valueParts = fields.map((f) => GoStructModel.toStringField(f)).join(', ');
    lines.push(`    return fmt.Sprintf("${className}{${formatParts}}", ${valueParts})`);
  }
  lines.push('}');
  lines.push('');

  // entry (enum names)
  if (table != null && (isEEntry(table.entry) || isEEnum(table.entry))) {
    if (vTable && vTable.enumNames != null) {
      lines.push('//entries');
      lines.push('var (');
      for (const e of vTable.enumNames) {
        lines.push(`    ${lower1(e)} ${name.className}`);
      }
      lines.push(')');
      lines.push('');
    }
  }

  // getters
  if (structural.fields().length > 0) {
    lines.push('    //getters');
    for (const fieldSchema of structural.fields()) {
      lines.push(`    func (t *${name.className}) ${upper1(fieldSchema.name)}() ${model.type(fieldSchema.type)} {`);
      lines.push(`        return t.${lower1(fieldSchema.name)}`);
      lines.push(`    }`);
      lines.push('');
    }
  }

  // refs
  if (structural.foreignKeys().length > 0) {
    // list ref and map ref
    for (const fk of structural.foreignKeys()) {
      const keySchema = fk.key;
      const firstField = keySchema.fieldSchemas()![0];
      if (isFMap(firstField.type)) {
        lines.push(genMapRef(name, fk));
      }
      if (isFList(firstField.type)) {
        lines.push(genListRef(name, fk));
      }
    }

    // other refs (RefPrimary/RefList with simple/list key types)
    for (const fk of structural.foreignKeys()) {
      const refName = GoStructModel.refName(fk);
      const refNameLower = lower1(refName);
      const refTypeStr = GoStructModel.refType(fk);
      const refTbName = new GoName(fk.refTableSchema()!);
      const refTableClassName = refTbName.className;
      const fieldType = fk.key.fieldSchemas()![0].type;
      const refKey = fk.refKey;
      const keyFields = fk.key.fieldSchemas()!;
      const keyFieldCount = keyFields.length;

      let getFuncName: string | null = null;
      if (isRefPrimary(refKey)) {
        if (!isFMap(fieldType) && !isFList(fieldType)) {
          getFuncName = GoStructModel.GetFuncName(fk.key, true);
        }
      } else if (isRefList(refKey)) {
        getFuncName = 'GetAllBy' + upper1(fk.key.fieldSchemas()![0].name);
      }

      if (getFuncName != null) {
        lines.push(`func (t *${className}) ${refName}() ${refTypeStr} {`);
        lines.push(`    if t.${refNameLower} == nil {`);
        if (keyFieldCount > 1) {
          const paramVarsInT = keyFields.map((f) => `t.${lower1(f.name)}`).join(', ');
          lines.push(`        t.${refNameLower} = Get${refTableClassName}Mgr().${getFuncName}(${paramVarsInT})`);
        } else {
          const varName = lower1(fk.key.fieldSchemas()![0].name);
          lines.push(`        t.${refNameLower} = Get${refTableClassName}Mgr().${getFuncName}(t.${varName})`);
        }
        lines.push(`    }`);
        lines.push(`    return t.${refNameLower}`);
        lines.push(`}`);
        lines.push('');
      }
    }
  }

  // table-specific: enum getters, key structs, Mgr struct, Init
  if (table != null) {
    // EnumGetter
    if (isEEntry(table.entry) || isEEnum(table.entry)) {
      if (vTable && vTable.enumNames != null) {
        const tableName = new GoName(vTable.schema);
        for (const e of vTable.enumNames) {
          lines.push(`func (t *${tableName.className}Mgr) Get${upper1(e)}() *${tableName.className} {`);
          lines.push(`    return &${lower1(e)}`);
          lines.push(`}`);
          lines.push('');
        }
      }
    }

    // keySchemas = [primaryKey, ...uniqueKeys]
    const keySchemas: KeySchema[] = [];
    keySchemas.push(table.primaryKey);
    for (const uk of table.uniqueKeys()) {
      keySchemas.push(uk);
    }

    // multi-field key struct types
    for (const keySchema of keySchemas) {
      if (keySchema.fieldSchemas()!.length > 1) {
        lines.push(`type ${GoStructModel.keyClassName(keySchema)} struct {`);
        for (const field of keySchema.fieldSchemas()!) {
          lines.push(`    ${lower1(field.name)} ${model.type(field.type)}`);
        }
        lines.push('}');
        lines.push('');
      }
    }

    // Mgr struct
    lines.push(`type ${className}Mgr struct {`);
    lines.push(`    all []*${className}`);
    for (const keySchema of keySchemas) {
      const fieldSchemas = keySchema.fieldSchemas()!;
      if (fieldSchemas.length === 1 && fieldSchemas[0].isSeq()) {
        lines.push(`    ${GoStructModel.mapName(keySchema)}Arr []*${name.className}`);
      } else {
        lines.push(`    ${GoStructModel.mapName(keySchema)}Map map[${GoStructModel.keyClassName(keySchema)}]*${name.className}`);
      }
    }
    // multi-field primary key: extra mapList for each field
    if (table.primaryKey.fieldSchemas()!.length > 1) {
      for (const fieldSchema of table.primaryKey.fieldSchemas()!) {
        lines.push(`    ${fieldSchema.name}MapList map[${model.type(fieldSchema.type)}][]*${className}`);
      }
    }
    lines.push('}');
    lines.push('');

    // GetAll
    lines.push(`func(t *${className}Mgr) GetAll() []*${className} {`);
    lines.push(`    return t.all`);
    lines.push('}');
    lines.push('');

    // Get functions for each key
    for (const keySchema of keySchemas) {
      const isPrimaryKey = keySchema.equals(table.primaryKey);
      const fieldSchemas = keySchema.fieldSchemas()!;
      const fieldCnt = fieldSchemas.length;
      const paramVars = GoStructModel.GetParamVars(keySchema);
      const varDefines = GoStructModel.GetVarDefines(keySchema);
      const getFuncName = GoStructModel.GetFuncName(keySchema, isPrimaryKey);
      const IdType = GoStructModel.keyClassName(keySchema);
      const mapName = GoStructModel.mapName(keySchema);
      const isSeq = fieldCnt === 1 && fieldSchemas[0].isSeq();

      if (isSeq) {
        lines.push(`func(t *${className}Mgr) ${getFuncName}(${varDefines}) *${className} {`);
        lines.push(`    if ${paramVars} < 0 || int(${paramVars}) >= len(t.${mapName}Arr) {`);
        lines.push(`        return nil`);
        lines.push(`    }`);
        lines.push(`    return t.${mapName}Arr[${paramVars}]`);
        lines.push(`}`);
        lines.push('');
      } else if (fieldCnt > 1) {
        lines.push(`func(t *${className}Mgr) ${getFuncName}(${varDefines}) *${className} {`);
        lines.push(`    return t.${mapName}Map[${IdType}{${paramVars}}]`);
        lines.push(`}`);
        lines.push('');
      } else {
        lines.push(`func(t *${className}Mgr) ${getFuncName}(${varDefines}) *${className} {`);
        lines.push(`    return t.${mapName}Map[${paramVars}]`);
        lines.push(`}`);
        lines.push('');
      }
    }

    // multi-field primary key: GetAllByFieldName methods
    if (table.primaryKey.fieldSchemas()!.length > 1) {
      for (const fieldSchema of table.primaryKey.fieldSchemas()!) {
        const mapName = fieldSchema.name;
        const codeGetByFuncName = 'GetAllBy' + upper1(fieldSchema.name);
        const IdType = model.type(fieldSchema.type);
        lines.push(`func (t *${className}Mgr) ${codeGetByFuncName}(${mapName} ${IdType}) []*${className} {`);
        lines.push(`    if t.${mapName}MapList == nil {`);
        lines.push(`        t.${mapName}MapList = make(map[${IdType}][]*${className})`);
        lines.push(`        for _, item := range t.all {`);
        lines.push(`            t.${mapName}MapList[item.${mapName}] = append(t.${mapName}MapList[item.${mapName}], item)`);
        lines.push(`        }`);
        lines.push(`    }`);
        lines.push(`    return t.${mapName}MapList[${mapName}]`);
        lines.push(`}`);
        lines.push('');
      }
    }

    // Init
    lines.push(`func (t *${className}Mgr) Init(stream *Stream) {`);
    lines.push(`    cnt := stream.ReadInt32()`);
    lines.push(`    t.all = make([]*${className}, 0, cnt)`);
    for (const keySchema of keySchemas) {
      const mapName = GoStructModel.mapName(keySchema);
      const IdType = GoStructModel.keyClassName(keySchema);
      const initIsSeq = keySchema.fieldSchemas()!.length === 1 && keySchema.fieldSchemas()![0].isSeq();
      if (initIsSeq) {
        lines.push(`    t.${mapName}Arr = make([]*${className}, cnt)`);
      } else {
        lines.push(`    t.${mapName}Map = make(map[${IdType}]*${className}, cnt)`);
      }
    }
    lines.push(`    for i := 0; i < int(cnt); i++ {`);
    lines.push(`        v := create${className}(stream)`);
    lines.push(`        t.all = append(t.all, v)`);
    for (const keySchema of keySchemas) {
      const fieldSchemas = keySchema.fieldSchemas()!;
      const fieldCnt = fieldSchemas.length;
      const mapName = GoStructModel.mapName(keySchema);
      const IdType = GoStructModel.keyClassName(keySchema);
      const paramVarsInV = GoStructModel.GetParamVarsInV(keySchema, 'v');
      const loopIsSeq = fieldCnt === 1 && fieldSchemas[0].isSeq();
      if (loopIsSeq) {
        lines.push(`        t.${mapName}Arr[${paramVarsInV}] = v`);
      } else if (fieldCnt > 1) {
        lines.push(`        t.${mapName}Map[${IdType}{${paramVarsInV}}] = v`);
      } else {
        lines.push(`        t.${mapName}Map[${paramVarsInV}] = v`);
      }
    }
    // enum switch
    if (vTable && vTable.enumNames != null) {
      const entry = vTable.schema.entry;
      let entryVarName: string | null = null;
      if (isEEntry(entry)) {
        entryVarName = entry.field;
      } else if (isEEnum(entry)) {
        entryVarName = entry.field;
      }
      if (entryVarName) {
        lines.push(`        switch v.${lower1(entryVarName)} {`);
        for (const enumName of vTable.enumNames) {
          lines.push(`        case "${upper1(enumName)}":`);
          lines.push(`            ${lower1(enumName)} = *v`);
        }
        lines.push(`        }`);
      }
    }
    lines.push(`    }`);
    lines.push('}');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// genInterface — GenInterface.jte
// ---------------------------------------------------------------------------

export function genInterface(model: GoInterfaceModel): string {
  const className = model.name.className;
  const sInterface = model.sInterface;
  const lines: string[] = [];

  lines.push(`package ${model.pkg}`);
  lines.push('');
  lines.push('');
  lines.push(`type ${className} interface{}`);
  lines.push('');
  lines.push(`func create${className}(stream *Stream) ${className} {`);
  lines.push(`    var typeName = stream.ReadStringInPool()`);
  lines.push(`    switch typeName {`);
  for (const impl of sInterface.impls()) {
    const implClassName = new GoName(impl).className;
    lines.push(`    case "${impl.name()}":`);
    lines.push(`        return create${implClassName}(stream)`);
  }
  lines.push(`    default:`);
  lines.push(`        panic("unexpected ${className} type: " + typeName)`);
  lines.push(`    }`);
  lines.push(`}`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// genCfgMgr — GenCfgMgr.jte
// ---------------------------------------------------------------------------

export function genCfgMgr(model: GoCfgMgrModel): string {
  const pkg = model.pkg;
  const cfgValue = model.cfgValue;
  const lines: string[] = [];

  lines.push(`package ${pkg}`);
  lines.push('');
  lines.push('import "io"');
  lines.push('');

  for (const vTable of cfgValue.sortedTables()) {
    const name = new GoName(vTable.schema);
    const className = lower1(name.className);
    const ClassName = upper1(className);

    lines.push(`var ${className}Mgr *${ClassName}Mgr`);
    lines.push('');
    lines.push(`func Get${ClassName}Mgr() *${ClassName}Mgr {`);
    lines.push(`    return ${className}Mgr`);
    lines.push(`}`);
    lines.push('');
  }

  lines.push('func Init(reader io.Reader) *Stream {');
  lines.push('    stream := &Stream{reader: reader}');
  lines.push('');
  lines.push('    // 1. 跳过 Schema（如果有）');
  lines.push('    schemaLength := stream.ReadInt32()');
  lines.push('    if schemaLength > 0 {');
  lines.push('        stream.SkipBytes(int(schemaLength))');
  lines.push('    }');
  lines.push('');
  lines.push('    // 2. 读取 StringPool');
  lines.push('    stream.ReadStringPool()');
  lines.push('');
  lines.push('    // 3. 读取 LangTextPool');
  lines.push('    stream.ReadLangTextPool()');
  lines.push('');
  lines.push('    // 4. 处理表数据');
  lines.push('    tableCount := stream.ReadSize()');
  lines.push('    for i := 0; i < tableCount; i++ {');
  lines.push('        tableName := stream.ReadString()');
  lines.push('        tableSize := stream.ReadSize()');
  lines.push('        switch tableName {');

  for (const vTable of cfgValue.sortedTables()) {
    const name = new GoName(vTable.schema);
    const className = lower1(name.className);
    const ClassName = upper1(className);
    const ClassReadName = name.pkgName;

    lines.push(`        case "${ClassReadName}":`);
    lines.push(`            ${className}Mgr = &${ClassName}Mgr{}`);
    lines.push(`            ${className}Mgr.Init(stream)`);
  }

  lines.push('        default:');
  lines.push('            stream.SkipBytes(tableSize)');
  lines.push('        }');
  lines.push('    }');
  lines.push('');
  lines.push('    return stream');
  lines.push('}');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// genListRef — GenListRef.jte
// ---------------------------------------------------------------------------

export function genListRef(name: GoName, foreignKeySchema: ForeignKeySchema): string {
  const keySchema = foreignKeySchema.key;
  const refTableName = new GoName(foreignKeySchema.refTableSchema()!);
  const fieldSchema = keySchema.fieldSchemas()![0];
  const className = name.className;
  const varName = fieldSchema.name;
  const VarName = upper1(fieldSchema.name);
  const ValueType = refTableName.className;

  const lines: string[] = [];
  lines.push('//list ref');
  lines.push(`func (t *${className}) Ref${VarName}() []*${ValueType} {`);
  lines.push(`    if t.ref${VarName} == nil {`);
  lines.push(`        t.ref${VarName} = make([]*${ValueType}, len(t.${varName}))`);
  lines.push(`        for i, v := range t.${varName} {`);
  lines.push(`            t.ref${VarName}[i] = Get${ValueType}Mgr().Get(v)`);
  lines.push(`        }`);
  lines.push(`    }`);
  lines.push(`    return t.ref${VarName}`);
  lines.push(`}`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// genMapRef — GenMapRef.jte
// ---------------------------------------------------------------------------

export function genMapRef(name: GoName, foreignKeySchema: ForeignKeySchema): string {
  const keySchema = foreignKeySchema.key;
  const refTableName = new GoName(foreignKeySchema.refTableSchema()!);
  const fieldSchema = keySchema.fieldSchemas()![0];
  const className = name.className;
  const mapName = fieldSchema.name;
  const MapName = upper1(fieldSchema.name);
  const MapValueType = refTableName.className;

  const lines: string[] = [];
  lines.push('//map ref');
  lines.push(`func (t *${className}) Ref${MapName}() map[int32]*${MapValueType} {`);
  lines.push(`    if t.ref${MapName} == nil {`);
  lines.push(`        t.ref${MapName} = make(map[int32]*${MapValueType}, len(t.${mapName}))`);
  lines.push(`        for k, v := range t.${mapName} {`);
  lines.push(`            t.ref${MapName}[k] = Get${MapValueType}Mgr().Get(v)`);
  lines.push(`        }`);
  lines.push(`    }`);
  lines.push(`    return t.ref${MapName}`);
  lines.push(`}`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// genServerText — ServerText.jte
// ---------------------------------------------------------------------------

export function genServerText(pkg: string, languages: string[]): string {
  const lines: string[] = [];

  lines.push(`package ${pkg}`);
  lines.push('');
  lines.push('type Text struct {');
  for (const lang of languages) {
    lines.push(`    ${lang} string`);
  }
  lines.push('}');
  lines.push('');
  lines.push('func createText(stream *Stream) *Text {');
  lines.push('    self := &Text{}');
  lines.push('    texts := stream.ReadTextsInPool()');
  for (let i = 0; i < languages.length; i++) {
    lines.push(`    if ${i} < len(texts) {`);
    lines.push(`        self.${languages[i]} = texts[${i}]`);
    lines.push(`    }`);
  }
  lines.push('    return self');
  lines.push('}');
  lines.push('');
  lines.push('func (t *Text) String() string {');
  if (languages.length === 1) {
    lines.push(`    return t.${languages[0]}`);
  } else {
    lines.push('    result := ""');
    for (let i = 0; i < languages.length; i++) {
      if (i > 0) {
        lines.push('    result += ","');
      }
      lines.push(`    result += t.${languages[i]}`);
    }
    lines.push('    return result');
  }
  lines.push('}');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// genClientText — ClientText.jte
// ---------------------------------------------------------------------------

export function genClientText(pkg: string): string {
  const lines: string[] = [];

  lines.push(`package ${pkg}`);
  lines.push('');
  lines.push('// TextPoolManager 客户端模式：全局文本管理器（应用层负责语言切换）');
  lines.push('type TextPoolManager struct {');
  lines.push('    globalTexts []string');
  lines.push('}');
  lines.push('');
  lines.push('var textPoolManagerInstance *TextPoolManager');
  lines.push('');
  lines.push('func TextPoolManagerInstance() *TextPoolManager {');
  lines.push('    if textPoolManagerInstance == nil {');
  lines.push('        textPoolManagerInstance = &TextPoolManager{}');
  lines.push('    }');
  lines.push('    return textPoolManagerInstance');
  lines.push('}');
  lines.push('');
  lines.push('func (m *TextPoolManager) SetGlobalTexts(texts []string) {');
  lines.push('    m.globalTexts = texts');
  lines.push('}');
  lines.push('');
  lines.push('func (m *TextPoolManager) GetText(index int) string {');
  lines.push('    if index < 0 || index >= len(m.globalTexts) {');
  lines.push('        return ""');
  lines.push('    }');
  lines.push('    return m.globalTexts[index]');
  lines.push('}');
  lines.push('');
  lines.push('type Text struct {');
  lines.push('    index int');
  lines.push('}');
  lines.push('');
  lines.push('func createText(stream *Stream) *Text {');
  lines.push('    self := &Text{}');
  lines.push('    self.index = stream.ReadTextIndex()');
  lines.push('    return self');
  lines.push('}');
  lines.push('');
  lines.push('// T 从全局文本数组获取文本');
  lines.push('func (t *Text) T() string {');
  lines.push('    return TextPoolManagerInstance().GetText(t.index)');
  lines.push('}');
  lines.push('');
  lines.push('func (t *Text) String() string {');
  lines.push('    return t.T()');
  lines.push('}');

  return lines.join('\n');
}
