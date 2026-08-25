/**
 * LuaValueStringify — TypeScript port of Java `configgen.genlua.ValueStringify`.
 *
 * Converts Value instances to Lua expression strings.
 *
 * Key features:
 * - packBool: collapses multiple bool fields into a single hex int
 * - shared composite values: reuses pre-computed table references (A[i])
 * - key/notKey mode: map keys may need bracket notation
 * - langSwitch: VText values become integer IDs instead of string literals
 *
 * Differences from Java:
 * - AContext.getInstance() singleton replaced with passed-in LuaAContext
 * - Java StringBuilder replaced with a reusable string[] buffer
 * - No BitSet (use manual bit operations)
 */

import type { FieldSchema } from '@cfggen/schema';
import { Primitive } from '@cfggen/schema';
import type { Value, SimpleValue, CompositeValue } from '@cfggen/value';
import {
  VBool, VInt, VLong, VFloat, VString, VText,
  VStruct, VInterface, VList, VMap,
} from '@cfggen/value';
import type { LuaAContext } from './LuaAContext';
import type { LuaCtx } from './LuaCtx';
import { isDoPackBool } from './LuaTypeStr';
import { luaFullName } from './LuaName';

// ---------------------------------------------------------------------------
// Lua keyword set
// ---------------------------------------------------------------------------

const KEYWORDS = new Set([
  'break', 'goto', 'do', 'end', 'for', 'in', 'repeat', 'until', 'while',
  'if', 'then', 'elseif', 'function', 'local', 'nil', 'true', 'false',
  'and', 'else', 'not', 'or', 'return',
]);

// ---------------------------------------------------------------------------
// Static helpers
// ---------------------------------------------------------------------------

export function getLuaString(res: string[], value: string): void {
  const val = toLuaStringLiteral(value);
  res.push(`"${val}"`);
}

function toLuaStringLiteral(value: string): string {
  let val = value.replace(/\\/g, '\\\\');
  val = val.replace(/\r\n/g, '\\n');
  val = val.replace(/\n/g, '\\n');
  val = val.replace(/"/g, '\\"');
  return val;
}

// ---------------------------------------------------------------------------
// ValueStringify
// ---------------------------------------------------------------------------

export class LuaValueStringify {
  private res: string[];
  private ctx: LuaCtx;
  private aCtx: LuaAContext;
  private beanTypeStr: string | null;
  private pkStr: string | null;
  private isKey: boolean;

  private key: LuaValueStringify;
  private notKey: LuaValueStringify;

  /**
   * @param res Shared output buffer
   * @param ctx Per-table context
   * @param aCtx Global context
   * @param beanTypeStr When non-null, this is the top-level "mk" bean call
   * @param pkStr When non-null, langSwitch text ID mode is active
   */
  constructor(
    res: string[],
    ctx: LuaCtx,
    aCtx: LuaAContext,
    beanTypeStr: string | null,
    pkStr: string | null,
  ) {
    this.res = res;
    this.ctx = ctx;
    this.aCtx = aCtx;
    this.beanTypeStr = beanTypeStr;
    this.pkStr = pkStr;

    if (pkStr !== null) {
      const ls = aCtx.nullableLangSwitchSupportVal();
      if (ls === null) {
        throw new Error("Don't set pkStr when no LangSwitch");
      }
    }

    this.isKey = false;

    // Create key/notKey sub-instances sharing state
    this.key = LuaValueStringify.createKeyInstance(res, ctx, aCtx, pkStr, true);
    this.notKey = LuaValueStringify.createKeyInstance(res, ctx, aCtx, pkStr, false);
    this.key.key = this.key;
    this.key.notKey = this.notKey;
    this.notKey.key = this.key;
    this.notKey.notKey = this.notKey;
  }

  private static createKeyInstance(
    res: string[],
    ctx: LuaCtx,
    aCtx: LuaAContext,
    pkStr: string | null,
    isKey: boolean,
  ): LuaValueStringify {
    const inst = Object.create(LuaValueStringify.prototype);
    inst.res = res;
    inst.ctx = ctx;
    inst.aCtx = aCtx;
    inst.beanTypeStr = null;
    inst.pkStr = pkStr;
    inst.isKey = isKey;
    inst.key = inst;
    inst.notKey = inst;
    return inst;
  }

  private add(val: string): void {
    if (this.isKey) {
      this.res.push(`[${val}]`);
    } else {
      this.res.push(val);
    }
  }

  private hasLangSwitchAndText(): boolean {
    return this.pkStr !== null;
  }

  private subChain(old: string[], e: string): string[] {
    if (this.hasLangSwitchAndText()) {
      return [...old, e];
    }
    return old;
  }

  addValue(value: Value, fieldChain: string[]): void {
    if (value instanceof VBool) {
      this.add(value.value ? 'true' : 'false');
    } else if (value instanceof VInt) {
      this.add(String(value.value));
    } else if (value instanceof VLong) {
      this.add(String(value.value));
    } else if (value instanceof VFloat) {
      this.add(String(value.value));
    } else if (value instanceof VString) {
      this.addString(value.value);
    } else if (value instanceof VText) {
      this.addVText(value, fieldChain);
    } else if (value instanceof VStruct) {
      this.addVStruct(value, null, fieldChain);
    } else if (value instanceof VInterface) {
      this.addVInterface(value, fieldChain);
    } else if (value instanceof VList) {
      this.addVList(value, fieldChain);
    } else if (value instanceof VMap) {
      this.addVMap(value, fieldChain);
    }
  }

  private addVText(value: VText, fieldChain: string[]): void {
    if (this.hasLangSwitchAndText()) {
      const ls = this.aCtx.nullableLangSwitchSupportVal()!;
      const id = ls.enterText(this.pkStr!, fieldChain, value.value) + 1;
      this.res.push(String(id));
    } else {
      this.addString(value.value);
    }
  }

  private addString(string: string): void {
    const val = toLuaStringLiteral(string);
    if (this.isKey) {
      if (KEYWORDS.has(val) || val.includes('-') || val.includes('=') || val.includes(',')) {
        this.res.push(`["${val}"]`);
      } else {
        this.res.push(val);
      }
    } else {
      if (this.aCtx.isNoStr()) {
        this.res.push("''");
      } else {
        this.res.push(`"${val}"`);
      }
    }
  }

  private addVList(value: VList, fieldChain: string[]): void {
    const sz = value.valueList.length;
    if (sz === 0) {
      this.ctx.ctxShared().incEmptyTableUseCount(this.aCtx);
      this.res.push(this.aCtx.getEmptyTableStr());
    } else {
      const vstr = this.getSharedCompositeBriefName(value);
      if (vstr !== null) {
        this.res.push(vstr);
      } else {
        this.ctx.ctxShared().incListTableUseCount(this.aCtx);
        this.res.push(this.aCtx.getListMapPrefixStr());
        let idx = 0;
        for (const eleValue of value.valueList) {
          this.notKey.addValue(eleValue, this.subChain(fieldChain, String(idx)));
          idx++;
          if (idx !== sz) {
            this.res.push(', ');
          }
        }
        this.res.push(this.aCtx.getListMapPostfixStr());
      }
    }
  }

  private getSharedCompositeBriefName(value: CompositeValue): string | null {
    if (value.isShared()) {
      return this.ctx.ctxShared().getSharedName(value);
    }
    return null;
  }

  private addVMap(value: VMap, fieldChain: string[]): void {
    const sz = value.valueMap.size;
    if (sz === 0) {
      this.ctx.ctxShared().incEmptyTableUseCount(this.aCtx);
      this.res.push(this.aCtx.getEmptyTableStr());
    } else {
      const vstr = this.getSharedCompositeBriefName(value);
      if (vstr !== null) {
        this.res.push(vstr);
      } else {
        this.ctx.ctxShared().incMapTableUseCount(this.aCtx);
        this.res.push(this.aCtx.getListMapPrefixStr());
        let idx = 0;
        for (const [k, v] of value.valueMap) {
          this.key.addValue(k, this.subChain(fieldChain, `${idx}k`));
          this.res.push(' = ');
          this.notKey.addValue(v, this.subChain(fieldChain, `${idx}v`));
          idx++;
          if (idx !== sz) {
            this.res.push(', ');
          }
        }
        this.res.push(this.aCtx.getListMapPostfixStr());
      }
    }
  }

  private addVInterface(value: VInterface, fieldChain: string[]): void {
    this.addVStruct(value.child, value, fieldChain);
  }

  private addVStruct(vStruct: VStruct, nullableInterface: VInterface | null, fieldChain: string[]): void {
    const value: CompositeValue = nullableInterface !== null ? nullableInterface : vStruct;

    let beanType = this.beanTypeStr;
    if (beanType === null) {
      beanType = this.ctx.ctxName().getLocalName(
        luaFullName(vStruct.schema, this.aCtx.getPkgPrefixStr()),
        (name: string) => this.aCtx.isForbidName(name),
      );
    }

    const vstr = this.getSharedCompositeBriefName(value);
    if (vstr !== null) {
      this.res.push(vstr);
    } else {
      const statistics = this.aCtx.getStatistics();
      if (this.beanTypeStr !== null) {
        statistics.useRecordTable();
      } else if (nullableInterface !== null) {
        statistics.useInterfaceTable();
      } else {
        statistics.useStructTable();
      }

      this.res.push(beanType);

      const fields = vStruct.schema.fields();
      const sz = vStruct.values.length;
      if (sz > 0) {
        this.res.push('(');
        let idx = 0;
        let meetBool = false;
        const doPack = isDoPackBool(vStruct.schema, this.aCtx);
        let i = 0;
        for (const field of fields) {
          const fieldValue = vStruct.values[i];
          i++;
          if (doPack && fieldValue instanceof VBool) {
            if (!meetBool) {
              meetBool = true;
              // Pack all bools into a single hex value
              let v = 0n;
              let cnt = 0;
              for (const fv of vStruct.values) {
                if (fv instanceof VBool) {
                  if (fv.value) {
                    v |= (1n << BigInt(cnt));
                  }
                  cnt++;
                }
              }
              idx += cnt;
              statistics.usePackBool(cnt - 1);

              if (cnt < 32) {
                const hex = v.toString(16);
                this.res.push(`0x${hex}`);
              } else {
                this.res.push(v.toString());
              }

              if (idx !== sz) {
                this.res.push(', ');
              }
            }
          } else {
            idx++;
            this.notKey.addValue(fieldValue, this.subChain(fieldChain, field.name));
            if (idx !== sz) {
              this.res.push(', ');
            }
          }
        }
        this.res.push(')');
      }
    }
  }
}
