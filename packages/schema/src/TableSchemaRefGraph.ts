/**
 * TableSchemaRefGraph — TypeScript port of Java `configgen.schema.TableSchemaRefGraph`.
 *
 * Queries reference relationships between tables.
 * Each Refs node has refInTables (tables that reference me) and refOutTables (tables I reference).
 *
 * Java source: configgen.schema.TableSchemaRefGraph.java (76 lines)
 */

import type { CfgSchema } from './CfgSchema.js';
import { TableSchema } from './TableSchema.js';
import type { Nameable } from './Nameable.js';
import type { Structural } from './Structural.js';
import { InterfaceSchema } from './InterfaceSchema.js';
import { StructSchema } from './StructSchema.js';
import { findAllIncludedStructs } from './IncludedStructs.js';

// ---------------------------------------------------------------------------
// Refs — per-table reference info
// ---------------------------------------------------------------------------

export class Refs {
  constructor(
    public readonly refInTables: Map<string, TableSchema>,
    public readonly refOutTables: Map<string, TableSchema>,
  ) {}

  refIn(): Set<string> {
    return new Set(this.refInTables.keys());
  }

  refOut(): Set<string> {
    return new Set(this.refOutTables.keys());
  }
}

// ---------------------------------------------------------------------------
// TableSchemaRefGraph
// ---------------------------------------------------------------------------

export class TableSchemaRefGraph {
  private readonly _schema: CfgSchema;
  private readonly _refsMap: Map<string, Refs>;

  constructor(schema: CfgSchema) {
    this._schema = schema;
    schema.requireResolved();
    this._refsMap = new Map();
    this.buildGraph();
  }

  private buildGraph(): void {
    const tableMap = this._schema.tableMap();
    if (!tableMap) return;

    // Step 1: compute refOut for each table
    for (const table of tableMap.values()) {
      this._refsMap.set(table.name(), new Refs(new Map(), TableSchemaRefGraph.findAllRefOuts(table)));
    }

    // Step 2: build reverse refIn edges
    for (const [tableName, refs] of this._refsMap) {
      const sourceTable = this._schema.findTable(tableName);
      if (!sourceTable) continue;
      for (const refToTable of refs.refOutTables.values()) {
        const refsTo = this._refsMap.get(refToTable.name());
        if (refsTo) {
          refsTo.refInTables.set(sourceTable.name(), sourceTable);
        }
      }
    }
  }

  get refsMap(): Map<string, Refs> {
    return this._refsMap;
  }

  static findAllRefOuts(tableSchema: TableSchema): Map<string, TableSchema> {
    const refOut = new Map<string, TableSchema>();
    const allIncludedStructs = findAllIncludedStructs(tableSchema);

    for (const item of allIncludedStructs.values()) {
      if (item instanceof InterfaceSchema) {
        const ref = item.nullableEnumRefTable();
        if (ref) {
          refOut.set(ref.name(), ref);
        }
      } else if (isStructural(item)) {
        for (const fk of item.foreignKeys()) {
          const t = fk.refTableSchema();
          if (t) {
            refOut.set(t.name(), t);
          }
        }
      }
    }

    return refOut;
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function isStructural(item: Nameable): item is Structural {
  return item instanceof StructSchema || item instanceof TableSchema;
}
