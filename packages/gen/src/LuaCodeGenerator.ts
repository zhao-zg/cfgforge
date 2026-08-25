/**
 * LuaCodeGenerator — TypeScript port of Java `configgen.genlua.LuaCodeGenerator`.
 *
 * Generates Lua code files:
 * - _cfgs.lua: package definitions and require setup
 * - _loads.lua (optional): preload requires
 * - _beans.lua: bean/action definitions for structs and interfaces
 * - <table>.lua per table: data + metadata
 * - <lang>.lua (optional): per-language text files
 *
 * Differences from Java:
 * - `generate(ctx)` is async (Promise<void>)
 * - No concurrency (TS single-threaded; Java used work-stealing pool)
 * - No COPY_FILES (mkcfg.lua etc.) — TS version only generates template code
 * - No configgenDir / mkCfgDir parameter
 * - No extraSplit / CachedIndentPrinter cache support (initial implementation;
 *   extraSplit is read but treated as 0 — no shard files generated)
 * - CachedIndentPrinter doesn't support printf-style format strings;
 *   we build strings manually then call println()
 *
 * Java source: configgen.genlua.LuaCodeGenerator.java (525 lines)
 */

import * as path from 'path';
import * as fs from 'fs';

import { CachedFiles, CachedIndentPrinter } from '@cfggen/shared';
import { isMetaInt } from '@cfggen/schema';
import { hasText as schemaHasText } from '@cfggen/schema';
import { StructSchema, InterfaceSchema } from '@cfggen/schema';
import type { CfgSchema, Fieldable, TableSchema } from '@cfggen/schema';
import type { Context } from '@cfggen/context';
import type { CfgValue, VTable, VStruct, Value } from '@cfggen/value';
import { TextValue } from '@cfggen/value';
import type { Parameter } from './Parameter';
import { GeneratorWithTag } from './GeneratorWithTag';
import { LuaAContext } from './LuaAContext';
import { LuaCtx } from './LuaCtx';
import {
  luaFullName, luaTablePath,
} from './LuaName';
import {
  getLuaUniqKeysString, getLuaEnumString, getLuaRefsString,
  getLuaFieldsString, getLuaFieldsStringEmmyLua,
  getLuaUniqKeysStringEmmyLua, getLuaEnumStringEmmyLua,
  getLuaRefsStringEmmyLua, getLuaTextFieldsString,
} from './LuaTypeStr';
import { LuaValueStringify, getLuaString } from './LuaValueStringify';
import { hasSubFieldable } from './LuaCtx';

export class LuaCodeGenerator extends GeneratorWithTag {
  readonly dir: string;
  readonly pkg: string;
  readonly encoding: string;
  readonly useEmmyLua: boolean;
  readonly preload: boolean;
  readonly useShared: boolean;
  readonly useSharedEmptyTable: boolean;
  readonly packBool: boolean;
  readonly noStr: boolean;
  readonly rForOldShared: boolean;

  private cfgValue!: CfgValue;
  private cfgSchema!: CfgSchema;
  private dstDir!: string;
  private isLangSwitch = false;

  constructor(parameter: Parameter) {
    super(parameter);
    this.dir = parameter.get('dir', '.');
    this.pkg = parameter.get('pkg', 'cfg');
    this.encoding = parameter.get('encoding', 'UTF-8');
    this.useEmmyLua = parameter.has('emmylua');
    this.preload = parameter.has('preload');
    this.useSharedEmptyTable = parameter.has('sharedEmptyTable');
    this.useShared = parameter.has('shared');
    this.packBool = parameter.has('packBool');
    this.rForOldShared = parameter.has('rForOldShared');
    this.noStr = parameter.has('noStr');
  }

  async generate(ctx: Context): Promise<void> {
    const aCtx = new LuaAContext();
    const ls = ctx.nullableLangSwitch();
    aCtx.init(
      this.pkg,
      ls,
      this.useSharedEmptyTable,
      this.useShared,
      this.packBool,
      this.noStr,
      this.rForOldShared,
    );
    this.isLangSwitch = aCtx.nullableLangSwitchSupportVal() !== null;

    this.dstDir = path.join(this.dir, this.pkg.replace('.', '/'));

    this.cfgValue = ctx.makeValueWithTag(this.tag);
    this.cfgSchema = this.cfgValue.schema;

    // _cfgs.lua
    this.withCode('_cfgs.lua', (ps) => this.generate_cfgs(ps, aCtx));

    // _loads.lua (optional preload)
    if (this.preload) {
      this.withCode('_loads.lua', (ps) => this.generate_loads(ps, aCtx));
    }

    // _beans.lua
    this.withCode('_beans.lua', (ps) => this.generate_beans(ps, aCtx));

    // Per-table .lua files
    for (const v of this.cfgValue.sortedTables()) {
      try {
        this.withCode(luaTablePath(v.name()), (ps) => this.generate_table(v, ps, aCtx));
      } catch (e) {
        throw new Error(`ERR generating lua code for ${v.name()}: ${(e as Error).message}`);
      }
    }

    aCtx.getStatistics().print();

    // Per-language .lua files
    if (aCtx.nullableLangSwitchSupportVal() !== null) {
      const lang2Texts = aCtx.nullableLangSwitchSupportVal()!.getLang2Texts();
      for (const [lang, texts] of lang2Texts) {
        this.withCode(`${lang}.lua`, (ps) => this.generate_lang(ps, texts));
      }
    }

    CachedFiles.keepMetaAndDeleteOtherFiles(this.dstDir);
  }

  // -------------------------------------------------------------------------
  // Helper: create a CachedIndentPrinter, run fn, close it
  // -------------------------------------------------------------------------

  private withCode(fn: string, fnBody: (ps: CachedIndentPrinter) => void): void {
    const filePath = path.join(this.dstDir, fn);
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const ps = new CachedIndentPrinter(filePath, this.encoding);
    fnBody(ps);
    ps.close();
  }

  // -------------------------------------------------------------------------
  // generate_lang
  // -------------------------------------------------------------------------

  private generate_lang(ps: CachedIndentPrinter, idToStr: string[]): void {
    ps.println('return {');
    const lineCache: string[] = [];
    for (const str of idToStr) {
      lineCache.length = 0;
      getLuaString(lineCache, str);
      ps.println1(lineCache.join('') + ',');
    }
    ps.println('}');
  }

  // -------------------------------------------------------------------------
  // generate_cfgs
  // -------------------------------------------------------------------------

  private generate_cfgs(ps: CachedIndentPrinter, aCtx: LuaAContext): void {
    ps.println(`local ${this.pkg} = {}`);
    ps.println();

    const mkcfgFrom = this.isLangSwitch ? this.pkg : 'common';
    ps.println(`${this.pkg}._mk = require "${mkcfgFrom}.mkcfg"`);
    if (!this.preload) {
      ps.println(`local pre = ${this.pkg}._mk.pretable`);
    }
    ps.println();

    if (this.isLangSwitch) {
      ps.println(`${this.pkg}._last_lang = nil`);
      ps.println(`function ${this.pkg}._set_lang(lang)`);
      ps.println1(`if ${this.pkg}._last_lang == lang then`);
      ps.println2('return');
      ps.println1('end');
      ps.println1(`${this.pkg}._last_lang = lang`);
      ps.println1(`${this.pkg}._mk.i18n = require("${this.pkg}." .. lang)`);
      ps.println('end');
      ps.println();
    }

    const context = new Set<string>();
    context.add(this.pkg);
    for (const table of this.cfgValue.schema.sortedTables()) {
      const full = luaFullName(table, aCtx.getPkgPrefixStr());
      this.definePkg(full, ps, context);

      if (this.useEmmyLua) {
        ps.println(`---@type ${full}`);
      }
      if (this.preload) {
        ps.println(`${full} = {}`);
      } else {
        ps.println(`${full} = pre("${full}")`);
      }
      context.add(full);
    }

    ps.println();
    ps.println(`return ${this.pkg}`);
  }

  // -------------------------------------------------------------------------
  // definePkg
  // -------------------------------------------------------------------------

  private definePkg(beanName: string, ps: CachedIndentPrinter, context: Set<string>): void {
    const seps = beanName.split('.');
    for (let i = 0; i < seps.length - 1; i++) {
      const pkg = seps.slice(0, i + 1).join('.');
      if (context.add(pkg)) {
        ps.println(`${pkg} = {}`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // generate_loads
  // -------------------------------------------------------------------------

  private generate_loads(ps: CachedIndentPrinter, aCtx: LuaAContext): void {
    ps.println('local require = require');
    ps.println();
    for (const table of this.cfgValue.schema.sortedTables()) {
      ps.println(`require "${luaFullName(table, aCtx.getPkgPrefixStr())}"`);
    }
    ps.println();
  }

  // -------------------------------------------------------------------------
  // generate_beans
  // -------------------------------------------------------------------------

  private generate_beans(ps: CachedIndentPrinter, aCtx: LuaAContext): void {
    ps.println(`local ${this.pkg} = require "${this.pkg}._cfgs"`);
    ps.println();

    ps.println('local Beans = {}');
    ps.println(`${this.pkg}._beans = Beans`);
    ps.println();
    ps.println(`local bean = ${this.pkg}._mk.bean`);
    ps.println(`local action = ${this.pkg}._mk.action`);

    if (this.isLangSwitch) {
      ps.println(`local i18n_bean = ${this.pkg}._mk.i18n_bean`);
      ps.println(`local i18n_action = ${this.pkg}._mk.i18n_action`);
    }
    ps.println();

    const context = new Set<string>();
    context.add('Beans');
    for (const fieldable of this.cfgSchema.sortedFieldables()) {
      const full = luaFullName(fieldable, aCtx.getPkgPrefixStr());
      this.definePkg(full, ps, context);
      context.add(full);

      if (fieldable instanceof InterfaceSchema) {
        this.generateBeanInterface(fieldable, full, ps, context, aCtx);
      } else if (fieldable instanceof StructSchema) {
        this.generateBeanStruct(fieldable, full, ps, aCtx);
      }
    }
    ps.println();
    ps.println('return Beans');
  }

  private generateBeanInterface(
    sInterface: InterfaceSchema,
    full: string,
    ps: CachedIndentPrinter,
    context: Set<string>,
    aCtx: LuaAContext,
  ): void {
    const setHandlerName = this.parameter.getOrNull('setHandlerName');
    const handlerName = this.parameter.getOrNull('handlerName');

    if (this.useEmmyLua) {
      ps.println(`---@class ${full}`);
      if (setHandlerName !== null && handlerName !== null) {
        ps.println(`---@field ${handlerName} fun(self:${full}, ...)`);
      }
      ps.println();
      ps.println(`---@type ${full}`);
    }
    ps.println(`${full} = {}`);
    ps.println();

    for (const impl of sInterface.impls()) {
      const fulln = luaFullName(impl, aCtx.getPkgPrefixStr());
      this.definePkg(fulln, ps, context);
      context.add(fulln);
      let func = 'action';
      let textFieldsStr = '';
      if (this.isLangSwitch) {
        textFieldsStr = getLuaTextFieldsString(impl);
        if (textFieldsStr.length > 0) {
          func = 'i18n_action';
        }
      }

      if (this.useEmmyLua) {
        ps.println(`---@class ${fulln} : ${full}`);
        if (setHandlerName !== null && handlerName !== null) {
          ps.println(`---@field ${setHandlerName} fun(${handlerName} :fun)`);
          ps.println(`---@field ${handlerName} fun(self: ${fulln}, ...)`);
        }
        ps.printlnIf(getLuaFieldsStringEmmyLua(impl));
        ps.printlnIf(getLuaRefsStringEmmyLua(impl, aCtx));
        ps.println();
        ps.println(`---@type ${fulln}`);
      }

      if (impl.fields().length === 0) {
        ps.println(`${fulln} = ${func}("${impl.name()}")()`);
      } else {
        const refsStr = getLuaRefsString(impl, aCtx);
        const fieldsStr = getLuaFieldsString(impl, aCtx);
        ps.println(`${fulln} = ${func}("${impl.name()}", ${refsStr}, ${textFieldsStr}${fieldsStr}\n    )`);
      }
      ps.println();
    }
  }

  private generateBeanStruct(
    struct: StructSchema,
    full: string,
    ps: CachedIndentPrinter,
    aCtx: LuaAContext,
  ): void {
    let func = 'bean';
    let textFieldsStr = '';
    if (this.isLangSwitch) {
      textFieldsStr = getLuaTextFieldsString(struct);
      if (textFieldsStr.length > 0) {
        func = 'i18n_bean';
      }
    }

    if (this.useEmmyLua) {
      ps.println(`---@class ${full}`);
      ps.printlnIf(getLuaFieldsStringEmmyLua(struct));
      ps.printlnIf(getLuaRefsStringEmmyLua(struct, aCtx));
      ps.println();
      ps.println(`---@type ${full}`);
    }

    if (struct.fields().length === 0) {
      ps.println(`${full} = ${func}()()`);
    } else {
      const refsStr = getLuaRefsString(struct, aCtx);
      const fieldsStr = getLuaFieldsString(struct, aCtx);
      ps.println(`${full} = ${func}(${refsStr}, ${textFieldsStr}${fieldsStr}\n    )`);
    }
    ps.println();
  }

  // -------------------------------------------------------------------------
  // generate_table
  // -------------------------------------------------------------------------

  private generate_table(vTable: VTable, ps: CachedIndentPrinter, aCtx: LuaAContext): void {
    const table = vTable.schema;

    if (this.isLangSwitch) {
      aCtx.nullableLangSwitchSupportVal()!.enterTable(table.name());
    }

    ps.println(`local ${this.pkg} = require "${this.pkg}._cfgs"`);
    if (hasSubFieldable(table)) {
      ps.println(`local Beans = ${this.pkg}._beans`);
    }
    ps.println();

    const fullName = luaFullName(table, aCtx.getPkgPrefixStr());

    if (this.useEmmyLua) {
      ps.println(`---@class ${fullName}`);
      ps.println(getLuaFieldsStringEmmyLua(table));
      ps.printlnIf(getLuaUniqKeysStringEmmyLua(table, aCtx));
      ps.printlnIf(getLuaEnumStringEmmyLua(vTable, aCtx));
      ps.println(`---@field all table<any,${fullName}>`);
      ps.printlnIf(getLuaRefsStringEmmyLua(table, aCtx));
      ps.println();
    }

    ps.println(`local this = ${fullName}`);
    ps.println();

    // extraSplit: read metadata, but treat as 0 (no shard support)
    let extraSplit = 0;
    const m = table.meta().get('extraSplit');
    if (m !== undefined && isMetaInt(m)) {
      extraSplit = m.value;
    }

    const tryUseShared = this.useShared && extraSplit === 0;

    const ctx = new LuaCtx(vTable);
    if (tryUseShared) {
      ctx.parseShared(aCtx);
    }

    let func = 'table';
    let textFieldsStr = '';
    if (this.isLangSwitch) {
      textFieldsStr = getLuaTextFieldsString(table);
      if (textFieldsStr.length > 0) {
        func = 'i18n_table';
      }
    }

    const uniqKeysStr = getLuaUniqKeysString(ctx, aCtx);
    const enumStr = getLuaEnumString(ctx, aCtx);
    const refsStr = getLuaRefsString(table, aCtx);
    const fieldsStr = getLuaFieldsString(table, aCtx);
    ps.println(`local mk = ${this.pkg}._mk.${func}(this, ${uniqKeysStr}, ${enumStr}, ${refsStr}, ${textFieldsStr}${fieldsStr}\n    )`);
    ps.println();

    // Generate value lines
    const lineCache: string[] = [];

    const hasLangSwitchAndText =
      aCtx.nullableLangSwitchSupportVal() !== null &&
      schemaHasText(vTable.schema);

    if (!hasLangSwitchAndText) {
      const stringify = new LuaValueStringify(lineCache, ctx, aCtx, 'mk', null);
      for (const vStruct of vTable.valueList) {
        lineCache.length = 0;
        stringify.addValue(vStruct, []);
        ps.println(lineCache.join(''));
      }
    } else {
      for (const [pk, vStruct] of vTable.primaryKeyMap) {
        lineCache.length = 0;
        const stringify = new LuaValueStringify(lineCache, ctx, aCtx, 'mk', pk.packStr());
        stringify.addValue(vStruct, []);
        ps.println(lineCache.join(''));
      }
    }

    // Generate shared local names and E/R
    this.generate_sharedLocalNamesAndER(ps, ctx, aCtx);

    // Generate shared value definitions
    if (tryUseShared && ctx.ctxShared().getSharedList().length > 0) {
      // Generate value strings for shared composite values using LuaValueStringify
      const sharedMap = ctx.ctxShared().getSharedCompositeValues();
      for (const [cv, vstr] of sharedMap) {
        lineCache.length = 0;
        const stringify = new LuaValueStringify(lineCache, ctx, aCtx, null, null);
        stringify.addValue(cv as Value, []);
        vstr.setValueStr(lineCache.join(''));
      }

      if (this.rForOldShared) {
        ps.println(`local R = ${this.pkg}._mk.R`);
        ps.println('local A = {}');
        for (const vstr of ctx.ctxShared().getSharedList()) {
          ps.println(`${vstr.getName()} = R(${vstr.getValueStr()})`);
        }
      } else {
        ps.println('local A = {}');
        for (const vstr of ctx.ctxShared().getSharedList()) {
          ps.println(`${vstr.getName()} = ${vstr.getValueStr()}`);
        }
      }
      ps.println();
    }

    ps.println();
    ps.println('return this');
  }

  // -------------------------------------------------------------------------
  // generate_sharedLocalNamesAndER
  // -------------------------------------------------------------------------

  private generate_sharedLocalNamesAndER(
    ps: CachedIndentPrinter,
    ctx: LuaCtx,
    aCtx: LuaAContext,
  ): void {
    const localNameMap = ctx.ctxName().getLocalNameMap();
    if (localNameMap.size > 0) {
      for (const [fullName, localName] of localNameMap) {
        ps.println(`local ${localName} = ${fullName}`);
      }
      ps.println();
    }

    let hasER = false;
    if (this.useSharedEmptyTable && ctx.ctxShared().getEmptyTableUseCount() > 0) {
      ps.println(`local E = ${this.pkg}._mk.E`);
      hasER = true;
    }
    if (this.rForOldShared && ctx.ctxShared().hasListTableOrMapTable()) {
      ps.println(`local R = ${this.pkg}._mk.R`);
      hasER = true;
    }
    if (hasER) {
      ps.println();
    }
  }
}
