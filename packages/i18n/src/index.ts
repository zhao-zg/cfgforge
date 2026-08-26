/**
 * @cfgforge/i18n — Internationalization text finder and utilities.
 *
 * Phase 5 (T5.1–T5.4): LangTextFinder, TextByValueFinder, TextByIdFinder,
 *                       I18nUtils, LangSwitchable, LangSwitchableRuntime, TodoFile
 */

export { LangTextFinder } from './LangTextFinder';
export type { TextVisitor, TextFinder } from './LangTextFinder';
export { TextByValueFinder } from './TextByValueFinder';
export { TextByIdFinder, OneText, OneRecord } from './TextByIdFinder';
export { LangSwitchable } from './LangSwitchable';
export { LangSwitchableRuntime } from './LangSwitchableRuntime';
export { TodoFile, TodoFileLine } from './TodoFile';
export { normalize, fieldChainStr } from './I18nUtils';
