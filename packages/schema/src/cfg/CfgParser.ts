/**
 * CFG Recursive Descent Parser
 *
 * Based on Cfg.g4 grammar rules, parses Token stream from CfgLexer into AST nodes.
 * Replaces the ANTLR-generated CfgParser.
 *
 * Grammar rules (from Cfg.g4):
 *   schema: schema_ele* suffix_comment* EOF
 *   schema_ele: struct_decl | interface_decl | table_decl | enum_decl
 *   struct_decl: leading_comment* STRUCT ns_ident metadata LC_COMMENT (field_decl|foreign_decl)* suffix_comment* RC
 *   interface_decl: leading_comment* INTERFACE ns_ident metadata LC_COMMENT struct_decl+ suffix_comment* RC
 *   table_decl: leading_comment* TABLE ns_ident key metadata LC_COMMENT (field_decl|foreign_decl|key_decl)+ suffix_comment* RC
 *   enum_decl: leading_comment* ENUM ns_ident metadata LC_COMMENT (enum_value_empty+|enum_value_assigned+)? suffix_comment* RC
 *   field_decl: leading_comment* identifier COLON type_ ref? metadata SEMI_COMMENT
 *   foreign_decl: leading_comment* REF identifier COLON key ref metadata SEMI_COMMENT
 *   key_decl: leading_comment* key SEMI_COMMENT
 *   enum_value_empty: leading_comment* identifier SEMI_COMMENT
 *   enum_value_assigned: leading_comment* identifier EQ enum_number SEMI_COMMENT
 *   type_: TLIST '<' type_ele '>' | TMAP '<' type_ele ',' type_ele '>' | type_ele
 *   type_ele: TBASE | ns_ident
 *   ref: (REF|LISTREF) ns_ident key?
 *   key: '[' identifier (',' identifier)* ']'
 *   metadata: (LP ident_with_opt_single_value (COMMA ident_with_opt_single_value)* RP)?
 *   ident_with_opt_single_value: identifier (EQ single_value)? | minus_ident
 *   minus_ident: MINUS identifier
 *   single_value: INTEGER_CONSTANT | HEX_INTEGER_CONSTANT | FLOAT_CONSTANT | STRING_CONSTANT | BOOL_CONSTANT
 *   enum_number: INTEGER_CONSTANT | HEX_INTEGER_CONSTANT
 *   ns_ident: identifier (DOT identifier)*
 *   identifier: IDENT | STRUCT | INTERFACE | TABLE | ENUM | TLIST | TMAP | TBASE
 *   leading_comment: COMMENT
 *   suffix_comment: COMMENT
 */

import { CfgLexer, TokenType, Token } from './CfgLexer';
import {
  SchemaAst, StructDeclAst, InterfaceDeclAst, TableDeclAst, EnumDeclAst,
  FieldDeclAst, ForeignDeclAst, KeyDeclAst, EnumValueEmptyAst, EnumValueAssignedAst,
  FieldTypeAst, FieldTypeEleAst, MetadataAst, MetaEntryAst, MetaValueAst,
  RefAst, KeyAst, CommentData,
  commentFromFull, commentFromLeadingTrailing, emptyComment,
} from './AstNode';

export class ParseError extends Error {
  constructor(message: string, public line: number, public column: number) {
    super(`Parse error at line ${line}, column ${column}: ${message}`);
    this.name = 'ParseError';
  }
}

export class CfgParser {
  private tokens: Token[];
  private pos: number = 0;

  private constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  /**
   * Parse a CFG source string into a SchemaAst.
   */
  static parse(src: string): SchemaAst {
    const tokens = CfgLexer.tokenize(src);
    const parser = new CfgParser(tokens);
    return parser.parseSchema();
  }

  /**
   * Parse from a pre-tokenized token stream.
   */
  static parseTokens(tokens: Token[]): SchemaAst {
    const parser = new CfgParser(tokens);
    return parser.parseSchema();
  }

  // ---- Token stream helpers ----

  private peek(offset: number = 0): Token | null {
    const idx = this.pos + offset;
    if (idx >= this.tokens.length) return null;
    return this.tokens[idx];
  }

  private current(): Token | null {
    return this.peek(0);
  }

  private advance(): Token {
    const token = this.tokens[this.pos];
    this.pos++;
    return token;
  }

  private expect(type: TokenType): Token {
    const token = this.current();
    if (!token) {
      throw new ParseError(`Expected ${TokenType[type]} but reached end of input`, 0, 0);
    }
    if (token.type !== type) {
      throw new ParseError(`Expected ${TokenType[type]} but got ${TokenType[token.type]} ("${token.value}")`, token.line, token.column);
    }
    return this.advance();
  }

  private match(type: TokenType): Token | null {
    const token = this.current();
    if (token && token.type === type) {
      return this.advance();
    }
    return null;
  }

  private check(type: TokenType): boolean {
    const token = this.current();
    return token !== null && token.type === type;
  }

  // ---- Grammar rules ----

  // schema: schema_ele* suffix_comment* EOF
  private parseSchema(): SchemaAst {
    const elements: SchemaAst['elements'] = [];

    // Parse schema_ele*
    while (this.hasMoreSchemaElements()) {
      const leadingComments = this.collectLeadingComments();
      const token = this.current();

      if (!token) break;

      let element: StructDeclAst | InterfaceDeclAst | TableDeclAst | EnumDeclAst | null = null;

      switch (token.type) {
        case TokenType.STRUCT:
          element = this.parseStructDecl(leadingComments);
          break;
        case TokenType.INTERFACE:
          element = this.parseInterfaceDecl(leadingComments);
          break;
        case TokenType.TABLE:
          element = this.parseTableDecl(leadingComments);
          break;
        case TokenType.ENUM:
          element = this.parseEnumDecl(leadingComments);
          break;
        default:
          // Should not happen — check method filters
          throw new ParseError(`Unexpected token ${TokenType[token.type]} ("${token.value}")`, token.line, token.column);
      }

      if (element) {
        elements.push(element);
      }
    }

    // Parse suffix_comment* (comments at end of file)
    const suffixComments = this.collectLeadingComments();

    // Ensure all tokens are consumed
    if (this.current() !== null) {
      const token = this.current()!;
      throw new ParseError(`Unexpected token ${TokenType[token.type]} ("${token.value}") — expected end of input`, token.line, token.column);
    }

    return { elements, suffixComments };
  }

  // Check if there are more schema elements to parse
  private hasMoreSchemaElements(): boolean {
    const token = this.current();
    if (!token) return false;
    // Skip leading comments to find the actual keyword
    let offset = 0;
    while (this.peek(offset) && this.peek(offset)!.type === TokenType.COMMENT) {
      offset++;
    }
    const next = this.peek(offset);
    if (!next) return false;
    return next.type === TokenType.STRUCT ||
           next.type === TokenType.INTERFACE ||
           next.type === TokenType.TABLE ||
           next.type === TokenType.ENUM;
  }

  // Collect leading COMMENT tokens (zero or more)
  private collectLeadingComments(): Token[] {
    const comments: Token[] = [];
    while (this.check(TokenType.COMMENT)) {
      comments.push(this.advance());
    }
    return comments;
  }

  // ns_ident: identifier (DOT identifier)*
  private parseNsIdent(): string {
    const parts: string[] = [];
    parts.push(this.parseIdentifier());
    while (this.check(TokenType.DOT)) {
      this.advance(); // DOT
      parts.push(this.parseIdentifier());
    }
    return parts.join('.');
  }

  // identifier: IDENT | STRUCT | INTERFACE | TABLE | ENUM | TLIST | TMAP | TBASE
  private parseIdentifier(): string {
    const token = this.current();
    if (!token) {
      throw new ParseError('Expected identifier but reached end of input', 0, 0);
    }
    switch (token.type) {
      case TokenType.IDENT:
      case TokenType.STRUCT:
      case TokenType.INTERFACE:
      case TokenType.TABLE:
      case TokenType.ENUM:
      case TokenType.TLIST:
      case TokenType.TMAP:
      case TokenType.TBASE:
        this.advance();
        return token.value;
      default:
        throw new ParseError(`Expected identifier but got ${TokenType[token.type]} ("${token.value}")`, token.line, token.column);
    }
  }

  // key: '[' identifier (',' identifier)* ']'
  private parseKey(): KeyAst {
    this.expect(TokenType.LB);
    const names: string[] = [this.parseIdentifier()];
    while (this.match(TokenType.COMMA)) {
      names.push(this.parseIdentifier());
    }
    this.expect(TokenType.RB);
    return { names };
  }

  // type_: TLIST '<' type_ele '>' | TMAP '<' type_ele ',' type_ele '>' | type_ele
  private parseType(): FieldTypeAst {
    if (this.check(TokenType.TLIST)) {
      this.advance(); // TLIST
      this.expect(TokenType.LT);
      const elementType = this.parseTypeEle();
      this.expect(TokenType.GT);
      return { kind: 'list', elementType };
    }

    if (this.check(TokenType.TMAP)) {
      this.advance(); // TMAP
      this.expect(TokenType.LT);
      const keyType = this.parseTypeEle();
      this.expect(TokenType.COMMA);
      const valueType = this.parseTypeEle();
      this.expect(TokenType.GT);
      return { kind: 'map', keyType, valueType };
    }

    // type_ele (basic)
    const typeEle = this.parseTypeEle();
    return typeEle;
  }

  // type_ele: TBASE | ns_ident
  private parseTypeEle(): FieldTypeEleAst {
    if (this.check(TokenType.TBASE)) {
      const token = this.advance();
      return { kind: 'primitive', name: token.value };
    }
    // ns_ident
    const ns = this.parseNsIdent();
    return { kind: 'structRef', namespace: ns };
  }

  // ref: (REF|LISTREF) ns_ident key?
  private parseRef(): RefAst {
    let isListRef: boolean;
    if (this.check(TokenType.REF)) {
      this.advance();
      isListRef = false;
    } else if (this.check(TokenType.LISTREF)) {
      this.advance();
      isListRef = true;
    } else {
      const token = this.current()!;
      throw new ParseError(`Expected REF (->) or LISTREF (=>) but got ${TokenType[token.type]}`, token.line, token.column);
    }

    const refTable = this.parseNsIdent();

    let remoteKey: string[] | null = null;
    if (this.check(TokenType.LB)) {
      const key = this.parseKey();
      remoteKey = key.names;
    }

    return { refTable, remoteKey, isListRef };
  }

  // metadata: (LP ident_with_opt_single_value (COMMA ident_with_opt_single_value)* RP)?
  private parseMetadata(): MetadataAst {
    if (!this.check(TokenType.LP)) {
      return { entries: [] };
    }

    this.expect(TokenType.LP);
    const entries: MetaEntryAst[] = [];

    // First entry
    entries.push(this.parseIdentWithOptSingleValue());

    // Additional entries
    while (this.match(TokenType.COMMA)) {
      entries.push(this.parseIdentWithOptSingleValue());
    }

    this.expect(TokenType.RP);
    return { entries };
  }

  // ident_with_opt_single_value: identifier (EQ single_value)? | minus_ident
  // minus_ident: MINUS identifier
  private parseIdentWithOptSingleValue(): MetaEntryAst {
    if (this.check(TokenType.MINUS)) {
      this.advance(); // MINUS
      const name = this.parseIdentifier();
      return { key: '-' + name, isMinus: true };
    }

    const key = this.parseIdentifier();

    let value: MetaValueAst | null = null;
    if (this.match(TokenType.EQ)) {
      value = this.parseSingleValue();
    }

    return { key, value };
  }

  // single_value: INTEGER_CONSTANT | HEX_INTEGER_CONSTANT | FLOAT_CONSTANT | STRING_CONSTANT | BOOL_CONSTANT
  private parseSingleValue(): MetaValueAst {
    const token = this.current();
    if (!token) {
      throw new ParseError('Expected a value but reached end of input', 0, 0);
    }

    switch (token.type) {
      case TokenType.INTEGER_CONSTANT:
        this.advance();
        return { kind: 'int', value: parseInt(token.value, 10) };
      case TokenType.HEX_INTEGER_CONSTANT:
        this.advance();
        return { kind: 'int', value: parseInt(token.value, 16) };
      case TokenType.FLOAT_CONSTANT:
        this.advance();
        return { kind: 'float', value: parseFloat(token.value) };
      case TokenType.STRING_CONSTANT:
        this.advance();
        // Strip quotes and trim
        let str = token.value;
        if (str.startsWith("'") && str.endsWith("'")) {
          str = str.substring(1, str.length - 1);
        }
        return { kind: 'string', value: str.trim() };
      case TokenType.BOOL_CONSTANT:
        this.advance();
        return { kind: 'bool', value: token.value };
      default:
        throw new ParseError(`Expected a value but got ${TokenType[token.type]} ("${token.value}")`, token.line, token.column);
    }
  }

  // enum_number: INTEGER_CONSTANT | HEX_INTEGER_CONSTANT
  private parseEnumNumber(): number {
    const token = this.current();
    if (!token) {
      throw new ParseError('Expected enum number but reached end of input', 0, 0);
    }

    if (token.type === TokenType.INTEGER_CONSTANT) {
      this.advance();
      return parseInt(token.value, 10);
    }
    if (token.type === TokenType.HEX_INTEGER_CONSTANT) {
      this.advance();
      return parseInt(token.value, 16); // handles 0x prefix
    }

    throw new ParseError(`Expected integer or hex but got ${TokenType[token.type]} ("${token.value}")`, token.line, token.column);
  }

  // field_decl: leading_comment* identifier COLON type_ ref? metadata SEMI_COMMENT
  private parseFieldDecl(leadingComments: Token[]): FieldDeclAst {
    const name = this.parseIdentifier();
    this.expect(TokenType.COLON);
    const type = this.parseType();

    // Optional ref
    let ref: RefAst | null = null;
    if (this.check(TokenType.REF) || this.check(TokenType.LISTREF)) {
      ref = this.parseRef();
    }

    const metadata = this.parseMetadata();
    const semiToken = this.expect(TokenType.SEMI_COMMENT);
    const comment = commentFromLeadingTrailing(leadingComments, semiToken);

    return { name, type, ref, metadata, comment };
  }

  // foreign_decl: leading_comment* REF identifier COLON key ref metadata SEMI_COMMENT
  private parseForeignDecl(leadingComments: Token[]): ForeignDeclAst {
    // REF (-> or =>)
    let isListRef: boolean;
    if (this.check(TokenType.REF)) {
      this.advance();
      isListRef = false;
    } else {
      this.expect(TokenType.LISTREF);
      isListRef = true;
    }

    const name = this.parseIdentifier();
    this.expect(TokenType.COLON);
    const localKey = this.parseKey();

    // ref: (REF|LISTREF) ns_ident key?
    // But we already consumed the first REF/LISTREF
    // In the grammar, foreign_decl has: REF identifier COLON key ref
    // Where ref = (REF|LISTREF) ns_ident key?
    // So the ref here starts with another REF or LISTREF
    // Wait, let me re-read the grammar:
    // foreign_decl: leading_comment* REF identifier COLON key ref metadata SEMI_COMMENT
    // ref: (REF|LISTREF) ns_ident key?
    // So there are TWO REF tokens: one in foreign_decl and one in ref
    // Actually looking at the g4 more carefully:
    // foreign_decl: leading_comment* REF identifier COLON key ref metadata SEMI_COMMENT
    // The REF at the beginning is a literal token
    // Then ref rule starts with (REF|LISTREF)
    // So the pattern is: -> fieldName: [localKey] -> remoteTable [remoteKey]
    // Two -> tokens!

    // Actually wait, let me look at example:
    // ->AnotherWay:[lootid] =>lootitem[lootid];
    // ->Loot:[lootId,lootItemId] ->lootitem;
    // ->AllLoot:[lootId] ->loot;

    // So foreign_decl starts with ->, then name, then : key, then another -> or =>
    // The first -> is the literal REF in foreign_decl
    // The second -> or => is from the ref rule

    const refToken = this.current();
    let refIsListRef: boolean;
    if (this.check(TokenType.REF)) {
      this.advance();
      refIsListRef = false;
    } else if (this.check(TokenType.LISTREF)) {
      this.advance();
      refIsListRef = true;
    } else {
      throw new ParseError(`Expected REF (->) or LISTREF (=>) for foreign ref but got ${refToken ? TokenType[refToken.type] : 'EOF'}`, refToken?.line ?? 0, refToken?.column ?? 0);
    }

    const refTable = this.parseNsIdent();
    let remoteKey: string[] | null = null;
    if (this.check(TokenType.LB)) {
      remoteKey = this.parseKey().names;
    }

    const ref: RefAst = { refTable, remoteKey, isListRef: refIsListRef };

    const metadata = this.parseMetadata();
    const semiToken = this.expect(TokenType.SEMI_COMMENT);
    const comment = commentFromLeadingTrailing(leadingComments, semiToken);

    return { name, localKey, ref, metadata, comment };
  }

  // key_decl: leading_comment* key SEMI_COMMENT
  private parseKeyDecl(leadingComments: Token[]): KeyDeclAst {
    const key = this.parseKey();
    const semiToken = this.expect(TokenType.SEMI_COMMENT);
    const comment = commentFromLeadingTrailing(leadingComments, semiToken);
    return { key, comment };
  }

  // enum_value_empty: leading_comment* identifier SEMI_COMMENT
  private parseEnumValueEmpty(leadingComments: Token[]): EnumValueEmptyAst {
    const name = this.parseIdentifier();
    const semiToken = this.expect(TokenType.SEMI_COMMENT);
    const comment = commentFromLeadingTrailing(leadingComments, semiToken);
    return { name, comment };
  }

  // enum_value_assigned: leading_comment* identifier EQ enum_number SEMI_COMMENT
  private parseEnumValueAssigned(leadingComments: Token[]): EnumValueAssignedAst {
    const name = this.parseIdentifier();
    this.expect(TokenType.EQ);
    const number = this.parseEnumNumber();
    const semiToken = this.expect(TokenType.SEMI_COMMENT);
    const comment = commentFromLeadingTrailing(leadingComments, semiToken);
    return { name, number, comment };
  }

  // struct_decl: leading_comment* STRUCT ns_ident metadata LC_COMMENT (field_decl|foreign_decl)* suffix_comment* RC
  private parseStructDecl(leadingComments: Token[]): StructDeclAst {
    this.expect(TokenType.STRUCT);
    const name = this.parseNsIdent();
    const metadata = this.parseMetadata();
    const lcToken = this.expect(TokenType.LC_COMMENT);

    const fields: FieldDeclAst[] = [];
    const foreignKeys: ForeignDeclAst[] = [];

    // Parse field_decl and foreign_decl
    // Collect leading comments for each member, stop at RC
    while (true) {
      const fieldLeadingComments = this.collectLeadingComments();
      if (this.check(TokenType.RC)) break;

      if (this.check(TokenType.REF) || this.check(TokenType.LISTREF)) {
        foreignKeys.push(this.parseForeignDecl(fieldLeadingComments));
      } else {
        fields.push(this.parseFieldDecl(fieldLeadingComments));
      }
    }

    // suffix_comment*
    const suffixComments = this.collectLeadingComments();

    this.expect(TokenType.RC);

    const comment = commentFromFull(leadingComments, lcToken, suffixComments);

    return { name, metadata, comment, fields, foreignKeys };
  }

  // interface_decl: leading_comment* INTERFACE ns_ident metadata LC_COMMENT struct_decl+ suffix_comment* RC
  private parseInterfaceDecl(leadingComments: Token[]): InterfaceDeclAst {
    this.expect(TokenType.INTERFACE);
    const name = this.parseNsIdent();
    const metadata = this.parseMetadata();
    const lcToken = this.expect(TokenType.LC_COMMENT);

    const structs: StructDeclAst[] = [];

    // Parse struct_decl+ (at least one)
    while (!this.check(TokenType.RC)) {
      const structLeadingComments = this.collectLeadingComments();
      if (this.check(TokenType.RC)) break;

      if (this.check(TokenType.STRUCT)) {
        structs.push(this.parseStructDecl(structLeadingComments));
      } else {
        const token = this.current();
        if (token) {
          throw new ParseError(`Expected struct inside interface but got ${TokenType[token.type]} ("${token.value}")`, token.line, token.column);
        }
        break;
      }
    }

    // suffix_comment*
    const suffixComments = this.collectLeadingComments();
    this.expect(TokenType.RC);

    const comment = commentFromFull(leadingComments, lcToken, suffixComments);

    return { name, metadata, comment, structs };
  }

  // table_decl: leading_comment* TABLE ns_ident key metadata LC_COMMENT (field_decl|foreign_decl|key_decl)+ suffix_comment* RC
  private parseTableDecl(leadingComments: Token[]): TableDeclAst {
    this.expect(TokenType.TABLE);
    const name = this.parseNsIdent();
    const primaryKey = this.parseKey();
    const metadata = this.parseMetadata();
    const lcToken = this.expect(TokenType.LC_COMMENT);

    const fields: FieldDeclAst[] = [];
    const foreignKeys: ForeignDeclAst[] = [];
    const uniqueKeys: KeyDeclAst[] = [];

    // Parse field_decl, foreign_decl, key_decl
    while (!this.check(TokenType.RC)) {
      const memberLeadingComments = this.collectLeadingComments();
      if (this.check(TokenType.RC)) break;

      if (this.check(TokenType.REF) || this.check(TokenType.LISTREF)) {
        foreignKeys.push(this.parseForeignDecl(memberLeadingComments));
      } else if (this.check(TokenType.LB)) {
        // key_decl starts with [
        uniqueKeys.push(this.parseKeyDecl(memberLeadingComments));
      } else {
        fields.push(this.parseFieldDecl(memberLeadingComments));
      }
    }

    // suffix_comment*
    const suffixComments = this.collectLeadingComments();
    this.expect(TokenType.RC);

    const comment = commentFromFull(leadingComments, lcToken, suffixComments);

    return { name, primaryKey, metadata, comment, fields, foreignKeys, uniqueKeys };
  }

  // enum_decl: leading_comment* ENUM ns_ident metadata LC_COMMENT (enum_value_empty+|enum_value_assigned+)? suffix_comment* RC
  private parseEnumDecl(leadingComments: Token[]): EnumDeclAst {
    this.expect(TokenType.ENUM);
    const name = this.parseNsIdent();
    const metadata = this.parseMetadata();
    const lcToken = this.expect(TokenType.LC_COMMENT);

    const enumValuesEmpty: EnumValueEmptyAst[] = [];
    const enumValuesAssigned: EnumValueAssignedAst[] = [];

    // Parse enum values (either all empty or all assigned)
    while (!this.check(TokenType.RC)) {
      const valueLeadingComments = this.collectLeadingComments();
      if (this.check(TokenType.RC)) break;

      // Check if it's assigned (identifier EQ) or empty (identifier SEMI_COMMENT)
      // We need lookahead: skip identifier, check if next is EQ or SEMI_COMMENT
      const offset = valueLeadingComments.length; // already consumed comments
      const identToken = this.peek(0);
      if (!identToken) break;

      // Peek ahead after identifier
      const afterIdent = this.peek(1);
      if (afterIdent && afterIdent.type === TokenType.EQ) {
        enumValuesAssigned.push(this.parseEnumValueAssigned(valueLeadingComments));
      } else {
        enumValuesEmpty.push(this.parseEnumValueEmpty(valueLeadingComments));
      }
    }

    // suffix_comment*
    const suffixComments = this.collectLeadingComments();
    this.expect(TokenType.RC);

    const comment = commentFromFull(leadingComments, lcToken, suffixComments);

    return { name, metadata, comment, enumValuesEmpty, enumValuesAssigned };
  }
}
