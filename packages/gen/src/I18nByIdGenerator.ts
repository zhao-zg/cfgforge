/**
 * I18nByIdGenerator — TypeScript port of Java
 * `configgen.geni18n.I18nByIdGenerator`.
 *
 * Generates xlsx translation files (one per module, sheets = tables).
 *
 * Two modes:
 * 1. langSwitch mode (-langSwitchDir): iterate all languages in langMap
 * 2. single i18nfile mode (-i18nfile): generate for one language
 *
 * Each language's output is a directory of xlsx files.
 * Also generates a _todo_[lang].xlsx summary file per language.
 *
 * Java source: configgen.geni18n.I18nByIdGenerator.java (216 lines)
 *
 * Simplified from Java:
 * - Java's backup/temp/overwrite logic was needed because fastexcel produced
 *   different bytes for the same content (timestamps in core.xml). SheetJS
 *   doesn't have this issue, so we write directly to the output directory.
 * - checkWrite validation (read-back + compare) is omitted (was optional).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Context } from '@cfggen/context';
import type { CfgValue } from '@cfggen/value';
import { TextValue } from '@cfggen/value';
import {
  TextByIdFinder,
  TodoFile,
  TodoFileLine,
} from '@cfggen/i18n';
import { Logger } from '@cfggen/shared';
import type { Parameter } from './Parameter';
import { Generator } from './Generator';
import { LangText, LangStat } from './LangText';

export class I18nByIdGenerator extends Generator {
  private readonly outputDir: string;

  constructor(parameter: Parameter) {
    super(parameter);
    this.outputDir = parameter.get('dir', '../i18n/en');
  }

  async generate(ctx: Context): Promise<void> {
    const cfgValue = ctx.makeValue();

    if (ctx.nullableLangSwitch() !== null) {
      // -langSwitchDir: outputDir is the parent of individual language dirs
      for (const [lang, langFinder] of ctx.nullableLangSwitch()!.langMap) {
        TextValue.setTranslated(cfgValue, langFinder);
        this.generateForValue(cfgValue, lang, this.outputDir);
      }
    } else {
      // -i18nfile: outputDir is a single language directory
      const lang = path.basename(this.outputDir);
      const langsDir = path.dirname(this.outputDir);
      this.generateForValue(cfgValue, lang, langsDir);
    }
  }

  private generateForValue(cfgValue: CfgValue, lang: string, langsDir: string): void {
    const extracted = LangText.extract(cfgValue);

    const outputDir = path.join(langsDir, lang);
    this.ensureDir(outputDir);

    // Write xlsx files (one per module)
    const stat = new LangStat();
    extracted.save(outputDir, stat);
    stat.dump();

    // Generate _todo_[lang].xlsx summary file
    const todoFile = this.todoFileOfLangText(extracted);
    const todoFileName = TextByIdFinder.getTodoFileName(lang);
    const todoFilePath = path.join(langsDir, todoFileName);
    TodoFile.save(todoFilePath, todoFile);
    Logger.log('create %s', path.resolve(todoFilePath));
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private todoFileOfLangText(lang: LangText): TodoFile {
    const todoLines: TodoFileLine[] = [];
    const doneLines: TodoFileLine[] = [];
    todoLines.push(TodoFile.header());
    doneLines.push(TodoFile.header());

    for (const [_, module] of lang.modules) {
      for (const [table, finder] of module.tables) {
        const fieldChainList = [...finder.getFieldChainToIndex().keys()];

        for (const [pk, record] of finder.getPkToTexts()) {
          let idx = 0;
          for (const ot of record.texts) {
            if (ot !== null) {
              const line = new TodoFileLine(table, pk, fieldChainList[idx], ot.original, ot.translated);
              if (ot.translated.length === 0) {
                todoLines.push(line);
              } else {
                doneLines.push(line);
              }
            }
            idx++;
          }
        }
      }
    }

    return new TodoFile(todoLines, doneLines);
  }
}
