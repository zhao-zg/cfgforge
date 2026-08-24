/**
 * CommentData — TypeScript port of Java `configgen.schema.CommentData`.
 *
 * Encapsulates three parts of a comment: leading, trailing, suffix.
 */

export class CommentData {
  constructor(
    public readonly leading: string,
    trailing: string,
    public readonly suffix: string | null,
  ) {
    // trailing must not contain newlines
    if (trailing.includes('\n')) {
      trailing = trailing.replace(/\n/g, 'LF');
    }
    this._trailing = trailing;
  }

  private _trailing: string;

  get trailing(): string {
    return this._trailing;
  }

  static readonly DELIMITER1 = '>>>';
  static readonly DELIMITER2 = '<<<';

  encode(): string {
    const leadBlank = isBlank(this.leading);
    const trailBlank = isBlank(this._trailing);
    const suffixBlank = this.suffix === null || isBlank(this.suffix);

    if (leadBlank && trailBlank && suffixBlank) {
      return '';
    }

    let res: string;
    if (leadBlank) {
      res = this._trailing;
    } else if (trailBlank) {
      res = this.leading;
      if (!res.includes('\n')) {
        res += '\n';
      }
    } else {
      res = this.leading + CommentData.DELIMITER1 + this._trailing;
    }

    if (!suffixBlank) {
      res += CommentData.DELIMITER2 + this.suffix!;
    }
    return res;
  }

  formatLeading(prefix: string): string {
    return formatLines(this.leading, prefix + '// ');
  }

  formatTrailing(): string {
    return isBlank(this._trailing) ? '' : ' // ' + this._trailing;
  }

  formatSuffix(prefix: string): string {
    return this.suffix !== null ? formatLines(this.suffix, prefix + '\t// ') : '';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isBlank(s: string | null | undefined): boolean {
  if (s === null || s === undefined) return true;
  return s.trim().length === 0;
}

function formatLines(text: string, linePrefix: string): string {
  if (isBlank(text)) return '';
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !isBlank(line))
    .map((line) => linePrefix + line + '\n')
    .join('');
}
