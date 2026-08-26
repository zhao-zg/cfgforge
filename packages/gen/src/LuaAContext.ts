/**
 * LuaAContext — TypeScript port of Java `configgen.genlua.AContext` +
 * `AStat` + `LangSwitchSupport`.
 *
 * Global state for Lua code generation:
 * - pkgPrefix, emptyTable/listMap strings, forbidden local names
 * - Statistics counters (emptyTable, list, map, interface, struct, record, shared, packBool)
 * - LangSwitchSupport: multi-language text ID management
 *
 * Differences from Java:
 * - Java uses a static singleton (AContext.getInstance()); TS uses a class
 *   instance passed around explicitly
 * - Java's LongAdder counters replaced with plain numbers (no concurrency needed)
 * - LangSwitchSupport is inlined here rather than a separate class
 */

import { Logger } from '@cfgforge/shared';
import type { LangSwitchable } from '@cfgforge/i18n';
import type { TextFinder } from '@cfgforge/i18n';

// ---------------------------------------------------------------------------
// LuaAStat — statistics (ported from AStat.java)
// ---------------------------------------------------------------------------

export class LuaAStat {
  private emptyTableCount = 0;
  private listTableCount = 0;
  private mapTableCount = 0;
  private interfaceTableCount = 0;
  private structTableCount = 0;
  private recordTableCount = 0;
  private sharedTableReduceCount = 0;
  private packBoolReduceCount = 0;

  useEmptyTable(): void { this.emptyTableCount++; }
  useListTable(): void { this.listTableCount++; }
  useMapTable(): void { this.mapTableCount++; }
  useInterfaceTable(): void { this.interfaceTableCount++; }
  useStructTable(): void { this.structTableCount++; }
  useRecordTable(): void { this.recordTableCount++; }
  useSharedTable(c: number): void { this.sharedTableReduceCount += c; }
  usePackBool(c: number): void { this.packBoolReduceCount += c; }

  print(): void {
    Logger.verbose(
      `可共享空table个数:${this.emptyTableCount}, 共享table节省:${this.sharedTableReduceCount}, 压缩bool节省:${this.packBoolReduceCount}, 总共有list:${this.listTableCount}, map:${this.mapTableCount}, interface:${this.interfaceTableCount}, struct:${this.structTableCount}, record:${this.recordTableCount}`,
    );
  }
}

// ---------------------------------------------------------------------------
// LangSwitchSupport — multi-language text ID management
// (ported from LangSwitchSupport.java)
// ---------------------------------------------------------------------------

interface LangTexts {
  lang: string;
  langI18n: import('@cfgforge/i18n').LangTextFinder;
  curTableTextFinder: TextFinder | null;
  texts: string[];
}

const INIT_SIZE = 1024 * 32;

export class LuaLangSwitchSupport {
  private readonly langSwitch: LangSwitchable;
  private readonly defaultLangTexts: string[];
  private readonly langTextsList: LangTexts[];
  private index = 0;

  constructor(langSwitch: LangSwitchable) {
    this.langSwitch = langSwitch;
    this.defaultLangTexts = new Array(INIT_SIZE);
    this.defaultLangTexts[0] = ''; // id=0 means empty string

    this.langTextsList = [];
    for (const [lang, langI18n] of langSwitch.langMap) {
      const texts = new Array(INIT_SIZE);
      texts[0] = '';
      this.langTextsList.push({ lang, langI18n, curTableTextFinder: null, texts });
    }
  }

  enterTable(table: string): void {
    for (const lt of this.langTextsList) {
      lt.curTableTextFinder = lt.langI18n.getTextFinder(table);
    }
  }

  enterText(pkStr: string, fieldChain: string[], original: string): number {
    if (original.length === 0) {
      return 0; // empty string
    }

    this.defaultLangTexts.push(original);
    for (const lt of this.langTextsList) {
      let text: string | null = null;
      if (lt.curTableTextFinder !== null) {
        text = lt.curTableTextFinder.findText(pkStr, fieldChain, original);
      }
      if (text === null) {
        text = original;
      }
      lt.texts.push(text);
    }
    this.index++;
    return this.index;
  }

  getLang2Texts(): Map<string, string[]> {
    const lang2Texts = new Map<string, string[]>();
    lang2Texts.set(this.langSwitch.defaultLang, this.defaultLangTexts);
    for (const lt of this.langTextsList) {
      lang2Texts.set(lt.lang, lt.texts);
    }
    return lang2Texts;
  }
}

// ---------------------------------------------------------------------------
// LuaAContext — global state (ported from AContext.java)
// ---------------------------------------------------------------------------

export class LuaAContext {
  private pkgPrefixStr = '';
  private nullableLangSwitchSupport: LuaLangSwitchSupport | null = null;
  private shared = false;
  private packBool = false;
  private noStr = false;

  private emptyTableStr = '';
  private listMapPrefixStr = '';
  private listMapPostfixStr = '';

  private readonly forbidLocalNames = new Set<string>([
    'Beans', 'this', 'mk',
    'A', // shared Table
    'E', // emptyTable
    'R', // wrapper for shared Table / list/map detection
  ]);

  private statistics!: LuaAStat;

  init(
    pkg: string,
    ls: LangSwitchable | null,
    shareEmptyTable: boolean,
    share: boolean,
    packBool: boolean,
    noStr: boolean,
    rForOldShared: boolean,
  ): void {
    this.nullableLangSwitchSupport = ls !== null ? new LuaLangSwitchSupport(ls) : null;
    this.shared = share;
    this.packBool = packBool;
    this.noStr = noStr;

    if (shareEmptyTable) {
      this.emptyTableStr = 'E';
    } else {
      this.emptyTableStr = '{}';
    }

    if (rForOldShared) {
      this.listMapPrefixStr = 'R({';
      this.listMapPostfixStr = '}';
    } else {
      this.listMapPrefixStr = '{';
      this.listMapPostfixStr = '}';
    }

    if (pkg.length === 0) {
      this.pkgPrefixStr = '';
    } else {
      this.pkgPrefixStr = pkg + '.';
      this.forbidLocalNames.add(pkg);
    }

    this.statistics = new LuaAStat();
  }

  isForbidName(name: string): boolean {
    return this.forbidLocalNames.has(name);
  }

  nullableLangSwitchSupportVal(): LuaLangSwitchSupport | null {
    return this.nullableLangSwitchSupport;
  }

  isShared(): boolean { return this.shared; }
  isPackBool(): boolean { return this.packBool; }
  isNoStr(): boolean { return this.noStr; }

  getEmptyTableStr(): string { return this.emptyTableStr; }
  getPkgPrefixStr(): string { return this.pkgPrefixStr; }
  getListMapPrefixStr(): string { return this.listMapPrefixStr; }
  getListMapPostfixStr(): string { return this.listMapPostfixStr; }

  getStatistics(): LuaAStat { return this.statistics; }
}
