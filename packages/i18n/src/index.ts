/**
 * @cfgforge/i18n — Internationalization text finder and utilities.
 *
 * Phase 5 (T5.1–T5.4): LangTextFinder, TextByValueFinder, TextByIdFinder,
 *                       I18nUtils, LangSwitchable, LangSwitchableRuntime, TodoFile
 */

export { LangTextFinder } from './LangTextFinder.js';
export type { TextVisitor, TextFinder } from './LangTextFinder.js';
export { TextByValueFinder } from './TextByValueFinder.js';
export { TextByIdFinder, OneText, OneRecord } from './TextByIdFinder.js';
export { LangSwitchable } from './LangSwitchable.js';
export { LangSwitchableRuntime } from './LangSwitchableRuntime.js';
export { TodoFile, TodoFileLine } from './TodoFile.js';
export { normalize, fieldChainStr } from './I18nUtils.js';
