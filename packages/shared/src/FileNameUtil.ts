/**
 * 数据文件命名约定解析：从带中文后缀/后缀名的文件名提取 code 名。
 * 原 Java: configgen.util.FileNameUtil
 */
const HAN_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

export function isFirstNotAzChar(name: string): boolean {
  if (name.length === 0) return true;
  const first = name.charCodeAt(0);
  return !((first >= 0x61 && first <= 0x7a) || (first >= 0x41 && first <= 0x5a));
}

export function findFirstHanIndex(s: string): number {
  const match = HAN_REGEX.exec(s);
  return match ? match.index : -1;
}

export function getCodeName(fileName: string): string | null {
  if (fileName.length === 0) {
    return null;
  }

  if (isFirstNotAzChar(fileName)) {
    return null;
  }

  // strip extension
  const dotIdx = fileName.indexOf('.');
  if (dotIdx >= 0) {
    fileName = fileName.substring(0, dotIdx);
  }

  const hanIdx = findFirstHanIndex(fileName);
  if (hanIdx === -1) {
    return fileName.toLowerCase();
  }

  // only take chars before Han, excluding trailing _
  let end = hanIdx;
  if (end > 0 && fileName[end - 1] === '_') {
    end = end - 1;
  }
  return fileName.substring(0, end).toLowerCase();
}
