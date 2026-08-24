/**
 * 逗号分隔键值解析。
 * 原 Java: configgen.util.ArgParser
 */

export interface IdAndMap {
  id: string;
  map: Map<string, string | null>;
}

function parseMap(sp: string[], fromIndex: number): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (let i = fromIndex; i < sp.length; i++) {
    const s = sp[i];
    let c = s.indexOf(':');
    if (c === -1) {
      c = s.indexOf('=');
    }

    if (c === -1) {
      map.set(s.trim().toLowerCase(), null);
    } else {
      map.set(s.substring(0, c).trim().toLowerCase(), s.substring(c + 1).trim());
    }
  }
  return map;
}

export function parseToIdAndMap(arg: string): IdAndMap {
  const sp = arg.split(',');
  return { id: sp[0], map: parseMap(sp, 1) };
}

export function parseToMap(arg: string | null | undefined): Map<string, string | null> {
  if (!arg || arg.length === 0) {
    return new Map();
  }
  const sp = arg.split(',');
  return parseMap(sp, 0);
}

export function parseToSet(arg: string | null | undefined): Set<string> {
  if (!arg || arg.length === 0) {
    return new Set();
  }
  const sp = arg.split(',');
  return new Set(sp);
}
