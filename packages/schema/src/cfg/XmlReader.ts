/**
 * XmlReader — TypeScript port of Java `configgen.schema.cfg.XmlReader`.
 *
 * Reads XML configuration files and builds CfgSchema objects.
 * Uses fast-xml-parser instead of Java DOM (DOMUtil).
 *
 * Java is an enum singleton (INSTANCE) with static readFromDir + readTo.
 * TS: static methods on XmlReader class.
 *
 * Key translations:
 * - DOMUtil.rootElement(file) → XMLParser.parseXML(xmlString)
 * - DOMUtil.elements(self, "bean") → getChildren(obj, "bean")
 * - element.getAttribute("name") → obj["@_name"]
 * - DOMUtil.parseStringArray(self, attr) → parseStringArray(obj, attr)
 */

import { XMLParser } from 'fast-xml-parser';
import { Logger } from '@cfggen/shared';
import { CfgSchema } from '../CfgSchema';
import { TableSchema } from '../TableSchema';
import { StructSchema } from '../StructSchema';
import { InterfaceSchema } from '../InterfaceSchema';
import { FieldSchema } from '../FieldSchema';
import { ForeignKeySchema } from '../ForeignKeySchema';
import { KeySchema } from '../KeySchema';
import { EntryType, ENo, EEntry, EEnum } from '../EntryType';
import { RefKey, RefPrimary, RefUniq, RefList } from '../RefKey';
import { FieldType, Primitive, StructRef, FList, FMap, SimpleType } from '../FieldType';
import { FieldFormat, AutoOrPack, Sep, Fix, Block } from '../FieldFormat';
import { Metadata, Metadata_of, TAG, metaStr, metaInt } from '../Metadata';
import { CommentData } from '../CommentData';
import type { Fieldable } from '../Fieldable';
import type { Nameable } from '../Nameable';

// ---------------------------------------------------------------------------
// XmlElement — normalized representation of a parsed XML element
// ---------------------------------------------------------------------------

export interface XmlElement {
  /** Attribute values keyed by attribute name (without @_ prefix). */
  attributes: Record<string, string>;
  /** Child elements grouped by tag name. */
  children: Record<string, XmlElement[]>;
}

// ---------------------------------------------------------------------------
// XmlReader
// ---------------------------------------------------------------------------

export class XmlReader {

  /**
   * Parse an XML string and add schemas to the destination CfgSchema.
   *
   * @param destination the CfgSchema to add parsed items to
   * @param xmlContent  the XML string to parse
   * @param pkgNameDot  the namespace prefix (e.g. "equip." or "")
   */
  static readTo(destination: CfgSchema, xmlContent: string, pkgNameDot: string): void {
    const root = XmlReader.parseRoot(xmlContent);
    if (!root) return;

    // Parse <bean> elements (struct or interface)
    const beans = getChildren(root, 'bean');
    for (const e of beans) {
      const f: Fieldable = hasAttr(e, 'enumRef')
        ? XmlReader.parseInterface(e, pkgNameDot)
        : XmlReader.parseStruct(e, pkgNameDot, null);
      destination.add(f as Nameable);
    }

    // Parse <table> elements
    const tables = getChildren(root, 'table');
    for (const e of tables) {
      const t = XmlReader.parseTable(e, pkgNameDot);
      destination.add(t as Nameable);
    }
  }

  // -------------------------------------------------------------------------
  // parseTable
  // -------------------------------------------------------------------------

  private static parseTable(self: XmlElement, pkgNameDot: string): TableSchema {
    const name = getAttr(self, 'name').trim();
    const primaryKey = XmlReader.getKeySchema(self, 'primaryKey');

    let entry: EntryType;
    if (hasAttr(self, 'enum')) {
      entry = new EEnum(getAttr(self, 'enum').trim());
    } else if (hasAttr(self, 'entry')) {
      entry = new EEntry(getAttr(self, 'entry').trim());
    } else {
      entry = ENo.NO;
    }

    const isColumnMode = hasAttr(self, 'isColumnMode');
    const fieldTagMap = XmlReader.parseTableOrStructOwn(self);
    const meta = fieldTagMap.meta;

    if (hasAttr(self, 'extraSplit')) {
      const extraSplit = parseInt(getAttr(self, 'extraSplit').trim(), 10);
      meta.data().set('extraSplit', metaInt(extraSplit));
    }

    const fields = XmlReader.parseFieldList(self, fieldTagMap.tag2FieldTag);
    const foreignKeys = XmlReader.parseForeignKeyList(self);
    const uniqueKeys: KeySchema[] = [];
    for (const ele of getChildren(self, 'uniqueKey')) {
      uniqueKeys.push(XmlReader.getKeySchema(ele, 'keys'));
    }

    return new TableSchema(
      pkgNameDot + name,
      primaryKey,
      entry,
      isColumnMode,
      meta,
      fields,
      foreignKeys,
      uniqueKeys,
    );
  }

  // -------------------------------------------------------------------------
  // parseStruct
  // -------------------------------------------------------------------------

  private static parseStruct(
    self: XmlElement,
    pkgNameDot: string,
    nullableInterfaceOwns: Set<string> | null,
  ): StructSchema {
    const name = getAttr(self, 'name').trim();
    const fieldTagMap = nullableInterfaceOwns !== null
      ? XmlReader.parseImplOwn(self, nullableInterfaceOwns)
      : XmlReader.parseTableOrStructOwn(self);

    const meta = fieldTagMap.meta;
    const fmt = XmlReader.parseBeanFmt(self);
    const fields = XmlReader.parseFieldList(self, fieldTagMap.tag2FieldTag);
    const foreignKeys = XmlReader.parseForeignKeyList(self);

    return new StructSchema(pkgNameDot + name, fmt, meta, fields, foreignKeys);
  }

  // -------------------------------------------------------------------------
  // parseInterface
  // -------------------------------------------------------------------------

  private static parseInterface(self: XmlElement, pkgNameDot: string): InterfaceSchema {
    const name = getAttr(self, 'name').trim();
    const interfaceOwns = XmlReader.parseOwnSet(self);
    const meta = XmlReader.createMetadata(interfaceOwns);

    const fmt = XmlReader.parseBeanFmt(self);
    const enumRef = getAttr(self, 'enumRef').trim();
    const defaultBeanName = getAttr(self, 'defaultBeanName').trim();

    const impls: StructSchema[] = [];
    for (const subSelf of getChildren(self, 'bean')) {
      const impl = XmlReader.parseStruct(subSelf, '', interfaceOwns);
      impls.push(impl);
    }

    return new InterfaceSchema(
      pkgNameDot + name,
      enumRef,
      defaultBeanName,
      fmt,
      meta,
      impls,
    );
  }

  // -------------------------------------------------------------------------
  // parseBeanFmt
  // -------------------------------------------------------------------------

  private static parseBeanFmt(self: XmlElement): FieldFormat {
    let fmt: FieldFormat = AutoOrPack.AUTO;
    let sep: string | null = null;
    if (hasAttr(self, 'compress')) {
      sep = getAttr(self, 'compress').trim();
    } else if (hasAttr(self, 'packSep')) {
      sep = getAttr(self, 'packSep').trim();
    }
    if (sep !== null) {
      require(sep.length === 1, '分隔符pack长度必须为1');
      fmt = new Sep(sep);
    }
    return fmt;
  }

  // -------------------------------------------------------------------------
  // parseFieldList
  // -------------------------------------------------------------------------

  private static parseFieldList(
    self: XmlElement,
    tag2OwnField: Map<string, FieldTag>,
  ): FieldSchema[] {
    const fields: FieldSchema[] = [];
    for (const ele of getChildren(self, 'column')) {
      const field = XmlReader.parseField(ele, tag2OwnField);
      if (field !== null) {
        fields.push(field);
      }
    }
    return fields;
  }

  // -------------------------------------------------------------------------
  // parseOwnSet
  // -------------------------------------------------------------------------

  private static parseOwnSet(self: XmlElement): Set<string> {
    if (!hasAttr(self, 'own')) {
      return new Set();
    }
    const own = getAttr(self, 'own');
    const tags = new Set<string>();
    for (const tag of own.split(',')) {
      tags.add(tag.trim());
    }
    return tags;
  }

  // -------------------------------------------------------------------------
  // FieldTagPolicy / FieldTag / FieldTagMap
  // -------------------------------------------------------------------------

  private static parseTableOrStructOwn(self: XmlElement): FieldTagMap {
    const tag2FieldTag = new Map<string, FieldTag>();
    let all = 0;
    for (const ele of getChildren(self, 'column')) {
      const tags = XmlReader.parseOwnSet(ele);
      for (const tag of tags) {
        let ownField = tag2FieldTag.get(tag);
        if (!ownField) {
          ownField = new FieldTag();
          tag2FieldTag.set(tag, ownField);
        }
        ownField.count++;
      }
      all++;
    }

    for (const of of tag2FieldTag.values()) {
      of.resolve(all);
    }

    const meta = XmlReader.createMetadata(new Set(tag2FieldTag.keys()));
    return new FieldTagMap(tag2FieldTag, meta);
  }

  private static parseImplOwn(
    self: XmlElement,
    interfaceOwns: Set<string>,
  ): FieldTagMap {
    const tag2FieldTag = new Map<string, FieldTag>();
    let all = 0;
    let fieldCount = 0;
    for (const ele of getChildren(self, 'column')) {
      fieldCount++;
      const tags = XmlReader.parseOwnSet(ele);
      for (const tag of tags) {
        if (!interfaceOwns.has(tag)) {
          Logger.log(`impl ${getAttr(self, 'name')} has tag ${tag} not in interface, ignore!`);
          continue;
        }
        let ownField = tag2FieldTag.get(tag);
        if (!ownField) {
          ownField = new FieldTag();
          tag2FieldTag.set(tag, ownField);
        }
        ownField.count++;
      }
      all++;
    }
    for (const of of tag2FieldTag.values()) {
      of.resolve(all);
    }

    const meta = Metadata_of();
    for (const interfaceOwn of interfaceOwns) {
      if (fieldCount === 0) {
        // impl has no fields, skip — treat as ALL
        continue;
      }
      const fieldTag = tag2FieldTag.get(interfaceOwn);
      // If impl doesn't include tag, all fields are included (no tag needed)
      if (fieldTag !== undefined && fieldTag.policy === FieldTagPolicy.ALL) {
        continue;
      }
      meta.putTag(interfaceOwn);
    }

    return new FieldTagMap(tag2FieldTag, meta);
  }

  private static createMetadata(owns: Set<string>): Metadata {
    const meta = Metadata_of();
    for (const tag of owns) {
      meta.putTag(tag);
    }
    return meta;
  }

  // -------------------------------------------------------------------------
  // parseField
  // -------------------------------------------------------------------------

  private static parseField(
    self: XmlElement,
    tag2OwnField: Map<string, FieldTag>,
  ): FieldSchema | null {
    const ownSet = XmlReader.parseOwnSet(self);
    const meta = Metadata_of();

    for (const [tag, ownField] of tag2OwnField) {
      switch (ownField.policy) {
        case FieldTagPolicy.ALL:
          // nothing
          break;
        case FieldTagPolicy.USE_TAG:
          if (ownSet.has(tag)) {
            meta.putTag(tag);
          }
          break;
        case FieldTagPolicy.USE_MINUS_TAG:
          if (!ownSet.has(tag)) {
            meta.putTag('-' + tag);
          }
          break;
      }
    }

    const name = getAttr(self, 'name').trim();
    if (!isIdentifier(name)) {
      Logger.log(`${name} not identifier, ignore!`);
      return null;
    }

    if (hasAttr(self, 'range')) {
      const range = getAttr(self, 'range').trim();
      if (range.length > 0) {
        meta.data().set('range', metaStr(range));
      }
    }

    const comment = getAttr(self, 'desc').trim();
    if (comment.length > 0 && comment.toLowerCase() !== name.toLowerCase()) {
      meta.putComment(new CommentData('', comment, null));
    }

    let type: FieldType;
    let fmt: FieldFormat = AutoOrPack.AUTO;

    require(hasAttr(self, 'type'), 'column必须设置type');
    const typ = getAttr(self, 'type').trim();

    if (typ.startsWith('list,')) {
      const sp = typ.split(',');
      const v = sp[1].trim();
      const item = XmlReader.parseSimpleType(v);
      type = new FList(item);

      if (sp.length > 2) {
        const c = parseInt(sp[2].trim(), 10);
        fmt = new Fix(c);
      }
    } else if (typ.startsWith('map,')) {
      const sp = typ.split(',');
      const k = sp[1].trim();
      const v = sp[2].trim();
      const key = XmlReader.parseSimpleType(k);
      const value = XmlReader.parseSimpleType(v);
      type = new FMap(key, value);

      if (sp.length > 3) {
        const c = parseInt(sp[3].trim(), 10);
        fmt = new Fix(c);
      }
    } else {
      type = XmlReader.parseSimpleType(typ);
    }

    if (hasAttr(self, 'block')) {
      fmt = new Block(1);
    } else if (hasAttr(self, 'pack') || hasAttr(self, 'compressAsOne')) {
      fmt = AutoOrPack.PACK;
    } else if (hasAttr(self, 'packSep') || hasAttr(self, 'compress')) {
      const sep = hasAttr(self, 'packSep')
        ? getAttr(self, 'packSep')
        : getAttr(self, 'compress');
      require(sep.length === 1, `packSep字符串长度必须是1, ${sep}`);
      fmt = new Sep(sep);
    }

    return new FieldSchema(name, type, fmt, meta);
  }

  // -------------------------------------------------------------------------
  // parseForeignKeyList / parseForeignKey
  // -------------------------------------------------------------------------

  private static parseForeignKeyList(self: XmlElement): ForeignKeySchema[] {
    const foreignKeys: ForeignKeySchema[] = [];

    for (const ele of getChildren(self, 'column')) {
      if (hasAttr(ele, 'ref')) {
        const fk = XmlReader.parseForeignKey(ele, true);
        foreignKeys.push(fk);
      }
    }

    for (const ele of getChildren(self, 'foreignKey')) {
      const fk = XmlReader.parseForeignKey(ele, false);
      foreignKeys.push(fk);
    }

    return foreignKeys;
  }

  private static parseForeignKey(
    self: XmlElement,
    isFromColumnTag: boolean,
  ): ForeignKeySchema {
    const name = getAttr(self, 'name').trim();
    let localKey: KeySchema;
    if (isFromColumnTag) {
      localKey = new KeySchema([name]);
    } else {
      localKey = XmlReader.getKeySchema(self, 'keys');
    }

    const refStr = getAttr(self, 'ref').trim();
    const r = refStr.split(/\s*,\s*/);
    const refTable = r[0].trim();
    let refKey: RefKey;
    let nullable = false;
    let isList = false;

    if (hasAttr(self, 'refType')) {
      const rt = getAttr(self, 'refType').trim();
      if (rt.toLowerCase() === 'nullable') {
        nullable = true;
      } else if (rt.toLowerCase() === 'list') {
        isList = true;
      }
    }

    if (r.length > 1) {
      const rs = r.slice(1);
      const keySchema = new KeySchema(rs);
      if (isList) {
        refKey = new RefList(keySchema);
      } else {
        refKey = new RefUniq(keySchema, nullable);
      }
    } else {
      refKey = new RefPrimary(nullable);
    }

    return new ForeignKeySchema(name, localKey, refTable, refKey, Metadata_of());
  }

  // -------------------------------------------------------------------------
  // parseSimpleType
  // -------------------------------------------------------------------------

  private static parseSimpleType(typ: string): SimpleType {
    switch (typ) {
      case 'int': return Primitive.INT;
      case 'long': return Primitive.LONG;
      case 'bool': return Primitive.BOOL;
      case 'float': return Primitive.FLOAT;
      case 'string': return Primitive.STRING;
      case 'text': return Primitive.TEXT;
      default: return new StructRef(typ);
    }
  }

  // -------------------------------------------------------------------------
  // getKeySchema
  // -------------------------------------------------------------------------

  private static getKeySchema(self: XmlElement, attr: string): KeySchema {
    const keys = XmlReader.parseStringArray(self, attr);
    return new KeySchema(keys);
  }

  private static parseStringArray(self: XmlElement, attrName: string): string[] {
    const attr = getAttr(self, attrName).trim();
    if (attr.length === 0) return [];
    return attr.split(/\s*,\s*/);
  }

  // -------------------------------------------------------------------------
  // parseRoot — parse XML string into root XmlElement
  // -------------------------------------------------------------------------

  private static parseRoot(xmlContent: string): XmlElement | null {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      trimValues: true,
      parseTagValue: false,
      textNodeName: '#text',
    });

    const parsed = parser.parse(xmlContent);

    // The root element should be <config>
    const config = parsed['config'];
    if (!config || typeof config !== 'object') {
      return null;
    }

    return normalizeElement(config);
  }
}

// ---------------------------------------------------------------------------
// FieldTagPolicy / FieldTag / FieldTagMap
// ---------------------------------------------------------------------------

enum FieldTagPolicy {
  ALL = 'ALL',
  USE_TAG = 'USE_TAG',
  USE_MINUS_TAG = 'USE_MINUS_TAG',
}

class FieldTag {
  count = 0;
  policy: FieldTagPolicy = FieldTagPolicy.USE_TAG;

  resolve(all: number): void {
    if (this.count === all) {
      this.policy = FieldTagPolicy.ALL;
    } else if (this.count >= 0.7 * all) {
      this.policy = FieldTagPolicy.USE_MINUS_TAG;
    }
  }
}

class FieldTagMap {
  constructor(
    readonly tag2FieldTag: Map<string, FieldTag>,
    readonly meta: Metadata,
  ) {}
}

// ---------------------------------------------------------------------------
// XML element normalization helpers
// ---------------------------------------------------------------------------

/**
 * Convert a fast-xml-parser node into a normalized XmlElement.
 * Handles the various shapes fast-xml-parser can produce:
 * - { '@_attr': value, 'child': [...] | {...} }
 */
function normalizeElement(node: unknown): XmlElement {
  const attributes: Record<string, string> = {};
  const children: Record<string, XmlElement[]> = {};

  if (node && typeof node === 'object' && !Array.isArray(node)) {
    const obj = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('@_')) {
        // Attribute
        const attrName = key.substring(2);
        attributes[attrName] = String(value ?? '');
      } else if (key === '#text') {
        // Text node — ignore for element-based parsing
        continue;
      } else {
        // Child element(s)
        if (Array.isArray(value)) {
          children[key] = value.map((v) => normalizeElement(v));
        } else if (value && typeof value === 'object') {
          children[key] = [normalizeElement(value)];
        } else if (typeof value === 'string') {
          // e.g. <column>text</column> — treat as empty element with text
          children[key] = [normalizeElement({})];
        }
      }
    }
  }

  return { attributes, children };
}

/**
 * Get child elements by tag name from an XmlElement.
 * Returns empty array if none.
 */
function getChildren(elem: XmlElement, tagName: string): XmlElement[] {
  return elem.children[tagName] ?? [];
}

/**
 * Get an attribute value (empty string if not present, matching Java DOM behavior).
 */
function getAttr(elem: XmlElement, name: string): string {
  return elem.attributes[name] ?? '';
}

/**
 * Check if an attribute exists.
 */
function hasAttr(elem: XmlElement, name: string): boolean {
  return name in elem.attributes;
}

// ---------------------------------------------------------------------------
// isIdentifier — port of CfgUtil.isIdentifier
// ---------------------------------------------------------------------------

const identifierPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function isIdentifier(name: string): boolean {
  return identifierPattern.test(name);
}



// ---------------------------------------------------------------------------
// require — assertion helper (matches Java XmlReader.require)
// ---------------------------------------------------------------------------

function require(condition: boolean, detailMessage: unknown): void {
  if (!condition) {
    throw new AssertionError(detailMessage);
  }
}

class AssertionError extends Error {
  constructor(message: unknown) {
    super(String(message));
    this.name = 'AssertionError';
  }
}
