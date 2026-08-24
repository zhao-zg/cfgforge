/**
 * 字符串工具函数。
 * 原 Java: configgen.util.StringUtil
 */

export function upper1(value: string): string {
  return value.substring(0, 1).toUpperCase() + value.substring(1);
}

export function lower1(value: string): string {
  return value.substring(0, 1).toLowerCase() + value.substring(1);
}

export function removeLineSep(value: string): string {
  return value.replace(/\n/g, '---');
}

export function underscoreToPascalCase(input: string): string {
  if (!input) return input;

  let result = '';
  let capitalizeNext = true;

  for (const currentChar of input) {
    if (currentChar === '_') {
      capitalizeNext = true;
    } else {
      if (capitalizeNext) {
        result += currentChar.toUpperCase();
        capitalizeNext = false;
      } else {
        result += currentChar;
      }
    }
  }

  return result;
}

/**
 * 将名称转为 SCREAMING_SNAKE_CASE（枚举常量风格）。
 * 兼容 camelCase 与已含下划线的输入。
 * 连续大写按缩写词处理，不在中间拆分。
 * 多个连续下划线合并为一个，前导/尾随下划线丢弃；结果全部大写。
 */
export function toScreamingSnakeCase(input: string): string {
  if (!input) return input;

  let result = '';
  let pendingSeparator = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];

    if (c === '_') {
      pendingSeparator = true;
      continue;
    }

    if (result.length > 0) {
      const prev = input[i - 1];
      const prevLower = prev >= 'a' && prev <= 'z';
      const prevUpper = prev >= 'A' && prev <= 'Z';
      const curUpper = c >= 'A' && c <= 'Z';
      const nextLower = i + 1 < input.length && input[i + 1] >= 'a' && input[i + 1] <= 'z';

      if (pendingSeparator || (prevLower && curUpper) || (prevUpper && curUpper && nextLower)) {
        result += '_';
      }
    }
    result += c.toUpperCase();
    pendingSeparator = false;
  }

  return result;
}
