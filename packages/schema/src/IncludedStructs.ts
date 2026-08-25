/**
 * IncludedStructs — TypeScript port of Java `configgen.schema.IncludedStructs`.
 *
 * BFS-based structural inclusion traversal used by HasRef/HasBlock/HasMap/HasText
 * to determine whether a Nameable transitively contains a property.
 */

import type { Nameable } from './Nameable';
import type { Fieldable } from './Fieldable';
import { StructSchema } from './StructSchema';
import { TableSchema } from './TableSchema';
import { InterfaceSchema } from './InterfaceSchema';
import type { Structural } from './Structural';
import { foreachFieldStructRef } from './ForeachSchema';

export enum CheckResult {
  Ok,
  Fail,
  Unknown,
}

export type Checker = (nameable: Nameable) => CheckResult;

const unknownChecker: Checker = () => CheckResult.Unknown;

export function findAllIncludedStructs(nameable: Nameable): Map<string, Nameable> {
  const result = new Map<string, Nameable>();
  checkAnyOkInternal(nameable, unknownChecker, result);
  return result;
}

export function checkAnyOk(nameable: Nameable, checker: Checker): boolean {
  return checkAnyOkInternal(nameable, checker, new Map<string, Nameable>());
}

export function checkAnyOkInternal(
  nameable: Nameable,
  checker: Checker,
  checked: Map<string, Nameable>,
): boolean {
  let frontiers: Map<string, Nameable> = new Map();
  frontiers.set(nameable.fullName(), nameable);

  while (frontiers.size > 0) {
    const unknownFrontiers: Nameable[] = [];

    for (const frontier of frontiers.values()) {
      const res = checker(frontier);
      switch (res) {
        case CheckResult.Ok:
          return true;
        case CheckResult.Fail:
          break;
        case CheckResult.Unknown:
          unknownFrontiers.push(frontier);
          break;
      }
    }

    // merge frontiers into checked
    for (const [k, v] of frontiers) {
      checked.set(k, v);
    }

    const newFrontiers = new Map<string, Nameable>();
    for (const frontier of unknownFrontiers) {
      // expand
      if (frontier instanceof InterfaceSchema) {
        for (const impl of frontier.impls()) {
          const fn = impl.fullName();
          if (!checked.has(fn)) {
            newFrontiers.set(fn, impl);
          }
        }
      } else if (isStructural(frontier)) {
        for (const field of frontier.fields()) {
          foreachFieldStructRef(field, (obj) => {
            if (obj) {
              const fn = obj.fullName();
              if (!checked.has(fn)) {
                newFrontiers.set(fn, obj);
              }
            }
          });
        }
      }
    }

    frontiers = newFrontiers;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function isStructural(item: Nameable): item is Structural {
  return item instanceof StructSchema || item instanceof TableSchema;
}
