/**
 * 括号分组解析器：支持逗号/分号分隔，括号内不分割。
 * 原 Java: configgen.util.PackParser
 */

const SEP_COMMA = ','.charCodeAt(0);
const SEP_SEMICOLON = ';'.charCodeAt(0);
const QUOTE = '"';
const WHITESPACE = ' ';
const LEFT_PAREN = '(';
const RIGHT_PAREN = ')';

enum NestListState {
  START = 0,
  NO_QUOTE = 1,
  QUOTE = 2,
  QUOTE2 = 3,
  IN_PARENTHESES = 4,
  PARENTHESES_OK = 5,
}

export function parsePack(str: string): string[] {
  let state: NestListState = NestListState.START;
  const list: string[] = [];
  let field = '';
  let quoteCountInParens = 0;
  let leftNotMatchCountInParens = 0;
  let outMostIsFunction = false;

  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    const ch = str[i];

    switch (state) {
      case NestListState.START:
        if (ch === WHITESPACE) {
          // ignore
        } else if (c === SEP_COMMA || c === SEP_SEMICOLON) {
          list.push('');
        } else if (ch === QUOTE) {
          field = '';
          state = NestListState.QUOTE;
        } else if (ch === LEFT_PAREN) {
          field = '';
          outMostIsFunction = false;
          leftNotMatchCountInParens = 1;
          quoteCountInParens = 0;
          state = NestListState.IN_PARENTHESES;
        } else {
          field = '';
          field += ch;
          state = NestListState.NO_QUOTE;
        }
        break;

      case NestListState.NO_QUOTE:
        if (c === SEP_COMMA || c === SEP_SEMICOLON) {
          list.push(field);
          state = NestListState.START;
        } else if (ch === LEFT_PAREN) {
          field += ch;
          outMostIsFunction = true;
          leftNotMatchCountInParens = 1;
          quoteCountInParens = 0;
          state = NestListState.IN_PARENTHESES;
        } else {
          field += ch;
        }
        break;

      case NestListState.QUOTE:
        if (ch === QUOTE) {
          state = NestListState.QUOTE2;
        } else {
          field += ch;
        }
        break;

      case NestListState.QUOTE2:
        if (c === SEP_COMMA || c === SEP_SEMICOLON) {
          list.push(field);
          state = NestListState.START;
        } else if (ch === QUOTE) {
          field += QUOTE;
          state = NestListState.QUOTE;
        } else {
          field += ch;
          state = NestListState.NO_QUOTE;
        }
        break;

      case NestListState.IN_PARENTHESES:
        if (ch === QUOTE) {
          quoteCountInParens++;
        }

        if (quoteCountInParens % 2 === 1) {
          field += ch;
        } else if (ch === LEFT_PAREN) {
          leftNotMatchCountInParens++;
          field += ch;
        } else if (ch === RIGHT_PAREN) {
          leftNotMatchCountInParens--;
          if (leftNotMatchCountInParens > 0 || outMostIsFunction) {
            field += ch;
          }
          if (leftNotMatchCountInParens === 0) {
            state = NestListState.PARENTHESES_OK;
          }
        } else {
          field += ch;
        }
        break;

      case NestListState.PARENTHESES_OK:
        if (ch === WHITESPACE) {
          // ignore
        } else if (c === SEP_COMMA || c === SEP_SEMICOLON) {
          list.push(field);
          state = NestListState.START;
        } else {
          throw new Error('Expected whitespace after outermost parentheses');
        }
        break;
    }
  }

  // Last element (if not in START state)
  if (state !== NestListState.START) {
    list.push(field);
  }

  return list;
}

enum FunctionState {
  START = 0,
  NAME = 1,
  IN_PARENTHESES = 2,
}

export function parseFunction(str: string): string[] {
  let state: FunctionState = FunctionState.START;
  const list: string[] = [];
  let field = '';
  let parametersOk = false;
  let quoteCountInParens = 0;
  let leftNotMatchCountInParens = 0;

  for (const ch of str) {
    switch (state) {
      case FunctionState.START:
        if (ch === WHITESPACE) {
          // ignore
        } else if (parametersOk) {
          throw new Error('Extra characters after parsed parameters');
        } else if (ch === LEFT_PAREN) {
          throw new Error('Missing function name');
        } else {
          field = '';
          field += ch;
          state = FunctionState.NAME;
        }
        break;

      case FunctionState.NAME:
        if (ch === LEFT_PAREN) {
          list.push(field);
          field = '';
          quoteCountInParens = 0;
          leftNotMatchCountInParens = 1;
          state = FunctionState.IN_PARENTHESES;
        } else {
          field += ch;
        }
        break;

      case FunctionState.IN_PARENTHESES:
        if (ch === QUOTE) {
          quoteCountInParens++;
        }

        if (quoteCountInParens % 2 === 1) {
          field += ch;
        } else if (ch === LEFT_PAREN) {
          leftNotMatchCountInParens++;
          field += ch;
        } else if (ch === RIGHT_PAREN) {
          leftNotMatchCountInParens--;
          if (leftNotMatchCountInParens > 0) {
            field += ch;
          }
          if (leftNotMatchCountInParens === 0) {
            list.push(field);
            parametersOk = true;
            state = FunctionState.START;
          }
        } else {
          field += ch;
        }
        break;
    }
  }

  if (list.length !== 2) {
    throw new Error(`Parameter count mismatch, got ${list.length}, expected 2`);
  }
  return list;
}
