/**
 * tsTemplates — TypeScript equivalents of the 7 JTE templates in `jte/ts/`.
 *
 * Each function returns a string that becomes part of the generated Config.ts.
 * The templates use StructModel and TsCodeGenerator for type/code generation.
 *
 * Java templates ported:
 * 1. Config.jte       → genConfig (entry point, assembles all parts)
 * 2. GenStruct.jte    → genStruct (class definition for structs/tables)
 * 3. GenInterface.jte → genInterface (abstract class for interfaces)
 * 4. GenMapGetBy.jte  → genMapGetBy (static Get/GetBy methods)
 * 5. Processor.jte    → genProcessor (loader class)
 * 6. ServerText.jte   → genServerText (multi-language Text class)
 * 7. ClientText.jte   → genClientText (client-side Text class)
 */

import {
  isPrimitive,
  isStructRef,
  isFList,
  isFMap,
} from '@cfggen/schema';
import {
  hasRef,
  hasRefFieldType,
  isEEntry,
  isEEnum,
  isRefList,
  type RefSimple,
  type InterfaceSchema,
  type KeySchema,
} from '@cfggen/schema';
import { StructSchema as StructSchemaClass } from '@cfggen/schema';
import { removeLineSep, upper1 } from '@cfggen/shared';
import { StructModel } from './StructModel';
import type { TsCodeGenerator } from './TsCodeGenerator';

// ---------------------------------------------------------------------------
// 1. genMapGetBy (GenMapGetBy.jte)
// ---------------------------------------------------------------------------

export function genMapGetBy(
  model: StructModel,
  keySchema: KeySchema,
  isPrimaryKey: boolean,
): string {
  const mapName = isPrimaryKey ? 'all' : model.uniqueKeyMapName(keySchema);
  const className = model.structClassName;
  const getByName = isPrimaryKey ? 'Get' : model.uniqueKeyGetByName(keySchema);
  const formalParams = model.formalParams(keySchema.fieldSchemas()!);
  const actualParams = model.actualParamsKey(keySchema);
  const mapKeyType = model.mapKeyType(keySchema);

  return [
    `    private static ${mapName}: Map<${mapKeyType}, ${className}>;`,
    ``,
    `    static ${getByName}(${formalParams}) : ${className} | undefined {`,
    `        return this.${mapName}.get(${actualParams})`,
    `    }`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 2. genStruct (GenStruct.jte)
// ---------------------------------------------------------------------------

export function genStruct(model: StructModel): string {
  const className = model.structClassName;
  const structural = model.structural;

  // Check if this struct is an interface impl
  let nullableInterface: InterfaceSchema | null = null;
  if (structural instanceof StructSchemaClass) {
    nullableInterface = structural.nullableInterface();
  }
  const isImpl = nullableInterface !== null;

  const lines: string[] = [];

  // Class declaration
  if (isImpl) {
    const ifaceName = model.className(nullableInterface!);
    lines.push(`export class ${className} extends ${ifaceName} {`);

    const enumRefTable = nullableInterface!.nullableEnumRefTable();
    if (enumRefTable !== null) {
      const enumRefClassName = model.className(enumRefTable);
      lines.push(`    type() : ${enumRefClassName} {`);
      lines.push(`        return ${enumRefClassName}.${upper1(structural.name())};`);
      lines.push(`    }`);
      lines.push(``);
    }
  } else {
    lines.push(`export class ${className} {`);
  }

  // Static enum fields
  if (model.vTable !== null && (isEEntry(model.vTable.schema.entry) || isEEnum(model.vTable.schema.entry))) {
    const enumNames = model.vTable.enumNames;
    if (enumNames !== null) {
      for (const enumName of enumNames) {
        lines.push(`    private static _${enumName} : ${className};`);
        lines.push(`    static get ${upper1(enumName)}() :${className} { return this._${enumName}; }`);
        lines.push(``);
      }
    }
  }

  // Field properties
  for (const field of structural.fields()) {
    const t = model.type(field.type);
    const n = field.name;
    lines.push(`    private _${n}!: ${t};`);
    if (field.comment().length > 0) {
      lines.push(`    /* ${removeLineSep(field.comment())} */`);
    }
    lines.push(`    get ${upper1(n)}(): ${t} { return this._${n}; }`);
  }

  lines.push(``);

  // Ref properties
  for (const fk of structural.foreignKeys()) {
    const t = model.refType(fk);
    const n = model.refName(fk);
    const isNullable = model.isNullableRef(fk);
    if (isNullable) {
      lines.push(`    private _${n}: ${t} | undefined;`);
      lines.push(`    get ${n}(): ${t} | undefined { return this._${n}; }`);
    } else {
      lines.push(`    private _${n}!: ${t};`);
      lines.push(`    get ${n}(): ${t} { return this._${n}; }`);
    }
  }

  // toString
  lines.push(`    toString() : string {`);
  lines.push(`        return "(" + ${model.toStrings(structural.fields())} + ")";`);
  lines.push(`    }`);

  // Table static methods (Get, All, Initialize, Resolve)
  if (model.vTable !== null) {
    const table = model.vTable.schema;

    // GenMapGetBy for primary key
    lines.push(`    `);
    lines.push(genMapGetBy(model, table.primaryKey, true));

    // GenMapGetBy for unique keys
    for (const uk of table.uniqueKeys()) {
      lines.push(`    `);
      lines.push(genMapGetBy(model, uk, false));
    }

    // All()
    lines.push(``);
    lines.push(`    static All() : Map<${model.mapKeyType(table.primaryKey)}, ${className}> {`);
    lines.push(`        return this.all;`);
    lines.push(`    }`);

    // Initialize()
    lines.push(``);
    lines.push(`    static Initialize(os: Stream, errors: LoadErrors) {`);
    lines.push(`        this.all = new Map<${model.mapKeyType(table.primaryKey)}, ${className}>();`);
    for (const uk of table.uniqueKeys()) {
      lines.push(`        this.${model.uniqueKeyMapName(uk)} = new Map<${model.mapKeyType(uk)}, ${className}>();`);
    }
    lines.push(``);
    lines.push(`        for (let c = os.ReadInt32(); c > 0; c--)`);
    lines.push(`        {`);
    lines.push(`            let self = this._create(os);`);
    lines.push(`            this.all.set(${model.actualParamsKeySelf(table.primaryKey)}, self);`);
    for (const uk of table.uniqueKeys()) {
      lines.push(`            this.${model.uniqueKeyMapName(uk)}.set(${model.actualParamsKeySelf(uk)}, self);`);
    }
    lines.push(``);

    // Entry/enum handling
    if (isEEntry(table.entry) || isEEnum(table.entry)) {
      const ef = (table.entry as { field: string }).field;
      lines.push(`            if (self._${ef}.trim().length === 0) {`);
      lines.push(`                continue;`);
      lines.push(`            }`);
      lines.push(`            switch(self._${ef}.trim()) {`);
      if (model.vTable.enumNames !== null) {
        for (const enumName of model.vTable.enumNames) {
          lines.push(`                case "${enumName}":`);
          lines.push(`                    if (this._${enumName} != null)`);
          lines.push(`                        errors.EnumDup("${structural.name()}", "${enumName}");`);
          lines.push(`                    this._${enumName} = self;`);
          lines.push(`                    break;`);
        }
      }
      lines.push(`                default:`);
      lines.push(`                    errors.EnumDataAdd("${structural.name()}", self._${ef});`);
      lines.push(`                    break;`);
      lines.push(`            }`);
    }
    lines.push(`        }`);
    lines.push(``);

    // Enum null checks
    if (isEEntry(table.entry) || isEEnum(table.entry)) {
      if (model.vTable.enumNames !== null) {
        for (const enumName of model.vTable.enumNames) {
          lines.push(`        if (this._${enumName} == null) {`);
          lines.push(`            errors.EnumNull("${structural.name()}", "${enumName}");`);
          lines.push(`        }`);
        }
      }
    }
    lines.push(`    }`);

    // Resolve()
    if (hasRef(structural)) {
      lines.push(``);
      lines.push(`    static Resolve(errors: LoadErrors) {`);
      lines.push(`        for (const v of this.all.values()) {`);
      lines.push(`            v._resolve(errors);`);
      lines.push(`        }`);
      lines.push(`    }`);
    }
  }

  // static _create
  lines.push(``);
  lines.push(`    static _create(os: Stream) : ${className} {`);
  lines.push(`        const self = new ${className}();`);
  for (const field of structural.fields()) {
    const n = field.name;
    const t = field.type;
    if (isFList(t)) {
      const itemCreate = model.create(t.item)!;
      lines.push(`        self._${n} = [];`);
      lines.push(`        for (let c = os.ReadInt32(); c > 0; c--)`);
      lines.push(`            self._${n}.push(${itemCreate});`);
    } else if (isFMap(t)) {
      const keyCreate = model.create(t.key)!;
      const valueCreate = model.create(t.value)!;
      lines.push(`        self._${n}  = new ${model.type(t)}();`);
      lines.push(`        for (let c = os.ReadInt32(); c > 0; c--) {`);
      lines.push(`            self._${n}.set(${keyCreate}, ${valueCreate});`);
      lines.push(`        }`);
    } else {
      const createExpr = model.create(t)!;
      lines.push(`        self._${n} = ${createExpr};`);
    }
  }
  lines.push(`        return self;`);
  lines.push(`    }`);

  // _resolve
  if (hasRef(structural)) {
    lines.push(``);
    lines.push(`    _resolve(errors: LoadErrors) {`);
    // Resolve nested struct refs in fields
    for (const field of structural.fields()) {
      const n = field.name;
      const t = field.type;
      if (hasRefFieldType(t)) {
        if (isStructRef(t)) {
          lines.push(`        this._${n}._resolve(errors);`);
        } else if (isFList(t)) {
          lines.push(`        for (const e of this._${n}) {`);
          lines.push(`            e._resolve(errors);`);
          lines.push(`        }`);
        } else if (isFMap(t)) {
          lines.push(`        for (const e of this._${n}.values()) {`);
          lines.push(`            e._resolve(errors);`);
          lines.push(`        }`);
        }
      }
    }

    // Resolve foreign keys
    for (const fk of structural.foreignKeys()) {
      if (!isRefList(fk.refKey)) {
        // RefSimple
        const refSimple = fk.refKey as RefSimple;
        const firstField = fk.key.fieldSchemas()![0];
        const refName = model.refName(fk);
        const firstType = firstField.type;

        if (isPrimitive(firstType) || isStructRef(firstType)) {
          // SimpleType
          if (refSimple.nullable) {
            const actualParam = model.actualParamsKeyThis(fk.key);
            const tableGet = model.tableGet(fk.refTableSchema()!, refSimple, actualParam);
            lines.push(`        this._${refName} = ${tableGet};`);
          } else {
            const actualParam = model.actualParamsKeyThis(fk.key);
            const tableGet = model.tableGet(fk.refTableSchema()!, refSimple, actualParam);
            lines.push(`        const _tmp${refName} = ${tableGet};`);
            lines.push(`        if (_tmp${refName} === undefined) {`);
            lines.push(`            errors.RefNull("${structural.name()}", this.toString(), "${fk.name}");`);
            lines.push(`        }`);
            lines.push(`        this._${refName} = _tmp${refName}!;`);
          }
        } else if (isFList(firstType)) {
          lines.push(`        this._${refName} = [];`);
          lines.push(`        for (const e of this._${firstField.name}) {`);
          const tableGet = model.tableGet(fk.refTableSchema()!, refSimple, 'e');
          lines.push(`            const r = ${tableGet};`);
          lines.push(`            if (r === undefined) {`);
          lines.push(`                errors.RefNull("${structural.name()}", this.toString(), "${fk.name}");`);
          lines.push(`            }`);
          lines.push(`            this._${refName}.push(r);`);
          lines.push(`        }`);
        } else if (isFMap(firstType)) {
          lines.push(`        this._${refName} = new ${model.refType(fk)}();`);
          lines.push(`        for (const e of this._${firstField.name}.entries()) {`);
          const tableGet = model.tableGet(fk.refTableSchema()!, refSimple, 'e[1]');
          lines.push(`            const v = ${tableGet};`);
          lines.push(`            if (v === undefined) {`);
          lines.push(`                errors.RefNull("${structural.name()}", this.toString(), "${fk.name}");`);
          lines.push(`            }`);
          lines.push(`            this._${refName}.set(e[0], v);`);
          lines.push(`        }`);
        }
      }
    }

    // Resolve RefList foreign keys
    for (const fk of structural.foreignKeys()) {
      if (isRefList(fk.refKey)) {
        const refName = model.refName(fk);
        const refTableClassName = model.className(fk.refTableSchema()!);
        lines.push(`        this._${refName} = [];`);
        lines.push(`        for (const v of ${refTableClassName}.All().values())`);
        lines.push(`        {`);
        const keyFields = fk.key.fields();
        const keyNames = fk.refKey.keyNames();
        const eqs: string[] = [];
        for (let i = 0; i < keyFields.length; i++) {
          eqs.push(`v.${upper1(keyNames[i])} === this._${keyFields[i]}`);
        }
        lines.push(`            if (${eqs.join(' && ')})`);
        lines.push(`                this._${refName}.push(v);`);
        lines.push(`        }`);
      }
    }
    lines.push(`    }`);
  }

  lines.push(`}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 3. genInterface (GenInterface.jte)
// ---------------------------------------------------------------------------

export function genInterface(
  gen: TsCodeGenerator,
  sInterface: InterfaceSchema,
): string {
  const className = gen.className(sInterface);
  const lines: string[] = [];

  lines.push(`export abstract class ${className} {`);

  // Enum type method
  const enumRefTable = sInterface.nullableEnumRefTable();
  if (enumRefTable !== null) {
    const enumRefClassName = gen.className(enumRefTable);
    lines.push(`    abstract type() : ${enumRefClassName};`);
  }

  // _resolve stub if hasRef
  if (hasRef(sInterface)) {
    lines.push(`    _resolve(errors: LoadErrors) {`);
    lines.push(`    }`);
  }

  // static _create
  lines.push(`    static _create(os: Stream) : ${className} {`);
  lines.push(`        const typeName = os.ReadStringInPool();`);
  lines.push(`        switch(typeName) {`);
  for (const impl of sInterface.impls()) {
    lines.push(`            case "${impl.name()}":`);
    lines.push(`                return ${gen.className(impl)}._create(os);`);
  }
  lines.push(`            default:`);
  lines.push(`                throw new Error("Unknown type: " + typeName);`);
  lines.push(`        }`);
  lines.push(`    }`);

  lines.push(``);
  lines.push(`    abstract toString() : string;`);
  lines.push(`}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 4. genServerText (ServerText.jte)
// ---------------------------------------------------------------------------

export function genServerText(_pkg: string, languages: string[]): string {
  const lines: string[] = [];
  lines.push(`export class Text`);
  lines.push(`{`);
  for (const lang of languages) {
    lines.push(`    private _${lang}: string = "";`);
    lines.push(`    get ${lang}(): string { return this._${lang}; }`);
  }
  lines.push(``);
  lines.push(`    static _create(os: Stream): Text`);
  lines.push(`    {`);
  lines.push(`        const self = new Text();`);
  lines.push(`        const texts = os.ReadTextsInPool();`);
  for (let i = 0; i < languages.length; i++) {
    lines.push(`        self._${languages[i]} = texts[${i}];`);
  }
  lines.push(`        return self;`);
  lines.push(`    }`);
  lines.push(``);
  const toStringParts = languages.map(l => `this._${l}`).join(' + "," + ');
  lines.push(`    toString(): string {`);
  lines.push(`        return "(" + ${toStringParts} + ")";`);
  lines.push(`    }`);
  lines.push(`}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 5. genClientText (ClientText.jte)
// ---------------------------------------------------------------------------

export function genClientText(_pkg: string, _languages: string[]): string {
  const lines: string[] = [];
  lines.push(`export class Text`);
  lines.push(`{`);
  lines.push(`    private index: number = 0;`);
  lines.push(``);
  lines.push(`    get T(): string {`);
  lines.push(`        return TextPoolManager.GetText(this.index);`);
  lines.push(`    }`);
  lines.push(``);
  lines.push(`    static _create(os: Stream): Text`);
  lines.push(`    {`);
  lines.push(`        const self = new Text();`);
  lines.push(`        self.index = os.ReadTextIndex();`);
  lines.push(`        return self;`);
  lines.push(`    }`);
  lines.push(``);
  lines.push(`    toString(): string {`);
  lines.push(`        return this.T;`);
  lines.push(`    }`);
  lines.push(`}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 6. genProcessor (Processor.jte)
// ---------------------------------------------------------------------------

export function genProcessor(model: TsCodeGenerator): string {
  const lines: string[] = [];
  lines.push(`export class Processor {`);
  lines.push(``);
  lines.push(`    // 从 bytes 文件加载（新格式）`);
  lines.push(`    static Process(os: Stream, errors: LoadErrors): void {`);
  lines.push(`        const configNulls = new Set<string>([`);
  for (const table of model.cfgSchema.sortedTables()) {
    lines.push(`            "${table.name()}",`);
  }
  lines.push(`        ]);`);
  lines.push(``);
  lines.push(`        // 读取表数量`);
  lines.push(`        const tableCount = os.ReadSize();`);
  lines.push(``);
  lines.push(`        for (let i = 0; i < tableCount; i++) {`);
  lines.push(`            // 读取表名`);
  lines.push(`            const tableName = os.ReadString();`);
  lines.push(`            // 读取表大小`);
  lines.push(`            const tableSize = os.ReadSize();`);
  lines.push(``);
  lines.push(`            // 根据表名分发到对应的 Initialize 方法`);
  lines.push(`            switch(tableName) {`);
  for (const table of model.cfgSchema.sortedTables()) {
    lines.push(`                case "${table.name()}":`);
    lines.push(`                    configNulls.delete(tableName);`);
    lines.push(`                    ${model.className(table)}.Initialize(os, errors);`);
    lines.push(`                    break;`);
  }
  lines.push(`                default:`);
  lines.push(`                    // 未知表，跳过`);
  lines.push(`                    os.SkipBytes(tableSize);`);
  lines.push(`                    break;`);
  lines.push(`            }`);
  lines.push(`        }`);
  lines.push(``);
  lines.push(`        // 检查缺失的表`);
  lines.push(`        for (const t of configNulls) {`);
  lines.push(`            errors.ConfigNull(t);`);
  lines.push(`        }`);
  lines.push(``);
  lines.push(`        // 解析外键引用`);
  for (const table of model.cfgSchema.sortedTables()) {
    if (hasRef(table)) {
      lines.push(`        ${model.className(table)}.Resolve(errors);`);
    }
  }
  lines.push(`    }`);
  lines.push(`}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 7. genConfig (Config.jte — entry point)
// ---------------------------------------------------------------------------

export function genConfig(model: TsCodeGenerator): string {
  const lines: string[] = [];

  // Header comment
  lines.push(`// noinspection UnnecessaryLocalVariableJS,JSUnusedLocalSymbols,JSUnusedGlobalSymbols,DuplicatedCode,SpellCheckingInspection`);
  lines.push(``);

  // Imports
  if (model.nullableLanguageSwitch !== null && !model.serverText) {
    lines.push(`import {Stream, LoadErrors, ToStringList, ToStringMap, TextPoolManager} from "./ConfigUtil";`);
  } else {
    lines.push(`import {Stream, LoadErrors, ToStringList, ToStringMap} from "./ConfigUtil";`);
  }
  lines.push(`export namespace ${model.pkg} {`);

  // Sorted fieldables (structs + interfaces)
  for (const fieldable of model.cfgSchema.sortedFieldables()) {
    if (fieldable instanceof StructSchemaClass) {
      // Struct
      const structModel = new StructModel(model, fieldable, null);
      lines.push(genStruct(structModel));
      lines.push(``);
    } else {
      // Interface
      const interfaceSchema = fieldable as InterfaceSchema;
      lines.push(genInterface(model, interfaceSchema));
      lines.push(``);
      // Gen impl structs
      for (const impl of interfaceSchema.impls()) {
        const structModel = new StructModel(model, impl, null);
        lines.push(genStruct(structModel));
        lines.push(``);
      }
    }
  }

  // Tables
  for (const vTable of model.cfgValue.sortedTables()) {
    const structModel = new StructModel(model, vTable.schema, vTable);
    lines.push(genStruct(structModel));
    lines.push(``);
  }

  // Text class (if multi-language)
  if (model.nullableLanguageSwitch !== null) {
    if (model.serverText) {
      lines.push(genServerText(model.pkg, model.nullableLanguageSwitch.languages()));
    } else {
      lines.push(genClientText(model.pkg, model.nullableLanguageSwitch.languages()));
    }
    lines.push(``);
  }

  // Processor
  lines.push(genProcessor(model));

  lines.push(`}`);
  lines.push(``);

  return lines.join('\n');
}
