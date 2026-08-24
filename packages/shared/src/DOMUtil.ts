/**
 * XML/DOM 工具。使用 fast-xml-parser 替代 Java DOM。
 * 原 Java: configgen.util.DOMUtil
 */

import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  preserveOrder: false,
  ignoreAttributes: false,
  allowBooleanAttributes: true,
  trimValues: true,
});

export type XMLElement = Record<string, any>;
export type XMLDoc = Record<string, XMLElement>;

export function parseXML(xml: string): XMLDoc {
  return parser.parse(xml) as XMLDoc;
}

export function getElements(parent: XMLElement, name: string): XMLElement[] {
  const result: XMLElement[] = [];
  if (!parent || typeof parent !== 'object') return result;

  for (const key of Object.keys(parent)) {
    if (key === '@_attr' || key.startsWith('@_')) continue;
    if (key === name) {
      const val = parent[key];
      if (Array.isArray(val)) {
        for (const v of val) {
          result.push(typeof v === 'object' ? v : { '#text': v });
        }
      } else {
        result.push(typeof val === 'object' ? val : { '#text': val });
      }
    }
  }

  return result;
}

export function parseStringArray(element: XMLElement, attrName: string): string[] {
  const attrKey = '@_' + attrName;
  const attr = element[attrKey];
  if (!attr || attr.trim().length === 0) return [];

  return attr.trim().split(/\s*,\s*/);
}
