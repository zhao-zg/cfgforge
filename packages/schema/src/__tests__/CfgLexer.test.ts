import { describe, it, expect } from 'vitest';
import { CfgLexer, TokenType } from '../cfg/CfgLexer';

describe('CfgLexer', () => {
  describe('Keywords', () => {
    it('should tokenize struct keyword', () => {
      const tokens = CfgLexer.tokenize('struct');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.STRUCT);
      expect(tokens[0].value).toBe('struct');
    });

    it('should tokenize interface keyword', () => {
      const tokens = CfgLexer.tokenize('interface');
      expect(tokens[0].type).toBe(TokenType.INTERFACE);
    });

    it('should tokenize table keyword', () => {
      const tokens = CfgLexer.tokenize('table');
      expect(tokens[0].type).toBe(TokenType.TABLE);
    });

    it('should tokenize enum keyword', () => {
      const tokens = CfgLexer.tokenize('enum');
      expect(tokens[0].type).toBe(TokenType.ENUM);
    });

    it('should tokenize list keyword', () => {
      const tokens = CfgLexer.tokenize('list');
      expect(tokens[0].type).toBe(TokenType.TLIST);
    });

    it('should tokenize map keyword', () => {
      const tokens = CfgLexer.tokenize('map');
      expect(tokens[0].type).toBe(TokenType.TMAP);
    });
  });

  describe('Base types (TBASE)', () => {
    it('should tokenize bool', () => {
      const tokens = CfgLexer.tokenize('bool');
      expect(tokens[0].type).toBe(TokenType.TBASE);
      expect(tokens[0].value).toBe('bool');
    });

    it('should tokenize int', () => {
      const tokens = CfgLexer.tokenize('int');
      expect(tokens[0].type).toBe(TokenType.TBASE);
      expect(tokens[0].value).toBe('int');
    });

    it('should tokenize long', () => {
      const tokens = CfgLexer.tokenize('long');
      expect(tokens[0].type).toBe(TokenType.TBASE);
      expect(tokens[0].value).toBe('long');
    });

    it('should tokenize float', () => {
      const tokens = CfgLexer.tokenize('float');
      expect(tokens[0].type).toBe(TokenType.TBASE);
      expect(tokens[0].value).toBe('float');
    });

    it('should tokenize str', () => {
      const tokens = CfgLexer.tokenize('str');
      expect(tokens[0].type).toBe(TokenType.TBASE);
      expect(tokens[0].value).toBe('str');
    });

    it('should tokenize text', () => {
      const tokens = CfgLexer.tokenize('text');
      expect(tokens[0].type).toBe(TokenType.TBASE);
      expect(tokens[0].value).toBe('text');
    });
  });

  describe('Operators and symbols', () => {
    it('should tokenize -> as REF', () => {
      const tokens = CfgLexer.tokenize('->');
      expect(tokens[0].type).toBe(TokenType.REF);
    });

    it('should tokenize => as LISTREF', () => {
      const tokens = CfgLexer.tokenize('=>');
      expect(tokens[0].type).toBe(TokenType.LISTREF);
    });

    it('should tokenize = as EQ', () => {
      const tokens = CfgLexer.tokenize('=');
      expect(tokens[0].type).toBe(TokenType.EQ);
    });

    it('should tokenize ( as LP', () => {
      const tokens = CfgLexer.tokenize('(');
      expect(tokens[0].type).toBe(TokenType.LP);
    });

    it('should tokenize ) as RP', () => {
      const tokens = CfgLexer.tokenize(')');
      expect(tokens[0].type).toBe(TokenType.RP);
    });

    it('should tokenize [ as LB', () => {
      const tokens = CfgLexer.tokenize('[');
      expect(tokens[0].type).toBe(TokenType.LB);
    });

    it('should tokenize ] as RB', () => {
      const tokens = CfgLexer.tokenize(']');
      expect(tokens[0].type).toBe(TokenType.RB);
    });

    it('should tokenize < and > as T__0 and T__1', () => {
      const tokens = CfgLexer.tokenize('<>');
      expect(tokens[0].type).toBe(TokenType.LT);
      expect(tokens[1].type).toBe(TokenType.GT);
    });

    it('should tokenize . as DOT', () => {
      const tokens = CfgLexer.tokenize('.');
      expect(tokens[0].type).toBe(TokenType.DOT);
    });

    it('should tokenize , as COMMA', () => {
      const tokens = CfgLexer.tokenize(',');
      expect(tokens[0].type).toBe(TokenType.COMMA);
    });

    it('should tokenize : as COLON', () => {
      const tokens = CfgLexer.tokenize(':');
      expect(tokens[0].type).toBe(TokenType.COLON);
    });

    it('should tokenize + as PLUS', () => {
      const tokens = CfgLexer.tokenize('+');
      expect(tokens[0].type).toBe(TokenType.PLUS);
    });

    it('should tokenize - as MINUS', () => {
      const tokens = CfgLexer.tokenize('-');
      expect(tokens[0].type).toBe(TokenType.MINUS);
    });
  });

  describe('LC_COMMENT and SEMI_COMMENT', () => {
    it('should tokenize { as LC_COMMENT', () => {
      const tokens = CfgLexer.tokenize('{');
      expect(tokens[0].type).toBe(TokenType.LC_COMMENT);
      expect(tokens[0].value).toBe('{');
    });

    it('should tokenize { // comment as LC_COMMENT with trailing comment', () => {
      const tokens = CfgLexer.tokenize('{ // my comment');
      expect(tokens[0].type).toBe(TokenType.LC_COMMENT);
      expect(tokens[0].value).toBe('{ // my comment');
    });

    it('should tokenize { with spaces before comment', () => {
      const tokens = CfgLexer.tokenize('{    // hello');
      expect(tokens[0].type).toBe(TokenType.LC_COMMENT);
      expect(tokens[0].value).toBe('{    // hello');
    });

    it('should tokenize ; as SEMI_COMMENT', () => {
      const tokens = CfgLexer.tokenize(';');
      expect(tokens[0].type).toBe(TokenType.SEMI_COMMENT);
      expect(tokens[0].value).toBe(';');
    });

    it('should tokenize ; // comment as SEMI_COMMENT with trailing comment', () => {
      const tokens = CfgLexer.tokenize('; // hello world');
      expect(tokens[0].type).toBe(TokenType.SEMI_COMMENT);
      expect(tokens[0].value).toBe('; // hello world');
    });
  });

  describe('Boolean literals', () => {
    it('should tokenize true', () => {
      const tokens = CfgLexer.tokenize('true');
      expect(tokens[0].type).toBe(TokenType.BOOL_CONSTANT);
      expect(tokens[0].value).toBe('true');
    });

    it('should tokenize false', () => {
      const tokens = CfgLexer.tokenize('false');
      expect(tokens[0].type).toBe(TokenType.BOOL_CONSTANT);
      expect(tokens[0].value).toBe('false');
    });
  });

  describe('Numeric literals', () => {
    it('should tokenize integer', () => {
      const tokens = CfgLexer.tokenize('42');
      expect(tokens[0].type).toBe(TokenType.INTEGER_CONSTANT);
      expect(tokens[0].value).toBe('42');
    });

    it('should tokenize negative integer', () => {
      const tokens = CfgLexer.tokenize('-42');
      expect(tokens[0].type).toBe(TokenType.INTEGER_CONSTANT);
      expect(tokens[0].value).toBe('-42');
    });

    it('should tokenize positive integer with sign', () => {
      const tokens = CfgLexer.tokenize('+42');
      expect(tokens[0].type).toBe(TokenType.INTEGER_CONSTANT);
      expect(tokens[0].value).toBe('+42');
    });

    it('should tokenize hex integer', () => {
      const tokens = CfgLexer.tokenize('0xFF');
      expect(tokens[0].type).toBe(TokenType.HEX_INTEGER_CONSTANT);
      expect(tokens[0].value).toBe('0xFF');
    });

    it('should tokenize hex integer with uppercase X', () => {
      const tokens = CfgLexer.tokenize('0XFF');
      expect(tokens[0].type).toBe(TokenType.HEX_INTEGER_CONSTANT);
    });

    it('should tokenize negative hex integer', () => {
      const tokens = CfgLexer.tokenize('-0xFF');
      expect(tokens[0].type).toBe(TokenType.HEX_INTEGER_CONSTANT);
      expect(tokens[0].value).toBe('-0xFF');
    });

    it('should tokenize positive hex integer', () => {
      const tokens = CfgLexer.tokenize('+0xFF');
      expect(tokens[0].type).toBe(TokenType.HEX_INTEGER_CONSTANT);
    });

    it('should tokenize float', () => {
      const tokens = CfgLexer.tokenize('3.14');
      expect(tokens[0].type).toBe(TokenType.FLOAT_CONSTANT);
      expect(tokens[0].value).toBe('3.14');
    });

    it('should tokenize negative float', () => {
      const tokens = CfgLexer.tokenize('-3.14');
      expect(tokens[0].type).toBe(TokenType.FLOAT_CONSTANT);
      expect(tokens[0].value).toBe('-3.14');
    });

    it('should tokenize float with exponent', () => {
      const tokens = CfgLexer.tokenize('1.5e10');
      expect(tokens[0].type).toBe(TokenType.FLOAT_CONSTANT);
      expect(tokens[0].value).toBe('1.5e10');
    });

    it('should tokenize float with negative exponent', () => {
      const tokens = CfgLexer.tokenize('1.5e-10');
      expect(tokens[0].type).toBe(TokenType.FLOAT_CONSTANT);
      expect(tokens[0].value).toBe('1.5e-10');
    });

    it('should tokenize float without leading digit (.5)', () => {
      const tokens = CfgLexer.tokenize('.5');
      expect(tokens[0].type).toBe(TokenType.FLOAT_CONSTANT);
      expect(tokens[0].value).toBe('.5');
    });

    it('should tokenize float with trailing dot (1.)', () => {
      const tokens = CfgLexer.tokenize('1.');
      expect(tokens[0].type).toBe(TokenType.FLOAT_CONSTANT);
      expect(tokens[0].value).toBe('1.');
    });

    it('should tokenize float with just exponent (1e10)', () => {
      const tokens = CfgLexer.tokenize('1e10');
      expect(tokens[0].type).toBe(TokenType.FLOAT_CONSTANT);
      expect(tokens[0].value).toBe('1e10');
    });

    it('should tokenize float with sign and exponent (1e+10)', () => {
      const tokens = CfgLexer.tokenize('1e+10');
      expect(tokens[0].type).toBe(TokenType.FLOAT_CONSTANT);
      expect(tokens[0].value).toBe('1e+10');
    });
  });

  describe('String literals', () => {
    it('should tokenize empty string', () => {
      const tokens = CfgLexer.tokenize("''");
      expect(tokens[0].type).toBe(TokenType.STRING_CONSTANT);
      expect(tokens[0].value).toBe("''");
    });

    it('should tokenize simple string', () => {
      const tokens = CfgLexer.tokenize("'hello'");
      expect(tokens[0].type).toBe(TokenType.STRING_CONSTANT);
      expect(tokens[0].value).toBe("'hello'");
    });

    it('should tokenize string with escape sequences', () => {
      const tokens = CfgLexer.tokenize("'hello\\nworld'");
      expect(tokens[0].type).toBe(TokenType.STRING_CONSTANT);
      expect(tokens[0].value).toBe("'hello\\nworld'");
    });

    it('should tokenize string with hex escape', () => {
      const tokens = CfgLexer.tokenize("'\\x41'");
      expect(tokens[0].type).toBe(TokenType.STRING_CONSTANT);
      expect(tokens[0].value).toBe("'\\x41'");
    });

    it('should tokenize string with unicode escape', () => {
      const tokens = CfgLexer.tokenize("'\\u0041'");
      expect(tokens[0].type).toBe(TokenType.STRING_CONSTANT);
      expect(tokens[0].value).toBe("'\\u0041'");
    });
  });

  describe('Identifiers', () => {
    it('should tokenize simple identifier', () => {
      const tokens = CfgLexer.tokenize('itemId');
      expect(tokens[0].type).toBe(TokenType.IDENT);
      expect(tokens[0].value).toBe('itemId');
    });

    it('should tokenize identifier starting with underscore', () => {
      const tokens = CfgLexer.tokenize('_private');
      expect(tokens[0].type).toBe(TokenType.IDENT);
    });

    it('should tokenize identifier with numbers', () => {
      const tokens = CfgLexer.tokenize('field123');
      expect(tokens[0].type).toBe(TokenType.IDENT);
      expect(tokens[0].value).toBe('field123');
    });

    it('should tokenize keywords used as identifiers (struct, table, etc.)', () => {
      // In g4, identifier rule allows keyword tokens as identifiers
      // But since keywords have priority, they'll be tokenized as keywords
      // This is handled at parser level
      const tokens = CfgLexer.tokenize('struct');
      expect(tokens[0].type).toBe(TokenType.STRUCT);
    });
  });

  describe('Comments', () => {
    it('should tokenize line comment', () => {
      const tokens = CfgLexer.tokenize('// this is a comment');
      expect(tokens[0].type).toBe(TokenType.COMMENT);
      expect(tokens[0].value).toBe('// this is a comment');
    });

    it('should tokenize comment with Chinese characters', () => {
      const tokens = CfgLexer.tokenize('// 等级');
      expect(tokens[0].type).toBe(TokenType.COMMENT);
      expect(tokens[0].value).toBe('// 等级');
    });

    it('should tokenize comment with trailing dashes', () => {
      const tokens = CfgLexer.tokenize('// 描述----这里测试下多行效果--再来一行');
      expect(tokens[0].type).toBe(TokenType.COMMENT);
      expect(tokens[0].value).toBe('// 描述----这里测试下多行效果--再来一行');
    });
  });

  describe('Whitespace', () => {
    it('should skip spaces', () => {
      const tokens = CfgLexer.tokenize('  struct  ');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.STRUCT);
    });

    it('should skip newlines', () => {
      const tokens = CfgLexer.tokenize('\nstruct\n');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.STRUCT);
    });

    it('should skip tabs', () => {
      const tokens = CfgLexer.tokenize('\tstruct\t');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.STRUCT);
    });

    it('should skip mixed whitespace', () => {
      const tokens = CfgLexer.tokenize(' \t\n\r struct \n\t ');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.STRUCT);
    });
  });

  describe('Complex CFG snippets', () => {
    it('should tokenize a simple struct declaration', () => {
      const input = `struct Award { itemId:int; count:int; }`;
      const tokens = CfgLexer.tokenize(input);
      const types = tokens.map(t => t.type);
      expect(types).toEqual([
        TokenType.STRUCT,
        TokenType.IDENT,      // Award
        TokenType.LC_COMMENT, // {
        TokenType.IDENT,      // itemId
        TokenType.COLON,
        TokenType.TBASE,      // int
        TokenType.SEMI_COMMENT, // ;
        TokenType.IDENT,      // count
        TokenType.COLON,
        TokenType.TBASE,      // int
        TokenType.SEMI_COMMENT, // ;
        TokenType.RC,         // }
      ]);
    });

    it('should tokenize struct with namespace and metadata', () => {
      const input = `struct trigger.Condition (pack) { x:int; }`;
      const tokens = CfgLexer.tokenize(input);
      const types = tokens.map(t => t.type);
      expect(types).toEqual([
        TokenType.STRUCT,
        TokenType.IDENT,       // trigger
        TokenType.DOT,
        TokenType.IDENT,       // Condition
        TokenType.LP,
        TokenType.IDENT,       // pack
        TokenType.RP,
        TokenType.LC_COMMENT,  // {
        TokenType.IDENT,       // x
        TokenType.COLON,
        TokenType.TBASE,       // int
        TokenType.SEMI_COMMENT, // ;
        TokenType.RC,
      ]);
    });

    it('should tokenize table with key, metadata, fields and refs', () => {
      const input = `table test[id] (json){ id:int; ref:int ->buff.skill; }`;
      const tokens = CfgLexer.tokenize(input);
      const types = tokens.map(t => t.type);
      expect(types).toEqual([
        TokenType.TABLE,
        TokenType.IDENT,        // test
        TokenType.LB,           // [
        TokenType.IDENT,        // id
        TokenType.RB,           // ]
        TokenType.LP,           // (
        TokenType.IDENT,        // json
        TokenType.RP,           // )
        TokenType.LC_COMMENT,   // {
        TokenType.IDENT,        // id
        TokenType.COLON,
        TokenType.TBASE,        // int
        TokenType.SEMI_COMMENT,  // ;
        TokenType.IDENT,        // ref
        TokenType.COLON,
        TokenType.TBASE,        // int
        TokenType.REF,           // ->
        TokenType.IDENT,        // buff
        TokenType.DOT,
        TokenType.IDENT,        // skill
        TokenType.SEMI_COMMENT,  // ;
        TokenType.RC,           // }
      ]);
    });

    it('should tokenize enum with assigned values', () => {
      const input = `enum Color { Red = 1; Blue = 2; }`;
      const tokens = CfgLexer.tokenize(input);
      const types = tokens.map(t => t.type);
      expect(types).toEqual([
        TokenType.ENUM,
        TokenType.IDENT,
        TokenType.LC_COMMENT,
        TokenType.IDENT,        // Red
        TokenType.EQ,           // =
        TokenType.INTEGER_CONSTANT, // 1
        TokenType.SEMI_COMMENT,  // ;
        TokenType.IDENT,        // Blue
        TokenType.EQ,
        TokenType.INTEGER_CONSTANT, // 2
        TokenType.SEMI_COMMENT,
        TokenType.RC,
      ]);
    });

    it('should tokenize enum with empty values', () => {
      const input = `enum Direction { North; South; }`;
      const tokens = CfgLexer.tokenize(input);
      const types = tokens.map(t => t.type);
      expect(types).toEqual([
        TokenType.ENUM,
        TokenType.IDENT,
        TokenType.LC_COMMENT,
        TokenType.IDENT,        // North
        TokenType.SEMI_COMMENT,
        TokenType.IDENT,        // South
        TokenType.SEMI_COMMENT,
        TokenType.RC,
      ]);
    });

    it('should tokenize list and map types', () => {
      const input = `list<int> map<str,int>`;
      const tokens = CfgLexer.tokenize(input);
      const types = tokens.map(t => t.type);
      expect(types).toEqual([
        TokenType.TLIST,
        TokenType.LT,
        TokenType.TBASE,       // int
        TokenType.GT,
        TokenType.TMAP,
        TokenType.LT,
        TokenType.TBASE,       // str
        TokenType.COMMA,
        TokenType.TBASE,       // int
        TokenType.GT,
      ]);
    });

    it('should tokenize listref (=>)', () => {
      const input = `lootid:int =>lootitem[lootid]`;
      const tokens = CfgLexer.tokenize(input);
      const types = tokens.map(t => t.type);
      expect(types).toEqual([
        TokenType.IDENT,
        TokenType.COLON,
        TokenType.TBASE,
        TokenType.LISTREF,     // =>
        TokenType.IDENT,       // lootitem
        TokenType.LB,
        TokenType.IDENT,
        TokenType.RB,
      ]);
    });

    it('should tokenize metadata with tags, values, and minus', () => {
      const input = `(tag1, tag2='hello', -tag3, n=42, f=3.14, b=true)`;
      const tokens = CfgLexer.tokenize(input);
      const types = tokens.map(t => t.type);
      expect(types).toEqual([
        TokenType.LP,
        TokenType.IDENT,       // tag1
        TokenType.COMMA,
        TokenType.IDENT,       // tag2
        TokenType.EQ,
        TokenType.STRING_CONSTANT, // 'hello'
        TokenType.COMMA,
        TokenType.MINUS,       // -
        TokenType.IDENT,       // tag3
        TokenType.COMMA,
        TokenType.IDENT,       // n
        TokenType.EQ,
        TokenType.INTEGER_CONSTANT, // 42
        TokenType.COMMA,
        TokenType.IDENT,       // f
        TokenType.EQ,
        TokenType.FLOAT_CONSTANT, // 3.14
        TokenType.COMMA,
        TokenType.IDENT,       // b
        TokenType.EQ,
        TokenType.BOOL_CONSTANT, // true
        TokenType.RP,
      ]);
    });

    it('should tokenize comment before struct', () => {
      const input = `// leading comment\nstruct Foo { }`;
      const tokens = CfgLexer.tokenize(input);
      const types = tokens.map(t => t.type);
      expect(types).toEqual([
        TokenType.COMMENT,
        TokenType.STRUCT,
        TokenType.IDENT,
        TokenType.LC_COMMENT,
        TokenType.RC,
      ]);
    });

    it('should tokenize inline comment after semicolon', () => {
      const input = `id:int; // 等级`;
      const tokens = CfgLexer.tokenize(input);
      const types = tokens.map(t => t.type);
      // SEMI_COMMENT = '; [ \t]* (// comment)?' captures the comment as part of the token
      expect(types).toEqual([
        TokenType.IDENT,
        TokenType.COLON,
        TokenType.TBASE,
        TokenType.SEMI_COMMENT, // includes the comment
      ]);
      expect(tokens[3].value).toBe('; // 等级');
    });

    it('should tokenize semicolon with inline comment as SEMI_COMMENT', () => {
      const input = `id:int; // 等级`;
      const tokens = CfgLexer.tokenize(input);
      const types = tokens.map(t => t.type);
      expect(types).toEqual([
        TokenType.IDENT,
        TokenType.COLON,
        TokenType.TBASE,
        TokenType.SEMI_COMMENT, // includes the comment
      ]);
      expect(tokens[3].value).toBe('; // 等级');
    });

    it('should tokenize brace with inline comment as LC_COMMENT', () => {
      const input = `table t[id] { // 副本逻辑`;
      const tokens = CfgLexer.tokenize(input);
      const lcComment = tokens.find(t => t.type === TokenType.LC_COMMENT);
      expect(lcComment).toBeDefined();
      expect(lcComment!.value).toBe('{ // 副本逻辑');
    });

    it('should tokenize the full samples/test/test.cfg', () => {
      const input = `table test[id] (json){ // 副本逻辑
    id:int;
    name:str;

    testBools:list<bool>;
    testInts:list<int>;
    testFloats:list<float>;
    testStrs:list<str>;

    enumInt:int -> buff.buffclass;
    testEnumInts:list<int> -> buff.buffclass;

    enumStr:str -> buff.triggerevt;
    testEnumStrs:list<str> -> buff.triggerevt;

    ref:int ->buff.skill;
    testRefs:list<int> -> buff.skill;
}

table test2[id] {
    id:int;
    name:str; // 名称
    testBools:list<bool> (fix=3); // 固定长度为3的布尔列表
    cond: trigger.Condition (pack); // 条件，使用pack进行压缩
}`;
      const tokens = CfgLexer.tokenize(input);
      // Should not throw and should produce a reasonable number of tokens
      expect(tokens.length).toBeGreaterThan(50);
      // First token should be TABLE
      expect(tokens[0].type).toBe(TokenType.TABLE);
      // Last token should be RC
      const lastNonEof = tokens[tokens.length - 1];
      expect(lastNonEof.type).toBe(TokenType.RC);
    });
  });

  describe('Token positions', () => {
    it('should track line and column', () => {
      const input = `struct Foo\n{\n}`;
      const tokens = CfgLexer.tokenize(input);
      expect(tokens[0].line).toBe(1); // struct
      expect(tokens[0].column).toBe(0);
      expect(tokens[1].line).toBe(1); // Foo is on the same line as struct
      expect(tokens[1].column).toBe(7);
      expect(tokens[2].line).toBe(2); // { is on the next line
      expect(tokens[3].line).toBe(3); // } is on the third line
    });

    it('should track column within a line', () => {
      const tokens = CfgLexer.tokenize(`  struct`);
      expect(tokens[0].line).toBe(1);
      expect(tokens[0].column).toBe(2);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty input', () => {
      const tokens = CfgLexer.tokenize('');
      expect(tokens).toHaveLength(0);
    });

    it('should handle whitespace-only input', () => {
      const tokens = CfgLexer.tokenize('   \n\t  \n');
      expect(tokens).toHaveLength(0);
    });

    it('should handle comment-only input', () => {
      const tokens = CfgLexer.tokenize('// just a comment');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe(TokenType.COMMENT);
    });

    it('should distinguish minus from negative number', () => {
      // -tag is MINUS IDENT
      const tokens1 = CfgLexer.tokenize('-tag');
      expect(tokens1[0].type).toBe(TokenType.MINUS);
      expect(tokens1[1].type).toBe(TokenType.IDENT);

      // -42 is INTEGER_CONSTANT
      const tokens2 = CfgLexer.tokenize('-42');
      expect(tokens2[0].type).toBe(TokenType.INTEGER_CONSTANT);
      expect(tokens2[0].value).toBe('-42');
    });

    it('should handle dotted namespace identifiers', () => {
      const tokens = CfgLexer.tokenize('equip.jewelryrandom');
      expect(tokens).toHaveLength(3);
      expect(tokens[0].type).toBe(TokenType.IDENT);
      expect(tokens[1].type).toBe(TokenType.DOT);
      expect(tokens[2].type).toBe(TokenType.IDENT);
    });
  });
});
