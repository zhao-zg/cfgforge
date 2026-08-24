/**
 * JsonTableFiles tests — TypeScript port of Java `configgen.data.JsonTableFiles`.
 *
 * JsonTableFiles is a port interface (hexagonal architecture port) that
 * provides JSON file listings by table name. The actual implementation
 * (DirectoryStructure) lives in the ctx layer (Phase 5).
 */

import { describe, it, expect } from 'vitest';
import { JsonFileInfo } from '../JsonFileInfo';
import type { JsonTableFiles } from '../JsonTableFiles';

describe('JsonTableFiles', () => {
  describe('contract: interface implementation', () => {
    it('can be implemented as a simple map', () => {
      const impl: JsonTableFiles = {
        jsonFilesOf(tableName: string): JsonFileInfo[] {
          const map: Record<string, JsonFileInfo[]> = {
            'buff.buff': [
              JsonFileInfo.of('/d/_buff/0.json', '_buff/0.json'),
              JsonFileInfo.of('/d/_buff/1.json', '_buff/1.json'),
            ],
            'buff.skill': [
              JsonFileInfo.of('/d/_skill/2.json', '_skill/2.json'),
            ],
          };
          return map[tableName] ?? [];
        },
      };

      expect(impl.jsonFilesOf('buff.buff')).toHaveLength(2);
      expect(impl.jsonFilesOf('buff.buff')[0].integerId).toBe(0);
      expect(impl.jsonFilesOf('buff.buff')[1].integerId).toBe(1);
      expect(impl.jsonFilesOf('buff.skill')).toHaveLength(1);
    });

    it('returns empty array for unknown table', () => {
      const impl: JsonTableFiles = {
        jsonFilesOf(_tableName: string): JsonFileInfo[] {
          return [];
        },
      };
      expect(impl.jsonFilesOf('unknown.table')).toEqual([]);
    });
  });
});
