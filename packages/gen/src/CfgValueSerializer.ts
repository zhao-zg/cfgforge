/**
 * CfgValueSerializer — TypeScript port of Java
 * `configgen.genbytes.CfgValueSerializer`.
 *
 * Top-level serializer: writes table count, then for each sorted table:
 * writeString(tableName) + writeInt(tableBytes.length) + writeRawBytes(tableBytes)
 *
 * Each table is serialized to its own ConfigOutput buffer first (so the
 * table byte length is known before writing).
 *
 * Java source: configgen.genbytes.CfgValueSerializer.java (58 lines)
 */

import type { LangSwitchableRuntime } from '@cfggen/i18n';
import { CfgValue, VTable } from '@cfggen/value';
import { Logger } from '@cfggen/shared';

import { ConfigOutput } from './ConfigOutput';
import { StringPool } from './StringPool';
import { LangTextPool } from './LangTextPool';
import { TableSerializer } from './TableSerializer';

export class CfgValueSerializer {
  constructor(
    private output: ConfigOutput,
    private stringPool: StringPool,
    private langTextPool: LangTextPool,
    private langSwitchRuntime: LangSwitchableRuntime | null,
  ) {}

  serialize(cfgValue: CfgValue): void {
    // 1. Write table count
    this.output.writeInt(cfgValue.vTableMap.size);

    for (const vTable of cfgValue.sortedTables()) {
      const tableBytes = this.serializeTableBytes(vTable);

      Logger.verbose(`${vTable.name()}: ${tableBytes.length}`);

      // 2. Write table name
      this.output.writeString(vTable.name());

      // 3. Write total size
      this.output.writeInt(tableBytes.length);

      // 4. Write table data
      this.output.writeRawBytes(tableBytes);
    }
  }

  private serializeTableBytes(vTable: VTable): Buffer {
    if (this.langSwitchRuntime !== null) {
      this.langSwitchRuntime.enterTable(vTable.name());
    }

    const tableOut = new ConfigOutput();
    const serializer = new TableSerializer(
      tableOut,
      this.stringPool,
      this.langTextPool,
      this.langSwitchRuntime,
    );
    serializer.serialize(vTable);
    return tableOut.toBuffer();
  }
}
