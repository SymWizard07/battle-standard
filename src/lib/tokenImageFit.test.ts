/**
 * Run with: npx tsx src/lib/tokenImageFit.test.ts
 */
import {
  canonicalFootprintFromAspect,
  clampCropRectInsideImage,
  clampImageTransformToCoverFootprint,
  coverImageTransform,
  defaultImageTransform,
  defaultOutline,
  appearanceFromCropRect,
  imageTransformCoversFootprint,
  isCellRectCenteredOnFootprint,
  isDefaultImageTransform,
  outlineFromCellRect,
  recenterCellRectOnFootprint,
  recenterCropRectOnImage,
  scaleAppearanceBetweenFootprints,
  scaleCellRectFromMidEdge,
  scaleCropRectFromCorner,
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

{
  const fp = { w: 1, h: 1 };
  const cover = coverImageTransform(fp, 2);
  assert(imageTransformCoversFootprint(cover, fp));
  assert(nearly(cover.size.w, 2) && nearly(cover.size.h, 1));

  const shifted = clampImageTransformToCoverFootprint(
    { offset: { x: -0.25, y: 0.5 }, size: { w: 2, h: 1 } },
    fp,
    2,
  );
  assert(imageTransformCoversFootprint(shifted, fp));
  assert(nearly(shifted.size.w, 2) && nearly(shifted.size.h, 1));
  assert(shifted.offset.y <= 1e-6);
  assert(shifted.offset.y + shifted.size.h >= fp.h - 1e-6);

  const tooSmall = clampImageTransformToCoverFootprint(
    { offset: { x: 0.2, y: 0.2 }, size: { w: 0.5, h: 0.25 } },
    fp,
    2,
  );
  assert(imageTransformCoversFootprint(tooSmall, fp));
  assert(tooSmall.size.w + 1e-6 >= cover.size.w);

  // Growing a square stretch to wide cover must center, not pin to (0,0).
  const fromSquare = clampImageTransformToCoverFootprint(
    { offset: { x: 0, y: 0 }, size: { w: 1, h: 1 } },
    fp,
    2,
  );
  assert(imageTransformCoversFootprint(fromSquare, fp));
  assert(nearly(fromSquare.offset.x, (fp.w - fromSquare.size.w) / 2));
  assert(nearly(fromSquare.offset.y, (fp.h - fromSquare.size.h) / 2));
  assert(isCellRectCenteredOnFootprint(fp, fromSquare));

  const recentered = recenterCellRectOnFootprint(fp, {
    offset: { x: 0, y: 0 },
    size: { w: 2, h: 1 },
  });
  assert(nearly(recentered.offset.x, -0.5));
  assert(nearly(recentered.offset.y, 0));
  assert(isCellRectCenteredOnFootprint(fp, recentered));
}

{
  const fp = { w: 1, h: 1 };
  const base = { offset: { x: -0.5, y: 0 }, size: { w: 2, h: 1 } };
  const crop0 = { offset: { x: 0, y: 0 }, size: { w: 1, h: 1 } };
  const cut0 = appearanceFromCropRect(base, crop0, fp, defaultOutline(fp));
  assert(nearly(cut0.footprint.w, 1) && nearly(cut0.footprint.h, 1));
  assert(nearly(cut0.imageTransform.offset.x, -0.5));
  assert(nearly(cut0.imageTransform.size.w, 2));

  // Move crop right → rebase offset; footprint stays crop size (no stretch).
  const moved = appearanceFromCropRect(
    base,
    { offset: { x: 0.25, y: 0 }, size: { w: 1, h: 1 } },
    fp,
    defaultOutline(fp),
  );
  assert(nearly(moved.imageTransform.offset.x, -0.75));
  assert(nearly(moved.imageTransform.size.w, 2));
  assert(nearly(moved.footprint.w, 1));

  // Smaller free-aspect crop becomes the new footprint size (cuts, does not stretch).
  const trimmed = appearanceFromCropRect(
    base,
    { offset: { x: 0, y: 0 }, size: { w: 0.5, h: 1 } },
    fp,
    defaultOutline(fp),
  );
  assert(nearly(trimmed.footprint.w, 0.5) && nearly(trimmed.footprint.h, 1));
  assert(nearly(trimmed.imageTransform.size.w, 2));
  assert(nearly(trimmed.imageTransform.size.h, 1));
  assert(nearly(trimmed.imageTransform.offset.x, -0.5));

  const inside = clampCropRectInsideImage(
    { offset: { x: -1, y: -1 }, size: { w: 1.5, h: 1.5 } },
    base,
  );
  assert(inside.offset.x >= base.offset.x - 1e-6);
  assert(inside.offset.y >= base.offset.y - 1e-6);
  assert(inside.offset.x + inside.size.w <= base.offset.x + base.size.w + 1e-6);

  const cornered = scaleCropRectFromCorner(
    crop0,
    'se',
    { x: -0.25, y: 0 },
    false,
  );
  assert(nearly(cornered.size.w, 0.75));
  assert(nearly(cornered.size.h, 1));

  // Soft snap: within ~8% of square → snap shorter side up to longer.
  const nearSquare = scaleCropRectFromCorner(
    { offset: { x: 0, y: 0 }, size: { w: 1, h: 1 } },
    'se',
    { x: 0.04, y: 0 },
    false,
  );
  assert(nearly(nearSquare.size.w, nearSquare.size.h));
  assert(nearly(nearSquare.size.w, 1.04));

  const farFromSquare = scaleCropRectFromCorner(
    { offset: { x: 0, y: 0 }, size: { w: 1, h: 1 } },
    'se',
    { x: 0.5, y: 0 },
    false,
  );
  assert(nearly(farFromSquare.size.w, 1.5));
  assert(nearly(farFromSquare.size.h, 1));

  const centeredCrop = recenterCropRectOnImage(
    { offset: { x: 0, y: 0 }, size: { w: 0.5, h: 0.5 } },
    base,
  );
  assert(nearly(centeredCrop.offset.x, base.offset.x + base.size.w / 2 - 0.25));
  assert(nearly(centeredCrop.offset.y, base.offset.y + base.size.h / 2 - 0.25));
}

{
  // bakeCroppedImageBlob needs a DOM image; unit-test the cell→pixel math via appearance cut.
  const fp = { w: 1, h: 1 };
  const base = { offset: { x: -0.5, y: 0 }, size: { w: 2, h: 1 } };
  const crop = { offset: { x: 0, y: 0 }, size: { w: 1, h: 1 } };
  const cut = appearanceFromCropRect(base, crop, fp, defaultOutline(fp));
  // After bake, appearance uses default fill of the new footprint (editor/finalize).
  const filled = defaultImageTransform(cut.footprint);
  assert(nearly(filled.offset.x, 0) && nearly(filled.size.w, cut.footprint.w));
}

console.log('tokenImageFit.test.ts: ok');
