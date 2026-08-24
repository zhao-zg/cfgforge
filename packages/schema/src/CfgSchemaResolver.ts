/**
 * CfgSchemaResolver — TypeScript port of Java
 * `configgen.schema.CfgSchemaResolver`.
 *
 * Resolves all internal relationships within a CfgSchema:
 *  - step0: interface→impl linkage, table name lowercase, name conflicts
 *  - step1: field type resolution (struct refs, enum→string+foreign key)
 *  - step2: interface enumRef/defaultImpl, table entry/keys
 *  - step3: foreign key resolution (ref table, local key, remote key, type match)
 *  - step4: chained sep fmt constraints
 *  - step5: unused struct/interface warnings
 *
 * Then pre-calculates span/hasRef/hasBlock/hasMap/hasText and checks
 * block first-column overlap.
 */

import type { CfgSchema } from './CfgSchema';
import type { CfgSchemaErrs } from './CfgSchemaErrs';
import * as Errs from './CfgSchemaErrs';
import type { Nameable } from './Nameable';
import { makeName } from './Nameable';
import type { Fieldable } from './Fieldable';
import type { Structural } from './Structural';
import type { FieldType, SimpleType } from './FieldType';
import { Primitive, FList, FMap, StructRef, isPrimitive, isStructRef, isFList, isFMap } from './FieldType';
import type { FieldFormat } from './FieldFormat';
import { AutoOrPack, isSep } from './FieldFormat';
import type { FieldSchema } from './FieldSchema';
import type { ForeignKeySchema } from './ForeignKeySchema';
import { ForeignKeySchema as ForeignKeySchemaClass } from './ForeignKeySchema';
import { KeySchema } from './KeySchema';
import type { RefKey } from './RefKey';
import { RefPrimary, isRefPrimary, isRefUniq, isRefList } from './RefKey';
import type { EntryType } from './EntryType';
import { isENo, isEEntry, isEEnum } from './EntryType';
import { StructSchema } from './StructSchema';
import { TableSchema } from './TableSchema';
import { InterfaceSchema } from './InterfaceSchema';
import { Metadata, Metadata_of } from './Metadata';
import { CfgWriter } from './cfg/CfgWriter';
import { findFieldIndices } from './FindFieldIndex';
import { foreachStructural, foreachFieldStructRef } from './ForeachSchema';
import { preCalculateAllNeededSpans } from './Span';
import { preCalculateAllHasRef } from './HasRef';
import { preCalculateAllHasBlock } from './HasBlock';
import { preCalculateAllHasMap } from './HasMap';
import { preCalculateAllHasText } from './HasText';
import { checkBlockFirstColOverlap } from './BlockFirstColOverlapChecker';

// ---------------------------------------------------------------------------
// Visitor type for resolve_structural
// ---------------------------------------------------------------------------

type StructuralVisitor = (structural: Structural) => void;

// ---------------------------------------------------------------------------
// CfgSchemaResolver
// ---------------------------------------------------------------------------

export class CfgSchemaResolver {
  private readonly cfgSchema: CfgSchema;
  private readonly errs: CfgSchemaErrs;
  private curTopNameable: Nameable | null = null;
  private curNameable: Nameable | null = null;

  constructor(cfgSchema: CfgSchema, errs: CfgSchemaErrs) {
    this.cfgSchema = cfgSchema;
    this.errs = errs;
  }

  resolve(): void {
    this.step0_setImplInterfaceAndCheckTableName();
    this.step0_checkNameConflict();
    this.step1_resolveAllFields();
    this.step2_resolveEachNameable();
    this.step3_resolveAllForeignKeys();
    this.step4_checkAllChainedSepFmt();
    this.step5_checkUnusedFieldable();

    if (this.errs.errs.length === 0) {
      preCalculateAllNeededSpans(this.cfgSchema, this.errs);
      preCalculateAllHasRef(this.cfgSchema);
      preCalculateAllHasBlock(this.cfgSchema, this.errs);
      preCalculateAllHasMap(this.cfgSchema, this.errs);
      preCalculateAllHasText(this.cfgSchema);
    }

    if (this.errs.errs.length === 0) {
      checkBlockFirstColOverlap(this.cfgSchema, this.errs);
    }

    if (this.errs.errs.length === 0) {
      this.cfgSchema.setResolved();
    }
  }

  // -----------------------------------------------------------------------
  // step0: set impl interface + check table name
  // -----------------------------------------------------------------------

  private step0_setImplInterfaceAndCheckTableName(): void {
    for (const item of this.cfgSchema.items()) {
      if (item instanceof InterfaceSchema) {
        for (const impl of item.impls()) {
          impl.setNullableInterface(item);
        }
      } else if (item instanceof TableSchema) {
        if (item.meta().hasEnumValues()) {
          continue;
        }
        if (item.name() !== item.name().toLowerCase()) {
          this.errs.addErr(Errs.tableNameNotLowerCase(item.name()));
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // step0: check name conflict
  // -----------------------------------------------------------------------

  private step0_checkNameConflict(): void {
    const nameSet = new StringArraySet();
    const fieldableNameSet = new StringArraySet();
    const fieldableTopNameSet = new Set<string>();

    for (const item of this.cfgSchema.items()) {
      const names = item.name().split('.');
      if (!nameSet.add(names)) {
        this.errs.addErr(Errs.nameConflict(item.name()));
      }
      if (isFieldable(item)) {
        fieldableNameSet.add(names);
        fieldableTopNameSet.add(names[0]);
      }

      if (item instanceof InterfaceSchema) {
        const implLowerToName = new Map<string, string>();
        for (const impl of item.impls()) {
          if (impl.namespace() !== '') {
            this.errs.addErr(Errs.implNamespaceNotEmpty(item.name(), impl.name()));
          }
          if (item.lastName().toLowerCase() === impl.name().toLowerCase()) {
            this.errs.addErr(Errs.interfaceImplNameConflict(item.name(), impl.name()));
          }
          const first = implLowerToName.get(impl.name().toLowerCase());
          if (first !== undefined) {
            this.errs.addErr(Errs.implNameConflict(item.name(), first, impl.name()));
          } else {
            implLowerToName.set(impl.name().toLowerCase(), impl.name());
          }
          this.checkInnerNameConflict(impl);
        }
      } else if (isStructural(item)) {
        this.checkInnerNameConflict(item);
      }
    }

    // Check local namespace vs global namespace conflicts
    for (const item of this.cfgSchema.items()) {
      if (item instanceof InterfaceSchema) {
        for (const impl of item.impls()) {
          if (fieldableTopNameSet.has(impl.name())) {
            this.errs.addWarn(Errs.nameMayConflictByRef(item.name() + '.' + impl.name(), impl.name()));
          }
        }
      }
    }

    // Check fieldable name subsets
    for (const name of fieldableNameSet.values()) {
      if (name.length <= 1) continue;
      const len = name.length;
      for (let i = 1; i < len; i++) {
        const sub = name.slice(i, len);
        if (fieldableNameSet.has(sub)) {
          const name1 = name.join('.');
          const name2 = sub.join('.');
          this.errs.addWarn(Errs.nameMayConflictByRef(name1, name2));
        }
      }
    }

    // Build index maps
    const itemMap = new Map<string, Nameable>();
    const structMap = new Map<string, Fieldable>();
    const tableMap = new Map<string, TableSchema>();
    for (const item of this.cfgSchema.items()) {
      itemMap.set(item.name(), item);
      if (isFieldable(item)) {
        structMap.set(item.name(), item);
      }
      if (item instanceof TableSchema) {
        tableMap.set(item.name(), item);
      }
    }
    this.cfgSchema.setMaps(itemMap, structMap, tableMap);
  }

  private checkInnerNameConflict(structural: Structural): void {
    const innerNameSet = new Set<string>();
    for (const field of structural.fields()) {
      if (innerNameSet.has(field.name)) {
        this.errs.addErr(Errs.innerNameConflict(structural.name(), field.name));
      } else {
        innerNameSet.add(field.name);
      }
    }
    innerNameSet.clear();
    for (const fk of structural.foreignKeys()) {
      if (innerNameSet.has(fk.name)) {
        this.errs.addErr(Errs.innerNameConflict(structural.name(), fk.name));
      } else {
        innerNameSet.add(fk.name);
      }
    }
  }

  // -----------------------------------------------------------------------
  // step1: resolve all fields
  // -----------------------------------------------------------------------

  private step1_resolveAllFields(): void {
    this.resolve_structural((structural) => this.resolveFields(structural));
  }

  private resolve_structural(visitor: StructuralVisitor): void {
    foreachStructural((structural) => {
      this.curNameable = structural;
      this.curTopNameable =
        structural instanceof StructSchema && structural.nullableInterface() !== null
          ? structural.nullableInterface()!
          : structural;

      visitor(structural);

      this.curNameable = null;
      this.curTopNameable = null;
    }, this.cfgSchema);
  }

  private resolveFields(structural: Structural): void {
    for (const field of structural.fields()) {
      if (field.isSeq() && field.type !== Primitive.INT) {
        this.errs.addErr(Errs.seqFieldMustBeInt(this.ctx(), field.name, field.type.toString()));
      }
      this.resolveFieldType(field.type, field, structural);
    }
  }

  private resolveFieldType(type: FieldType, field: FieldSchema, structural: Structural): void {
    if (type === Primitive.STRING || type === Primitive.TEXT) {
      return;
    }

    if (field.isLowercase()) {
      this.errs.addWarn(Errs.lowercaseNotOnStrOrText(this.ctx(), field.name, type.toString()));
    }

    if (isFList(type)) {
      const item = type.item;
      const resolvedItem = this.resolveSimpleType(item, field, structural);
      if (resolvedItem !== item) {
        structural.updateFieldType(field.name, new FList(resolvedItem));
      }
    } else if (isFMap(type)) {
      const key = type.key;
      const value = type.value;
      const resolvedKey = this.resolveSimpleTypeForMapKey(key, field);
      const resolvedValue = this.resolveSimpleType(value, field, structural);
      if (resolvedKey !== key || resolvedValue !== value) {
        structural.updateFieldType(field.name, new FMap(resolvedKey, resolvedValue));
      }
      this.checkMapKey(resolvedKey, field);
    } else if (isPrimitive(type)) {
      // primitive — nothing to do
    } else if (isStructRef(type)) {
      const resolved = this.resolveSimpleType(type, field, structural);
      if (resolved !== type) {
        structural.updateFieldType(field.name, resolved);
      }
    }
  }

  /**
   * Resolve SimpleType for map key — enum only converts to STRING, no foreign key.
   */
  private resolveSimpleTypeForMapKey(simpleType: SimpleType, field: FieldSchema): SimpleType {
    if (simpleType instanceof StructRef) {
      const structRef = simpleType;
      const enumTable = this.findTableInLocalThenGlobal(structRef.name);
      if (enumTable !== null && enumTable.meta().hasEnumValues()) {
        this.errs.addWarn(Errs.mapKeyNotSupportEnumType(this.ctx(), field.name, structRef.name));
        return Primitive.STRING;
      } else {
        const obj = this.findStructRefObj(structRef.name);
        if (obj !== null) {
          structRef.obj = obj;
        } else {
          this.errs.addErr(Errs.typeStructNotFound(this.ctx(), field.name, structRef.name));
        }
        return structRef;
      }
    }
    return simpleType;
  }

  /**
   * Resolve SimpleType — enum converts to STRING + creates foreign key.
   */
  private resolveSimpleType(simpleType: SimpleType, field: FieldSchema, structural: Structural): SimpleType {
    if (simpleType instanceof StructRef) {
      const structRef = simpleType;
      const enumTable = this.findTableInLocalThenGlobal(structRef.name);
      if (enumTable !== null && enumTable.meta().hasEnumValues()) {
        // enum field: convert to STRING + foreign key
        field.meta.putFromEnumType(structRef.name);

        const fkMeta = Metadata_of();
        fkMeta.putFromEnumType(structRef.name);

        const fk = new ForeignKeySchemaClass(
          field.name,
          new KeySchema([field.name]),
          enumTable.name(),
          new RefPrimary(false),
          fkMeta,
        );
        structural.addForeignKey(fk);

        return Primitive.STRING;
      } else {
        const obj = this.findStructRefObj(structRef.name);
        if (obj !== null) {
          structRef.obj = obj;
        } else {
          this.errs.addErr(Errs.typeStructNotFound(this.ctx(), field.name, structRef.name));
        }
        return structRef;
      }
    }
    return simpleType;
  }

  /**
   * Find StructRef target: interface impl → local namespace → global.
   */
  private findStructRefObj(name: string): Fieldable | null {
    // 1. Search interface impls
    if (this.curTopNameable instanceof InterfaceSchema) {
      const obj = this.curTopNameable.findImpl(name);
      if (obj !== null) {
        return obj;
      }
    }

    // 2. Search local namespace
    const namespace = this.curTopNameable!.namespace();
    if (namespace !== '') {
      const fullName = makeName(namespace, name);
      const obj = this.cfgSchema.findFieldable(fullName);
      if (obj !== undefined) {
        return obj;
      }
    }

    // 3. Search global
    const obj = this.cfgSchema.findFieldable(name);
    return obj !== undefined ? obj : null;
  }

  private ctx(): string {
    return this.curNameable!.fullName();
  }

  // -----------------------------------------------------------------------
  // step2: resolve each nameable
  // -----------------------------------------------------------------------

  private step2_resolveEachNameable(): void {
    for (const item of this.cfgSchema.items()) {
      this.curNameable = item;
      this.curTopNameable = item;

      if (item instanceof InterfaceSchema) {
        this.resolveInterface(item);
      } else if (item instanceof TableSchema) {
        this.resolveTable(item);
      }
      // StructSchema — nothing to do
    }
  }

  private resolveInterface(sInterface: InterfaceSchema): void {
    const enumRef = sInterface.enumRef();
    if (enumRef !== '') {
      const enumRefTable = this.findTableInLocalThenGlobal(enumRef);
      if (enumRefTable !== null) {
        sInterface.setNullableEnumRefTable(enumRefTable);
      } else {
        this.errs.addErr(Errs.enumRefNotFound(this.ctx(), enumRef));
      }
    }

    if (sInterface.impls().length === 0) {
      this.errs.addErr(Errs.interfaceImplEmpty(this.ctx()));
    }

    const defaultImpl = sInterface.defaultImpl();
    if (defaultImpl !== '') {
      const defaultImplStruct = sInterface.findImpl(defaultImpl);
      if (defaultImplStruct !== null) {
        sInterface.setNullableDefaultImplStruct(defaultImplStruct);
      } else {
        this.errs.addErr(Errs.defaultImplNotFound(this.ctx(), defaultImpl));
      }
    }
  }

  private findTableInLocalThenGlobal(name: string): TableSchema | null {
    const namespace = this.curTopNameable!.namespace();
    if (namespace !== '') {
      const fullName = makeName(namespace, name);
      const table = this.cfgSchema.findTable(fullName);
      if (table !== undefined) {
        return table;
      }
    }
    const table = this.cfgSchema.findTable(name);
    return table !== undefined ? table : null;
  }

  private resolveTable(table: TableSchema): void {
    this.resolveEntry(table, table.entry);

    const primaryKey = table.primaryKey;
    if (this.resolveKey(table, primaryKey)) {
      this.checkPrimaryOrUniqueKey(primaryKey);
      this.checkPrimaryKeyEnumOrIntIfEnum(table, primaryKey);
    }
    for (const key of table.uniqueKeys()) {
      if (this.resolveKey(table, key)) {
        this.checkPrimaryOrUniqueKey(key);
      }
    }
  }

  private resolveEntry(table: TableSchema, entry: EntryType): void {
    if (isEEntry(entry) || isEEnum(entry)) {
      const entryBase = entry as { field: string; fieldSchema: FieldSchema | null; setFieldSchema(fs: FieldSchema): void };
      const fn = entryBase.field;
      const fs = table.findField(fn);
      if (fs !== null) {
        if (fs.type === Primitive.STRING) {
          entryBase.setFieldSchema(fs);
        } else {
          this.errs.addErr(Errs.entryFieldTypeNotStr(this.ctx(), fn, CfgWriter.typeStr(fs)));
        }
      } else {
        this.errs.addErr(Errs.entryNotFound(this.ctx(), fn));
      }
    }
  }

  private resolveKey(structural: Structural, key: KeySchema): boolean {
    const obj: FieldSchema[] = [];
    let ok = true;
    for (const name of key.fields()) {
      const field = structural.findField(name);
      obj.push(field!);
      if (field === null) {
        this.errs.addErr(Errs.keyNotFound(this.ctx(), name));
        ok = false;
      }
    }
    if (ok) {
      key.setFieldSchemas(obj);
    }
    return ok;
  }

  private checkPrimaryOrUniqueKey(key: KeySchema): void {
    const fields = key.fieldSchemas()!;
    if (fields.length === 1) {
      const field = fields[0];
      const type = field.type;
      if (isFList(type) || isFMap(type)) {
        this.errKeyTypeNotSupport(field.name, type.toString());
      } else {
        // SimpleType
        this.checkMapKey(type, field);
      }
    } else {
      for (const field of fields) {
        if (this.checkErrTypeAsKey(field.type)) {
          this.errKeyTypeNotSupport(field.name, field.type.toString());
        }
      }
    }
  }

  private checkPrimaryKeyEnumOrIntIfEnum(table: TableSchema, key: KeySchema): void {
    if (isEEnum(table.entry)) {
      const eEnum = table.entry as { fieldSchema: FieldSchema | null };
      const enumField = eEnum.fieldSchema;
      if (enumField === null) return;

      if (key.fieldSchemas()!.length !== 1) {
        this.errPrimaryKeyNotEnumOrIntWhenEnum(
          key.fields().join(','),
          'size=' + key.fieldSchemas()!.length,
          enumField.name,
        );
        return;
      }

      const pkField = key.fieldSchemas()![0];
      if (pkField !== enumField && pkField.type !== Primitive.INT) {
        this.errPrimaryKeyNotEnumOrIntWhenEnum(pkField.name, pkField.type.toString(), enumField.name);
      }
    }
  }

  private checkErrTypeAsKey(type: FieldType): boolean {
    return !(type === Primitive.BOOL || type === Primitive.INT || type === Primitive.LONG || type === Primitive.STRING);
  }

  private errKeyTypeNotSupport(field: string, errType: string): void {
    this.errs.addErr(Errs.keyTypeNotSupport(this.ctx(), field, errType));
  }

  private errPrimaryKeyNotEnumOrIntWhenEnum(field: string, errType: string, enumField: string): void {
    this.errs.addErr(Errs.primaryKeyNotEnumOrIntWhenEnum(this.ctx(), field, errType, enumField));
  }

  private checkMapKey(keyType: SimpleType, field: FieldSchema): void {
    let err: boolean;
    if (isPrimitive(keyType)) {
      err = this.checkErrTypeAsKey(keyType);
    } else if (keyType instanceof StructRef) {
      if (keyType.obj === null) {
        err = true;
      } else {
        if (keyType.obj instanceof InterfaceSchema) {
          err = true;
        } else if (keyType.obj instanceof StructSchema) {
          err = keyType.obj.fields().some((f) => this.checkErrTypeAsKey(f.type));
        } else {
          err = true;
        }
      }
    } else {
      err = true;
    }
    if (err) {
      this.errKeyTypeNotSupport(field.name, keyType.toString());
    }
  }

  // -----------------------------------------------------------------------
  // step3: resolve all foreign keys
  // -----------------------------------------------------------------------

  private step3_resolveAllForeignKeys(): void {
    this.resolve_structural((structural) => this.resolveForeignKeys(structural));
  }

  private resolveForeignKeys(structural: Structural): void {
    for (const foreignKey of structural.foreignKeys()) {
      this.resolveForeignKey(structural, foreignKey);
    }
  }

  private resolveForeignKey(structural: Structural, foreignKey: ForeignKeySchema): void {
    let err = false;
    const refTable = foreignKey.refTable;
    const refTableSchema = this.findTableInLocalThenGlobal(refTable);
    if (refTableSchema !== null) {
      foreignKey.setRefTableSchema(refTableSchema);
    } else {
      this.errs.addErr(Errs.refTableNotFound(this.ctx(), foreignKey.name, refTable));
      err = true;
    }

    const localKey = foreignKey.key;
    if (!this.resolveKey(structural, localKey)) {
      err = true;
    }

    if (err) {
      return;
    }

    foreignKey.setKeyIndices(findFieldIndices(structural, foreignKey.key));

    const refKey = foreignKey.refKey;
    if (isRefPrimary(refKey)) {
      this.checkLocalAndRemoteTypeMatch(foreignKey, localKey, refTableSchema!.primaryKey);
    } else if (isRefUniq(refKey)) {
      const remoteKey = refKey.key;
      const uk = refTableSchema!.findUniqueKey(remoteKey);
      if (uk !== null) {
        remoteKey.setFieldSchemas(uk.fieldSchemas()!);
        this.checkLocalAndRemoteTypeMatch(foreignKey, localKey, remoteKey);
      } else {
        this.errs.addErr(Errs.refTableKeyNotUniq(this.ctx(), foreignKey.name, refTable, refKey.key.fields()));
      }
    } else if (isRefList(refKey)) {
      if (localKey.fields().length !== 1) {
        this.errs.addErr(Errs.listRefMultiKeyNotSupport(this.ctx(), foreignKey.name, localKey.fields()));
        return;
      }

      const remoteKey = refKey.key;
      if (remoteKey.fields().length !== 1) {
        this.errs.addErr(Errs.listRefMultiKeyNotSupport(this.ctx(), foreignKey.name, remoteKey.fields()));
        return;
      }

      const remoteField = refTableSchema!.findField(remoteKey.fields()[0]);
      if (remoteField !== null) {
        remoteKey.setFieldSchemas([remoteField]);
        this.checkLocalAndRemoteTypeMatch(foreignKey, localKey, remoteKey);
      } else {
        this.errs.addErr(Errs.refTableKeyNotUniq(this.ctx(), foreignKey.name, refTable, refKey.key.fields()));
      }
    }
  }

  private checkLocalAndRemoteTypeMatch(
    foreignKey: ForeignKeySchema,
    localKey: KeySchema,
    remoteKey: KeySchema,
  ): void {
    const localFields = localKey.fieldSchemas()!;
    const remoteFields = remoteKey.fieldSchemas()!;

    if (localFields.length !== remoteFields.length) {
      this.errs.addErr(Errs.refLocalKeyRemoteKeyCountNotMatch(this.ctx(), foreignKey.toString()));
      return;
    }

    let ok = true;
    const len = localFields.length;
    for (let i = 0; i < len; i++) {
      const local = localFields[i];
      const remote = remoteFields[i];

      if (isFList(local.type) || isFMap(local.type)) {
        // ContainerType
        const refKey = foreignKey.refKey;
        if (isRefPrimary(refKey) && refKey.nullable) {
          this.errs.addErr(Errs.refContainerNullable(this.ctx(), foreignKey.name));
        }

        if (isFList(local.type)) {
          if (len !== 1 || !this.checkSimpleTypeMatch(local.type.item, remote.type)) {
            ok = false;
          }
        } else if (isFMap(local.type)) {
          if (len !== 1 || !this.checkSimpleTypeMatch(local.type.value, remote.type)) {
            ok = false;
          }
        }
      } else {
        // SimpleType
        if (!this.checkSimpleTypeMatch(local.type, remote.type)) {
          ok = false;
        }
      }
      if (!ok) {
        this.errs.addErr(
          Errs.refLocalKeyRemoteKeyTypeNotMatch(
            this.ctx(),
            foreignKey.name,
            local.type.toString(),
            remote.type.toString(),
          ),
        );
      }
    }
  }

  private checkSimpleTypeMatch(local: SimpleType, remote: FieldType): boolean {
    if (isPrimitive(local)) {
      return local === remote;
    }
    if (local instanceof StructRef) {
      return remote instanceof StructRef && local.obj === remote.obj;
    }
    return false;
  }

  // -----------------------------------------------------------------------
  // step4: check chained sep fmt
  // -----------------------------------------------------------------------

  private step4_checkAllChainedSepFmt(): void {
    for (const item of this.cfgSchema.items()) {
      if (item instanceof InterfaceSchema) {
        for (const impl of item.impls()) {
          if (impl.fmt() !== AutoOrPack.AUTO) {
            this.errs.addErr(Errs.implFmtNotSupport(item.name(), impl.name(), CfgWriter.fmtStr(impl.fmt())));
          }
        }
      } else if (item instanceof StructSchema) {
        if (isSep(item.fmt())) {
          let isAllFieldsPrimitive = true;
          for (const field of item.fields()) {
            if (!isPrimitive(field.type)) {
              isAllFieldsPrimitive = false;
              break;
            }
          }
          if (!isAllFieldsPrimitive) {
            this.errs.addErr(Errs.sepFmtStructHasUnPrimitiveField(item.name()));
          }
        }
      }
      // TableSchema — nothing to do
    }
  }

  // -----------------------------------------------------------------------
  // step5: check unused fieldable
  // -----------------------------------------------------------------------

  private step5_checkUnusedFieldable(): void {
    let needToCheck: FieldSchema[] = [];
    const tableMap = this.cfgSchema.tableMap();
    if (tableMap) {
      for (const table of tableMap.values()) {
        needToCheck = needToCheck.concat(table.fields());
      }
    }

    const collectedFieldableSet = new Set<string>();

    while (needToCheck.length > 0) {
      const needToCheckFieldables = new Map<string, Fieldable>();
      for (const field of needToCheck) {
        foreachFieldStructRef(field, (obj) => {
          if (obj !== null) {
            needToCheckFieldables.set(obj.name(), obj);
          }
        });
      }

      needToCheck = [];
      for (const f of needToCheckFieldables.values()) {
        const notCheckedBefore = collectedFieldableSet.add(f.name());
        if (notCheckedBefore) {
          if (f instanceof InterfaceSchema) {
            for (const impl of f.impls()) {
              needToCheck = needToCheck.concat(impl.fields());
            }
          } else if (f instanceof StructSchema) {
            needToCheck = needToCheck.concat(f.fields());
          }
        }
      }
    }

    const fieldableMap = this.cfgSchema.fieldableMap();
    if (fieldableMap) {
      for (const [key, value] of fieldableMap) {
        if (!collectedFieldableSet.has(key)) {
          if (value instanceof InterfaceSchema) {
            this.errs.addWarn(Errs.interfaceNotUsed(key));
          } else if (value instanceof StructSchema) {
            this.errs.addWarn(Errs.structNotUsed(key));
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: array-based set for string[] (value equality, not reference equality)
// ---------------------------------------------------------------------------

function arrEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

class StringArraySet {
  private _arrays: string[][] = [];

  add(arr: string[]): boolean {
    if (this.has(arr)) return false;
    this._arrays.push(arr);
    return true;
  }

  has(arr: string[]): boolean {
    return this._arrays.some((existing) => arrEqual(existing, arr));
  }

  values(): string[][] {
    return this._arrays;
  }

  get size(): number {
    return this._arrays.length;
  }
}

// ---------------------------------------------------------------------------
// Type guards (local)
// ---------------------------------------------------------------------------

function isFieldable(item: Nameable): item is Fieldable {
  return item instanceof StructSchema || item instanceof InterfaceSchema;
}

function isStructural(item: Nameable): item is Structural {
  return item instanceof StructSchema || item instanceof TableSchema;
}
