import { describe, it, expect } from 'vitest';
import {
  upper1,
  lower1,
  removeLineSep,
  underscoreToPascalCase,
  toScreamingSnakeCase,
} from '../StringUtil';

describe('StringUtil', () => {
  describe('upper1', () => {
    it('capitalizes first letter', () => {
      expect(upper1('abc')).toBe('Abc');
      expect(upper1('hello')).toBe('Hello');
    });
    it('handles already capitalized', () => {
      expect(upper1('Abc')).toBe('Abc');
    });
  });

  describe('lower1', () => {
    it('lowercases first letter', () => {
      expect(lower1('Abc')).toBe('abc');
      expect(lower1('Hello')).toBe('hello');
    });
  });

  describe('removeLineSep', () => {
    it('replaces newlines with ---', () => {
      expect(removeLineSep('hello\nworld')).toBe('hello---world');
      expect(removeLineSep('a\nb\nc')).toBe('a---b---c');
    });
    it('no newline returns as-is', () => {
      expect(removeLineSep('hello')).toBe('hello');
    });
  });

  describe('underscoreToPascalCase', () => {
    it('converts underscored to PascalCase', () => {
      expect(underscoreToPascalCase('a_b')).toBe('AB');
      expect(underscoreToPascalCase('hello_world')).toBe('HelloWorld');
    });
    it('handles leading underscore', () => {
      expect(underscoreToPascalCase('_hello')).toBe('Hello');
    });
    it('handles consecutive underscores', () => {
      expect(underscoreToPascalCase('a__b')).toBe('AB');
    });
    it('returns empty/null as-is', () => {
      expect(underscoreToPascalCase('')).toBe('');
      expect(underscoreToPascalCase(null as any)).toBe(null);
    });
    it('no underscore returns as-is (first char capitalized)', () => {
      // Java: capitalizeNext starts true, so first char always uppercased
      expect(underscoreToPascalCase('hello')).toBe('Hello');
    });
  });

  describe('toScreamingSnakeCase', () => {
    it('converts camelCase', () => {
      expect(toScreamingSnakeCase('helloWorld')).toBe('HELLO_WORLD');
      expect(toScreamingSnakeCase('resetDuration')).toBe('RESET_DURATION');
    });
    it('handles existing underscores', () => {
      expect(toScreamingSnakeCase('reset_duration')).toBe('RESET_DURATION');
      expect(toScreamingSnakeCase('Reset_Duration')).toBe('RESET_DURATION');
    });
    it('handles abbreviation words', () => {
      expect(toScreamingSnakeCase('HTTPServer')).toBe('HTTP_SERVER');
      expect(toScreamingSnakeCase('XMLParser')).toBe('XML_PARSER');
    });
    it('merges consecutive underscores', () => {
      expect(toScreamingSnakeCase('a__b')).toBe('A_B');
    });
    it('strips leading/trailing underscores', () => {
      expect(toScreamingSnakeCase('_hello_')).toBe('HELLO');
    });
    it('returns empty/null as-is', () => {
      expect(toScreamingSnakeCase('')).toBe('');
    });
  });
});
