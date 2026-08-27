/**
 * PathUtil — 分隔符无关的路径工具函数。
 *
 * 问题：`path-browserify`（Vite polyfill）是纯 POSIX 实现，只认 `/` 分隔符。
 * 当 Tauri 传入 Windows 路径（`\` 分隔符）时，`path.join`/`path.dirname`/
 * `path.relative` 等函数会产生混用分隔符的路径，导致 Tauri FS API 无法正确匹配文件。
 *
 * 解决：本模块提供同时处理 `/` 和 `\` 的路径函数，在所有环境中行为一致。
 * 异步代码路径（Tauri WebView 环境）使用本模块替代 Node `path` 模块。
 * 同步代码路径（Node 环境）仍使用原生 `path` 模块，行为正确无需替换。
 *
 * 原 Java: 无对应类（Java Path 天生跨平台）
 */

/**
 * 检测路径是否为绝对路径（支持 Windows drive 路径和 POSIX 根路径）。
 */
export function isAbsolute(p: string): boolean {
  if (!p) return false;
  // POSIX absolute: /xxx
  if (p.startsWith('/')) return true;
  // Windows drive absolute: C:\xxx or C:/xxx
  if (p.length >= 3 && p[1] === ':' && (p[2] === '\\' || p[2] === '/')) return true;
  // UNC: \\server\share
  if (p.startsWith('\\\\') || p.startsWith('//')) return true;
  return false;
}

/**
 * 拼接路径（等价 path.join），同时处理 `/` 和 `\` 分隔符。
 * 空段被忽略；`.` 段被忽略；`..` 段回退一级。
 */
export function join(...paths: string[]): string {
  const parts: string[] = [];
  let firstIsAbs = false; // 第一个路径是否为绝对路径（/ 开头或 C:\ 开头）

  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    if (!p) continue;
    if (i === 0) {
      // POSIX absolute: /xxx
      if (p.startsWith('/')) firstIsAbs = true;
      // Windows drive absolute: C:\xxx or C:/xxx
      if (p.length >= 3 && p[1] === ':' && (p[2] === '\\' || p[2] === '/')) firstIsAbs = true;
      // UNC: \\server\share
      if (p.startsWith('\\\\') || p.startsWith('//')) firstIsAbs = true;
    }
    // 统一分隔符后拆分
    const norm = p.replace(/\\/g, '/');
    for (const seg of norm.split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') {
        // At root level with no parts: keep the .. segment
        if (parts.length === 0) {
          parts.push(seg);
          continue;
        }
        // Don't pop drive letter prefix (e.g. C:)
        if (parts[parts.length - 1] !== '..' && parts[parts.length - 1].length !== 2) {
          parts.pop();
        }
        continue;
      }
      parts.push(seg);
    }
  }

  if (parts.length === 0) return '.';

  const result = parts.join('/');
  if (firstIsAbs) {
    // 检查 parts[0] 是否已经是 drive letter（如 C:）
    if (parts[0].length === 2 && parts[0][1] === ':') {
      return result; // 已经包含 drive，如 C:/Users/...
    }
    return '/' + result; // POSIX 绝对路径
  }
  return result;
}

/**
 * 获取路径的目录部分（等价 path.dirname），同时处理 `/` 和 `\` 分隔符。
 */
export function dirname(p: string): string {
  if (!p) return '.';
  const norm = p.replace(/\\/g, '/');
  const idx = norm.lastIndexOf('/');
  if (idx < 0) return '.';
  // Windows drive root: 'C:/'
  if (idx === 2 && norm.length === 3 && norm[1] === ':') return norm;
  // POSIX root: '/'
  if (idx === 0) return '/';
  // Return with unified forward-slash separators
  return norm.substring(0, idx).replace(/\/$/, '') || '.';
}

/**
 * 获取路径的文件名部分（等价 path.basename），同时处理 `/` 和 `\` 分隔符。
 * 可选 ext 参数用于去除扩展名。
 */
export function basename(p: string, ext?: string): string {
  if (!p) return '';
  const norm = p.replace(/\\/g, '/');
  const lastSlash = norm.lastIndexOf('/');
  let name = lastSlash >= 0 ? norm.substring(lastSlash + 1) : norm;
  if (ext && name.endsWith(ext)) {
    name = name.substring(0, name.length - ext.length);
  }
  return name;
}

/**
 * 获取文件扩展名（等价 path.extname），同时处理 `/` 和 `\` 分隔符。
 */
export function extname(p: string): string {
  if (!p) return '';
  const base = basename(p);
  const idx = base.lastIndexOf('.');
  if (idx <= 0) return ''; // 隐藏文件如 .git 不算扩展名
  return base.substring(idx);
}

/**
 * 计算从 from 到 to 的相对路径（等价 path.relative），同时处理 `/` 和 `\` 分隔符。
 * 返回路径使用 `/` 分隔符（适合作为 cfgFiles Map 的 key）。
 */
export function relative(from: string, to: string): string {
  if (!from && !to) return '';
  if (!from) return to.replace(/\\/g, '/');
  if (!to) return from.replace(/\\/g, '/');

  // 统一分隔符
  const fromNorm = from.replace(/\\/g, '/').replace(/\/$/, '');
  const toNorm = to.replace(/\\/g, '/').replace(/\/$/, '');

  // Windows drive 路径特殊处理
  const fromDrive = fromNorm.length >= 2 && fromNorm[1] === ':' ? fromNorm.substring(0, 2) : '';
  const toDrive = toNorm.length >= 2 && toNorm[1] === ':' ? toNorm.substring(0, 2) : '';

  // 不同 drive 直接返回绝对路径
  if (fromDrive && toDrive && fromDrive !== toDrive) {
    return toNorm;
  }

  const fromParts = fromDrive ? fromNorm.substring(2).split('/').filter(p => p && p !== '.') : fromNorm.split('/').filter(p => p && p !== '.');
  const toParts = toDrive ? toNorm.substring(2).split('/').filter(p => p && p !== '.') : toNorm.split('/').filter(p => p && p !== '.');

  // 找到公共前缀
  let commonLen = 0;
  while (commonLen < fromParts.length && commonLen < toParts.length && fromParts[commonLen] === toParts[commonLen]) {
    commonLen++;
  }

  // 构建相对路径
  const upCount = fromParts.length - commonLen;
  const remaining = toParts.slice(commonLen);

  const segments: string[] = [];
  for (let i = 0; i < upCount; i++) segments.push('..');
  segments.push(...remaining);

  if (segments.length === 0) return '.';
  return segments.join('/');
}

/**
 * 规范化路径（等价 path.normalize），同时处理 `/` 和 `\` 分隔符。
 */
export function normalize(p: string): string {
  if (!p) return '.';
  const isAbs = p.startsWith('/') || (p.length >= 3 && p[1] === ':' && (p[2] === '\\' || p[2] === '/'));
  const hasDrive = p.length >= 2 && p[1] === ':';
  const drive = hasDrive ? p.substring(0, 2) : '';

  const norm = p.replace(/\\/g, '/');
  const parts = (hasDrive ? norm.substring(2) : norm).split('/');
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      // At root level with nothing resolved: keep the .. segment
      if (resolved.length === 0) {
        resolved.push(part);
        continue;
      }
      if (resolved[resolved.length - 1] !== '..') {
        resolved.pop();
      }
      continue;
    }
    resolved.push(part);
  }

  if (resolved.length === 0) {
    if (hasDrive) return drive + '/';
    return isAbs ? '/' : '.';
  }

  const result = resolved.join('/');
  if (hasDrive) return drive + '/' + result;
  if (isAbs) return '/' + result;
  return result;
}
