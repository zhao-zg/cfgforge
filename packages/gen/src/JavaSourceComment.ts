/**
 * JavaSourceComment — TypeScript port of Java `SourceComment.java`.
 *
 * Generates source comment lines for generated class headers.
 */

import type { Nameable } from '@cfggen/schema';
import { CommentData } from '@cfggen/schema';

export function sourceCommentOf(nameable: Nameable, rawSheetIds: string[] | null): string {
  const lines: string[] = [];
  const cd = nameable.meta().getComment();
  if (cd) {
    if (cd.trailing.trim().length > 0) {
      appendLine(lines, cd.trailing.trim());
    } else if (cd.leading.trim().length > 0) {
      const leadingLines = cd.leading.split('\n');
      if (leadingLines.length === 1) {
        appendLine(lines, cd.leading.trim());
      }
    }
  }
  if (rawSheetIds && rawSheetIds.length > 0) {
    const paths = rawSheetIds.map((s) => s.replace(/\\/g, '/')).join(', ');
    appendLine(lines, '来自: ' + paths);
  }
  return lines.join('\n');
}

function appendLine(lines: string[], line: string): void {
  lines.push('// ' + line);
}
