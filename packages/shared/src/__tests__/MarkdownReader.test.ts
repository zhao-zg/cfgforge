import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readMarkdown } from '../MarkdownReader';

describe('MarkdownReader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggen-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads file with frontmatter', () => {
    const filePath = path.join(tmpDir, 'test.md');
    const content = '---\ntitle: My Document\nauthor: John\n---\n\n# Hello\n\nThis is content.';
    fs.writeFileSync(filePath, content, 'utf8');

    const doc = readMarkdown(filePath, 'UTF-8');
    expect(doc.frontmatter.get('title')).toBe('My Document');
    expect(doc.frontmatter.get('author')).toBe('John');
    expect(doc.content).toBe('\n# Hello\n\nThis is content.');
  });

  it('reads file without frontmatter', () => {
    const filePath = path.join(tmpDir, 'test.md');
    const content = '# Hello\n\nThis is content.';
    fs.writeFileSync(filePath, content, 'utf8');

    const doc = readMarkdown(filePath, 'UTF-8');
    expect(doc.frontmatter.size).toBe(0);
    expect(doc.content).toBe('# Hello\n\nThis is content.');
  });

  it('reads empty file', () => {
    const filePath = path.join(tmpDir, 'empty.md');
    fs.writeFileSync(filePath, '', 'utf8');

    const doc = readMarkdown(filePath, 'UTF-8');
    expect(doc.frontmatter.size).toBe(0);
    expect(doc.content).toBe('');
  });

  it('reads frontmatter with empty values', () => {
    const filePath = path.join(tmpDir, 'test.md');
    const content = '---\nkey:\n---\nbody';
    fs.writeFileSync(filePath, content, 'utf8');

    const doc = readMarkdown(filePath, 'UTF-8');
    expect(doc.frontmatter.get('key')).toBe('');
    expect(doc.content).toBe('body');
  });

  it('skips empty lines in frontmatter', () => {
    const filePath = path.join(tmpDir, 'test.md');
    const content = '---\n\nkey: value\n\n---\nbody';
    fs.writeFileSync(filePath, content, 'utf8');

    const doc = readMarkdown(filePath, 'UTF-8');
    expect(doc.frontmatter.size).toBe(1);
    expect(doc.frontmatter.get('key')).toBe('value');
    expect(doc.content).toBe('body');
  });
});
