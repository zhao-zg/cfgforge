/**
 * DField tests — TypeScript port of Java `configgen.data.CfgData.DField`.
 */

import { describe, it, expect } from 'vitest';
import { DField } from '../DField';

describe('DField', () => {
  it('constructs with name, comment, suggestedType', () => {
    const f = new DField('Id', '唯一ID', '');
    expect(f.name).toBe('Id');
    expect(f.comment).toBe('唯一ID');
    expect(f.suggestedType).toBe('');
  });

  it('constructs with empty comment', () => {
    const f = new DField('Name', '', '');
    expect(f.comment).toBe('');
  });

  it('constructs with suggestedType', () => {
    const f = new DField('Hp', '生命值', 'int');
    expect(f.suggestedType).toBe('int');
  });
});
