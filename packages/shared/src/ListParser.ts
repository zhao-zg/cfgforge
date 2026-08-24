/**
 * 四状态机解析分隔符列表（支持引号转义）。
 * 原 Java: configgen.util.ListParser
 */

const QUOTE = '"';

enum ListState {
  START = 0,
  NO_QUOTE = 1,
  QUOTE = 2,
  QUOTE2 = 3,
}

export function parseList(str: string, separator: string): string[] {
  const sep = separator.charCodeAt(0);
  const list: string[] = [];
  let field = '';
  let state: ListState = ListState.START;

  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    const ch = str[i];

    switch (state) {
      case ListState.START:
        if (c === sep) {
          list.push('');
        } else if (ch === QUOTE) {
          field = '';
          state = ListState.QUOTE;
        } else {
          field = '';
          field += ch;
          state = ListState.NO_QUOTE;
        }
        break;

      case ListState.NO_QUOTE:
        if (c === sep) {
          list.push(field);
          state = ListState.START;
        } else {
          field += ch;
        }
        break;

      case ListState.QUOTE:
        if (ch === QUOTE) {
          state = ListState.QUOTE2;
        } else {
          field += ch;
        }
        break;

      case ListState.QUOTE2:
        if (c === sep) {
          list.push(field);
          state = ListState.START;
        } else if (ch === QUOTE) {
          field += QUOTE;
          state = ListState.QUOTE;
        } else {
          field += ch;
          state = ListState.NO_QUOTE;
        }
        break;
    }
  }

  // 注意：最后一个分隔符后没有内容则不算
  if (state !== ListState.START) {
    list.push(field);
  }

  return list;
}
