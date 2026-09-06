/**
 * Run with: npx tsx src/lib/tokenImageFit.test.ts
 */
import {
  canonicalFootprintFromAspect,
  coverImageTransform,
  defaultImageTransform,
  isCellRectCenteredOnFootprint,
  isDefaultImageTransform,
  outlineFromCellRect,
  recenterCellRectOnFootprint,
  scaleAppearanceBetweenFootprints,
  scaleCellRectFromMidEdge,
  translateCellRect,
  nudgeCellRect,
} from './tokenImageFit';

function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) throw new Error(message ?? 'Assertion failed');
}

function nearly(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) < eps;
}

const start = { offset: { x: 0, y: 0 }, size: { w: 2, h: 1 } };

{
  const next = scaleCellRectFromMidEdge(start, 'e', { x: 0.5, y: 0 }, true);
  assert(nearly(next.size.w, 3));
  assert(nearly(next.size.h, 1.5));
  assert(nearly(next.offset.x + next.size.w / 2, 1));
  assert(nearly(next.offset.y + next.size.h / 2, 0.5));
}

{
  const next = scaleCellRectFromMidEdge(start, 'e', { x: 1, y: 0 }, false);
  assert(nearly(next.offset.x, 0));
  assert(nearly(next.size.w, 3));
  assert(nearly(next.size.h, 1));
}

{
  // Portrait lock: south scale grows both axes with natural aspect (no vertical-only stretch).
  const square = { offset: { x: 0, y: 0 }, size: { w: 1, h: 1 } };
  const next = scaleCellRectFromMidEdge(square, 's', { x: 0, y: 0.5 }, true, 0.5);
  assert(nearly(next.size.h, 2));
  assert(nearly(next.size.w, 1));
  assert(nearly(next.offset.x + next.size.w / 2, 0.5));
  assert(nearly(next.offset.y + next.size.h / 2, 0.5));
}

{
  const covered = coverImageTransform({ w: 1, h: 1 }, 0.5);
  assert(nearly(covered.size.w, 1));
  assert(nearly(covered.size.h, 2));
  assert(nearly(covered.offset.y, -0.5));
  assert(isDefaultImageTransform({ w: 1, h: 1 }, defaultImageTransform({ w: 1, h: 1 })));
  assert(!isDefaultImageTransform({ w: 1, h: 1 }, covered));
}

{
  const moved = { offset: { x: 0.25, y: -0.5 }, size: { w: 2, h: 1 } };
  assert(!isCellRectCenteredOnFootprint({ w: 1, h: 1 }, moved));
  const centered = recenterCellRectOnFootprint({ w: 1, h: 1 }, moved);
  assert(isCellRectCenteredOnFootprint({ w: 1, h: 1 }, centered));
  assert(nearly(centered.size.w, 2) && nearly(centered.size.h, 1));
  assert(nearly(centered.offset.x, -0.5));
  assert(nearly(centered.offset.y, 0));
}

{
  const next = translateCellRect(start, { x: 0.25, y: -0.5 });
  assert(nearly(next.offset.x, 0.25));
  assert(nearly(next.offset.y, -0.5));
}

{
  const next = nudgeCellRect(start, 'ArrowRight', 0.125);
  assert(nearly(next.offset.x, 0.125));
}

{
  const circle = outlineFromCellRect(
    { offset: { x: 0, y: 0 }, size: { w: 2, h: 1 } },
    'circle',
  );
  assert(circle.shape === 'circle');
  assert(nearly(circle.size.w, 2));
  assert(nearly(circle.size.h, 2));
}

{
  const t = defaultImageTransform({ w: 3, h: 2 });
  assert(t.size.w === 3 && t.size.h === 2);
}

{
  const square = canonicalFootprintFromAspect(1);
  assert(nearly(square.w, 1) && nearly(square.h, 1));
  const wide = canonicalFootprintFromAspect(2);
  assert(nearly(wide.w, 2) && nearly(wide.h, 1));
  const tall = canonicalFootprintFromAspect(0.5);
  assert(nearly(tall.w, 1) && nearly(tall.h, 2));
}

{
  const from = { w: 2, h: 1 };
  const to = { w: 4, h: 2 };
  const scaled = scaleAppearanceBetweenFootprints(from, to, {
    imageTransform: { offset: { x: 0.25, y: -0.5 }, size: { w: 2, h: 1 } },
    outline: {
      shape: 'rect',
      offset: { x: 0.1, y: 0.2 },
      size: { w: 1.5, h: 0.8 },
    },
  });
  assert(nearly(scaled.imageTransform.offset.x, 0.5));
  assert(nearly(scaled.imageTransform.offset.y, -1));
  assert(nearly(scaled.imageTransform.size.w, 4));
  assert(nearly(scaled.imageTransform.size.h, 2));
  assert(nearly(scaled.outline.offset.x, 0.2));
  assert(nearly(scaled.outline.offset.y, 0.4));
  assert(nearly(scaled.outline.size.w, 3));
  assert(nearly(scaled.outline.size.h, 1.6));
  assert(scaled.outline.shape === 'rect');
}

console.log('tokenImageFit.test.ts: ok');
