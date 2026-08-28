/**
 * 缩进打印机：4 空格缩进 + CachedFiles 增量写入。
 * 原 Java: configgen.util.CachedIndentPrinter (implements Closeable, TemplateOutput)
 *
 * 简化版：不实现 CacheConfig/extraCaches 分片功能（代码生成器大表场景用到，
 * 后续 gen 包如需要再补）。
 */

import { CachedFiles } from './CachedFiles.js';

export class CachedIndentPrinter {
  private filePath: string;
  private encoding: string;
  private dst: string[] = [];
  private indent = 0;

  constructor(filePath: string, encoding: string = 'utf-8') {
    this.filePath = filePath;
    this.encoding = encoding;
  }

  indent_level(): number {
    return this.indent;
  }

  inc(): void {
    this.indent++;
  }

  dec(): void {
    this.indent--;
    if (this.indent < 0) {
      throw new Error('indent < 0');
    }
  }

  println(fmt?: string): void {
    if (fmt === undefined) {
      this.dst.push('\n');
    } else {
      this.printlnn(0, fmt);
    }
  }

  printlnIf(fmt: string): void {
    if (fmt.length === 0) return;
    this.printlnn(0, fmt);
  }

  println1(fmt: string): void { this.printlnn(1, fmt); }
  println2(fmt: string): void { this.printlnn(2, fmt); }
  println3(fmt: string): void { this.printlnn(3, fmt); }
  println4(fmt: string): void { this.printlnn(4, fmt); }
  println5(fmt: string): void { this.printlnn(5, fmt); }
  println6(fmt: string): void { this.printlnn(6, fmt); }
  println7(fmt: string): void { this.printlnn(7, fmt); }

  private printlnn(n: number, fmt: string): void {
    this.indent += n;
    const prefix = '    '.repeat(Math.max(0, this.indent));
    this.dst.push(prefix + fmt + '\n');
    this.indent -= n;
  }

  writeContent(value: string): void {
    this.dst.push(value);
  }

  writeContentRange(value: string, beginIndex: number, endIndex: number): void {
    this.dst.push(value.substring(beginIndex, endIndex));
  }

  close(): void {
    const content = this.dst.join('');
    const buf = Buffer.from(content, this.encoding as BufferEncoding);
    CachedFiles.writeFile(this.filePath, buf);
  }
}
