/**
 * Run with: npx tsx src/lib/tokenScale.test.ts
 */
import { GRID_SIZE_PX } from './fixedGrid';
import {
  footprintAndPlacementFromCornerDrag,
  scaleTokenAppearanceForFootprint,
} from './tokenScale';

function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? 'Assertion failed');
}

function nearly(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) < eps;
}

{
  const scaled = scaleTokenAppearanceForFootprint(
    { w: 1, h: 1 },
    { w: 2, h: 2 },
    {
      imageTransform: { offset: { x: 0, y: 0 }, size: { w: 1, h: 1 } },
      outline: {
        shape: 'rect',
        offset: { x: 0.1, y: 0.1 },
        size: { w: 0.8, h: 0.8 },
      },
    },
  );
  assert(nearly(scaled.imageTransform!.size.w, 2));
  assert(nearly(scaled.imageTransform!.size.h, 2));
  assert(nearly(scaled.outline!.offset.x, 0.2));
  assert(nearly(scaled.outline!.size.w, 1.6));
}

{
  // Outline-aware drag: doubling the marquee from SE should roughly double footprint.
  const startFp = { w: 1, h: 1 };
  const outline = {
    shape: 'rect' as const,
    offset: { x: 0, y: 0 },
    size: { w: 1, h: 1 },
  };
  const fixed = { x: 0, y: 0 };
  const pointer = {
    x: 2 * GRID_SIZE_PX + 4,
    y: 2 * GRID_SIZE_PX + 4,
  };
  const { footprint } = footprintAndPlacementFromCornerDrag(
    'se',
    fixed,
    pointer,
    undefined,
    startFp,
    null,
    0,
    { x: 0, y: 0 },
    outline,
  );
  assert(nearly(footprint.w, 2, 0.05), `expected ~2 got ${footprint.w}`);
  assert(nearly(footprint.h, 2, 0.05), `expected ~2 got ${footprint.h}`);
}

console.log('tokenScale.test.ts: ok');
