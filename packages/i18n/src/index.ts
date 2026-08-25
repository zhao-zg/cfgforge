/**
 * @cfggen/i18n — Internationalization text finder and utilities.
 *
 * Phase 5 (T5.1): LangTextFinder, TextByValueFinder, I18nUtils
 */

export { LangTextFinder } from './LangTextFinder';
export type { TextVisitor, TextFinder } from './LangTextFinder';
export { TextByValueFinder } from './TextByValueFinder';
export { normalize, fieldChainStr } from './I18nUtils';
