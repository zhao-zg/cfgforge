/**
 * LuaCtx — TypeScript port of Java `configgen.genlua.Ctx` + `CtxShared` +
 * `ValueShared` + `ValueSharedLayer` + `HasSubFieldable`.
 *
 * Per-table context for Lua code generation:
 * - VTable reference
 * - CtxName: local variable name management
 * - CtxShared: shared composite value optimization (dedup identical tables)
 * - HasSubFieldable: checks if a Structural references any StructRef
 *
 * Differences from Java:
 * - All 5 classes merged into one file
 * - AContext.getInstance() replaced with passed-in LuaAContext
 * - No concurrency (TS single-threaded; Java used LongAdder for counters)
 */

import type { Structural } from '@cfggen/schema';
import { FList, FMap, StructRef } from '@cfggen/schema';
import type { VTable, Value, CompositeValue } from '@cfggen/value';
import {
  VStruct, VInterface, VList, VMap,
} from '@cfggen/value';
import { TextValue } from '@cfggen/value';
import type { LuaAContext } from './LuaAContext';
import { LuaCtxName } from './LuaName';

// ---------------------------------------------------------------------------
// HasSubFieldable — check if a Structural has StructRef fields
// ---------------------------------------------------------------------------

export function hasSubFieldable(structural: Structural): boolean {
  for (const field of structural.fields()) {
    const type = field.type;
    if (type instanceof StructRef) {
      return true;
    }
    if (type instanceof FList) {
      if (type.item instanceof StructRef) return true;
    }
    if (type instanceof FMap) {
      if (type.key instanceof StructRef || type.value instanceof StructRef) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// CompositeValueCnt — count for a composite value in a shared layer
// ---------------------------------------------------------------------------

class CompositeValueCnt {
  private cnt: number;
  private readonly first: CompositeValue;
  private traversed = false;

  constructor(first: CompositeValue) {
    this.first = first;
    this.cnt = 1;
  }

  getCnt(): number { return this.cnt; }
  incCnt(): void { this.cnt++; }
  getFirst(): CompositeValue { return this.first; }
  isTraversed(): boolean { return this.traversed; }
  setTraversed(): void { this.traversed = true; }
}

// ---------------------------------------------------------------------------
// CompositeValueStr — shared value with name and string representation
// ---------------------------------------------------------------------------

export class CompositeValueStr {
  private valueStr: string | null = null;
  private readonly name: string;

  constructor(i: number) {
    this.name = `A[${i}]`;
  }

  setValueStr(value: string): void { this.valueStr = value; }
  getName(): string { return this.name; }
  getValueStr(): string | null { return this.valueStr; }
}

// ---------------------------------------------------------------------------
// ValueSharedLayer — one layer of composite value counting
// ---------------------------------------------------------------------------

class ValueSharedLayer {
  private readonly shared: ValueShared;
  private readonly compositeValueToCnt = new Map<CompositeValue, CompositeValueCnt>();

  constructor(shared: ValueShared) {
    this.shared = shared;
  }

  getCompositeValueToCnt(): Map<CompositeValue, CompositeValueCnt> {
    return this.compositeValueToCnt;
  }

  private add(v: CompositeValue, aCtx: LuaAContext): void {
    const oldInThisLayer = this.compositeValueToCnt.get(v);
    const isLangSwitchAndHasText = isLangSwitchAndCompositeValueHasText(v, aCtx);
    if (oldInThisLayer !== undefined) {
      if (!isLangSwitchAndHasText) {
        oldInThisLayer.incCnt();
        oldInThisLayer.getFirst().setShared();
        v.setShared();
      }
    } else {
      const oldInPreviousLayer = this.shared.remove(v);
      if (oldInPreviousLayer !== null) {
        if (!isLangSwitchAndHasText) {
          oldInPreviousLayer.incCnt();
          this.compositeValueToCnt.set(v, oldInPreviousLayer);
          oldInPreviousLayer.getFirst().setShared();
          v.setShared();
        }
      } else {
        this.compositeValueToCnt.set(v, new CompositeValueCnt(v));
      }
    }
  }

  visitSubStructs(value: Value, aCtx: LuaAContext): void {
    if (value instanceof VStruct) {
      for (const fv of value.values) {
        this.visitThis(fv, aCtx);
      }
    } else if (value instanceof VInterface) {
      for (const fv of value.child.values) {
        this.visitThis(fv, aCtx);
      }
    } else if (value instanceof VList) {
      for (const item of value.valueList) {
        this.visitThis(item, aCtx);
      }
    } else if (value instanceof VMap) {
      for (const [k, v] of value.valueMap) {
        this.visitThis(k, aCtx);
        this.visitThis(v, aCtx);
      }
    }
    // PrimitiveValue: do nothing
  }

  private visitThis(value: Value, aCtx: LuaAContext): void {
    if (value instanceof VStruct) {
      if (value.values.length > 0) {
        this.add(value, aCtx);
      }
    } else if (value instanceof VInterface) {
      this.add(value, aCtx);
    } else if (value instanceof VList) {
      if (value.valueList.length > 0) {
        this.add(value, aCtx);
      }
    } else if (value instanceof VMap) {
      if (value.valueMap.size > 0) {
        this.add(value, aCtx);
      }
    }
    // PrimitiveValue: do nothing
  }
}

// ---------------------------------------------------------------------------
// ValueShared — manages shared composite value layers
// ---------------------------------------------------------------------------

class ValueShared {
  private readonly layers: ValueSharedLayer[] = [];
  private readonly vTable: VTable;

  constructor(vTable: VTable) {
    this.vTable = vTable;
  }

  iterateShared(aCtx: LuaAContext): void {
    const layer1 = new ValueSharedLayer(this);
    for (const vStruct of this.vTable.valueList) {
      layer1.visitSubStructs(vStruct, aCtx);
    }
    this.layers.push(layer1);

    let currLayer = layer1;
    while (true) {
      const nextLayer = new ValueSharedLayer(this);
      const currLayerCopy = [...currLayer.getCompositeValueToCnt().values()];
      for (const vc of currLayerCopy) {
        if (!vc.isTraversed()) {
          nextLayer.visitSubStructs(vc.getFirst(), aCtx);
          vc.setTraversed();
        }
      }
      if (nextLayer.getCompositeValueToCnt().size > 0) {
        this.layers.push(nextLayer);
        currLayer = nextLayer;
      } else {
        break;
      }
    }
  }

  getLayers(): ValueSharedLayer[] { return this.layers; }

  remove(v: CompositeValue): CompositeValueCnt | null {
    for (const layer of this.layers) {
      const old = layer.getCompositeValueToCnt().get(v);
      if (old !== undefined) {
        layer.getCompositeValueToCnt().delete(v);
        return old;
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// LuaCtxShared — shared composite value management
// ---------------------------------------------------------------------------

export class LuaCtxShared {
  private emptyTableUseCount = 0;
  private listTableUseCount = 0;
  private mapTableUseCount = 0;
  private readonly sharedCompositeValues = new Map<CompositeValue, CompositeValueStr>();

  parseShared(ctx: LuaCtx, aCtx: LuaAContext): void {
    const shared = new ValueShared(ctx.vTable());
    shared.iterateShared(aCtx);

    let idx = 0;
    const layers = shared.getLayers();
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      for (const vc of layer.getCompositeValueToCnt().values()) {
        if (vc.getCnt() > 1) {
          idx++;
          aCtx.getStatistics().useSharedTable(vc.getCnt() - 1);
          this.sharedCompositeValues.set(vc.getFirst(), new CompositeValueStr(idx));
        }
      }
    }

    // Generate value strings — deferred to LuaValueStringify
    // (handled by the caller via generateSharedValueStrs)
  }

  /** Called by LuaCodeGenerator after parseShared to generate value strings. */
  getSharedList(): CompositeValueStr[] {
    return [...this.sharedCompositeValues.values()];
  }

  /** Returns the shared composite values map for value string generation. */
  getSharedCompositeValues(): Map<CompositeValue, CompositeValueStr> {
    return this.sharedCompositeValues;
  }

  getSharedName(v: CompositeValue): string | null {
    const vstr = this.sharedCompositeValues.get(v);
    if (vstr !== undefined) {
      if (vstr.getValueStr() !== null) {
        return vstr.getName();
      }
    }
    return null;
  }

  getEmptyTableUseCount(): number { return this.emptyTableUseCount; }

  incEmptyTableUseCount(aCtx: LuaAContext): void {
    this.emptyTableUseCount++;
    aCtx.getStatistics().useEmptyTable();
  }

  hasListTableOrMapTable(): boolean {
    return this.listTableUseCount > 0 || this.mapTableUseCount > 0;
  }

  incListTableUseCount(aCtx: LuaAContext): void {
    this.listTableUseCount++;
    aCtx.getStatistics().useListTable();
  }

  incMapTableUseCount(aCtx: LuaAContext): void {
    this.mapTableUseCount++;
    aCtx.getStatistics().useMapTable();
  }
}

// ---------------------------------------------------------------------------
// LuaCtx — per-table context
// ---------------------------------------------------------------------------

export class LuaCtx {
  private readonly _vTable: VTable;
  private readonly _ctxName: LuaCtxName;
  private readonly _ctxShared: LuaCtxShared;

  constructor(vTable: VTable) {
    this._vTable = vTable;
    this._ctxName = new LuaCtxName();
    this._ctxShared = new LuaCtxShared();
  }

  vTable(): VTable { return this._vTable; }
  ctxName(): LuaCtxName { return this._ctxName; }
  ctxShared(): LuaCtxShared { return this._ctxShared; }

  parseShared(aCtx: LuaAContext): void {
    this._ctxShared.parseShared(this, aCtx);
  }
}

// ---------------------------------------------------------------------------
// Helper: check if composite value has text (for lang switch optimization)
// ---------------------------------------------------------------------------

function isLangSwitchAndCompositeValueHasText(v: CompositeValue, aCtx: LuaAContext): boolean {
  if (aCtx.nullableLangSwitchSupportVal() === null) return false;
  return TextValue.hasText(v as unknown as Value);
}
