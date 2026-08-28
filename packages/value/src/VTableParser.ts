/**
 * VTableParser — TypeScript port of Java `configgen.value.VTableParser`.
 *
 * Single-table value parsing driver: iterates record rows by primary key,
 * passing each row to ValueParser.parseStructural.
 * Block extraction is delegated to the injected BlockParser — production
 * path defaults to VTableBlockParser.
 *
 * Java source: configgen.value.VTableParser.java (119 lines)
 */

import type { DTable, HeadRow } from '@cfgforge/data';
import { TableSchema } from '@cfgforge/schema';
import { hasBlock } from '@cfgforge/schema';

import { CfgValueErrs } from './CfgValueErrs.js';
import { ValueParser } from './ValueParser.js';
import type { BlockParser } from './ValueParser.js';
import { ParseContext } from './ValueParser.js';
import { VTableCreator } from './VTableCreator.js';
import { VTableBlockParser, getPkColumnIndices, isPkCellAllEmpty } from './VTableBlockParser.js';
import type { VStruct, VTable } from './CfgValue.js';

export class VTableParser {
  private readonly subTableSchema: TableSchema;
  private readonly dTable: DTable;
  private readonly tableSchema: TableSchema;
  private readonly errs: CfgValueErrs;
  private readonly parser: ValueParser;
  private readonly pkColumnIndices: number[];

  /**
   * Creates a VTableParser with the default VTableBlockParser.
   */
  constructor(
    subTableSchema: TableSchema,
    dTable: DTable,
    tableSchema: TableSchema,
    headRow: HeadRow,
    errs: CfgValueErrs,
  );

  /**
   * Creates a VTableParser with a custom BlockParser (for migration comparison).
   */
  constructor(
    subTableSchema: TableSchema,
    dTable: DTable,
    tableSchema: TableSchema,
    headRow: HeadRow,
    errs: CfgValueErrs,
    blockParser: BlockParser,
  );

  // Implementation
  constructor(
    subTableSchema: TableSchema,
    dTable: DTable,
    tableSchema: TableSchema,
    headRow: HeadRow,
    errs: CfgValueErrs,
    blockParser?: BlockParser,
  ) {
    this.subTableSchema = subTableSchema;
    this.dTable = dTable;
    this.tableSchema = tableSchema;
    this.errs = errs;
    const bp: BlockParser = blockParser ?? new VTableBlockParser(dTable, tableSchema);
    this.parser = new ValueParser(errs, headRow, bp);
    this.pkColumnIndices = getPkColumnIndices(tableSchema);
  }

  parseTable(): VTable {
    const block = hasBlock(this.tableSchema);

    const rowCnt = this.dTable.rows.length;
    const valueList: VStruct[] = [];

    for (let curRecordRow = 0; curRecordRow < rowCnt; ) {
      const curRow = this.dTable.rows[curRecordRow];
      const vStruct = this.parser.parseStructural(
        this.subTableSchema,
        curRow,
        this.tableSchema,
        new ParseContext(this.tableSchema.fullName(), false, true, curRecordRow),
      );
      if (vStruct !== null) {
        valueList.push(vStruct);
      }
      curRecordRow++;

      if (block) {
        while (curRecordRow < rowCnt) {
          const nr = this.dTable.rows[curRecordRow];
          // Use PK cells all-empty to determine if this row belongs to
          // the previous record's block, or is a new record
          if (isPkCellAllEmpty(nr, this.pkColumnIndices)) {
            curRecordRow++; // extraction handled by VList/VMap via parseBlock
          } else {
            break;
          }
        }
      }
    }

    return new VTableCreator(this.subTableSchema, this.errs).create(valueList);
  }
}
