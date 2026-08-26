/**
 * TextValue — TypeScript port of Java `configgen.value.TextValue`.
 *
 * Two responsibilities:
 *   1. hasText(value) — recursively checks if a Value tree contains any VText
 *   2. setTranslated(cfgValue, langFinder) — sets translated text on all VText
 *      values using a LangTextFinder (i18n). When langFinder is null, returns
 *      immediately (no-op).
 *
 * setTranslatedForTable uses ForeachValue.foreachVTable with a
 * SetTextTranslatedVisitor that only implements visitPrimitive.
 *
 * Java source: configgen.value.TextValue.java (80 lines)
 */

import { hasText } from '@cfgforge/schema';
import type { Nameable } from '@cfgforge/schema';
import {
  type Value,
  type PrimitiveValue,
  VText,
  VStruct,
  VInterface,
  VList,
  VMap,
  VTable,
  CfgValue,
} from './CfgValue';
import { ForeachValue, ValueVisitorForPrimitive } from './ForeachValue';
import type { LangTextFinder, TextFinder } from './LangTextFinder';

export class TextValue {
  /**
   * Check if a Value tree contains any VText (translatable text).
   * For VStruct/VInterface, first checks schema's hasText() meta
   * (pre-calculated by preCalculateAllHasText).
   */
  static hasText(value: Value): boolean {
    if (isPrimitive(value)) {
      return value instanceof VText;
    }
    if (value instanceof VStruct) {
      if (!hasText(value.schema as Nameable)) return false;
      return value.values.some(v => TextValue.hasText(v));
    }
    if (value instanceof VInterface) {
      if (!hasText(value.schema as Nameable)) return false;
      return value.child.values.some(v => TextValue.hasText(v));
    }
    if (value instanceof VList) {
      return value.valueList.some(v => TextValue.hasText(v));
    }
    if (value instanceof VMap) {
      // Map keys are never Text (checked at schema resolve time in Java)
      for (const v of value.valueMap.values()) {
        if (TextValue.hasText(v)) return true;
      }
      return false;
    }
    return false;
  }

  /**
   * Set translated text on all VText values across all tables.
   * No-op when langFinder is null.
   */
  static setTranslated(cfgValue: CfgValue, langFinder: LangTextFinder | null): void {
    for (const vTable of cfgValue.tables()) {
      TextValue.setTranslatedForTable(vTable, langFinder);
    }
  }

  /**
   * Set translated text on all VText values in a single table.
   * No-op when langFinder is null, no TextFinder for this table,
   * or the table schema has no text fields.
   */
  static setTranslatedForTable(vTable: VTable, langFinder: LangTextFinder | null): void {
    if (langFinder === null) return;

    const textFinder: TextFinder | null = langFinder.getTextFinder(vTable.name());
    if (textFinder === null) return;

    if (!hasText(vTable.schema as Nameable)) return;

    ForeachValue.foreachVTable(
      new SetTextTranslatedVisitor(textFinder),
      vTable,
    );
  }
}

// ---------------------------------------------------------------------------
// SetTextTranslatedVisitor — only visits primitives, sets VText translated
// ---------------------------------------------------------------------------

class SetTextTranslatedVisitor extends ValueVisitorForPrimitive {
  private readonly _textFinder: TextFinder;

  constructor(textFinder: TextFinder) {
    super();
    this._textFinder = textFinder;
  }

  override visitPrimitive(pv: PrimitiveValue, pk: Value, fieldChain: string[]): void {
    if (pv instanceof VText) {
      const translated = this._textFinder.findText(pk.packStr(), fieldChain, pv.original);
      pv.setTranslated(translated);
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: type guard for PrimitiveValue
// ---------------------------------------------------------------------------

function isPrimitive(v: unknown): v is PrimitiveValue {
  return (
    v instanceof Object &&
    'value' in v &&
    !(
      v instanceof VStruct ||
      v instanceof VInterface ||
      v instanceof VList ||
      v instanceof VMap
    )
  );
}
