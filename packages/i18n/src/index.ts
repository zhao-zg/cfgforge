/**
 * @cfggen/i18n — Internationalization text finder and utilities.
 *
 * Phase 5 (T5.1–T5.2): LangTextFinder, TextByValueFinder, I18nUtils,
 *                       LangSwitchable, LangSwitchableRuntime
 */

export { LangTextFinder } from './LangTextFinder';
export type { TextVisitor, TextFinder } from './LangTextFinder';
export { TextByValueFinder } from './TextByValueFinder';
export { LangSwitchable } from './LangSwitchable';
export { LangSwitchableRuntime } from './LangSwitchableRuntime';
export { normalize, fieldChainStr } from './I18nUtils';
