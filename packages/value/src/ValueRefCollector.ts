/**
 * ValueRefCollector — TypeScript port of Java `configgen.value.ValueRefCollector`.
 *
 * Collects foreign key reference information from a Value tree:
 *   - RefId: (table, id) — identifies a referenced record
 *   - FieldRef: (firstField, label, toTable, toId) — describes a link
 *
 * Static API:
 *   - collectStructRef(cfgValue, vStruct, refIdToRecordMap, fieldRefs, namePrefix)
 *     Collects refs from a single VStruct's foreign keys.
 *   - collectRefs(record, cfgValue)
 *     Convenience: recursively collects all field refs from a Value tree.
 *
 * Instance API:
 *   - new ValueRefCollector(cfgValue, refIdToRecordMap, fieldRefs)
 *   - collect(value, prefix) — recursively traverses Value tree
 *
 * Java source: configgen.value.ValueRefCollector.java (184 lines)
 */

import {
  type Value,
  VStruct,
  VInterface,
  VList,
  VMap,
  VString,
  VText,
  type CfgValue,
  valueEquals,
} from './CfgValue';
import { ValueUtil } from './ValueUtil';
import { upper1 } from '@cfgforge/shared';
import type { ForeignKeySchema, Structural } from '@cfgforge/schema';
import { isRefPrimary, isRefUniq, isFList, isFMap, isSimpleType, type RefSimple } from '@cfgforge/schema';

// ---------------------------------------------------------------------------
// Record types (Java records → TS classes)
// ---------------------------------------------------------------------------

export class RefId {
  constructor(
    public readonly table: string,
    public readonly id: string,
  ) {}
}

export class FieldRef {
  constructor(
    public readonly firstField: string,
    public readonly label: string,
    public readonly toTable: string,
    public readonly toId: string,
  ) {}
}

// ---------------------------------------------------------------------------
// ValueRefCollector
// ---------------------------------------------------------------------------

export class ValueRefCollector {
  private readonly cfgValue: CfgValue;
  private readonly resultRefIdToRecordMap: Map<RefId, VStruct>;
  private readonly resultFieldRefs: FieldRef[];

  constructor(
    cfgValue: CfgValue,
    resultRefIdToRecordMap: Map<RefId, VStruct>,
    resultFieldRefs: FieldRef[],
  ) {
    this.cfgValue = cfgValue;
    this.resultRefIdToRecordMap = resultRefIdToRecordMap;
    this.resultFieldRefs = resultFieldRefs;
  }

  // -------------------------------------------------------------------------
  // Static convenience: collect all refs from a Value tree
  // -------------------------------------------------------------------------

  static collectRefs(record: Value, cfgValue: CfgValue): FieldRef[] {
    const resultFieldRefs: FieldRef[] = [];
    const newFrontier = new Map<RefId, VStruct>();
    const collector = new ValueRefCollector(cfgValue, newFrontier, resultFieldRefs);
    collector.collect(record, []);
    return resultFieldRefs;
  }

  // -------------------------------------------------------------------------
  // Static: collect struct-level FK refs from a single VStruct
  // -------------------------------------------------------------------------

  static collectStructRef(
    cfgValue: CfgValue,
    vStruct: VStruct,
    refIdToRecordMap: Map<RefId, VStruct>,
    fieldRefs: FieldRef[] | null,
    namePrefix: string,
  ): FieldRef[] {
    if (fieldRefs === null) {
      fieldRefs = [];
    }

    const structural: Structural = vStruct.schema;
    for (const fk of structural.foreignKeys()) {
      const refKey = fk.refKey;
      const foreignKeyValueMap = ValueUtil.getForeignKeyValueMap(cfgValue, fk);
      if (foreignKeyValueMap === null) {
        continue;
      }

      // Only RefSimple (RefPrimary / RefUniq) — RefList not handled here
      if (isRefPrimary(refKey) || isRefUniq(refKey)) {
        const refSimple = refKey as RefSimple;
        const firstField = fk.key.fieldSchemas()![0];
        const ft = firstField.type;

        // Allow custom ref name via refTitle meta
        let refName: string | null = null;
        const refTitleFieldName = fk.meta.getStr('refTitle', '');
        if (refTitleFieldName !== '') {
          const refTitleValue = ValueUtil.extractFieldValue(vStruct, refTitleFieldName);
          if (refTitleValue instanceof VString || refTitleValue instanceof VText) {
            refName = (refTitleValue as VString | VText).value;
          }
        }
        if (refName === null) {
          const baseName = refSimple.nullable ? 'nullableRef' : 'ref';
          refName = namePrefix + baseName + upper1(fk.name);
        }

        if (isSimpleType(ft)) {
          // SimpleType field — single value lookup
          const localValue = ValueUtil.extractKeyValue(vStruct, fk.keyIndices()!);
          const refRecord = mapGet(foreignKeyValueMap, localValue);
          if (refRecord) {
            addRef(refIdToRecordMap, fieldRefs, fk, refName, localValue.packStr(), refRecord);
          }
        } else if (isFList(ft)) {
          // FList field — iterate list elements
          const localList = vStruct.values[fk.keyIndices()![0]] as VList;
          for (const item of localList.valueList) {
            const refRecord = mapGet(foreignKeyValueMap, item);
            if (refRecord) {
              addRef(refIdToRecordMap, fieldRefs, fk, refName, item.packStr(), refRecord);
            }
          }
        } else if (isFMap(ft)) {
          // FMap field — iterate map values
          const localMap = vStruct.values[fk.keyIndices()![0]] as VMap;
          for (const val of localMap.valueMap.values()) {
            const refRecord = mapGet(foreignKeyValueMap, val);
            if (refRecord) {
              addRef(refIdToRecordMap, fieldRefs, fk, refName, val.packStr(), refRecord);
            }
          }
        }
      }
    }
    return fieldRefs;
  }

  // -------------------------------------------------------------------------
  // Instance: recursive collect
  // -------------------------------------------------------------------------

  collect(value: Value, prefix: string[]): void {
    if (value instanceof VStruct) {
      this.collectVStruct(value, prefix);
    } else if (value instanceof VInterface) {
      this.collectVInterface(value, prefix);
    } else if (value instanceof VList) {
      this.collectVList(value, prefix);
    } else if (value instanceof VMap) {
      this.collectVMap(value, prefix);
    }
    // Primitive values: no-op
  }

  collectVStruct(vStruct: VStruct, prefix: string[]): void {
    let pre = '';
    if (prefix.length > 0) {
      pre = prefix.join('.') + '.';
    }

    ValueRefCollector.collectStructRef(
      this.cfgValue, vStruct, this.resultRefIdToRecordMap, this.resultFieldRefs, pre,
    );

    let i = 0;
    for (const value of vStruct.values) {
      const name = vStruct.schema.fields()[i].name;
      this.collect(value, [...prefix, name]);
      i++;
    }
  }

  collectVInterface(vInterface: VInterface, prefix: string[]): void {
    this.collectVStruct(vInterface.child, prefix);
  }

  collectVList(vList: VList, prefix: string[]): void {
    let i = 0;
    for (const sv of vList.valueList) {
      this.collect(sv, [...prefix, String(i)]);
      i++;
    }
  }

  collectVMap(vMap: VMap, prefix: string[]): void {
    let i = 0;
    for (const [key, value] of vMap.valueMap.entries()) {
      this.collect(key, [...prefix, i + 'k']);
      this.collect(value, [...prefix, i + 'v']);
      i++;
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function addRef(
  refIdToRecordMap: Map<RefId, VStruct>,
  fieldRefs: FieldRef[],
  fk: ForeignKeySchema,
  refName: string,
  id: string,
  refRecord: VStruct,
): void {
  const table = fk.refTableNormalized();
  const refId = new RefId(table, id);
  refIdToRecordMap.set(refId, refRecord);
  fieldRefs.push(new FieldRef(fk.key.fieldSchemas()![0].name, refName, table, id));
}

/**
 * Map lookup using valueEquals (TS Map uses ===, not equals/hashCode).
 */
function mapGet(map: Map<Value, VStruct>, value: Value): VStruct | undefined {
  for (const [k, v] of map) {
    if (valueEquals(k, value)) {
      return v;
    }
  }
  return undefined;
}
