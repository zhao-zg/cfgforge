/**
 * VTableCreator — TypeScript port of Java `configgen.value.VTableCreator`.
 *
 * Builds a VTable from a list of VStruct values:
 * - Generates enum virtual data if the table has enumValues meta.
 * - Extracts primary key and unique key indices.
 * - Sorts primary key map by int value when PK is VInt.
 * - Collects enum names and enumNameToIntegerValueMap for EEntry/EEnum tables.
 * - Validates seq field continuity.
 *
 * Java source: configgen.value.VTableCreator.java (171 lines)
 */

import {
  VString,
  VText,
  VInt,
  VStruct,
  VTable,
  valueEquals,
  type Value,
  type SimpleValue,
} from './CfgValue';
import type { CfgValueErrs } from './CfgValueErrs';
import {
  primaryOrUniqueKeyDuplicated,
  enumEmpty,
  entryContainsSpace,
  entryDuplicated,
  seqValueNotContinuous,
} from './CfgValueErrs';
import { ValueUtil } from './ValueUtil';
import { DCellList, type Source } from '@cfggen/data';
import {
  type TableSchema,
  type KeySchema,
  type EntryType,
  type MetaEnumValues,
  type MetaEnumValuesOfEmpty,
  type MetaEnumValuesOfAssigned,
  Metadata,
  ENo,
  isEEntry,
  isEEnum,
  findFieldIndices,
  findFieldIndex,
  Primitive,
} from '@cfggen/schema';

export class VTableCreator {
  private readonly tableSchema: TableSchema;
  private readonly errs: CfgValueErrs;

  constructor(tableSchema: TableSchema, errs: CfgValueErrs) {
    this.tableSchema = tableSchema;
    this.errs = errs;
  }

  create(valueList: VStruct[]): VTable {
    // Check if this is a schema-defined enum
    const enumValues = this.tableSchema.meta().getEnumValues();

    if (enumValues !== null) {
      // Generate virtual data
      valueList = this.generateEnumData(enumValues);
    }

    // Collect primary key and unique keys
    const capacity = Math.floor(valueList.length / 0.75) + 1;
    let primaryKeyMap = new Map<Value, VStruct>();
    const uniqueKeyValueSetMap = new Map<string[], Map<Value, VStruct>>();

    this.extractKeyValues(primaryKeyMap, valueList, this.tableSchema.primaryKey);

    // Sort if PK is int type
    primaryKeyMap = this.sortIfPKIsNumber(primaryKeyMap);

    for (const uniqueKey of this.tableSchema.uniqueKeys()) {
      const ukMap = new Map<Value, VStruct>();
      this.extractKeyValues(ukMap, [...primaryKeyMap.values()], uniqueKey);
      uniqueKeyValueSetMap.set(uniqueKey.fields(), ukMap);
    }

    // Collect enum names
    let enumNames: Set<string> | null = null;
    let enumNameToIntegerValueMap: Map<string, number> | null = null;

    const entry = this.tableSchema.entry;
    if (isEEntry(entry) || isEEnum(entry)) {
      const names = new Set<string>(); // uppercase tracker
      const idx = findFieldIndex(this.tableSchema, entry.fieldSchema!);

      enumNames = new Set<string>();

      let pkIdx = -1;
      const pk = this.tableSchema.primaryKey;
      const pkFields = pk.fieldSchemas();
      if (pkFields !== null && pkFields.length === 1 && pkFields[0] !== entry.fieldSchema) {
        pkIdx = findFieldIndex(this.tableSchema, pkFields[0]);
        enumNameToIntegerValueMap = new Map<string, number>();
      }

      for (const vStruct of valueList) {
        const vStr = vStruct.values[idx] as VString;
        const e = vStr.value;

        if (e.includes(' ')) {
          this.errs.addErr(entryContainsSpace(vStr.source, this.tableSchema.name()));
          continue;
        }

        if (e.length === 0) {
          if (isEEnum(entry)) {
            this.errs.addErr(enumEmpty(vStr.source, this.tableSchema.name()));
          }
        } else {
          const upperName = e.toUpperCase();
          if (names.has(upperName)) {
            this.errs.addErr(entryDuplicated(vStr.source, this.tableSchema.name()));
          } else {
            names.add(upperName);
            enumNames.add(e);

            if (pkIdx !== -1) {
              const vInt = vStruct.values[pkIdx] as VInt;
              enumNameToIntegerValueMap!.set(e, vInt.value);
            }
          }
        }
      }
    }

    // Validate seq fields
    this.validateSeqFields(valueList);

    return new VTable(
      this.tableSchema,
      valueList,
      primaryKeyMap,
      uniqueKeyValueSetMap,
      enumNames,
      enumNameToIntegerValueMap,
    );
  }

  private generateEnumData(enumValues: MetaEnumValues): VStruct[] {
    const valueList: VStruct[] = [];
    const autoSource: Source = DCellList.of(); // empty source for auto-generated data

    if (enumValues._tag === 'OfEmpty') {
      const empty = enumValues as MetaEnumValuesOfEmpty;
      for (const ev of empty.values) {
        const vStruct = new VStruct(
          this.tableSchema,
          [
            new VString(ev.name, autoSource),
            new VText(ev.comment, autoSource),
          ],
          autoSource,
        );
        valueList.push(vStruct);
      }
    } else {
      const assigned = enumValues as MetaEnumValuesOfAssigned;
      for (const ev of assigned.values) {
        const vStruct = new VStruct(
          this.tableSchema,
          [
            new VString(ev.name, autoSource),
            new VInt(ev.number, autoSource),
            new VText(ev.comment, autoSource),
          ],
          autoSource,
        );
        valueList.push(vStruct);
      }
    }

    return valueList;
  }

  private validateSeqFields(valueList: VStruct[]): void {
    for (const field of this.tableSchema.fields()) {
      if (!field.isSeq()) continue;

      const fieldIdx = findFieldIndex(this.tableSchema, field);
      let nextExpected = 0;

      for (const vStruct of valueList) {
        const v = vStruct.values[fieldIdx];
        if (v instanceof VInt) {
          const val = v.value;
          if (val !== nextExpected) {
            this.errs.addErr(seqValueNotContinuous(
              v.source,
              this.tableSchema.name(),
              field.name,
              val,
            ));
          }
          nextExpected++;
        }
      }
    }
  }

  private extractKeyValues(
    keyMap: Map<Value, VStruct>,
    valueList: Iterable<VStruct>,
    key: KeySchema,
  ): void {
    const keyIndices = findFieldIndices(this.tableSchema, key);
    for (const value of valueList) {
      const keyValue = ValueUtil.extractKeyValue(value, keyIndices);
      // TS Map uses reference equality (===), but Value types need equals() check.
      // Must manually check for duplicates and replace the old entry.
      let existingKey: Value | null = null;
      for (const ek of keyMap.keys()) {
        if (valueEquals(ek, keyValue)) {
          existingKey = ek;
          break;
        }
      }
      if (existingKey !== null) {
        this.errs.addErr(primaryOrUniqueKeyDuplicated(
          keyValue,
          this.tableSchema.name(),
          key.fields(),
        ));
        // Remove old key and set new one so the map has only one entry per value
        keyMap.delete(existingKey);
      }
      keyMap.set(keyValue, value);
    }
  }

  private sortIfPKIsNumber(
    keyMap: Map<Value, VStruct>,
  ): Map<Value, VStruct> {
    if (keyMap.size <= 1) {
      return keyMap;
    }

    const firstKey = [...keyMap.keys()][0];
    if (firstKey instanceof VInt) {
      const entries = [...keyMap.entries()];
      entries.sort((a, b) => {
        const aVal = (a[0] as VInt).value;
        const bVal = (b[0] as VInt).value;
        return aVal - bVal;
      });
      const sortedMap = new Map<Value, VStruct>();
      for (const [k, v] of entries) {
        sortedMap.set(k, v);
      }
      return sortedMap;
    }
    return keyMap;
  }
}
