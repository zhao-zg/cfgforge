/**
 * Main — TypeScript port of Java `configgen.gen.Main`.
 *
 * CLI entry point: registers all providers, parses command-line arguments,
 * runs tools, creates Context, and runs generators.
 *
 * Differences from Java:
 * - `run()` is async (Context.create is async due to ExcelJS)
 * - `CliException` → `CliError` (subclass of Error)
 * - `System.exit()` → return exit code (caller decides whether to exit)
 * - `-gui` is not supported in TS (no JavaFX equivalent)
 * - `WatchAndPostRun` is handled by Context package, not Main
 */

import type { Generator } from '@cfgforge/gen';
import { Generators } from '@cfgforge/gen';
import {
  JavaCodeGenerator,
  CsCodeGenerator,
  BytesGenerator,
  LuaCodeGenerator,
  TsCodeGenerator,
  GoCodeGenerator,
  GdCodeGenerator,
  TsSchemaGenerator,
  JsonGenerator,
  SqlGenerator,
  I18nByValueGenerator,
  I18nByIdGenerator,
  ByAIGenerator,
} from '@cfgforge/gen';
import { Context, ContextCfg, ExplicitDir } from '@cfgforge/context';
import { HeadRows } from '@cfgforge/data';
import type { HeadRow } from '@cfgforge/data';
import { Logger, LocaleUtil, CachedFiles } from '@cfgforge/shared';
import { printHelp } from './Help';
import { Tools } from './Tools';
import type { Tool } from './Tool';

const MAX_EXCEPTION_DEPTH = 30;

export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliError';
  }
}

interface NamedTool {
  name: string;
  tool: Tool;
}

interface NamedGenerator {
  name: string;
  gen: Generator;
}

/**
 * Register all providers (generators only in current TS port).
 * Tools need to be registered separately when their TS implementations
 * become available.
 *
 * Note: verify/search (ValueVerifyTool/ValueInspectTool) are not yet
 * ported, so they're skipped. server/mcpserver belong to editor-core/mcp
 * packages and are also skipped.
 */
export function registerAllProviders(): void {
  Generators.addProvider('java', (p) => new JavaCodeGenerator(p));
  Generators.addProvider('cs', (p) => new CsCodeGenerator(p));
  Generators.addProvider('bytes', (p) => new BytesGenerator(p));
  Generators.addProvider('lua', (p) => new LuaCodeGenerator(p));
  Generators.addProvider('ts', (p) => new TsCodeGenerator(p));
  Generators.addProvider('go', (p) => new GoCodeGenerator(p));
  Generators.addProvider('gd', (p) => new GdCodeGenerator(p));
  Generators.addProvider('tsschema', (p) => new TsSchemaGenerator(p));
  Generators.addProvider('json', (p) => new JsonGenerator(p));
  Generators.addProvider('sql', (p) => new SqlGenerator(p));
  Generators.addProvider('i18n', (p) => new I18nByValueGenerator(p));
  Generators.addProvider('i18nbyid', (p) => new I18nByIdGenerator(p));
  Generators.addProvider('byai', (p) => new ByAIGenerator(p));
}

function formatException(t: unknown): string {
  const newLine = '\n';
  let sb = '';
  let curr: unknown = t;
  let depth = 0;

  while (curr !== null && curr !== undefined && depth < MAX_EXCEPTION_DEPTH) {
    depth++;
    const err = curr as Error;

    if (depth === 1) {
      sb += '-------------------------异常描述-------------------------' + newLine;
    } else {
      sb += 'Caused by: ';
    }

    sb += (err?.constructor?.name ?? 'Error');
    const msg = err?.message;
    if (msg) {
      sb += ': ' + msg;
    }
    sb += newLine;

    const stack = err?.stack;
    if (stack) {
      const stackLines = stack.split('\n').slice(1); // skip first line (error name: msg)
      for (const line of stackLines) {
        sb += '\t' + line.trim() + newLine;
      }
    }

    curr = (err as any)?.cause;
    if (curr !== null && curr !== undefined) {
      sb += newLine;
    }
  }

  return sb;
}

function nextArg(args: string[], paramType: string, valueIndex: number): string {
  if (valueIndex >= args.length) {
    throw new CliError('missing value for ' + paramType);
  }
  return args[valueIndex];
}

function help(reason?: string | null): number {
  printHelp(reason);
  return 1;
}

/**
 * Parse and execute CLI arguments.
 * Returns exit code: 0 = success, 1 = error.
 */
export async function run(args: string[]): Promise<number> {
  let allowValueErr = false;
  let dataDir: string | null = null;
  let headRowId: string | null = null;
  let csvDefaultEncoding = 'GBK';
  let asRoot: string | null = null;
  let excelDirs: string | null = null;
  let jsonDirs: string | null = null;

  let i18nfile: string | null = null;
  let langSwitchDir: string | null = null;
  let langSwitchDefaultLang = 'zh_cn';

  const tools: NamedTool[] = [];
  const generators: NamedGenerator[] = [];

  for (let i = 0; i < args.length; ++i) {
    const paramType = args[i].toLowerCase();
    switch (paramType) {
      case '-locale': {
        const language = nextArg(args, paramType, ++i);
        if (!isSupportedLocale(language)) {
          Logger.log('Specified Locale is not supported: ' + language);
          return 1;
        }
        LocaleUtil.setLocale(language);
        break;
      }

      case '-h':
        printHelp();
        return 0;

      case '-v':
        Logger.setVerboseLevel(1);
        break;
      case '-vv':
        Logger.setVerboseLevel(2);
        break;
      case '-p':
        Logger.enableProfile();
        break;
      case '-pp':
        Logger.enableProfile();
        Logger.enableProfileGc();
        break;
      case '-nowarn':
        Logger.setWarningEnabled(false);
        break;
      case '-weakwarn':
        Logger.setWeakWarningEnabled(true);
        break;
      case '-allowvalueerr':
        allowValueErr = true;
        break;

      case '-tool': {
        const name = nextArg(args, paramType, ++i);
        const tool = Tools.create(name);
        if (tool === null) {
          return help('-tool ' + name + ' UNKNOWN');
        }
        tools.push({ name, tool });
        break;
      }

      case '-datadir':
        dataDir = nextArg(args, paramType, ++i);
        break;
      case '-headrow':
        headRowId = nextArg(args, paramType, ++i);
        break;
      case '-encoding':
        csvDefaultEncoding = nextArg(args, paramType, ++i);
        break;

      case '-asroot':
        asRoot = nextArg(args, paramType, ++i);
        break;
      case '-exceldirs':
        excelDirs = nextArg(args, paramType, ++i);
        break;
      case '-jsondirs':
        jsonDirs = nextArg(args, paramType, ++i);
        break;

      case '-i18nfile':
        i18nfile = nextArg(args, paramType, ++i);
        break;
      case '-langswitchdir':
        langSwitchDir = nextArg(args, paramType, ++i);
        break;
      case '-defaultlang':
        langSwitchDefaultLang = nextArg(args, paramType, ++i);
        break;

      case '-gen': {
        const name = nextArg(args, paramType, ++i);
        const generator = Generators.create(name);
        if (generator === null) {
          return help('-gen ' + name + ' UNKNOWN');
        }
        generators.push({ name, gen: generator });
        break;
      }

      default:
        return help('unknown args ' + args[i]);
    }
  }

  // Cross-parameter validation (must precede any execution)
  if (i18nfile !== null && langSwitchDir !== null) {
    return help('-不能同时配置-i18nFile和-langSwitchDir');
  }
  if (dataDir === null && generators.length > 0) {
    return help('-datadir is required');
  }

  // Run tools (before Context creation)
  for (const nt of tools) {
    Logger.verbose('-----tool %s', nt.name);
    await nt.tool.call();
  }

  if (dataDir === null) {
    return 0;
  }

  // Resolve headRow
  if (headRowId === null) {
    headRowId = '2';
  }
  const headRow: HeadRow = HeadRows.getById(headRowId);

  // Parse explicit dirs
  const explicitDir = ExplicitDir.parse(asRoot, excelDirs, jsonDirs);

  Logger.profile('start');

  // Create Context (async due to ExcelJS)
  const contextCfg = new ContextCfg(
    dataDir,
    explicitDir,
    headRow,
    csvDefaultEncoding,
    i18nfile,
    langSwitchDir,
    langSwitchDefaultLang,
    allowValueErr,
  );
  const context = await Context.createWithCfg(contextCfg);

  // Run generators
  for (const ng of generators) {
    Logger.verbose('-----generate %s', ng.name);
    try {
      await ng.gen.generate(context);
    } catch (e) {
      throw new Error('generate ' + ng.name + ' failed: ' + (e as Error).message);
    }
    Logger.profile('generate ' + ng.name);
  }

  CachedFiles.finalExit();
  Logger.profile('end');
  return 0;
}

/**
 * Run with exception handling, returning exit code.
 */
export async function runWithCatch(args: string[]): Promise<number> {
  try {
    return await run(args);
  } catch (e) {
    if (e instanceof CliError) {
      // CLI usage error: print short reason + help, no stack trace
      return help(e.message);
    } else {
      process.stderr.write(formatException(e));
      return 1;
    }
  }
}

/**
 * Main entry point.
 * Registers providers and runs the CLI.
 */
export async function main(args?: string[]): Promise<void> {
  registerAllProviders();

  const cliArgs = args ?? process.argv.slice(2);

  if (cliArgs.length === 0) {
    printHelp();
    return;
  }

  const ret = await runWithCatch(cliArgs);
  if (ret !== 0) {
    process.exit(ret);
  }
}

/**
 * Check if a locale is supported.
 * Simple check: accepts any non-empty string (Java version has a fixed set).
 */
function isSupportedLocale(locale: string): boolean {
  return locale !== null && locale !== undefined && locale.length > 0;
}
