/**
 * LuaName — TypeScript port of Java `configgen.genlua.Name` + `CtxName`.
 *
 * Naming utilities for Lua code generation:
 * - fullName: converts Nameable to Lua dotted name (Beans.x / pkg.x)
 * - refName: foreign key ref name (RefX / NullableRefX / ListRefX)
 * - uniqueKeyGetByName / uniqueKeyMapName: getter/map names for keys
 * - tablePath / tableExtraPath: file paths for .lua files
 *
 * CtxName: manages local variable names to avoid Lua's ~250 local limit.
 *
 * Differences from Java:
 * - AContext.getInstance() singleton replaced with passed-in LuaAContext
 * - No static singleton; fullName takes a pkgPrefixStr parameter
 */

import { upper1 } from '@cfggen/shared';
import type { Nameable } from '@cfggen/schema';
import { InterfaceSchema, StructSchema, TableSchema } from '@cfggen/schema';
import type { ForeignKeySchema, KeySchema } from '@cfggen/schema';
import type { RefKey } from '@cfggen/schema';
import { RefList, RefPrimary, RefUniq } from '@cfggen/schema';

// ---------------------------------------------------------------------------
// Constants (match Java Name.java)
// ---------------------------------------------------------------------------

export const primaryKeyMapName = 'all';
export const primaryKeyGetName = 'get';

// ---------------------------------------------------------------------------
// Name utility functions (ported from Name.java)
// ---------------------------------------------------------------------------

export function luaUniqueKeyGetByName(key: KeySchema): string {
  return 'getBy' + key.fields().map(upper1).join('');
}

export function luaUniqueKeyMapName(key: KeySchema): string {
  return key.fields().map(upper1).join('') + 'Map';
}

export function luaUniqueKeyGetByFieldNames(keyFields: string[]): string {
  if (keyFields.length === 0) return 'get';
  return 'getBy' + keyFields.map(upper1).join('');
}

export function luaRefName(fk: ForeignKeySchema): string {
  const refKey: RefKey = fk.refKey;
  if (refKey instanceof RefList) {
    return 'ListRef' + upper1(fk.name);
  }
  // RefSimple = RefPrimary | RefUniq
  if (refKey instanceof RefPrimary) {
    if (refKey.nullable) {
      return 'NullableRef' + upper1(fk.name);
    }
    return 'Ref' + upper1(fk.name);
  }
  if (refKey instanceof RefUniq) {
    if (refKey.nullable) {
      return 'NullableRef' + upper1(fk.name);
    }
    return 'Ref' + upper1(fk.name);
  }
  throw new Error('Unknown RefKey type');
}

export function luaFullName(nameable: Nameable, pkgPrefixStr: string): string {
  if (nameable instanceof InterfaceSchema) {
    return 'Beans.' + nameable.name().toLowerCase();
  }
  if (nameable instanceof StructSchema) {
    const s = nameable as StructSchema;
    const iface = s.nullableInterface();
    if (iface !== null) {
      return 'Beans.' + iface.name().toLowerCase() + '.' + s.name().toLowerCase();
    }
    return 'Beans.' + nameable.name().toLowerCase();
  }
  if (nameable instanceof TableSchema) {
    return pkgPrefixStr + nameable.name().toLowerCase();
  }
  throw new Error('Unknown Nameable type: ' + nameable.name());
}

export function luaTablePath(tableName: string): string {
  return tableName.replace(/\./g, '/').toLowerCase() + '.lua';
}

export function luaTableExtraPath(tableName: string, extraIndex: number): string {
  return tableName.replace(/\./g, '/').toLowerCase() + '_' + extraIndex + '.lua';
}

// ---------------------------------------------------------------------------
// CtxName — local variable name manager (ported from CtxName.java)
// ---------------------------------------------------------------------------

const MAX_LOCAL = 128;

export class LuaCtxName {
  private readonly locals = new Set<string>();
  private readonly fullNameToLocals = new Map<string, string>();

  getLocalNameMap(): Map<string, string> {
    return this.fullNameToLocals;
  }

  getLocalName(fullName: string, isForbidName: (name: string) => boolean): string {
    const existing = this.fullNameToLocals.get(fullName);
    if (existing !== undefined) {
      return existing;
    }

    // Lua has ~250 local variable limit; we cap at 128 to leave room
    if (this.fullNameToLocals.size > MAX_LOCAL) {
      return fullName;
    }

    const seps = fullName.split('.');
    let tryName: string | null = null;
    for (let i = seps.length - 1; i >= 0; i--) {
      if (tryName === null) {
        tryName = seps[i];
      } else {
        tryName = seps[i] + '_' + tryName;
      }

      if (isForbidName(tryName)) continue;
      if (this.locals.has(tryName)) continue;

      this.locals.add(tryName);
      this.fullNameToLocals.set(fullName, tryName);
      return tryName;
    }

    return fullName;
  }
}
