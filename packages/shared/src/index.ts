// @cfgforge/shared - Shared utilities for cfgforge
// All exports from this package

export * from './CfgFileSystem';
export * from './NodeFileSystem';
export * from './FileNameUtil';
export * from './StringUtil';
export * from './ListParser';
export * from './ArgParser';
export * from './UnicodeReader';
export * from './BomUtf8Writer';
export * from './CSVUtil';
export * from './Logger';
export * from './CachedFiles';
export * from './CachedIndentPrinter';
export * from './PackParser';
export * from './MarkdownReader';
export * from './XorCipher';
export * from './FileUtil';
export * from './DOMUtil';
export * from './LocaleUtil';

// 在 Node 环境（CLI/MCP/测试）下自动初始化默认文件系统为 NodeFileSystem，
// 使 readCSVAsync / CachedFiles.writeFileAsync 等异步 fs 工具开箱即用。
// Tauri WebView 环境由入口显式调用 setDefaultFileSystem(TauriFileSystem)。
import { ensureDefaultFileSystem } from './CfgFileSystem';
ensureDefaultFileSystem();