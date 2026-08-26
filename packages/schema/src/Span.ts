/**
 * Span — TypeScript port of Java `configgen.schema.Span`.
 *
 * Pre-calculates the column span (in Excel) for each Nameable.
 * Stored as a `_span` metadata tag.
 */

import type { CfgSchema } from './CfgSchema';
import type { CfgSchemaErrs } from './CfgSchemaErrs';
import type { Nameable } from './Nameable';
import type { Fieldable } from './Fieldable';
import type { Structural } from './Structural';
import type { FieldSchema } from './FieldSchema';
import type { SimpleType } from './FieldType';
import { isStructRef, isFList, isFMap, isPrimitive } from './FieldType';
import type { FieldFormat } from './FieldFormat';
import { AutoOrPack, isSep, isBlock, isFix } from './FieldFormat';
import { isMetaInt } from './Metadata';
import { StructSchema } from './StructSchema';
import { TableSchema } from './TableSchema';
import { InterfaceSchema } from './InterfaceSchema';
import { foreachFieldStructRef } from './ForeachSchema';
import { CfgWriter } from './cfg/CfgWriter';
import * as Errs from './CfgSchemaErrs';

// ---------------------------------------------------------------------------
// Pre-calculation entry point
// ---------------------------------------------------------------------------

export function preCalculateAllNeededSpans(cfgSchema: CfgSchema, errs: CfgSchemaErrs): void {
  const needSpans = collectNeededCalculateSpans(cfgSchema);
  // reverse: calculate table-dependent struct spans first
  const reversedNeedSpans = Array.from(needSpans.values()).reverse();

  for (const nameable of reversedNeedSpans) {
    checkNameableFmt(nameable, errs);
  }

  if (errs.errs.length === 0) {
    try {
      for (const nameable of reversedNeedSpans) {
        calcSpanCheckLoop(nameable, new Set<string>());
      }
    } catch (e) {
      if (e instanceof StructNestLoop) {
        errs.addErr(Errs.mappingToExcelLoop([...e.stackNames]));
      } else {
        throw e;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// StructNestLoop — internal exception
// ---------------------------------------------------------------------------

class StructNestLoop extends Error {
  readonly stackNames: Set<string>;
  constructor(stack: Set<string>) {
    super('StructNestLoop');
    this.name = 'StructNestLoop';
    this.stackNames = stack;
  }
}

// ---------------------------------------------------------------------------
// Fmt checking
// ---------------------------------------------------------------------------

function checkNameableFmt(nameable: Nameable, errs: CfgSchemaErrs): void {
  if (nameable instanceof InterfaceSchema) {
    for (const impl of nameable.impls()) {
      for (const field of impl.fields()) {
        checkFieldFmt(field, errs, impl.fullName());
      }
    }
  } else if (isStructural(nameable)) {
    for (const field of nameable.fields()) {
      checkFieldFmt(field, errs, nameable.fullName());
    }
  }
}

function checkFieldFmt(field: FieldSchema, errs: CfgSchemaErrs, ctx: string): void {
  const type = field.type;
  const fmt = field.fmt;

  if (isPrimitive(type)) {
    if (fmt !== AutoOrPack.AUTO) {
      errs.addErr(Errs.primitiveFieldFmtMustBeAuto(ctx, field.name, CfgWriter.typeStr(field), CfgWriter.fmtStr(fmt)));
    }
  } else if (isStructRef(type)) {
    if (!isAutoOrPack(fmt)) {
      errs.addErr(Errs.structFieldFmtMustBeAutoOrPack(ctx, field.name, CfgWriter.typeStr(field), CfgWriter.fmtStr(fmt)));
    }
  } else if (isFList(type)) {
    if (fmt === AutoOrPack.AUTO) {
      errs.addErr(Errs.listFieldFmtMustBePackOrSepOrFixOrBlock(ctx, field.name, CfgWriter.typeStr(field), CfgWriter.fmtStr(fmt)));
    }
    if (isSep(fmt) && isStructRef(type.item)) {
      const structRef = type.item;
      if (structRef.obj) {
        const objFmt = structRef.obj.fmt();
        if ((isSep(objFmt) && objFmt.sep === fmt.sep) ||
            (objFmt === AutoOrPack.PACK && fmt.sep === ',')) {
          errs.addErr(Errs.listStructSepEqual(ctx, field.name));
        }
      }
    }
  } else if (isFMap(type)) {
    if (fmt === AutoOrPack.AUTO || isSep(fmt)) {
      errs.addErr(Errs.mapFieldFmtMustBePackOrFixOrBlock(ctx, field.name, CfgWriter.typeStr(field), CfgWriter.fmtStr(fmt)));
    }
  }
}

// ---------------------------------------------------------------------------
// Collect needed spans (BFS from non-json tables)
// ---------------------------------------------------------------------------

function collectNeededCalculateSpans(cfgSchema: CfgSchema): Map<string, Nameable> {
  const collectedNeedSpans = new Map<string, Nameable>();
  let fieldFrontiers: FieldSchema[] = [];

  const tableMap = cfgSchema.tableMap();
  if (tableMap) {
    for (const table of tableMap.values()) {
      if (!table.isJson()) {
        collectedNeedSpans.set(table.name(), table);
        fieldFrontiers = fieldFrontiers.concat(table.fields());
      }
    }
  }

  while (fieldFrontiers.length > 0) {
    const needChecks = new Map<string, Fieldable>();
    for (const field of fieldFrontiers) {
      if (field.fmt !== AutoOrPack.PACK) {
        foreachFieldStructRef(field, (fieldable) => addIfNotPack(needChecks, fieldable));
      }
    }

    fieldFrontiers = [];
    for (const nameable of needChecks.values()) {
      const old = collectedNeedSpans.get(nameable.fullName());
      const notCheckedBefore = old === undefined;
      if (notCheckedBefore) {
        collectedNeedSpans.set(nameable.fullName(), nameable);
        if (nameable instanceof InterfaceSchema) {
          for (const impl of nameable.impls()) {
            fieldFrontiers = fieldFrontiers.concat(impl.fields());
          }
        } else if (nameable instanceof StructSchema) {
          fieldFrontiers = fieldFrontiers.concat(nameable.fields());
        }
      }
    }
  }

  return collectedNeedSpans;
}

function addIfNotPack(needChecks: Map<string, Fieldable>, fieldable: Fieldable | null): void {
  if (fieldable !== null && fieldable.fmt() !== AutoOrPack.PACK) {
    needChecks.set(fieldable.name(), fieldable);
  }
}

// ---------------------------------------------------------------------------
// Span calculation with loop detection
// ---------------------------------------------------------------------------

function calcSpanCheckLoop(nameable: Nameable, stack: Set<string>): number {
  const meta = nameable.meta();
  const spanVal = meta.getSpan();
  if (isMetaInt(spanVal)) {
    return spanVal.value;
  }

  const fmt = nameable.fmt();
  if (fmt === AutoOrPack.PACK || isSep(fmt)) {
    return 1;
  }

  if (!stack.add(nameable.fullName())) {
    throw new StructNestLoop(stack);
  }

  let resultSpan: number;

  if (nameable instanceof InterfaceSchema) {
    let max = -1;
    for (const impl of nameable.impls()) {
      const s = calcSpanCheckLoop(impl, stack);
      if (s > max) max = s;
    }
    resultSpan = max >= 0 ? max + 1 : 1;
  } else if (isStructural(nameable)) {
    resultSpan = 0;
    for (const field of nameable.fields()) {
      resultSpan += calcFieldSpanCheckLoop(field, stack);
    }
  } else {
    resultSpan = 1;
  }

  stack.delete(nameable.fullName());
  meta.putSpan(resultSpan);
  return resultSpan;
}

function calcFieldSpanCheckLoop(field: FieldSchema, stack: Set<string>): number {
  const fmt = field.fmt;
  if (fmt === AutoOrPack.PACK || isSep(fmt) || isPrimitive(field.type)) {
    return 1;
  }

  const meta = field.meta;
  const spanVal = meta.getSpan();
  if (isMetaInt(spanVal)) {
    return spanVal.value;
  }

  let resultSpan: number;

  if (isStructRef(field.type)) {
    resultSpan = calcSpanCheckLoop(field.type.obj!, stack);
  } else if (isFList(field.type)) {
    const fl = field.type;
    if (isBlock(fmt)) {
      resultSpan = calcSimpleTypeSpanCheckLoop(fl.item, stack) * fmt.fix;
    } else if (isFix(fmt)) {
      resultSpan = calcSimpleTypeSpanCheckLoop(fl.item, stack) * fmt.count;
    } else {
      throw new Error(`Unexpected value: ${fmt}`);
    }
  } else if (isFMap(field.type)) {
    const fm = field.type;
    if (isBlock(fmt)) {
      resultSpan = (calcSimpleTypeSpanCheckLoop(fm.key, stack) +
                    calcSimpleTypeSpanCheckLoop(fm.value, stack)) * fmt.fix;
    } else if (isFix(fmt)) {
      resultSpan = (calcSimpleTypeSpanCheckLoop(fm.key, stack) +
                    calcSimpleTypeSpanCheckLoop(fm.value, stack)) * fmt.count;
    } else {
      throw new Error(`Unexpected value: ${fmt}`);
    }
  } else {
    throw new Error('Unexpected primitive type in calcFieldSpanCheckLoop');
  }

  meta.putSpan(resultSpan);
  return resultSpan;
}

function calcSimpleTypeSpanCheckLoop(type: SimpleType, stack: Set<string>): number {
  if (isPrimitive(type)) return 1;
  if (isStructRef(type)) return calcSpanCheckLoop(type.obj!, stack);
  throw new Error('Unexpected SimpleType');
}

// ---------------------------------------------------------------------------
// Public query functions
// ---------------------------------------------------------------------------

export function span(nameable: Nameable): number {
  const fmt = nameable.fmt();
  if (fmt === AutoOrPack.PACK || isSep(fmt)) return 1;

  const v = nameable.meta().getSpan();
  if (isMetaInt(v)) return v.value;

  throw new Error(`${nameable.fullName()} has no _span meta value, schema may not resolved`);
}

export function fieldSpan(field: FieldSchema): number {
  const fmt = field.fmt;
  if (fmt === AutoOrPack.PACK || isSep(fmt) || isPrimitive(field.type)) return 1;

  const v = field.meta.getSpan();
  if (isMetaInt(v)) return v.value;

  throw new Error(`${field.name} has no _span meta value, schema may not resolved`);
}

export function simpleTypeSpan(type: SimpleType): number {
  if (isPrimitive(type)) return 1;
  if (isStructRef(type)) return span(type.obj!);
  throw new Error('Unexpected SimpleType');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAutoOrPack(fmt: FieldFormat): boolean {
  return fmt === AutoOrPack.AUTO || fmt === AutoOrPack.PACK;
}

function isStructural(item: Nameable): item is Structural {
  return item instanceof StructSchema || item instanceof TableSchema;
}
