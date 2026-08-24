/**
 * ValueToJson — TypeScript port of Java `configgen.value.ValueToJson`.
 *
 * Serializes a Value tree to JSON for the cfgeditor save format.
 *
 * - VBool/VInt/VLong/VFloat → primitive JSON values
 * - VString → string
 * - VText → original (not translated) text
 * - VStruct → {$type, $note?, $fold?, embedFields*, field*, $refs?}
 * - VInterface → delegates to child VStruct
 * - VList → JSON array
 * - VMap → JSON array of {$type:$entry, key, value, $embed_value?, $fold?, $note?}
 *
 * isSaveDefault controls whether default-valued fields are included.
 *
 * Java source: configgen.value.ValueToJson.java (133 lines)
 */

import {
  type Value,
  type SimpleValue,
  VBool,
  VInt,
  VLong,
  VFloat,
  VString,
  VText,
  VStruct,
  VInterface,
  VList,
  VMap,
  type CfgValue,
} from './CfgValue';
import { ValueDefault } from './ValueDefault';
import { ValueRefCollector, type RefId, type FieldRef } from './ValueRefCollector';

export class ValueToJson {
  private readonly cfgValue: CfgValue | null;
  private readonly refIdToRecordMap: Map<RefId, VStruct> | null;
  private isSaveDefault: boolean;

  static toJsonStr(record: VStruct): string {
    const toJson = new ValueToJson();
    toJson.setSaveDefault(false);
    const json = toJson.toJson(record);
    return JSON.stringify(json, null, 2);
  }

  constructor();
  constructor(cfgValue: CfgValue, refIdToRecordMap: Map<RefId, VStruct>);
  constructor(cfgValue?: CfgValue, refIdToRecordMap?: Map<RefId, VStruct>) {
    this.cfgValue = cfgValue ?? null;
    this.refIdToRecordMap = refIdToRecordMap ?? null;
    this.isSaveDefault = true;
  }

  setSaveDefault(saveDefault: boolean): void {
    this.isSaveDefault = saveDefault;
  }

  toJson(value: Value): unknown {
    if (value instanceof VBool) return value.value;
    if (value instanceof VInt) return value.value;
    if (value instanceof VLong) return Number(value.value);
    if (value instanceof VFloat) return value.value;
    if (value instanceof VString) return value.value;
    if (value instanceof VText) return value.original; // Use original, not translated
    if (value instanceof VStruct) return this.toJsonVStruct(value);
    if (value instanceof VInterface) return this.toJsonVInterface(value);
    if (value instanceof VList) return this.toJsonVList(value);
    if (value instanceof VMap) return this.toJsonVMap(value);
    throw new Error(`Unknown Value type: ${value.constructor.name}`);
  }

  toJsonVStruct(vStruct: VStruct): Record<string, unknown> {
    const count = vStruct.values.length;
    const json: Record<string, unknown> = {};

    json['$type'] = vStruct.schema.fullName();

    const note = vStruct.note;
    if (note !== undefined && note.length > 0) {
      json['$note'] = note;
    }

    if (vStruct.isFold()) {
      json['$fold'] = true;
    }

    const embedFields = vStruct.embedFields;
    if (embedFields) {
      for (const [fieldName, embedded] of embedFields) {
        json[fieldName] = embedded;
      }
    }

    for (let i = 0; i < count; i++) {
      const fs = vStruct.schema.fields()[i];
      const fv = vStruct.values[i];
      if (this.isSaveDefault || !ValueDefault.isDefault(fv)) {
        json[fs.name] = this.toJson(fv);
      }
    }

    if (this.refIdToRecordMap !== null) {
      const fieldRefs: FieldRef[] = [];
      ValueRefCollector.collectStructRef(
        this.cfgValue!, vStruct, this.refIdToRecordMap, fieldRefs, '',
      );
      if (fieldRefs.length > 0) {
        json['$refs'] = fieldRefs.map(r => ({
          firstField: r.firstField,
          label: r.label,
          toTable: r.toTable,
          toId: r.toId,
        }));
      }
    }

    return json;
  }

  toJsonVInterface(vInterface: VInterface): Record<string, unknown> {
    return this.toJsonVStruct(vInterface.child);
  }

  toJsonVList(vList: VList): unknown[] {
    const json: unknown[] = [];
    for (const sv of vList.valueList) {
      json.push(this.toJson(sv));
    }
    return json;
  }

  toJsonVMap(vMap: VMap): Record<string, unknown>[] {
    const json: Record<string, unknown>[] = [];
    const entryEmbeds = vMap.entryEmbeds;
    const foldedEntries = vMap.foldedEntries;
    const entryNotes = vMap.entryNotes;

    for (const [key, value] of vMap.valueMap.entries()) {
      const entryJson: Record<string, unknown> = {};
      entryJson['$type'] = '$entry';
      entryJson['key'] = this.toJson(key);
      entryJson['value'] = this.toJson(value);

      if (entryEmbeds && mapHasKey(entryEmbeds, key)) {
        entryJson['$embed_value'] = entryEmbeds.get(key)!;
      }
      if (foldedEntries && setHas(set2arr(foldedEntries), key)) {
        entryJson['$fold'] = true;
      }
      if (entryNotes && mapHasKey(entryNotes, key)) {
        entryJson['$note'] = entryNotes.get(key)!;
      }

      json.push(entryJson);
    }
    return json;
  }
}

// ---------------------------------------------------------------------------
// Helpers: Map/Set lookup using valueEquals (TS Map uses ===, not equals/hashCode)
// ---------------------------------------------------------------------------

import { valueEquals } from './CfgValue';

function mapHasKey(map: Map<SimpleValue, unknown>, key: SimpleValue): boolean {
  for (const k of map.keys()) {
    if (valueEquals(k, key)) return true;
  }
  return false;
}

function setHas(arr: SimpleValue[], key: SimpleValue): boolean {
  for (const k of arr) {
    if (valueEquals(k, key)) return true;
  }
  return false;
}

function set2arr<T>(s: Set<T>): T[] {
  return Array.from(s);
}
