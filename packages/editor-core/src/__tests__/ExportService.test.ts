import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EditorService } from '../EditorService';
import { ExportService } from '../ExportService';

function writeFile(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

function rmSync(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Fixture for CSV/SQL tests (used in later tasks)
const ITEM_CFG = `table item[id] (title='name') {
  id:int;
  name:str;
  damage:int;
}
`;

const ITEM_CSV = `ID,名称,伤害
id,name,damage
100,剑,10
101,盾,20
`;

describe('ExportService', () => {
  describe('camelToSnake', () => {
    it('converts HeroRecruitList to hero_recruit_list', () => {
      expect(ExportService.camelToSnake('HeroRecruitList')).toBe('hero_recruit_list');
    });

    it('converts A2024Christmas to a2024_christmas', () => {
      expect(ExportService.camelToSnake('A2024Christmas')).toBe('a2024_christmas');
    });

    it('converts AiNpcCityAttack to ai_npc_city_attack', () => {
      expect(ExportService.camelToSnake('AiNpcCityAttack')).toBe('ai_npc_city_attack');
    });

    it('converts simple lowercase name', () => {
      expect(ExportService.camelToSnake('item')).toBe('item');
    });

    it('handles consecutive uppercase', () => {
      expect(ExportService.camelToSnake('HTTPServer')).toBe('http_server');
    });
  });
});
