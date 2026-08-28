/**
 * TsCodeGenerator — TypeScript port of Java `configgen.gents.TsCodeGenerator`.
 *
 * Generates two files in `dstDir` (default "."):
 * - Config.ts  (generated from schema via tsTemplates)
 * - ConfigUtil.ts (static runtime library copied from resources)
 *
 * Differences from Java:
 * - `generate(ctx)` is async (Promise<void>)
 * - ConfigUtil.ts is copied via fs.copyFileSync instead of Java's
 *   FileUtil.copyFileIfNotExist (resource path resolution differs)
 * - No directory cleanup (ts dstDir defaults to user project root;
 *   only two fixed filenames are produced — see CLAUDE.md note #7)
 */

import * as path from 'path';

import { CachedFiles, Logger, upper1, getDefaultFileSystem } from '@cfgforge/shared';
import type { Context } from '@cfgforge/context';
import type { CfgValue } from '@cfgforge/value';
import type { CfgSchema } from '@cfgforge/schema';
import type { Nameable } from '@cfgforge/schema';
import type { LangSwitchable } from '@cfgforge/i18n';
import type { Parameter } from './Parameter.js';
import { GeneratorWithTag } from './GeneratorWithTag.js';
import { genConfig } from './tsTemplates.js';

export class TsCodeGenerator extends GeneratorWithTag {
  readonly pkg: string;
  readonly encoding: string;
  readonly serverText: boolean;
  private readonly dstDir: string;

  // Public fields accessed by tsTemplates via `model.xxx`
  cfgValue!: CfgValue;
  cfgSchema!: CfgSchema;
  nullableLanguageSwitch: LangSwitchable | null = null;

  constructor(parameter: Parameter) {
    super(parameter);
    this.dstDir = parameter.get('dir', '.');
    this.pkg = parameter.get('pkg', 'Config');
    this.encoding = parameter.get('encoding', 'UTF-8');
    this.serverText = parameter.has('serverText');
  }

  async generate(ctx: Context): Promise<void> {
    this.cfgValue = ctx.makeValueWithTag(this.tag);
    this.cfgSchema = this.cfgValue.schema;
    this.nullableLanguageSwitch = ctx.nullableLangSwitch();

    // Generate Config.ts
    const content = genConfig(this);
    const configTsPath = path.join(this.dstDir, 'Config.ts');
    CachedFiles.writeFile(configTsPath, Buffer.from(content, this.encoding as BufferEncoding));

    // Copy ConfigUtil.ts (static runtime library)
    const dfs = getDefaultFileSystem();
    const configUtilTsPath = path.join(this.dstDir, 'ConfigUtil.ts');
    if (!await dfs.exists(configUtilTsPath)) {
      const resourcePath = path.join(__dirname, 'resources', 'ConfigUtil.ts');
      if (await dfs.exists(resourcePath)) {
        // Read resource and write to destination via CfgFileSystem
        const bytes = await dfs.readFile(resourcePath);
        await dfs.writeFile(configUtilTsPath, bytes);
        Logger.log('create file: ' + configUtilTsPath);
      } else {
        throw new Error('ConfigUtil.ts resource not found at ' + resourcePath);
      }
    }
  }

  className(nameable: Nameable): string {
    const parts = nameable.fullName().split('.');
    return parts.map(upper1).join('_');
  }
}
