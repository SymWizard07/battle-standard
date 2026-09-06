import {
  DEFAULT_TOKEN_NAME_COLOR,
  parseTokenNameMarkup,
  type TokenNameSegment,
} from './tokenNameMarkup';

/** Accent for `# heading` lines in token sheet text. */
export const SHEET_HEADING_COLOR = '#fbbf24';

export interface TokenSheetTextLine {
  /** True when the line starts with `#` + whitespace (markdown-style heading). */
  heading: boolean;
  /** Characters before the heading body (`#` + whitespace), empty when not a heading. */
  prefix: string;
  /** Line content after the heading prefix (or the full line). */
  body: string;
  segments: TokenNameSegment[];
}

/**
 * Parse free-text sheet fields (traits / actions / reactions / effects).
 * Supports token-name markup, plus a single heading level: lines starting with `# `.
 */
export function parseTokenSheetText(
  raw: string,
  defaultColor: string = DEFAULT_TOKEN_NAME_COLOR,
): TokenSheetTextLine[] {
  if (raw === '') {
    return [{ heading: false, prefix: '', body: '', segments: [] }];
  }

  return raw.split('\n').map((line) => {
    const match = /^#(\s+)/.exec(line);
    if (match) {
      const prefix = match[0]!;
      const body = line.slice(prefix.length);
      return {
        heading: true,
        prefix,
        body,
        segments: parseTokenNameMarkup(body, defaultColor),
      };
    }
    return {
      heading: false,
      prefix: '',
      body: line,
      segments: parseTokenNameMarkup(line, defaultColor),
    };
  });
}
