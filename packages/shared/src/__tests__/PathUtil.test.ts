import { describe, it, expect } from 'vitest';
import {
  isAbsolute,
  join,
  dirname,
  basename,
  extname,
  relative,
  normalize,
} from '../PathUtil';

// ---------------------------------------------------------------------------
// isAbsolute
// ---------------------------------------------------------------------------
describe('PathUtil.isAbsolute', () => {
  it('POSIX absolute path', () => {
    expect(isAbsolute('/usr/local/bin')).toBe(true);
  });

  it('Windows drive absolute with backslash', () => {
    expect(isAbsolute('C:\\Users\\test')).toBe(true);
  });

  it('Windows drive absolute with forward slash', () => {
    expect(isAbsolute('C:/Users/test')).toBe(true);
  });

  it('UNC path with backslash', () => {
    expect(isAbsolute('\\\\server\\share\\dir')).toBe(true);
  });

  it('UNC path with forward slash', () => {
    expect(isAbsolute('//server/share/dir')).toBe(true);
  });

  it('relative path', () => {
    expect(isAbsolute('foo/bar')).toBe(false);
  });

  it('relative path with backslash', () => {
    expect(isAbsolute('foo\\bar')).toBe(false);
  });

  it('empty string', () => {
    expect(isAbsolute('')).toBe(false);
  });

  it('single dot', () => {
    expect(isAbsolute('.')).toBe(false);
  });

  it('drive letter without path', () => {
    expect(isAbsolute('C:')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// join
// ---------------------------------------------------------------------------
describe('PathUtil.join', () => {
  it('simple join', () => {
    expect(join('a', 'b', 'c')).toBe('a/b/c');
  });

  it('mixed separators', () => {
    expect(join('a\\b', 'c/d', 'e\\f')).toBe('a/b/c/d/e/f');
  });

  it('absolute path in later segment is treated as normal segment', () => {
    // path.join does NOT reset on absolute paths in later arguments
    expect(join('a', '/b', 'c')).toBe('a/b/c');
  });

  it('Windows drive absolute as first argument', () => {
    expect(join('C:\\Users', 'test', 'file.txt')).toBe('C:/Users/test/file.txt');
  });

  it('empty segments are ignored', () => {
    expect(join('', 'a', '', 'b', '')).toBe('a/b');
  });

  it('dot segments are ignored', () => {
    expect(join('a', '.', 'b', '.', 'c')).toBe('a/b/c');
  });

  it('double-dot segments pop previous', () => {
    expect(join('a', 'b', '..', 'c')).toBe('a/c');
  });

  it('double-dot at root stays relative', () => {
    expect(join('..', 'a')).toBe('../a');
  });

  it('all empty returns dot', () => {
    expect(join('', '', '')).toBe('.');
  });

  it('UNC path as first argument', () => {
    // UNC prefix is detected as absolute, but parts won't have drive letter
    // join normalizes \\server\share → //server/share → split → ['server','share']
    // firstIsAbs=true, parts[0]='server' (not drive) → prepends '/'
    expect(join('\\\\server\\share', 'dir')).toBe('/server/share/dir');
  });

  it('Windows drive with double-dot', () => {
    expect(join('C:\\Users', '..', 'Program')).toBe('C:/Program');
  });

  it('trailing separator on drive does not create empty segment', () => {
    expect(join('C:\\', 'Users')).toBe('C:/Users');
  });
});

// ---------------------------------------------------------------------------
// dirname
// ---------------------------------------------------------------------------
describe('PathUtil.dirname', () => {
  it('simple file path', () => {
    expect(dirname('a/b/c.txt')).toBe('a/b');
  });

  it('backslash separators', () => {
    expect(dirname('a\\b\\c.txt')).toBe('a/b');
  });

  it('mixed separators', () => {
    expect(dirname('a\\b/c.txt')).toBe('a/b');
  });

  it('file in root directory', () => {
    expect(dirname('/file.txt')).toBe('/');
  });

  it('relative file without directory', () => {
    expect(dirname('file.txt')).toBe('.');
  });

  it('empty string', () => {
    expect(dirname('')).toBe('.');
  });

  it('Windows drive root', () => {
    expect(dirname('C:\\')).toBe('C:/');
  });

  it('Windows drive root with forward slash', () => {
    expect(dirname('C:/')).toBe('C:/');
  });

  it('nested directory path (trailing no separator)', () => {
    expect(dirname('a/b/c')).toBe('a/b');
  });
});

// ---------------------------------------------------------------------------
// basename
// ---------------------------------------------------------------------------
describe('PathUtil.basename', () => {
  it('simple file with extension', () => {
    expect(basename('a/b/c.txt')).toBe('c.txt');
  });

  it('backslash path', () => {
    expect(basename('a\\b\\c.txt')).toBe('c.txt');
  });

  it('no directory', () => {
    expect(basename('file.txt')).toBe('file.txt');
  });

  it('strip extension with ext parameter', () => {
    expect(basename('a/b/c.txt', '.txt')).toBe('c');
  });

  it('strip extension with backslash path', () => {
    expect(basename('a\\b\\c.txt', '.txt')).toBe('c');
  });

  it('empty string', () => {
    expect(basename('')).toBe('');
  });

  it('trailing slash returns empty', () => {
    expect(basename('a/b/')).toBe('');
  });

  it('ext that does not match', () => {
    expect(basename('a/b/c.txt', '.csv')).toBe('c.txt');
  });
});

// ---------------------------------------------------------------------------
// extname
// ---------------------------------------------------------------------------
describe('PathUtil.extname', () => {
  it('simple extension', () => {
    expect(extname('file.txt')).toBe('.txt');
  });

  it('path with directory', () => {
    expect(extname('a/b/c.csv')).toBe('.csv');
  });

  it('backslash path', () => {
    expect(extname('a\\b\\c.xlsx')).toBe('.xlsx');
  });

  it('no extension', () => {
    expect(extname('file')).toBe('');
  });

  it('hidden file (dot prefix) has no extension', () => {
    expect(extname('.gitignore')).toBe('');
  });

  it('multiple dots — ext is last', () => {
    expect(extname('archive.tar.gz')).toBe('.gz');
  });

  it('empty string', () => {
    expect(extname('')).toBe('');
  });

  it('directory path with trailing slash', () => {
    expect(extname('a/b/')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// relative
// ---------------------------------------------------------------------------
describe('PathUtil.relative', () => {
  it('same directory returns dot', () => {
    expect(relative('/a/b', '/a/b')).toBe('.');
  });

  it('subdirectory', () => {
    expect(relative('/a', '/a/b/c')).toBe('b/c');
  });

  it('parent directory', () => {
    expect(relative('/a/b/c', '/a')).toBe('../..');
  });

  it('sibling directory', () => {
    expect(relative('/a/b', '/a/c')).toBe('../c');
  });

  it('Windows drive path — same drive', () => {
    expect(relative('C:\\Users\\test', 'C:\\Users\\test\\file.txt')).toBe('file.txt');
  });

  it('Windows drive path — different drive returns absolute', () => {
    expect(relative('C:\\Users', 'D:\\Program')).toBe('D:/Program');
  });

  it('relative paths', () => {
    expect(relative('a/b', 'a/c')).toBe('../c');
  });

  it('backslash paths normalized to forward slash', () => {
    expect(relative('a\\b', 'a\\c')).toBe('../c');
  });

  it('empty from returns to normalized', () => {
    expect(relative('', 'a/b')).toBe('a/b');
  });

  it('empty to returns from normalized', () => {
    expect(relative('a/b', '')).toBe('a/b');
  });

  it('both empty returns empty', () => {
    expect(relative('', '')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// normalize
// ---------------------------------------------------------------------------
describe('PathUtil.normalize', () => {
  it('removes leading ./ ', () => {
    expect(normalize('./a/b')).toBe('a/b');
  });

  it('resolves ../ in the middle', () => {
    expect(normalize('a/../b')).toBe('b');
  });

  it('resolves multiple ../', () => {
    expect(normalize('a/b/../../c')).toBe('c');
  });

  it('collapses extra separators', () => {
    expect(normalize('a//b///c')).toBe('a/b/c');
  });

  it('backslash separators converted to forward slash', () => {
    expect(normalize('a\\b\\c')).toBe('a/b/c');
  });

  it('mixed separators', () => {
    expect(normalize('a\\b/c\\d')).toBe('a/b/c/d');
  });

  it('Windows drive letter preserved', () => {
    expect(normalize('C:\\Users\\..\\Program')).toBe('C:/Program');
  });

  it('POSIX absolute path stays absolute', () => {
    expect(normalize('/usr/../local/./bin')).toBe('/local/bin');
  });

  it('Windows drive root with trailing slash', () => {
    expect(normalize('C:\\')).toBe('C:/');
  });

  it('POSIX root', () => {
    expect(normalize('/')).toBe('/');
  });

  it('empty string returns dot', () => {
    expect(normalize('')).toBe('.');
  });

  it('trailing slash removed', () => {
    expect(normalize('a/b/')).toBe('a/b');
  });

  it('leading double-dot on relative path', () => {
    expect(normalize('../a')).toBe('../a');
  });

  it('only dots segments', () => {
    expect(normalize('.')).toBe('.');
  });
});

// ---------------------------------------------------------------------------
// Edge cases: UNC paths, mixed separators, trailing separators
// ---------------------------------------------------------------------------
describe('PathUtil edge cases', () => {
  it('UNC path isAbsolute', () => {
    expect(isAbsolute('\\\\server\\share')).toBe(true);
  });

  it('UNC path with forward slash isAbsolute', () => {
    expect(isAbsolute('//server/share')).toBe(true);
  });

  it('join with all backslashes', () => {
    expect(join('C:\\a\\b', 'c\\d')).toBe('C:/a/b/c/d');
  });

  it('dirname of deep nested mixed-separator path', () => {
    expect(dirname('C:\\Users\\test/file.txt')).toBe('C:/Users/test');
  });

  it('basename of UNC path', () => {
    expect(basename('\\\\server\\share\\file.txt')).toBe('file.txt');
  });

  it('relative between UNC-style paths', () => {
    expect(relative('//a/b', '//a/b/c')).toBe('c');
  });

  it('normalize handles mixed ./ and ../ with drive', () => {
    expect(normalize('C:\\a\\.\\b\\..\\c')).toBe('C:/a/c');
  });

  it('join with leading ./ segments', () => {
    expect(join('./a', './b')).toBe('a/b');
  });
});
