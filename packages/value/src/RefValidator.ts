/**
 * RefValidator — TypeScript port of Java `configgen.value.RefValidator`.
 *
 * Validates foreign key references in a CfgValue tree:
 *   - Iterates all VStructs via ForeachVStruct
 *   - For each VStruct, checks every foreignKey on its schema
 *   - For RefSimple (RefPrimary/RefUniq):
 *     - SimpleType field: extracts local value, checks if it exists in the
 *       foreign table's primary/unique key map
 *     - FList field: checks every list element exists in the foreign map
 *     - FMap field: checks every map value exists in the foreign map
 *   - Special cases: nullable refs from pack/sep/json skip validation;
 *     nullable refs that are 0 or part of PK/UK skip validation
 *
 * Java source: configgen.value.RefValidator.java (130 lines)
 */

import {
  type Value,
  VStruct,
  VList,
  VMap,
  CfgValue,
  valueEquals,
} from './CfgValue';
import { CfgValueErrs, foreignValueNotFound, refNotNullableButCellEmpty } from './CfgValueErrs';
import { ForeachVStruct, type ForeachContext, type VStructVisitor } from './ForeachVStruct';
import { ValueUtil } from './ValueUtil';
import type { ForeignKeySchema, TableSchema, FieldType } from '@cfggen/schema';
import {
  isFList,
  isFMap,
  RefPrimary,
  RefUniq,
} from '@cfggen/schema';

// ---------------------------------------------------------------------------
// Helper: Map key lookup using valueEquals (TS Map uses ===, not equals/hashCode)
// ---------------------------------------------------------------------------

function mapContainsKey(map: Map<Value, VStruct>, value: Value): boolean {
  for (const k of map.keys()) {
    if (valueEquals(k, value)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// RefValidator
// ---------------------------------------------------------------------------

export class RefValidator implements VStructVisitor {
  private readonly cfgValue: CfgValue;
  private readonly errs: CfgValueErrs;

  constructor(cfgValue: CfgValue, errs: CfgValueErrs) {
    this.cfgValue = cfgValue;
    this.errs = errs;
  }

  validate(): void {
    ForeachVStruct.foreach(this, this.cfgValue);
  }

  // VStructVisitor.visit — delegates to validateVStruct
  visit(vStruct: VStruct, ctx: ForeachContext): boolean {
    return this.validateVStruct(vStruct, ctx);
  }

  private validateVStruct(vStruct: VStruct, ctx: ForeachContext): boolean {
    const fromTable = ctx.fromVTable;
    const structural = vStruct.schema;

    for (const fk of structural.foreignKeys()) {
      const refKey = fk.refKey;

      // RefSimple = RefPrimary | RefUniq
      if (refKey instanceof RefPrimary || refKey instanceof RefUniq) {
        const refSimple = refKey as { nullable: boolean };
        const ft: FieldType = fk.key.fieldSchemas()![0].type;

        if (isFList(ft)) {
          // --- FList case ---
          const foreignKeyValueMap = ValueUtil.getForeignKeyValueMap(this.cfgValue, fk);
          if (foreignKeyValueMap === null) {
            continue;
          }
          const localList = vStruct.values[fk.keyIndices()![0]] as VList;
          for (const item of localList.valueList) {
            if (!mapContainsKey(foreignKeyValueMap, item)) {
              this.errs.addErr(foreignValueNotFound(
                item,
                ctx.recordId(),
                fk.refTable,
                fk.name,
              ));
            }
          }
        } else if (isFMap(ft)) {
          // --- FMap case ---
          const foreignKeyValueMap = ValueUtil.getForeignKeyValueMap(this.cfgValue, fk);
          if (foreignKeyValueMap === null) {
            continue;
          }
          const localMap = vStruct.values[fk.keyIndices()![0]] as VMap;
          for (const val of localMap.valueMap.values()) {
            if (!mapContainsKey(foreignKeyValueMap, val)) {
              this.errs.addErr(foreignValueNotFound(
                val,
                ctx.recordId(),
                fk.refTable,
                fk.name,
              ));
            }
          }
        } else {
          // --- SimpleType case ---
          const localValue = ValueUtil.extractKeyValue(vStruct, fk.keyIndices()!);

          if (ValueUtil.isValueFromPackOrSepOrJson(localValue)) {
            // Value came from pack/sep/json source
            if (refSimple.nullable) {
              continue;
            }
            const foreignKeyValueMap = ValueUtil.getForeignKeyValueMap(this.cfgValue, fk);
            if (foreignKeyValueMap === null) {
              continue;
            }
            if (!mapContainsKey(foreignKeyValueMap, localValue)) {
              this.errs.addErr(foreignValueNotFound(
                localValue,
                ctx.recordId(),
                fk.refTable,
                fk.name,
              ));
            }
          } else {
            // Value came from cells
            if (ValueUtil.isValueCellsNotAllEmpty(localValue)) {
              // Cells have value — must ref unless special case
              const keyNotEmptyAndNullableRef =
                structural === fromTable.schema &&
                this.isForeignLocalKeyInPrimaryOrUniq(fk, fromTable.schema) &&
                refSimple.nullable;
              if (keyNotEmptyAndNullableRef) {
                continue;
              }

              const numberBe0AndNullableRef =
                ValueUtil.isValueNumber0(localValue) && refSimple.nullable;
              if (numberBe0AndNullableRef) {
                continue;
              }

              const foreignKeyValueMap = ValueUtil.getForeignKeyValueMap(this.cfgValue, fk);
              if (foreignKeyValueMap === null) {
                continue;
              }
              if (!mapContainsKey(foreignKeyValueMap, localValue)) {
                this.errs.addErr(foreignValueNotFound(
                  localValue,
                  ctx.recordId(),
                  fk.refTable,
                  fk.name,
                ));
              }
            } else {
              // Cells all empty
              if (!refSimple.nullable) {
                this.errs.addErr(refNotNullableButCellEmpty(
                  localValue,
                  ctx.recordId(),
                ));
              }
            }
          }
        }
      }
    }

    return true; // continue traversal
  }

  /**
   * Checks if the foreign key's local field is part of the table's primary key
   * or any unique key. Uses reference equality (===) to match Java's `f == pkf`.
   */
  private isForeignLocalKeyInPrimaryOrUniq(
    fk: ForeignKeySchema,
    table: TableSchema,
  ): boolean {
    const fkFields = fk.key.fieldSchemas();
    if (fkFields && fkFields.length === 1) {
      const f = fkFields[0];

      // Check primary key fields
      const pkFields = table.primaryKey.fieldSchemas();
      if (pkFields) {
        for (const pkf of pkFields) {
          if (f === pkf) {
            return true;
          }
        }
      }

      // Check unique key fields
      for (const uk of table.uniqueKeys()) {
        const ukFields = uk.fieldSchemas();
        if (ukFields) {
          for (const ukf of ukFields) {
            if (f === ukf) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }
}
