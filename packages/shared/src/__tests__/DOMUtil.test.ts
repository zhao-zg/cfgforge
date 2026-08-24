import { describe, it, expect } from 'vitest';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { parseXML, getElements, parseStringArray } from '../DOMUtil';

describe('DOMUtil', () => {
  const parser = new XMLParser({ preserveOrder: false });

  describe('parseXML', () => {
    it('parses simple XML', () => {
      const xml = '<root><child attr="value">text</child></root>';
      const doc = parseXML(xml);
      expect(doc).toBeDefined();
      expect(doc.root).toBeDefined();
    });

    it('parses attributes', () => {
      const xml = '<root name="test" version="1.0"/>';
      const doc = parseXML(xml);
      expect(doc.root['@_name']).toBe('test');
      expect(doc.root['@_version']).toBe('1.0');
    });
  });

  describe('getElements', () => {
    it('gets child elements by name', () => {
      const xml = '<root><a>1</a><b>2</b><a>3</a></root>';
      const doc = parseXML(xml);
      const root = doc.root;
      const aElements = getElements(root, 'a');
      expect(aElements.length).toBe(2);
      // fast-xml-parser returns leaf text nodes as primitives (number for numeric strings)
      expect(aElements[0]['#text']).toBe(1);
      expect(aElements[1]['#text']).toBe(3);
    });

    it('returns empty array for non-existent name', () => {
      const xml = '<root><a>1</a></root>';
      const doc = parseXML(xml);
      const root = doc.root;
      const cElements = getElements(root, 'c');
      expect(cElements).toEqual([]);
    });
  });

  describe('parseStringArray', () => {
    it('parses comma-separated attribute', () => {
      const xml = '<root items="a, b, c"/>';
      const doc = parseXML(xml);
      const result = parseStringArray(doc.root, 'items');
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('returns empty array for missing attribute', () => {
      const xml = '<root/>';
      const doc = parseXML(xml);
      const result = parseStringArray(doc.root, 'items');
      expect(result).toEqual([]);
    });

    it('handles single value', () => {
      const xml = '<root items="only"/>';
      const doc = parseXML(xml);
      const result = parseStringArray(doc.root, 'items');
      expect(result).toEqual(['only']);
    });
  });
});
