/**
 * Run with: npx tsx src/lib/drawText.test.ts
 */
import {
  DEFAULT_DRAW_TEXT_FONT,
  DRAW_TEXT_FONTS,
  drawTextBounds,
  drawTextFontSize,
  drawTextMarqueeSize,
  nextDrawTextFont,
  pointInDrawTextBounds,
} from './drawText';
import { isValidDrawPreview } from './drawShapes';
import type { DrawPreview } from './types';

function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? 'Assertion failed');
}

function runTests(): void {
  assert(drawTextFontSize(4) === 16);
  assert(drawTextFontSize(1) >= 8);
  assert(drawTextFontSize(48) <= 96);
  assert(drawTextFontSize(48) - drawTextFontSize(1) < 48 * 4 - 4);

  let font = DEFAULT_DRAW_TEXT_FONT;
  const seen = new Set<string>();
  for (let i = 0; i < DRAW_TEXT_FONTS.length; i++) {
    font = nextDrawTextFont(font);
    seen.add(font);
  }
  assert(seen.size === DRAW_TEXT_FONTS.length);
  assert(nextDrawTextFont(font) === DEFAULT_DRAW_TEXT_FONT || seen.has(nextDrawTextFont(font)));

  const size = drawTextMarqueeSize('', 16, DEFAULT_DRAW_TEXT_FONT);
  assert(size.width > 0 && size.height > 0);
  const wider = drawTextMarqueeSize('Hello world', 16, DEFAULT_DRAW_TEXT_FONT);
  assert(wider.width >= size.width);

  const origin = { x: 100, y: 200 };
  const bounds = drawTextBounds(
    { origin, text: 'Hi', fontFamily: DEFAULT_DRAW_TEXT_FONT },
    16,
  );
  assert(bounds.maxY === origin.y);
  assert(bounds.minX === origin.x);
  assert(bounds.minY < origin.y);
  assert(
    pointInDrawTextBounds(
      { x: origin.x + 2, y: origin.y - 2 },
      { origin, text: 'Hi', fontFamily: DEFAULT_DRAW_TEXT_FONT },
      16,
    ),
  );
  assert(
    !pointInDrawTextBounds(
      { x: origin.x - 50, y: origin.y },
      { origin, text: 'Hi', fontFamily: DEFAULT_DRAW_TEXT_FONT },
      16,
    ),
  );

  const emptyPreview: DrawPreview = {
    kind: 'text',
    color: '#fff',
    strokeWidth: 16,
    params: { origin, text: '', fontFamily: DEFAULT_DRAW_TEXT_FONT },
  };
  assert(!isValidDrawPreview(emptyPreview));

  const filledPreview: DrawPreview = {
    ...emptyPreview,
    params: { origin, text: 'A', fontFamily: DEFAULT_DRAW_TEXT_FONT },
  };
  assert(isValidDrawPreview(filledPreview));

  console.log('drawText tests passed');
}

runTests();
