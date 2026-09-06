import type { DrawTextParams, Point, WorldBounds } from './types';

/** Fun / diverse stacks — Lacquer & MedievalSharp load from Google Fonts. */
export const DRAW_TEXT_FONTS = [
  'Georgia, "Times New Roman", serif',
  'Impact, Haettenschweiler, "Arial Black", sans-serif',
  'Lacquer, cursive',
  '"Courier New", Courier, monospace',
  'MedievalSharp, "Palatino Linotype", Palatino, serif',
  '"Trebuchet MS", "Lucida Sans Unicode", sans-serif',
  '"Segoe Print", "Bradley Hand", cursive',
] as const;

export type DrawTextFont = (typeof DRAW_TEXT_FONTS)[number];

export const DEFAULT_DRAW_TEXT_FONT: DrawTextFont = DRAW_TEXT_FONTS[0];

const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 96;
/** Base size so default outline (4) stays ~16; each outline step adds less than before. */
const FONT_SIZE_BASE = 12;
const FONT_SIZE_PER_OUTLINE = 1;

let measureCanvas: HTMLCanvasElement | null = null;

export function drawTextFontSize(outlineWidth: number): number {
  const size = Math.round(FONT_SIZE_BASE + outlineWidth * FONT_SIZE_PER_OUTLINE);
  return Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, size));
}

export function nextDrawTextFont(current: string): DrawTextFont {
  const idx = DRAW_TEXT_FONTS.findIndex((f) => f === current);
  const next = idx < 0 ? 0 : (idx + 1) % DRAW_TEXT_FONTS.length;
  return DRAW_TEXT_FONTS[next]!;
}

export type DrawTextStyleFlags = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

/** Konva `fontStyle` value. */
export function drawTextKonvaFontStyle(style: DrawTextStyleFlags): string {
  const bold = !!style.bold;
  const italic = !!style.italic;
  if (bold && italic) return 'italic bold';
  if (bold) return 'bold';
  if (italic) return 'italic';
  return 'normal';
}

export function drawTextCanvasFont(
  fontSize: number,
  fontFamily: string,
  style: DrawTextStyleFlags = {},
): string {
  return `${drawTextKonvaFontStyle(style)} ${fontSize}px ${fontFamily}`.trim();
}

export function measureDrawTextWidth(
  text: string,
  fontSize: number,
  fontFamily: string,
  style: DrawTextStyleFlags = {},
): number {
  if (text.length === 0) return 0;
  if (typeof document !== 'undefined') {
    if (!measureCanvas) measureCanvas = document.createElement('canvas');
    const ctx = measureCanvas.getContext('2d');
    if (ctx) {
      ctx.font = drawTextCanvasFont(fontSize, fontFamily, style);
      return Math.max(ctx.measureText(text).width, fontSize * 0.5);
    }
  }
  const weight = style.bold ? 0.7 : 0.62;
  return Math.max(text.length * fontSize * weight, fontSize * 0.5);
}

export function drawTextMarqueeSize(
  text: string,
  fontSize: number,
  fontFamily: string,
  style: DrawTextStyleFlags = {},
): { width: number; height: number; padX: number; padY: number } {
  const padX = Math.max(4, fontSize * 0.2);
  const padY = Math.max(3, fontSize * 0.15);
  const textWidth = measureDrawTextWidth(text, fontSize, fontFamily, style);
  const minWidth = measureDrawTextWidth('MMM', fontSize, fontFamily, style);
  const height = fontSize * 1.35 + padY * 2;
  const width = Math.max(minWidth, textWidth) + padX * 2;
  return { width, height, padX, padY };
}

/** Axis-aligned bounds for the text marquee (origin = bottom-left). */
export function drawTextBounds(
  params: DrawTextParams,
  fontSize: number,
): WorldBounds {
  const { width, height } = drawTextMarqueeSize(
    params.text,
    fontSize,
    params.fontFamily,
    params,
  );
  return {
    minX: params.origin.x,
    minY: params.origin.y - height,
    maxX: params.origin.x + width,
    maxY: params.origin.y,
  };
}

export function drawTextTopLeft(
  params: DrawTextParams,
  fontSize: number,
): Point {
  const { height, padX, padY } = drawTextMarqueeSize(
    params.text,
    fontSize,
    params.fontFamily,
    params,
  );
  return {
    x: params.origin.x + padX,
    y: params.origin.y - height + padY,
  };
}

export function pointInDrawTextBounds(
  world: Point,
  params: DrawTextParams,
  fontSize: number,
  pad = 0,
): boolean {
  const b = drawTextBounds(params, fontSize);
  return (
    world.x >= b.minX - pad &&
    world.x <= b.maxX + pad &&
    world.y >= b.minY - pad &&
    world.y <= b.maxY + pad
  );
}

export function isDrawTextParams(params: unknown): params is DrawTextParams {
  if (!params || typeof params !== 'object') return false;
  const p = params as DrawTextParams;
  return (
    typeof p.text === 'string' &&
    typeof p.fontFamily === 'string' &&
    !!p.origin &&
    typeof p.origin.x === 'number' &&
    typeof p.origin.y === 'number'
  );
}
