/**
 * BytesGenerator — TypeScript port of Java
 * `configgen.genbytes.BytesGenerator`.
 *
 * Generates binary config files (.bytes) from CfgValue.
 *
 * Parameters (all read in constructor):
 * - dir: output directory (default ".")
 * - cipher: XOR encryption key (default "" = no encryption)
 * - schema: flag, whether to embed schema data (P1, not yet implemented)
 * - langSeparated: flag, whether to split per-language text pools
 * - own: tag filter (inherited from GeneratorWithTag)
 *
 * Output format (merged mode, single file "config.bytes"):
 *   [schemaLength: int][schemaBytes]  (or [0] if no schema)
 *   [StringPool.serialize]
 *   [LangTextPool.serialize]
 *   [tableCount: int][tableData...]
 *
 * Output format (separated mode):
 *   config.bytes: schema + StringPool + first lang TextPool + tableData
 *   <langName>.bytes (for 2nd+ langs): TextPool.serialize only
 *
 * Differences from Java:
 * - generate(ctx) is async (Promise<void>)
 * - Uses Buffer instead of ByteArrayOutputStream/OutputStream
 * - Uses XorCipher from @cfggen/shared for encryption
 * - Schema embedding (SchemaParser/SchemaSerializer) is P1, not yet ported
 *
 * Java source: configgen.genbytes.BytesGenerator.java (129 lines)
 */

import * as path from 'path';
import type { Context } from '@cfggen/context';
import { CachedFiles, XorCipher } from '@cfggen/shared';
import { LangSwitchableRuntime } from '@cfggen/i18n';
import type { LangSwitchable } from '@cfggen/i18n';
import type { Parameter } from './Parameter';
import { GeneratorWithTag } from './GeneratorWithTag';
import { ConfigOutput } from './ConfigOutput';
import { StringPool } from './StringPool';
import { LangTextPool } from './LangTextPool';
import { CfgValueSerializer } from './CfgValueSerializer';

export class BytesGenerator extends GeneratorWithTag {
  private readonly dir: string;
  private readonly cipher: string;
  private readonly hasSchema: boolean;
  private readonly isLangSeparated: boolean;

  constructor(parameter: Parameter) {
    super(parameter);
    this.dir = parameter.get('dir', '.');
    this.cipher = parameter.get('cipher', '');
    this.hasSchema = parameter.has('schema');
    this.isLangSeparated = parameter.has('langSeparated');
  }

  async generate(ctx: Context): Promise<void> {
    const cfgValue = ctx.makeValueWithTag(this.tag);
    const langSwitch: LangSwitchable | null = ctx.nullableLangSwitch();

    // Initialize runtime
    let langSwitchRuntime: LangSwitchableRuntime | null = null;
    let langTextPool: LangTextPool;

    if (langSwitch !== null) {
      langSwitchRuntime = new LangSwitchableRuntime(langSwitch);
      langTextPool = new LangTextPool(langSwitch.languages());
    } else {
      langTextPool = new LangTextPool(['default']);
    }

    // Schema (P1, not yet implemented)
    let schemaContent: Buffer | null = null;
    if (this.hasSchema) {
      // TODO: Port SchemaParser + SchemaSerializer (P1)
      // For now, just write schemaLength=0
    }

    // Collect table data and text
    const stringPool = new StringPool();
    const contentOutput = new ConfigOutput();
    const serializer = new CfgValueSerializer(
      contentOutput,
      stringPool,
      langTextPool,
      langSwitchRuntime,
    );
    serializer.serialize(cfgValue);
    const content = contentOutput.toBuffer();

    // Write file(s)
    if (this.isLangSeparated && langTextPool.getTextPools().length > 1) {
      // Separated mode: main file + per-language files
      this.writeConfigBytes(schemaContent, stringPool, langTextPool, true, content);
      this.writeRestLangFiles(langTextPool);
    } else {
      // Merged mode: single file
      this.writeConfigBytes(schemaContent, stringPool, langTextPool, false, content);
    }
  }

  private writeConfigBytes(
    schemaContent: Buffer | null,
    stringPool: StringPool,
    langTextPool: LangTextPool,
    isOnlyFirstLang: boolean,
    content: Buffer,
  ): void {
    const configOutput = new ConfigOutput();

    // 1. Schema (optional)
    if (schemaContent !== null) {
      configOutput.writeInt(schemaContent.length);
      configOutput.writeRawBytes(schemaContent);
    } else {
      configOutput.writeInt(0);
    }

    // 2. StringPool
    stringPool.serialize(configOutput);

    // 3. LangTextPool
    if (isOnlyFirstLang) {
      langTextPool.serializeFirst(configOutput);
    } else {
      langTextPool.serialize(configOutput);
    }

    // 4. Table data
    configOutput.writeRawBytes(content);

    this.writeFile('config.bytes', configOutput.toBuffer());
  }

  private writeRestLangFiles(langTextPool: LangTextPool): void {
    const pools = langTextPool.getTextPools();
    for (let i = 1; i < pools.length; i++) {
      const textPool = pools[i];
      const out = new ConfigOutput();
      textPool.serialize(out);
      this.writeFile(textPool.langName + '.bytes', out.toBuffer());
    }
  }

  private writeFile(fileName: string, data: Buffer): void {
    const filePath = path.join(this.dir, fileName);

    let finalData = data;
    if (this.cipher.length > 0) {
      const xor = new XorCipher(this.cipher);
      finalData = xor.process(data) as Buffer;
    }

    CachedFiles.writeFile(path.resolve(filePath), finalData);
  }
}
