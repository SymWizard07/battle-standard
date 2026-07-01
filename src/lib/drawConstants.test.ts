/**
 * Runnable with: npx tsx src/lib/drawConstants.test.ts
 */
import {
  DRAW_STROKE_WIDTH_DEFAULT,
  DRAW_STROKE_WIDTH_MAX,
  DRAW_STROKE_WIDTH_MIN,
  DRAW_OUTLINE_SLIDER_DIVISIONS,
  drawStrokeWidthFromSliderRelease,
  drawStrokeWidthKeyboardDelta,
  drawStrokeWidthToSlider,
  outlineSliderPositionFromIndex,
  sliderToDrawStrokeWidth,
  stepDrawStrokeWidth,
} from './drawConstants';

function assertEqual(actual: number, expected: number, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${expected} but got ${actual}`);
  }
}

function assertNull(actual: number | null, message?: string): void {
  if (actual !== null) throw new Error(message ?? `Expected null but got ${actual}`);
}

assertEqual(drawStrokeWidthToSlider(DRAW_STROKE_WIDTH_DEFAULT), 50, 'default at center');
assertEqual(
  sliderToDrawStrokeWidth(50),
  DRAW_STROKE_WIDTH_DEFAULT,
  'center maps to default',
);
assertEqual(
  sliderToDrawStrokeWidth(0),
  DRAW_STROKE_WIDTH_MIN,
  'slider min maps to stroke min',
);
assertEqual(
  sliderToDrawStrokeWidth(100),
  DRAW_STROKE_WIDTH_MAX,
  'slider max maps to stroke max',
);

assertEqual(
  drawStrokeWidthFromSliderRelease(50),
  DRAW_STROKE_WIDTH_DEFAULT,
  'release at center snaps to default',
);
assertEqual(
  drawStrokeWidthFromSliderRelease(52),
  DRAW_STROKE_WIDTH_DEFAULT,
  'release near center snaps to default',
);
assertEqual(
  drawStrokeWidthFromSliderRelease(45),
  sliderToDrawStrokeWidth(45),
  'release away from center does not snap',
);

for (let i = 0; i <= DRAW_OUTLINE_SLIDER_DIVISIONS; i++) {
  const pos = outlineSliderPositionFromIndex(i);
  assertEqual(pos, (i / DRAW_OUTLINE_SLIDER_DIVISIONS) * 100, `index ${i} position`);
  const roundTrip = sliderToDrawStrokeWidth(drawStrokeWidthToSlider(sliderToDrawStrokeWidth(pos)));
  assertEqual(roundTrip, sliderToDrawStrokeWidth(pos), `round-trip at index ${i}`);
}

assertEqual(outlineSliderPositionFromIndex(DRAW_OUTLINE_SLIDER_DIVISIONS), 100, 'max index reaches end');

assertEqual(
  stepDrawStrokeWidth(DRAW_STROKE_WIDTH_DEFAULT, 1),
  sliderToDrawStrokeWidth(outlineSliderPositionFromIndex(4)),
  '+ steps to next slider stop',
);
assertEqual(stepDrawStrokeWidth(DRAW_STROKE_WIDTH_DEFAULT, -1), 3, '- steps to previous slider stop');
assertEqual(drawStrokeWidthKeyboardDelta({ code: 'Equal', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })!, 1);
assertEqual(drawStrokeWidthKeyboardDelta({ code: 'Minus', shiftKey: true, ctrlKey: false, metaKey: false, altKey: false })!, -2);
assertNull(drawStrokeWidthKeyboardDelta({ code: 'Equal', shiftKey: false, ctrlKey: true, metaKey: false, altKey: false }));

console.log('drawConstants.test.ts: all passed');
