/**
 * CFG Lexer — 手写递归下降词法分析器
 *
 * 基于 Cfg.g4 的 Lexer Rules，逐字符扫描输出 Token 流。
 * 关键规则：
 * 1. 关键字优先于 IDENT（struct/interface/table/enum/list/map/bool/int/long/float/str/text/true/false）
 * 2. LC_COMMENT = '{' [ \t]* ('//' ~[\r\n]*)?
 * 3. SEMI_COMMENT = ';' [ \t]* ('//' ~[\r\n]*)?
 * 4. COMMENT = '//' ~[\r\n]*
 * 5. WS = [ \t\r\n] -> skip
 * 6. 数字字面量支持正负号、hex (0x)、float（含小数点/指数）
 * 7. 字符串用单引号，支持转义序列
 * 8. -> 和 => 是多字符操作符，必须在 MINUS/EQ 之前匹配
 */

export enum TokenType {
  LT = 1,           // <   (g4: T__0)
  GT = 2,           // >   (g4: T__1)
  STRUCT = 3,
  INTERFACE = 4,
  TABLE = 5,
  ENUM = 6,
  TLIST = 7,
  TMAP = 8,
  TBASE = 9,
  REF = 10,         // ->
  LISTREF = 11,     // =>
  EQ = 12,          // =
  LP = 13,          // (
  RP = 14,          // )
  LB = 15,          // [
  RB = 16,          // ]
  RC = 17,          // }
  DOT = 18,         // .
  COMMA = 19,       // ,
  COLON = 20,       // :
  PLUS = 21,        // +
  MINUS = 22,       // -
  LC_COMMENT = 23,  // { [ \t]* (// comment)?
  SEMI_COMMENT = 24,// ; [ \t]* (// comment)?
  BOOL_CONSTANT = 25,
  FLOAT_CONSTANT = 26,
  HEX_INTEGER_CONSTANT = 27,
  INTEGER_CONSTANT = 28,
  STRING_CONSTANT = 29,
  IDENT = 30,
  COMMENT = 31,     // // comment
  WS = 32,          // whitespace (skipped)
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;     // 1-based
  column: number;   // 0-based
}

// Base type keywords map
const BASE_TYPE_KEYWORDS = new Set(['bool', 'int', 'long', 'float', 'str', 'text']);

// All keywords that should be tokenized before IDENT
// Order matters for matching: longer keywords first where prefix overlaps
const KEYWORD_MAP: Map<string, TokenType> = new Map([
  ['struct', TokenType.STRUCT],
  ['interface', TokenType.INTERFACE],
  ['table', TokenType.TABLE],
  ['enum', TokenType.ENUM],
  ['list', TokenType.TLIST],
  ['map', TokenType.TMAP],
  ['true', TokenType.BOOL_CONSTANT],
  ['false', TokenType.BOOL_CONSTANT],
]);

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}

function isHexDigit(c: string): boolean {
  return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}

function isAlpha(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}

function isAlphaNum(c: string): boolean {
  return isAlpha(c) || isDigit(c);
}

function isWS(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\r' || c === '\n';
}

export class CfgLexer {
  private src: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 0;
  private tokens: Token[] = [];

  private constructor(src: string) {
    this.src = src;
  }

  /**
   * Tokenize a CFG source string into an array of tokens.
   * Whitespace tokens are skipped (not included in the output).
   */
  static tokenize(src: string): Token[] {
    const lexer = new CfgLexer(src);
    lexer.run();
    return lexer.tokens;
  }

  private run(): void {
    while (this.pos < this.src.length) {
      const c = this.src[this.pos];

      // Whitespace -> skip
      if (isWS(c)) {
        this.consumeWhitespace();
        continue;
      }

      // Comment: //
      if (c === '/' && this.peek(1) === '/') {
        this.readComment();
        continue;
      }

      // LC_COMMENT: { [ \t]* (// ~[\r\n]*)?
      if (c === '{') {
        this.readLCComment();
        continue;
      }

      // SEMI_COMMENT: ; [ \t]* (// ~[\r\n]*)?
      if (c === ';') {
        this.readSemiComment();
        continue;
      }

      // RC: }
      if (c === '}') {
        this.emitSingle(TokenType.RC);
        continue;
      }

      // Multi-char operators: ->, =>
      if (c === '-') {
        if (this.peek(1) === '>') {
          this.emitDouble(TokenType.REF); // ->
          continue;
        }
        // Could be start of negative number, or MINUS
        // Check if it's a negative number: - followed by digit or . followed by digit
        // In ANTLR, the lexer uses maximal munch: INTEGER_CONSTANT = [-+]? DECIMAL_DIGIT+
        // FLOAT_CONSTANT = (PLUS|MINUS)? FLOATLIT
        // So -42 would match INTEGER_CONSTANT, not MINUS INTEGER_CONSTANT
        // But -tag should be MINUS IDENT
        // The key: if after - there's a digit or a dot-digit or 0x, it's a number
        if (this.isStartOfNumberAfterSign()) {
          this.readNumber();
          continue;
        }
        this.emitSingle(TokenType.MINUS);
        continue;
      }

      if (c === '=') {
        if (this.peek(1) === '>') {
          this.emitDouble(TokenType.LISTREF); // =>
          continue;
        }
        this.emitSingle(TokenType.EQ);
        continue;
      }

      // Single-char symbols
      switch (c) {
        case '(': this.emitSingle(TokenType.LP); continue;
        case ')': this.emitSingle(TokenType.RP); continue;
        case '[': this.emitSingle(TokenType.LB); continue;
        case ']': this.emitSingle(TokenType.RB); continue;
        case '<': this.emitSingle(TokenType.LT); continue;
        case '>': this.emitSingle(TokenType.GT); continue;
        case '.': 
          // Could be start of float (.5)
          if (isDigit(this.peek(1))) {
            this.readNumber();
            continue;
          }
          this.emitSingle(TokenType.DOT);
          continue;
        case ',': this.emitSingle(TokenType.COMMA); continue;
        case ':': this.emitSingle(TokenType.COLON); continue;
        case '+':
          // Could be start of positive number
          if (this.isStartOfNumberAfterSign()) {
            this.readNumber();
            continue;
          }
          this.emitSingle(TokenType.PLUS);
          continue;
      }

      // String literal: '...'
      if (c === "'") {
        this.readString();
        continue;
      }

      // Number: starts with digit or 0x
      if (isDigit(c)) {
        this.readNumber();
        continue;
      }

      // Identifier or keyword
      if (isAlpha(c)) {
        this.readIdentOrKeyword();
        continue;
      }

      // Unknown character — skip it (shouldn't happen in valid CFG)
      throw new Error(`Unexpected character '${c}' at line ${this.line}, column ${this.column}`);
    }
  }

  private peek(offset: number): string {
    const idx = this.pos + offset;
    if (idx >= this.src.length) return '';
    return this.src[idx];
  }

  private advance(): string {
    const c = this.src[this.pos];
    this.pos++;
    if (c === '\n') {
      this.line++;
      this.column = 0;
    } else {
      this.column++;
    }
    return c;
  }

  private emitSingle(type: TokenType): void {
    const startLine = this.line;
    const startCol = this.column;
    const value = this.advance();
    this.tokens.push({ type, value, line: startLine, column: startCol });
  }

  private emitDouble(type: TokenType): void {
    const startLine = this.line;
    const startCol = this.column;
    const v1 = this.advance();
    const v2 = this.advance();
    this.tokens.push({ type, value: v1 + v2, line: startLine, column: startCol });
  }

  private consumeWhitespace(): void {
    while (this.pos < this.src.length && isWS(this.src[this.pos])) {
      this.advance();
    }
  }

  private readComment(): void {
    const startLine = this.line;
    const startCol = this.column;
    let value = '';
    // Read //
    value += this.advance(); // /
    value += this.advance(); // /
    // Read until end of line
    while (this.pos < this.src.length && this.src[this.pos] !== '\r' && this.src[this.pos] !== '\n') {
      value += this.advance();
    }
    this.tokens.push({ type: TokenType.COMMENT, value, line: startLine, column: startCol });
  }

  private readLCComment(): void {
    const startLine = this.line;
    const startCol = this.column;
    let value = '';
    // Read {
    value += this.advance();
    // Read optional spaces/tabs
    while (this.pos < this.src.length && (this.src[this.pos] === ' ' || this.src[this.pos] === '\t')) {
      value += this.advance();
    }
    // Optionally read a comment on the same line
    if (this.pos < this.src.length && this.src[this.pos] === '/' && this.peek(1) === '/') {
      while (this.pos < this.src.length && this.src[this.pos] !== '\r' && this.src[this.pos] !== '\n') {
        value += this.advance();
      }
    }
    this.tokens.push({ type: TokenType.LC_COMMENT, value, line: startLine, column: startCol });
  }

  private readSemiComment(): void {
    const startLine = this.line;
    const startCol = this.column;
    let value = '';
    // Read ;
    value += this.advance();
    // Read optional spaces/tabs
    while (this.pos < this.src.length && (this.src[this.pos] === ' ' || this.src[this.pos] === '\t')) {
      value += this.advance();
    }
    // Optionally read a comment on the same line
    if (this.pos < this.src.length && this.src[this.pos] === '/' && this.peek(1) === '/') {
      while (this.pos < this.src.length && this.src[this.pos] !== '\r' && this.src[this.pos] !== '\n') {
        value += this.advance();
      }
    }
    this.tokens.push({ type: TokenType.SEMI_COMMENT, value, line: startLine, column: startCol });
  }

  /**
   * Check if what follows the current position (after +/-) looks like a number.
   * The current char is already the sign; we look at peek(1) etc.
   */
  private isStartOfNumberAfterSign(): boolean {
    const next = this.peek(1);
    if (isDigit(next)) {
      return true;
    }
    // . followed by digit = float
    if (next === '.' && isDigit(this.peek(2))) {
      return true;
    }
    return false;
  }

  /**
   * Read a numeric literal (INTEGER_CONSTANT, HEX_INTEGER_CONSTANT, or FLOAT_CONSTANT).
   * The current position may be at a sign (+/-) or at a digit.
   */
  private readNumber(): void {
    const startLine = this.line;
    const startCol = this.column;
    let value = '';

    // Optional sign
    if (this.src[this.pos] === '+' || this.src[this.pos] === '-') {
      value += this.advance();
    }

    // Check for hex (0x or 0X)
    if (this.src[this.pos] === '0' && (this.peek(1) === 'x' || this.peek(1) === 'X')) {
      // HEX_INTEGER_CONSTANT
      value += this.advance(); // 0
      value += this.advance(); // x or X
      while (this.pos < this.src.length && isHexDigit(this.src[this.pos])) {
        value += this.advance();
      }
      this.tokens.push({ type: TokenType.HEX_INTEGER_CONSTANT, value, line: startLine, column: startCol });
      return;
    }

    // Now we're reading decimals — could be INTEGER or FLOAT
    // FLOAT pattern: DECIMALS.DECIMALS? EXPONENT? | DECIMALS EXPONENT | .DECIMALS EXPONENT?
    // INTEGER pattern: DECIMAL_DIGIT+

    let hasDot = false;
    let hasExponent = false;

    // Read integer part
    while (this.pos < this.src.length && isDigit(this.src[this.pos])) {
      value += this.advance();
    }

    // Check for dot — per g4: FLOATLIT = DECIMALS DOT DECIMALS? EXPONENT?
    // DECIMALS? and EXPONENT? are optional, so 1. is a valid float
    // ANTLR maximal munch: 1. (2 chars as FLOAT) wins over 1 (1 char as INTEGER) + . (DOT)
    // In CFG, numbers never appear as namespace identifiers, so this is safe
    if (this.pos < this.src.length && this.src[this.pos] === '.') {
      hasDot = true;
      value += this.advance(); // consume the dot

      // Read fractional part (optional: DECIMALS?)
      while (this.pos < this.src.length && isDigit(this.src[this.pos])) {
        value += this.advance();
      }

      // Check for exponent (optional: EXPONENT?)
      if (this.pos < this.src.length && (this.src[this.pos] === 'e' || this.src[this.pos] === 'E')) {
        hasExponent = true;
        value += this.advance(); // e or E
        // Optional sign
        if (this.pos < this.src.length && (this.src[this.pos] === '+' || this.src[this.pos] === '-')) {
          value += this.advance();
        }
        // Read exponent digits
        while (this.pos < this.src.length && isDigit(this.src[this.pos])) {
          value += this.advance();
        }
      }
    } else if (this.pos < this.src.length && (this.src[this.pos] === 'e' || this.src[this.pos] === 'E')) {
      // DECIMALS EXPONENT (no dot)
      hasExponent = true;
      value += this.advance(); // e or E
      // Optional sign
      if (this.pos < this.src.length && (this.src[this.pos] === '+' || this.src[this.pos] === '-')) {
        value += this.advance();
      }
      // Read exponent digits
      while (this.pos < this.src.length && isDigit(this.src[this.pos])) {
        value += this.advance();
      }
    }

    if (hasDot || hasExponent) {
      this.tokens.push({ type: TokenType.FLOAT_CONSTANT, value, line: startLine, column: startCol });
    } else {
      this.tokens.push({ type: TokenType.INTEGER_CONSTANT, value, line: startLine, column: startCol });
    }
  }

  /**
   * Read a string literal enclosed in single quotes.
   * Supports escape sequences: \n \t \\ \' etc.
   */
  private readString(): void {
    const startLine = this.line;
    const startCol = this.column;
    let value = '';
    // Read opening quote
    value += this.advance(); // '

    // Read content until closing quote
    while (this.pos < this.src.length && this.src[this.pos] !== "'") {
      if (this.src[this.pos] === '\\') {
        // Escape sequence
        value += this.advance(); // backslash
        if (this.pos < this.src.length) {
          value += this.advance(); // the escaped char
        }
      } else if (this.src[this.pos] === '\r' || this.src[this.pos] === '\n') {
        // String literals cannot span lines (per g4: ~['\\\r\n])
        break;
      } else {
        value += this.advance();
      }
    }

    // Read closing quote
    if (this.pos < this.src.length && this.src[this.pos] === "'") {
      value += this.advance();
    }

    this.tokens.push({ type: TokenType.STRING_CONSTANT, value, line: startLine, column: startCol });
  }

  /**
   * Read an identifier or keyword.
   * IDENT: [a-zA-Z_] [a-zA-Z0-9_]*
   * Keywords: struct, interface, table, enum, list, map, true, false
   * Base types: bool, int, long, float, str, text (as TBASE)
   */
  private readIdentOrKeyword(): void {
    const startLine = this.line;
    const startCol = this.column;
    let value = '';

    // Read first char (alpha or underscore)
    value += this.advance();

    // Read remaining chars
    while (this.pos < this.src.length && isAlphaNum(this.src[this.pos])) {
      value += this.advance();
    }

    // Check if it's a keyword
    const kwType = KEYWORD_MAP.get(value);
    if (kwType !== undefined) {
      this.tokens.push({ type: kwType, value, line: startLine, column: startCol });
      return;
    }

    // Check if it's a base type
    if (BASE_TYPE_KEYWORDS.has(value)) {
      this.tokens.push({ type: TokenType.TBASE, value, line: startLine, column: startCol });
      return;
    }

    // Otherwise it's an identifier
    this.tokens.push({ type: TokenType.IDENT, value, line: startLine, column: startCol });
  }
}
