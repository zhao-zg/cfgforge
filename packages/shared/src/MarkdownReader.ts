/**
 * Markdown 文件读取器，支持解析 frontmatter 和正文。
 * 原 Java: configgen.util.MarkdownReader
 *
 * T12.0b: 新增 readMarkdownAsync（异步版，走 CfgFileSystem 抽象）。
 */

import * as fs from 'fs';
import { readFromBuffer } from './UnicodeReader.js';
import { getDefaultFileSystem } from './CfgFileSystem.js';

export interface MarkdownDocument {
  frontmatter: Map<string, string>;
  content: string;
}

export function readMarkdown(filePath: string, encoding: string): MarkdownDocument {
  const buf = fs.readFileSync(filePath);
  const text = readFromBuffer(buf, encoding);
  return parseMarkdown(text);
}

/**
 * 异步读取 Markdown 文件（Tauri/WebView 环境可用），走 CfgFileSystem 抽象。
 */
export async function readMarkdownAsync(filePath: string, encoding: string): Promise<MarkdownDocument> {
  const buf = await getDefaultFileSystem().readFile(filePath);
  const text = readFromBuffer(buf, encoding);
  return parseMarkdown(text);
}

function parseMarkdown(text: string): MarkdownDocument {
  const frontmatter = new Map<string, string>();
  const lines = text.split('\n');

  if (lines.length === 0) {
    return { frontmatter, content: '' };
  }

  let lineIdx = 0;
  const firstLine = lines[0];
  const hasFrontmatter = firstLine.trim() === '---';

  let contentLines: string[];

  if (hasFrontmatter) {
    // Parse frontmatter
    lineIdx = 1;
    while (lineIdx < lines.length) {
      const line = lines[lineIdx];
      const trimmed = line.trim();

      if (trimmed === '---') {
        lineIdx++;
        break;
      }

      if (trimmed.length === 0) {
        lineIdx++;
        continue;
      }

      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.substring(0, colonIdx).trim();
        const value = line.substring(colonIdx + 1).trim();
        frontmatter.set(key, value);
      }

      lineIdx++;
    }

    contentLines = lines.slice(lineIdx);
  } else {
    contentLines = lines;
  }

  // Join and strip trailing newline
  let content = contentLines.join('\n');
  if (content.endsWith('\n')) {
    content = content.substring(0, content.length - 1);
  }

  return { frontmatter, content };
}