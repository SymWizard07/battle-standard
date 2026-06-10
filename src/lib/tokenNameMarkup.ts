export interface TokenNameStyle {
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  obfuscated: boolean;
}

export interface TokenNameSegment extends TokenNameStyle {
  text: string;
}

export const DEFAULT_TOKEN_NAME_COLOR = '#f8fafc';

export function expandHex3(hex: string): string {
  const h = hex.toLowerCase();
  return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
}

function cloneStyle(style: TokenNameStyle): TokenNameStyle {
  return { ...style };
}

function pushSegment(segments: TokenNameSegment[], text: string, style: TokenNameStyle) {
  if (!text) return;
  const last = segments[segments.length - 1];
  if (
    last &&
    last.color === style.color &&
    last.bold === style.bold &&
    last.italic === style.italic &&
    last.underline === style.underline &&
    last.strikethrough === style.strikethrough &&
    last.obfuscated === style.obfuscated
  ) {
    last.text += text;
    return;
  }
  segments.push({
    text,
    color: style.color,
    bold: style.bold,
    italic: style.italic,
    underline: style.underline,
    strikethrough: style.strikethrough,
    obfuscated: style.obfuscated,
  });
}

function findClosing(raw: string, start: number, end: number, delimiter: string): number {
  for (let i = start; i < end; i++) {
    if (raw[i] === '\\' && i + 1 < end) {
      i++;
      continue;
    }
    if (raw[i] === delimiter) return i;
  }
  return -1;
}

function parseRange(
  raw: string,
  start: number,
  end: number,
  style: TokenNameStyle,
  defaultColor: string,
  out: TokenNameSegment[],
): void {
  let buf = '';
  let i = start;

  const flush = () => {
    pushSegment(out, buf, style);
    buf = '';
  };

  while (i < end) {
    const ch = raw[i]!;
    if (ch === '\\' && i + 1 < end) {
      buf += raw[i + 1]!;
      i += 2;
      continue;
    }

    if (ch === '#') {
      const hex = raw.slice(i + 1, i + 4);
      if (/^[0-9a-fA-F]{3}$/.test(hex)) {
        flush();
        style = { ...style, color: expandHex3(hex) };
        i += 4;
        continue;
      }
      flush();
      style = { ...style, color: defaultColor };
      i += 1;
      continue;
    }

    if (ch === '*') {
      const close = findClosing(raw, i + 1, end, '*');
      if (close >= 0) {
        flush();
        parseRange(raw, i + 1, close, { ...style, bold: true }, defaultColor, out);
        i = close + 1;
        continue;
      }
    }

    if (ch === '_') {
      const close = findClosing(raw, i + 1, end, '_');
      if (close >= 0) {
        flush();
        parseRange(raw, i + 1, close, { ...style, italic: true }, defaultColor, out);
        i = close + 1;
        continue;
      }
    }

    if (ch === '~') {
      const close = findClosing(raw, i + 1, end, '~');
      if (close >= 0) {
        flush();
        parseRange(raw, i + 1, close, { ...style, underline: true }, defaultColor, out);
        i = close + 1;
        continue;
      }
    }

    if (ch === '-') {
      const close = findClosing(raw, i + 1, end, '-');
      if (close > i + 1) {
        flush();
        parseRange(
          raw,
          i + 1,
          close,
          { ...style, strikethrough: true },
          defaultColor,
          out,
        );
        i = close + 1;
        continue;
      }
    }

    if (ch === '?') {
      const close = findClosing(raw, i + 1, end, '?');
      if (close >= 0) {
        flush();
        parseRange(raw, i + 1, close, { ...style, obfuscated: true }, defaultColor, out);
        i = close + 1;
        continue;
      }
    }

    buf += ch;
    i += 1;
  }

  flush();
}

export function parseTokenNameMarkup(
  raw: string,
  defaultColor: string = DEFAULT_TOKEN_NAME_COLOR,
): TokenNameSegment[] {
  if (!raw) return [];
  const style: TokenNameStyle = {
    color: defaultColor,
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    obfuscated: false,
  };
  const out: TokenNameSegment[] = [];
  parseRange(raw, 0, raw.length, cloneStyle(style), defaultColor, out);
  return out.length > 0 ? out : [{ text: raw, ...style }];
}

export function plainTokenName(raw: string): string {
  return parseTokenNameMarkup(raw).map((segment) => segment.text).join('');
}

export function cssFontWeight(bold: boolean): number | undefined {
  return bold ? 700 : undefined;
}

export function cssFontStyle(italic: boolean): 'italic' | 'normal' | undefined {
  return italic ? 'italic' : undefined;
}

export function konvaFontStyle(segment: Pick<TokenNameSegment, 'bold' | 'italic'>): string {
  if (segment.bold && segment.italic) return 'bold italic';
  if (segment.bold) return 'bold';
  if (segment.italic) return 'italic';
  return 'normal';
}

let measureCanvas: HTMLCanvasElement | null = null;

export function measureTokenNameText(
  text: string,
  fontSize: number,
  segment: Pick<TokenNameSegment, 'bold' | 'italic'>,
  fontFamily = 'system-ui, sans-serif',
): number {
  if (!text) return 0;
  measureCanvas ??= document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return text.length * fontSize * 0.55;
  const weight = segment.bold ? '700' : '400';
  const style = segment.italic ? 'italic' : 'normal';
  ctx.font = `${style} ${weight} ${fontSize}px ${fontFamily}`;
  return ctx.measureText(text).width;
}

export interface TokenNameLayoutLine {
  pieces: Array<{
    text: string;
    x: number;
    width: number;
    segment: TokenNameSegment;
  }>;
  width: number;
  y: number;
}

export function layoutTokenNameInBox(
  raw: string,
  boxWidth: number,
  fontSize: number,
  defaultColor: string = DEFAULT_TOKEN_NAME_COLOR,
  lineHeight = 1.15,
): TokenNameLayoutLine[] {
  const segments = parseTokenNameMarkup(raw, defaultColor);
  type Piece = { text: string; segment: TokenNameSegment; width: number };
  const pieces: Piece[] = [];

  for (const segment of segments) {
    const parts = segment.text.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      pieces.push({
        text: part,
        segment,
        width: measureTokenNameText(part, fontSize, segment),
      });
    }
  }

  const lines: Array<Piece[]> = [];
  let current: Piece[] = [];
  let currentWidth = 0;

  const pushLine = () => {
    if (current.length === 0) return;
    while (current.length > 0 && /^\s+$/.test(current[0]!.text)) {
      current.shift();
    }
    if (current.length > 0) lines.push(current);
    current = [];
    currentWidth = 0;
  };

  for (const piece of pieces) {
    if (/^\s+$/.test(piece.text)) {
      if (current.length > 0) {
        current.push(piece);
        currentWidth += piece.width;
      }
      continue;
    }

    if (piece.width > boxWidth) {
      pushLine();
      let chunk = '';
      for (const char of piece.text) {
        const next = chunk + char;
        const nextWidth = measureTokenNameText(next, fontSize, piece.segment);
        if (nextWidth > boxWidth && chunk) {
          lines.push([
            {
              text: chunk,
              segment: piece.segment,
              width: measureTokenNameText(chunk, fontSize, piece.segment),
            },
          ]);
          chunk = char;
        } else {
          chunk = next;
        }
      }
      if (chunk) {
        current.push({
          text: chunk,
          segment: piece.segment,
          width: measureTokenNameText(chunk, fontSize, piece.segment),
        });
        currentWidth = measureTokenNameText(chunk, fontSize, piece.segment);
      }
      continue;
    }

    if (current.length > 0 && currentWidth + piece.width > boxWidth) {
      pushLine();
    }
    current.push(piece);
    currentWidth += piece.width;
  }
  pushLine();

  const linePx = fontSize * lineHeight;
  return lines.map((line, lineIndex) => {
    const lineWidth = line.reduce((sum, piece) => sum + piece.width, 0);
    let x = Math.max(0, (boxWidth - lineWidth) / 2);
    const laidOut = line.map((piece) => {
      const placed = {
        text: piece.text,
        x,
        width: piece.width,
        segment: piece.segment,
      };
      x += piece.width;
      return placed;
    });
    return {
      pieces: laidOut,
      width: lineWidth,
      y: lineIndex * linePx,
    };
  });
}

export function layoutTokenNameCentered(
  raw: string,
  boxWidth: number,
  boxHeight: number,
  fontSize: number,
  defaultColor: string = DEFAULT_TOKEN_NAME_COLOR,
): TokenNameLayoutLine[] {
  const lineHeight = 1.15;
  const lines = layoutTokenNameInBox(raw, boxWidth, fontSize, defaultColor, lineHeight);
  const linePx = fontSize * lineHeight;
  const totalHeight = lines.length * linePx;
  const offsetY = Math.max(0, (boxHeight - totalHeight) / 2);
  return lines.map((line) => ({ ...line, y: line.y + offsetY }));
}
