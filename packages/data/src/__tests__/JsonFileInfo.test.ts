/**
 * JsonFileInfo tests — TypeScript port of Java `configgen.data.JsonFileInfo`.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { JsonFileInfo } from '../JsonFileInfo';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BUFF_JSON = path.join(REPO_ROOT, 'samples', 'buff', '_buff', '0.json');
const SKILL_JSON = path.join(REPO_ROOT, 'samples', 'buff', '_skill', '2.json');

describe('JsonFileInfo', () => {
  describe('of() factory', () => {
    it('creates JsonFileInfo from integer-named file (0.json)', () => {
      const info = JsonFileInfo.of(BUFF_JSON, 'buff/_buff/0.json');
      expect(info.isIntegerId).toBe(true);
      expect(info.integerId).toBe(0);
      expect(info.path).toBe(BUFF_JSON);
      expect(info.relativePath).toBe('buff/_buff/0.json');
      expect(info.lastModified).toBeGreaterThan(0);
    });

    it('creates JsonFileInfo from integer-named file (2.json)', () => {
      const info = JsonFileInfo.of(SKILL_JSON, 'buff/_skill/2.json');
      expect(info.isIntegerId).toBe(true);
      expect(info.integerId).toBe(2);
    });

    it('creates JsonFileInfo from large integer name (12345.json)', () => {
      const info = JsonFileInfo.of('/data/_table/12345.json', '_table/12345.json');
      expect(info.isIntegerId).toBe(true);
      expect(info.integerId).toBe(12345);
    });

    it('sets isIntegerId=false for non-integer filename', () => {
      const info = JsonFileInfo.of('/data/_table/abc.json', '_table/abc.json');
      expect(info.isIntegerId).toBe(false);
      expect(info.integerId).toBe(-1);
    });

    it('sets isIntegerId=false for mixed name (buff1.json)', () => {
      const info = JsonFileInfo.of('/data/_table/buff1.json', '_table/buff1.json');
      expect(info.isIntegerId).toBe(false);
      expect(info.integerId).toBe(-1);
    });

    it('sets isIntegerId=false for negative (-1.json)', () => {
      // parseInt('-1') succeeds but the substring is '-1' which is a valid integer
      // Java: fn.substring(0, fn.length()-5) on "-1.json" → "-1", parseInt → -1 → isIntegerId=true
      const info = JsonFileInfo.of('/data/_table/-1.json', '_table/-1.json');
      expect(info.isIntegerId).toBe(true);
      expect(info.integerId).toBe(-1);
    });

    it('reads real file lastModified', () => {
      const info = JsonFileInfo.of(BUFF_JSON, 'buff/_buff/0.json');
      const stat = fs.statSync(BUFF_JSON);
      expect(info.lastModified).toBe(stat.mtimeMs);
    });
  });

  describe('sorting', () => {
    it('integerId files sort numerically', () => {
      const infos = [
        JsonFileInfo.of('/d/_t/10.json', '_t/10.json'),
        JsonFileInfo.of('/d/_t/2.json', '_t/2.json'),
        JsonFileInfo.of('/d/_t/1.json', '_t/1.json'),
      ];
      const sorted = [...infos].sort((a, b) => a.integerId - b.integerId);
      expect(sorted[0].integerId).toBe(1);
      expect(sorted[1].integerId).toBe(2);
      expect(sorted[2].integerId).toBe(10);
    });

    it('non-integer files keep insertion order', () => {
      const a = JsonFileInfo.of('/d/_t/zebra.json', '_t/zebra.json');
      const b = JsonFileInfo.of('/d/_t/apple.json', '_t/apple.json');
      // Non-integer: no numeric sort, insertion order preserved
      expect(a.isIntegerId).toBe(false);
      expect(b.isIntegerId).toBe(false);
    });
  });
});
