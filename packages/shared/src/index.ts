// @cfgforge/shared - Shared utilities for cfgforge
// All exports from this package

export * from './CfgFileSystem.js';
export * from './NodeFileSystem.js';
export * from './FileNameUtil.js';
export * from './StringUtil.js';
export * from './ListParser.js';
export * from './ArgParser.js';
export * from './UnicodeReader.js';
export * from './BomUtf8Writer.js';
export * from './CSVUtil.js';
export * from './Logger.js';
export * from './CachedFiles.js';
export * from './CachedIndentPrinter.js';
export * from './PackParser.js';
export * from './MarkdownReader.js';
export * from './XorCipher.js';
export * from './FileUtil.js';
export * from './DOMUtil.js';
export * from './LocaleUtil.js';
export * from './PathUtil.js';

// 在 Node 环境（CLI/MCP/测试）下自动初始化默认文件系统为 NodeFileSystem，
// 使 readCSVAsync / CachedFiles.writeFileAsync 等异步 fs 工具开箱即用。
// Tauri WebView 环境由入口显式调用 setDefaultFileSystem(TauriFileSystem)。
import { ensureDefaultFileSystem } from './CfgFileSystem.js';
ensureDefaultFileSystem();