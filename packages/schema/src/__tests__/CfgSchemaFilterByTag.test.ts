/**
 * CfgSchemaFilterByTag tests — TypeScript port of Java CfgSchemaFilterByTagTest.
 *
 * TDD: tests written first, implementation to follow.
 */

import { describe, it, expect } from 'vitest';
import { CfgReader } from '../cfg/CfgReader';
import { CfgSchema } from '../CfgSchema';
import { CfgSchemaErrs } from '../CfgSchemaErrs';
import { CfgSchemaFilterByTag } from '../CfgSchemaFilterByTag';
import { TableSchema } from '../TableSchema';
import { InterfaceSchema } from '../InterfaceSchema';
import { StructSchema } from '../StructSchema';


// ---------------------------------------------------------------------------
// Helper: parse + resolve a CFG string
// ---------------------------------------------------------------------------

function parseAndResolve(str: string): { cfg: CfgSchema; errs: CfgSchemaErrs } {
  const cfg = CfgReader.parse(str);
  const errs = cfg.resolve();
  return { cfg, errs };
}

describe('CfgSchemaFilterByTag', () => {

  // =========================================================================
  // 1. emptyIfNoTag: no tags at all → filter returns 0 items
  // =========================================================================
  it('emptyIfNoTag', () => {
    const str = `
      table tab1[id] {
          id:int;
          v:int;
      }
    `;

    const { cfg, errs } = parseAndResolve(str);
    expect(cfg.items().length).toBe(1);

    const filter = new CfgSchemaFilterByTag(cfg, 'c', errs);
    const filtered = filter.filter();
    filtered.resolve();

    expect(errs.warns.length).toBe(0);
    expect(errs.errs.length).toBe(0);
    expect(filtered.items().length).toBe(0);
  });

  // =========================================================================
  // 2. filterByFieldTag: field-level tags → only tagged fields kept
  // =========================================================================
  it('filterByFieldTag', () => {
    const str = `
      table tab1[id] {
          id:int (c);
          v:int (c);
          v2:int;
      }
    `;

    const { cfg, errs } = parseAndResolve(str);
    const tab1 = cfg.findTable('tab1')!;
    expect(tab1.fields().length).toBe(3);

    const filter = new CfgSchemaFilterByTag(cfg, 'c', errs);
    const filtered = filter.filter();
    const errs2 = filtered.resolve();

    expect(errs.errs.length).toBe(0);
    expect(errs2.errs.length).toBe(0);

    const tab1f = filtered.findTable('tab1')!;
    expect(tab1f.fields().length).toBe(2);
  });

  // =========================================================================
  // 3. filter_ifNotIncludePrimaryKey_resolveErr: filtered-out primary key → resolve error
  // =========================================================================
  it('filter_ifNotIncludePrimaryKey_resolveErr', () => {
    const str = `
      table tab1[id] {
          id:int;
          v:int (c);
          v2:int (c);
      }
    `;

    const { cfg, errs } = parseAndResolve(str);

    const filter = new CfgSchemaFilterByTag(cfg, 'c', errs);
    const filtered = filter.filter();
    expect(errs.warns.length).toBe(0);
    expect(errs.errs.length).toBe(0);

    const errs2 = filtered.resolve();
    expect(errs2.errs.length).toBeGreaterThan(0);
    // First error should be KeyNotFound
    expect(errs2.errs[0]._tag).toBe('KeyNotFound');

    const tab1 = filtered.findTable('tab1')!;
    expect(tab1.fields().length).toBe(2);
    expect(tab1.findField('v')).not.toBeNull();
    expect(tab1.findField('v2')).not.toBeNull();
  });

  // =========================================================================
  // 4. filterAllFields_forTaggedTable: table-level tag, no field tags → all fields kept
  // =========================================================================
  it('filterAllFields_forTaggedTable', () => {
    const str = `
      table tab1[id] (c) {
          id:int;
          v:int;
          v2:int;
      }
    `;

    const { cfg, errs } = parseAndResolve(str);

    const filter = new CfgSchemaFilterByTag(cfg, 'c', errs);
    const filtered = filter.filter();
    filtered.resolve();

    const tab1 = filtered.findTable('tab1')!;
    expect(tab1.fields().length).toBe(3);
  });

  // =========================================================================
  // 5. filterTaggedFields_forTaggedTable: table + field tags → only tagged fields
  // =========================================================================
  it('filterTaggedFields_forTaggedTable', () => {
    const str = `
      table tab1[id] (c) {
          id:int (c);
          v:int (c);
          v2:int;
      }
    `;

    const { cfg, errs } = parseAndResolve(str);

    const filter = new CfgSchemaFilterByTag(cfg, 'c', errs);
    const filtered = filter.filter();
    filtered.resolve();

    const tab1 = filtered.findTable('tab1')!;
    expect(tab1.fields().length).toBe(2);
    expect(tab1.findField('id')).not.toBeNull();
    expect(tab1.findField('v')).not.toBeNull();
  });

  // =========================================================================
  // 6. filterNoMinusTaggedFields_forTaggedTable: table tag + field -c → exclude -c fields
  // =========================================================================
  it('filterNoMinusTaggedFields_forTaggedTable', () => {
    const str = `
      table tab1[id] (c) {
          id:int ;
          v:int ;
          v2:int (-c);
      }
    `;

    const { cfg, errs } = parseAndResolve(str);

    const filter = new CfgSchemaFilterByTag(cfg, 'c', errs);
    const filtered = filter.filter();
    filtered.resolve();

    const tab1 = filtered.findTable('tab1')!;
    expect(tab1.fields().length).toBe(2);
    expect(tab1.findField('id')).not.toBeNull();
    expect(tab1.findField('v')).not.toBeNull();
  });

  // =========================================================================
  // 7. filterOnlyTaggedFields_forTaggedTable: mixed tags → only +c fields win
  // =========================================================================
  it('filterOnlyTaggedFields_forTaggedTable', () => {
    const str = `
      table tab1[id] (c) {
          id:int (c);
          v:int ;
          v2:int (-c);
      }
    `;

    const { cfg, errs } = parseAndResolve(str);

    const filter = new CfgSchemaFilterByTag(cfg, 'c', errs);
    const filtered = filter.filter();
    filtered.resolve();

    const tab1 = filtered.findTable('tab1')!;
    expect(tab1.fields().length).toBe(1);
    expect(tab1.findField('id')).not.toBeNull();
  });

  // =========================================================================
  // 8. filterAllImpls_forTaggedInterface: interface tag → all impls + all fields kept
  // =========================================================================
  it('filterAllImpls_forTaggedInterface', () => {
    const str = `
      interface action (c) {
          struct impl1 {
              v:int;
          }
      }
    `;

    const { cfg, errs } = parseAndResolve(str);

    const filter = new CfgSchemaFilterByTag(cfg, 'c', errs);
    const filtered = filter.filter();
    const errs2 = filtered.resolve();
    expect(errs2.errs.length).toBe(0);

    const action = filtered.findFieldable('action') as InterfaceSchema;
    expect(action.impls().length).toBe(1);
    expect(action.impls()[0].fields().length).toBe(1);
  });

  // =========================================================================
  // 9. tagImplToFilterOnlyImplName_forTaggedInterface: interface + impl tag → empty struct
  // =========================================================================
  it('tagImplToFilterOnlyImplName_forTaggedInterface', () => {
    const str = `
      interface action (c) {
          struct impl1 (c) {
              v:int;
          }
      }
    `;

    const { cfg, errs } = parseAndResolve(str);

    const filter = new CfgSchemaFilterByTag(cfg, 'c', errs);
    const filtered = filter.filter();
    const errs2 = filtered.resolve();
    expect(errs2.errs.length).toBe(0);

    const action = filtered.findFieldable('action') as InterfaceSchema;
    expect(action.impls().length).toBe(1);
    expect(action.impls()[0].fields().length).toBe(0);
  });

  // =========================================================================
  // 10. tagImplNotAutomaticallyTagInterface: only impl tag, no interface tag → filtered out
  // =========================================================================
  it('tagImplNotAutomaticallyTagInterface', () => {
    const str = `
      interface action {
          struct impl1 (c) {
              v:int;
          }
      }
    `;

    const { cfg, errs } = parseAndResolve(str);

    const filter = new CfgSchemaFilterByTag(cfg, 'c', errs);
    const filtered = filter.filter();
    const errs2 = filtered.resolve();

    expect(errs2.errs.length).toBe(0);
    expect(filtered.items().length).toBe(0);
  });

  // =========================================================================
  // 11. warn_FilterRefIgnoredByRefTableNotFound: ref table filtered out → weak warn
  // =========================================================================
  it('warn_FilterRefIgnoredByRefTableNotFound', () => {
    const str = `
      table tab1[id] (c) {
          id:int;
          v:int ->tab2;
      }
      table tab2[id] {
          id:int;
          v2:int;
      }
    `;

    const { cfg, errs } = parseAndResolve(str);
    expect(errs.warns.length).toBe(0);
    expect(errs.errs.length).toBe(0);

    const filter = new CfgSchemaFilterByTag(cfg, 'c', errs);
    filter.filter();

    expect(errs.weakWarns.length).toBe(1);
    expect(errs.errs.length).toBe(0);
    const warn = errs.weakWarns[0] as any;
    expect(warn._tag).toBe('FilterRefIgnoredByRefTableNotFound');
    expect(warn.name).toBe('tab1');
    expect(warn.foreignKey).toBe('v');
    expect(warn.notFoundRefTable).toBe('tab2');
  });

  // =========================================================================
  // 12. warn_FilterRefIgnoredByRefKeyNotFound: ref uniqueKey filtered out → weak warn
  // =========================================================================
  it('warn_FilterRefIgnoredByRefKeyNotFound', () => {
    const str = `
      table tab1[id] (c) {
          id:int;
          v:int ->tab2[uk];
      }
      table tab2[id](c) {
          [uk];
          id:int;
          v2:int;
          uk:int (-c);
      }
    `;

    const { cfg, errs } = parseAndResolve(str);
    expect(errs.warns.length).toBe(0);
    expect(errs.errs.length).toBe(0);

    const filter = new CfgSchemaFilterByTag(cfg, 'c', errs);
    filter.filter();

    expect(errs.weakWarns.length).toBe(1);
    expect(errs.errs.length).toBe(0);
    const warn = errs.weakWarns[0] as any;
    expect(warn._tag).toBe('FilterRefIgnoredByRefKeyNotFound');
    expect(warn.name).toBe('tab1');
    expect(warn.foreignKey).toBe('v');
    expect(warn.refTable).toBe('tab2');
    expect(warn.notFoundRefKey[0]).toBe('uk');
  });

});
