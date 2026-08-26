/**
 * SchemaToTs — TypeScript port of Java `configgen.genbyai.SchemaToTs`.
 *
 * Converts a TableSchema + CfgValue into TypeScript type definitions.
 * Groups types by namespace, generates export interface/type declarations,
 * and optionally generates union types from actual enum/ref table data values.
 */

import type { CfgValue } from '@cfggen/value';
import { VString, VText, VInt, VLong, VFloat } from '@cfggen/value';
import { ValueUtil } from '@cfggen/value';
import type { TableSchema, Nameable, Structural, FieldSchema, FieldType } from '@cfggen/schema';
import { StructSchema, InterfaceSchema, TableSchema as TableSchemaCls } from '@cfggen/schema';
import { findAllIncludedStructs } from '@cfggen/schema';
import { RefPrimary, RefUniq } from '@cfggen/schema';
import { Primitive, FList, StructRef, isPrimitive, isStructRef, isFList, isFMap } from '@cfggen/schema';
import { isEEnum } from '@cfggen/schema';
import { isMetaStr } from '@cfggen/schema';

// ---------------------------------------------------------------------------
// Internal helper types
// ---------------------------------------------------------------------------

interface StructEntry {
  nameable: Nameable;
  tableKey: string | null; // null = generate type declaration, non-null = generate union type
}

interface RefName {
  namespace: string;
  lastName: string;
}

// ---------------------------------------------------------------------------
// SchemaToTs
// ---------------------------------------------------------------------------

export class SchemaToTs {
  private readonly cfgValue: CfgValue;
  private readonly tableSchema: TableSchema;
  private readonly isGenerate$type: boolean;
  private readonly sb: string[] = [];

  private readonly namespaces: Map<string, Map<string, StructEntry>> = new Map();
  private readonly refNames: Map<FieldSchema, RefName> = new Map();
  private readonly extraRefTables: string[];

  constructor(cfgValue: CfgValue, tableSchema: TableSchema, extraRefTables: string[], isGenerate$type: boolean) {
    this.cfgValue = cfgValue;
    this.tableSchema = tableSchema;
    this.extraRefTables = extraRefTables;
    this.isGenerate$type = isGenerate$type;
  }

  generate(): string {
    const allIncludedStructs = findAllIncludedStructs(this.tableSchema);

    for (const struct of allIncludedStructs.values()) {
      this.addStruct(struct.lastName(), struct, null);

      if (struct instanceof StructSchema || struct instanceof TableSchemaCls) {
        const structural = struct as Structural;
        for (const fk of structural.foreignKeys()) {
          // Simple: 1. only single-field, 2. only enum table or in extraRefTables
          if (fk.key.fieldSchemas()?.length === 1 &&
              (isEEnum(fk.refTableSchema()!.entry) || this.extraRefTables.includes(fk.refTableNormalized()))) {
            const refTable = fk.refTableSchema()!;
            let refKey = null;
            if (fk.refKey instanceof RefPrimary) {
              refKey = refTable.primaryKey;
            } else if (fk.refKey instanceof RefUniq) {
              refKey = fk.refKey.key;
            }
            // RefList: skip

            const refKeyFields = refKey?.fieldSchemas();
            if (refKey && refKeyFields && refKeyFields.length === 1) {
              const refKeyField = refKeyFields[0];
              if (isPrimitive(refKeyField.type)) {
                const field = fk.key.fieldSchemas()![0];
                const lastName = refTable.lastName() + '_' + refKeyField.name;
                this.refNames.set(field, { namespace: refTable.namespace(), lastName });
                this.addStruct(lastName, refTable, refKeyField.name);
              }
            }
          }
        }
      }
    }

    const nsCount = this.namespaces.size;
    let nsIdx = 0;
    for (const [nsName, structMap] of this.namespaces) {
      this.println(`namespace ${nsName} {`);
      for (const [structName, entry] of structMap) {
        if (entry.tableKey === null) {
          this.generateTypeDeclaration(structName, entry.nameable);
        } else {
          this.generateUnionTypeByValues(structName, entry.nameable, entry.tableKey);
        }
      }

      nsIdx++;
      if (nsIdx < nsCount) {
        this.println('}');
      } else {
        this.sb.push('}');
      }
    }

    return this.sb.join('');
  }

  private addStruct(name: string, struct: Nameable, tableKey: string | null): void {
    let ns = struct.namespace();
    if (struct instanceof StructSchema) {
      const iface = struct.nullableInterface();
      if (iface !== null) {
        ns = iface.fullName();
      }
    }

    let structMap = this.namespaces.get(ns);
    if (!structMap) {
      structMap = new Map();
      this.namespaces.set(ns, structMap);
    }
    structMap.set(name, { nameable: struct, tableKey });
  }

  private println(fmt: string): void {
    this.sb.push(fmt + '\n');
  }

  private generateTypeDeclaration(structName: string, struct: Nameable): void {
    if (struct instanceof StructSchema || struct instanceof TableSchemaCls) {
      const structural = struct as Structural;
      this.println(`export interface ${structName} {${this.comment(structural.comment())}`);
      if (this.isGenerate$type) {
        this.println(`\t$type: "${structural.fullName()}"`);
      }
      for (const field of structural.fields()) {
        this.println(`\t${field.name}: ${this.fieldType(field, structural)};${this.comment(field.comment())}`);
      }
      this.println('}');
    } else if (struct instanceof InterfaceSchema) {
      this.println(`export type ${structName} = `);
      const impls = struct.impls();
      const size1 = impls.length - 1;
      for (let i = 0; i < impls.length; i++) {
        const or = i < size1 ? ' |' : ';';
        this.println(`\t${impls[i].fullName()}${or}`);
      }
    }
  }

  private comment(raw: string): string {
    return raw.length === 0 ? '' : ` /* ${raw} */`;
  }

  private generateUnionTypeByValues(structName: string, nameable: Nameable, tableKey: string): void {
    const table = this.cfgValue.getTable(nameable.name());
    if (!table) throw new Error(`table ${nameable.name()} not found`);

    const fieldNames = new Set<string>();
    if (isEEnum(table.schema.entry)) {
      fieldNames.add(table.schema.entry.field);
    }
    // Check title metadata
    const titleMeta = table.schema.meta().get('title');
    if (titleMeta !== undefined && isMetaStr(titleMeta)) {
      fieldNames.add(titleMeta.value);
    }
    fieldNames.delete(tableKey);

    this.println(`export type ${structName} = `);
    const valueList = table.valueList;
    const size1 = valueList.length - 1;
    for (let idx = 0; idx < valueList.length; idx++) {
      const record = valueList[idx];
      const fv = ValueUtil.extractFieldValue(record, tableKey);
      if (fv === null) throw new Error(`field ${tableKey} not found in record`);

      let v: string;
      if (fv instanceof VString || fv instanceof VText) {
        v = `'${fv.value}'`;
      } else if (fv instanceof VFloat) {
        v = String(fv.value);
      } else if (fv instanceof VInt) {
        v = String(fv.value);
      } else if (fv instanceof VLong) {
        v = String(fv.value);
      } else {
        throw new Error(`${fv} not supported`);
      }

      const commentParts: string[] = [];
      let i = 0;
      for (const fn of fieldNames) {
        if (i > 0) commentParts.push(',');
        const d = ValueUtil.extractFieldValue(record, fn);
        if (d instanceof VString || d instanceof VText) {
          commentParts.push(d.value);
        }
        i++;
      }

      const or = idx < size1 ? ' |' : ';';
      this.println(`\t${v}${this.comment(commentParts.join(''))}${or}`);
    }
  }

  private fieldType(field: FieldSchema, structural: Structural): string {
    const rn = this.refNames.get(field);
    if (rn) {
      let refName: string;
      if (rn.namespace === structural.namespace()) {
        refName = rn.lastName;
      } else {
        refName = rn.namespace + '.' + rn.lastName;
      }

      if (isFList(field.type)) {
        return refName + '[]';
      } else {
        return refName;
      }
    }
    return this.fieldTypeFromType(field.type, structural);
  }

  private fieldTypeFromType(fieldType: FieldType, structural: Structural): string {
    if (isPrimitive(fieldType)) {
      switch (fieldType) {
        case Primitive.INT:
        case Primitive.LONG:
        case Primitive.FLOAT:
          return 'number';
        case Primitive.BOOL:
          return 'boolean';
        case Primitive.STRING:
        case Primitive.TEXT:
          return 'string';
      }
    }

    if (isStructRef(fieldType)) {
      const structRef = fieldType as StructRef;
      const obj = structRef.obj;
      if (obj && obj.namespace() === structural.namespace()) {
        return obj.lastName();
      }
      return obj ? obj.fullName() : structRef.name;
    }

    if (isFList(fieldType)) {
      return this.fieldTypeFromType((fieldType as FList).item, structural) + '[]';
    }

    if (isFMap(fieldType)) {
      throw new Error('map not supported');
    }

    throw new Error(`unsupported field type: ${fieldType}`);
  }
}
