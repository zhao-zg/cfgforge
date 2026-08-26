/**
 * ValueJsonParser — TypeScript port of Java `configgen.value.ValueJsonParser`.
 *
 * Parses JSON strings into VStruct values, with full support for:
 *   - All primitive types (bool, int, long, float, str, text)
 *   - Struct references (nested structs and interfaces)
 *   - Lists (FList) and Maps (FMap, as arrays of {key, value} entries)
 *   - cfgeditor metadata ($note, $fold, $embed_*, $type, $entry metadata)
 *   - Extra field validation (JsonHasExtraFields warning)
 *   - Error handling (empty JSON, parse errors, type mismatches)
 *
 * Java source: configgen.value.ValueJsonParser.java (377 lines)
 */

import { DFile } from '@cfggen/data';
import {
  type FieldType,
  type Nameable,
  type Structural,
  InterfaceSchema,
  Primitive,
  FList,
  FMap,
  isPrimitive,
  isStructRef,
  isFList,
  isFMap,
  type TableSchema,
  type FieldSchema,
} from '@cfggen/schema';
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
} from './CfgValue';
import {
  type CfgValueErrs,
  jsonStrEmpty,
  jsonParseException,
  jsonTypeNotExist,
  jsonTypeNotMatch,
  jsonValueNotMatchType,
  jsonHasExtraFields,
  EType,
} from './CfgValueErrs';
import { ValueDefault } from './ValueDefault';

// ---------------------------------------------------------------------------
// JSON value type aliases (TS replacements for FastJSON2 types)
// ---------------------------------------------------------------------------

/** A parsed JSON object — Record<string, unknown> */
type JsonObject = Record<string, unknown>;
/** A parsed JSON array */
type JsonArray = unknown[];

// ---------------------------------------------------------------------------
// ValueJsonParser
// ---------------------------------------------------------------------------

export class ValueJsonParser {
  private readonly tableSchema: TableSchema;
  private readonly isTableSchemaPartial: boolean;
  private readonly errs: CfgValueErrs;

  constructor(tableSchema: TableSchema, errs: CfgValueErrs);
  constructor(tableSchema: TableSchema, isTableSchemaPartial: boolean, errs: CfgValueErrs);
  constructor(tableSchema: TableSchema, ...args: unknown[]) {
    this.tableSchema = tableSchema;
    if (args.length === 1) {
      this.isTableSchemaPartial = false;
      this.errs = args[0] as CfgValueErrs;
    } else {
      this.isTableSchemaPartial = args[0] as boolean;
      this.errs = args[1] as CfgValueErrs;
    }
  }

  // --- Public API ---

  fromJson(jsonStr: string): VStruct;
  fromJson(jsonStr: string, source: DFile): VStruct;
  fromJson(jsonStr: string, source?: DFile): VStruct {
    const src = source ?? DFile.of('<server>', this.tableSchema.name());
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return this.parseStructural(this.tableSchema, parsed as JsonObject, src);
      } else {
        this.errs.addErr(jsonStrEmpty(src));
      }
    } catch (e) {
      this.errs.addErr(jsonParseException(src, (e as Error).message));
    }
    return ValueDefault.ofStructural(this.tableSchema, src);
  }

  // --- Private methods ---

  private static readonly jsonExtraKeySet: Set<string> = new Set(['$type', '$note', '$fold', '$refs']);

  private parseNameable(nameable: Nameable, jsonObject: JsonObject, source: DFile): SimpleValue {
    if (nameable instanceof InterfaceSchema) {
      return this.parseInterface(nameable, jsonObject, source);
    }
    // Structural
    return this.parseStructural(nameable as Structural, jsonObject, source);
  }

  private parseStructural(structural: Structural, jsonObject: JsonObject, source: DFile): VStruct {
    const type = structural.fullName();

    const vStruct = new VStruct(structural, [], source);
    const thisSource = source.withInStruct(structural.fullName());

    for (const fs of structural.fields()) {
      const fieldObj = jsonObject[fs.name];
      let fieldValue: Value;
      const fieldSource = thisSource.child(fs.name);

      if (fieldObj !== undefined && fieldObj !== null) {
        fieldValue = this.parse(fs.type, fieldObj, fieldSource, fs);
      } else {
        // not throw exception, but use default value
        fieldValue = ValueDefault.of(fs.type, fieldSource);
      }
      vStruct.values.push(fieldValue);
    }

    // $note
    const note = jsonObject['$note'];
    if (typeof note === 'string' && note.length > 0) {
      vStruct.setNote(note);
    }

    // $fold
    const fold = this.parseBool(jsonObject['$fold'], thisSource.child('$fold'));
    if (fold) {
      vStruct.setFold(true);
    }

    // $embed_<fieldName> fields
    let embedFields: Map<string, boolean> | null = null;
    for (const [k, v] of Object.entries(jsonObject)) {
      if (k.startsWith('$embed_') && typeof v === 'boolean') {
        if (embedFields === null) {
          embedFields = new Map();
        }
        embedFields.set(k, v);
      }
    }
    if (embedFields !== null) {
      vStruct.setEmbedFields(embedFields);
    }

    // Extra fields warning
    if (!this.isTableSchemaPartial) {
      const jsonKeys = new Set<string>(Object.keys(jsonObject));
      // Remove known field names
      for (const fn of structural.fieldNameSet()) {
        jsonKeys.delete(fn);
      }
      for (const ek of ValueJsonParser.jsonExtraKeySet) {
        jsonKeys.delete(ek);
      }
      if (embedFields !== null) {
        for (const ek of embedFields.keys()) {
          jsonKeys.delete(ek);
        }
      }
      if (jsonKeys.size > 0) {
        this.errs.addWarn(jsonHasExtraFields(thisSource, type, jsonKeys));
      }
    }

    return vStruct;
  }

  private parseInterface(interfaceSchema: InterfaceSchema, jsonObject: JsonObject, source: DFile): VInterface {
    const type = jsonObject['$type'];
    const name = interfaceSchema.name();

    if (type === undefined || type === null) {
      this.errs.addErr(jsonTypeNotExist(source, name));
      return ValueDefault.ofInterface(interfaceSchema, source);
    }

    let implName: string;
    const interfaceNamePrefix = name + '.';

    if (typeof type === 'string' && type.includes('.')) {
      if (type.startsWith(interfaceNamePrefix)) {
        // Old version data with prefix
        implName = type.substring(interfaceNamePrefix.length);
      } else {
        this.errs.addErr(jsonTypeNotMatch(source, type, name));
        return ValueDefault.ofInterface(interfaceSchema, source);
      }
    } else {
      implName = type as string; // Recommended: no prefix
    }

    const impl = interfaceSchema.findImpl(implName);
    if (impl === null) {
      this.errs.addErr(jsonTypeNotMatch(source, type as string, name));
      return ValueDefault.ofInterface(interfaceSchema, source);
    }

    const implValue = this.parseStructural(impl, jsonObject, source.lastAppend('<' + implName + '>'));
    return new VInterface(interfaceSchema, implValue, source);
  }

  private parseBool(obj: unknown, source: DFile): boolean {
    if (obj === undefined || obj === null) {
      return false;
    }
    if (typeof obj === 'boolean') {
      return obj;
    }
    if (typeof obj === 'number') {
      return obj === 1;
    }
    this.errs.addErr(jsonValueNotMatchType(source, String(obj), EType.BOOL));
    return false;
  }

  private parseSimpleType(type: Exclude<FieldType, FList | FMap>, obj: unknown, source: DFile, fieldSchema: FieldSchema): SimpleValue {
    if (isPrimitive(type)) {
      switch (type) {
        case Primitive.BOOL:
          return new VBool(this.parseBool(obj, source), source);

        case Primitive.INT: {
          let iv = 0;
          if (typeof obj === 'number') {
            iv = Math.trunc(obj);
          } else {
            this.errs.addErr(jsonValueNotMatchType(source, String(obj), EType.INT));
          }
          return new VInt(iv, source);
        }

        case Primitive.LONG: {
          let lv = 0n;
          if (typeof obj === 'number') {
            lv = BigInt(Math.trunc(obj));
          } else {
            this.errs.addErr(jsonValueNotMatchType(source, String(obj), EType.LONG));
          }
          return new VLong(lv, source);
        }

        case Primitive.FLOAT: {
          let fv = 0;
          if (typeof obj === 'number') {
            fv = obj;
          } else {
            this.errs.addErr(jsonValueNotMatchType(source, String(obj), EType.FLOAT));
          }
          return new VFloat(fv, source);
        }

        case Primitive.STRING: {
          let sv = '';
          if (typeof obj === 'string') {
            sv = obj;
            if (fieldSchema.isLowercase()) {
              sv = sv.toLowerCase();
            }
          } else {
            this.errs.addErr(jsonValueNotMatchType(source, String(obj), EType.STR));
          }
          return new VString(sv, source);
        }

        case Primitive.TEXT: {
          let sv = '';
          if (typeof obj === 'string') {
            sv = obj;
            if (fieldSchema.isLowercase()) {
              sv = sv.toLowerCase();
            }
          } else {
            this.errs.addErr(jsonValueNotMatchType(source, String(obj), EType.STR));
          }
          return new VText(sv, source);
        }
      }
    }

    // StructRef
    if (isStructRef(type)) {
      let ov: JsonObject | null = null;
      if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
        ov = obj as JsonObject;
      } else {
        this.errs.addErr(jsonValueNotMatchType(source, String(obj), EType.STRUCT));
      }
      if (ov !== null) {
        return this.parseNameable(type.obj as Nameable, ov, source);
      } else {
        return ValueDefault.ofNamable(type.obj as Nameable, source);
      }
    }

    // Should never reach here
    throw new Error(`Unknown simple type: ${String(type)}`);
  }

  private parse(type: FieldType, obj: unknown, source: DFile, fieldSchema: FieldSchema): Value {
    if (isFList(type)) {
      let jsonArray: JsonArray = [];
      if (Array.isArray(obj)) {
        jsonArray = obj;
      } else {
        this.errs.addErr(jsonValueNotMatchType(source, String(obj), EType.ARRAY));
      }

      const vList = new VList([], source);
      let i = 0;
      for (const itemObj of jsonArray) {
        const v = this.parse(type.item, itemObj, source.child('[' + i + ']'), fieldSchema);
        if (isSimpleValueOrStructOrInterface(v)) {
          vList.valueList.push(v as SimpleValue);
        }
        i++;
      }
      return vList;
    }

    if (isFMap(type)) {
      let jsonArray: JsonArray = [];
      if (Array.isArray(obj)) {
        jsonArray = obj;
      } else {
        this.errs.addErr(jsonValueNotMatchType(source, String(obj), EType.MAP));
      }

      const vMap = new VMap(new Map(), source);
      let entryEmbeds: Map<SimpleValue, boolean> | null = null;
      let foldedEntries: Set<SimpleValue> | null = null;
      let entryNotes: Map<SimpleValue, string> | null = null;

      let i = 0;
      for (const itemObj of jsonArray) {
        let entry: JsonObject | null = null;
        if (itemObj !== null && typeof itemObj === 'object' && !Array.isArray(itemObj)) {
          entry = itemObj as JsonObject;
        } else {
          this.errs.addErr(jsonValueNotMatchType(source.child('[e' + i + ']'), String(itemObj), EType.MAP_ENTRY));
        }

        if (entry !== null) {
          const keyObj = entry['key'];
          const ks = source.child('[k' + i + ']');
          if (keyObj === undefined || keyObj === null) {
            this.errs.addErr(jsonValueNotMatchType(ks, String(itemObj), EType.MAP_ENTRY));
          }

          const valueObj = entry['value'];
          const vs = source.child('[v' + i + ']');
          if (valueObj === undefined || valueObj === null) {
            this.errs.addErr(jsonValueNotMatchType(vs, String(itemObj), EType.MAP_ENTRY));
          }

          if (keyObj !== undefined && keyObj !== null && valueObj !== undefined && valueObj !== null) {
            const key = this.parseSimpleType(type.key, keyObj, ks, fieldSchema);
            const value = this.parseSimpleType(type.value, valueObj, vs, fieldSchema);
            vMap.valueMap.set(key, value);

            // $embed_value
            const embedVal = entry['$embed_value'];
            if (typeof embedVal === 'boolean') {
              if (entryEmbeds === null) {
                entryEmbeds = new Map();
              }
              entryEmbeds.set(key, embedVal);
            }

            // $fold
            const foldVal = entry['$fold'];
            if (typeof foldVal === 'boolean' && foldVal) {
              if (foldedEntries === null) {
                foldedEntries = new Set();
              }
              foldedEntries.add(key);
            }

            // $note
            const noteVal = entry['$note'];
            if (typeof noteVal === 'string' && noteVal.length > 0) {
              if (entryNotes === null) {
                entryNotes = new Map();
              }
              entryNotes.set(key, noteVal);
            }
          }
        }
        i++;
      }

      if (entryEmbeds !== null) vMap.setEntryEmbeds(entryEmbeds);
      if (foldedEntries !== null) vMap.setFoldedEntries(foldedEntries);
      if (entryNotes !== null) vMap.setEntryNotes(entryNotes);

      return vMap;
    }

    // SimpleType (Primitive or StructRef)
    return this.parseSimpleType(type, obj, source, fieldSchema);
  }
}

// ---------------------------------------------------------------------------
// Helper: check if a Value can be a SimpleValue (VStruct and VInterface are SimpleValue)
// ---------------------------------------------------------------------------

function isSimpleValueOrStructOrInterface(v: Value): boolean {
  return v instanceof VBool
    || v instanceof VInt
    || v instanceof VLong
    || v instanceof VFloat
    || v instanceof VString
    || v instanceof VText
    || v instanceof VStruct
    || v instanceof VInterface;
}
