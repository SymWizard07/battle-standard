import { GRID_SIZE_PX } from './fixedGrid';
import type { ImageOpaqueShape } from './imageOpaqueBounds';
import type {
  Point,
  TokenImageTransform,
  TokenOutlineStyle,
} from './types';

export type MidEdge = 'n' | 'e' | 's' | 'w';

export type CellRect = {
  offset: Point;
  size: { w: number; h: number };
};

export const TOKEN_IMAGE_FIT_MIN_CELLS = 0.25;
export const TOKEN_IMAGE_FIT_MAX_CELLS = 12;
export const TOKEN_IMAGE_FIT_NUDGE = 1 / 8;

export function defaultImageTransform(footprint: { w: number; h: number }): TokenImageTransform {
  return {
    offset: { x: 0, y: 0 },
    size: { w: footprint.w, h: footprint.h },
  };
}

export function defaultOutline(footprint: { w: number; h: number }): TokenOutlineStyle {
  return {
    shape: 'rect',
    offset: { x: 0, y: 0 },
    size: { w: footprint.w, h: footprint.h },
  };
}

/**
 * Appearance-editor footprint with min(w,h) === 1 and the other side = aspect (w/h).
 * Example: aspect 2 → 2×1; aspect 0.5 → 1×2; aspect 1 → 1×1.
 */
export function canonicalFootprintFromAspect(aspect: number): { w: number; h: number } {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  let w: number;
  let h: number;
  if (a >= 1) {
    h = 1;
    w = a;
  } else {
    w = 1;
    h = 1 / a;
  }
  const clamp = (n: number) =>
    Math.max(TOKEN_IMAGE_FIT_MIN_CELLS, Math.min(TOKEN_IMAGE_FIT_MAX_CELLS, n));
  return { w: clamp(w), h: clamp(h) };
}

function scaleCellRect(
  rect: { offset: Point; size: { w: number; h: number } },
  sx: number,
  sy: number,
): { offset: Point; size: { w: number; h: number } } {
  return {
    offset: { x: rect.offset.x * sx, y: rect.offset.y * sy },
    size: { w: rect.size.w * sx, h: rect.size.h * sy },
  };
}

/** Remap image/outline cell units from one footprint into another (proportional). */
export function scaleAppearanceBetweenFootprints(
  from: { w: number; h: number },
  to: { w: number; h: number },
  appearance: {
    imageTransform: TokenImageTransform;
    outline: TokenOutlineStyle;
  },
): { imageTransform: TokenImageTransform; outline: TokenOutlineStyle } {
  const sx = to.w / Math.max(from.w, 1e-6);
  const sy = to.h / Math.max(from.h, 1e-6);
  const image = scaleCellRect(appearance.imageTransform, sx, sy);
  const outlineRect = scaleCellRect(appearance.outline, sx, sy);
  return {
    imageTransform: image,
    outline: {
      shape: appearance.outline.shape,
      offset: outlineRect.offset,
      size: outlineRect.size,
    },
  };
}

/** Fresh Appearance draft: square canonical slot until natural aspect is known. */
export function freshCanonicalAppearance(): {
  footprint: { w: number; h: number };
  imageTransform: TokenImageTransform;
  outline: TokenOutlineStyle;
} {
  const footprint = canonicalFootprintFromAspect(1);
  return {
    footprint,
    imageTransform: defaultImageTransform(footprint),
    outline: defaultOutline(footprint),
  };
}

/**
 * Place the image so it covers the footprint without distortion (may extend past edges).
 * `naturalAspect` is width/height of the source image.
 */
export function coverImageTransform(
  footprint: { w: number; h: number },
  naturalAspect: number,
): TokenImageTransform {
  const aspect = naturalAspect > 0 ? naturalAspect : 1;
  const fpAspect = footprint.w / Math.max(footprint.h, 1e-6);
  if (aspect >= fpAspect) {
    const h = footprint.h;
    const w = h * aspect;
    return {
      offset: { x: (footprint.w - w) / 2, y: 0 },
      size: { w, h },
    };
  }
  const w = footprint.w;
  const h = w / aspect;
  return {
    offset: { x: 0, y: (footprint.h - h) / 2 },
    size: { w, h },
  };
}

/**
 * Non-destructive crop framing: keep the full image, but ensure it covers the
 * footprint window and slide/scale so no empty gaps show inside the slot.
 * Source pixels outside the footprint stay in the transform and can be restored
 * by panning/zooming later.
 */
export function clampImageTransformToCoverFootprint(
  transform: TokenImageTransform,
  footprint: { w: number; h: number },
  naturalAspect?: number,
): TokenImageTransform {
  const aspect =
    naturalAspect != null && naturalAspect > 0
      ? naturalAspect
      : transform.size.w / Math.max(transform.size.h, 1e-6);

  const minCover = coverImageTransform(footprint, aspect);
  let scale = Math.max(
    transform.size.w / Math.max(minCover.size.w, 1e-6),
    transform.size.h / Math.max(minCover.size.h, 1e-6),
    1,
  );
  const maxScale = Math.min(
    TOKEN_IMAGE_FIT_MAX_CELLS / Math.max(minCover.size.w, 1e-6),
    TOKEN_IMAGE_FIT_MAX_CELLS / Math.max(minCover.size.h, 1e-6),
  );
  scale = Math.min(scale, maxScale);

  const w = minCover.size.w * scale;
  const h = minCover.size.h * scale;
  // Keep the image's center where it was when size changes (e.g. growing a
  // 1×1 stretch up to a wide cover). Clamping the old top-left would pin
  // uneven art to a corner instead of the footprint center.
  const prevCx = transform.offset.x + transform.size.w / 2;
  const prevCy = transform.offset.y + transform.size.h / 2;
  const minX = footprint.w - w;
  const minY = footprint.h - h;
  const x = Math.min(0, Math.max(minX, prevCx - w / 2));
  const y = Math.min(0, Math.max(minY, prevCy - h / 2));
  return { offset: { x, y }, size: { w, h } };
}

/** True when the image AABB fully covers the footprint (crop window has no gaps). */
export function imageTransformCoversFootprint(
  transform: TokenImageTransform,
  footprint: { w: number; h: number },
  eps = 1e-6,
): boolean {
  return (
    transform.offset.x <= eps &&
    transform.offset.y <= eps &&
    transform.offset.x + transform.size.w >= footprint.w - eps &&
    transform.offset.y + transform.size.h >= footprint.h - eps
  );
}

export type CropCorner = 'nw' | 'ne' | 'sw' | 'se';

export function cellRectCornerPoint(rect: CellRect, corner: CropCorner): Point {
  switch (corner) {
    case 'nw':
      return { x: rect.offset.x, y: rect.offset.y };
    case 'ne':
      return { x: rect.offset.x + rect.size.w, y: rect.offset.y };
    case 'sw':
      return { x: rect.offset.x, y: rect.offset.y + rect.size.h };
    case 'se':
      return { x: rect.offset.x + rect.size.w, y: rect.offset.y + rect.size.h };
  }
}

/** Keep the crop rectangle inside the image AABB. */
export function clampCropRectInsideImage(
  crop: CellRect,
  image: CellRect,
): CellRect {
  let w = Math.min(
    Math.max(TOKEN_IMAGE_FIT_MIN_CELLS, crop.size.w),
    Math.max(TOKEN_IMAGE_FIT_MIN_CELLS, image.size.w),
  );
  let h = Math.min(
    Math.max(TOKEN_IMAGE_FIT_MIN_CELLS, crop.size.h),
    Math.max(TOKEN_IMAGE_FIT_MIN_CELLS, image.size.h),
  );
  const maxX = image.offset.x + image.size.w - w;
  const maxY = image.offset.y + image.size.h - h;
  const x = Math.min(maxX, Math.max(image.offset.x, crop.offset.x));
  const y = Math.min(maxY, Math.max(image.offset.y, crop.offset.y));
  return { offset: { x, y }, size: { w, h } };
}

/**
 * Cut the crop window out as the new token footprint (1:1, no stretch).
 * Image placement is rebased so the crop's top-left becomes the footprint origin.
 * Outline is scaled from the pre-crop footprint into the new size.
 */
export function appearanceFromCropRect(
  baseImage: TokenImageTransform,
  crop: CellRect,
  baseFootprint: { w: number; h: number },
  baseOutline: TokenOutlineStyle,
): {
  footprint: { w: number; h: number };
  imageTransform: TokenImageTransform;
  outline: TokenOutlineStyle;
} {
  const footprint = {
    w: Math.min(
      TOKEN_IMAGE_FIT_MAX_CELLS,
      Math.max(TOKEN_IMAGE_FIT_MIN_CELLS, crop.size.w),
    ),
    h: Math.min(
      TOKEN_IMAGE_FIT_MAX_CELLS,
      Math.max(TOKEN_IMAGE_FIT_MIN_CELLS, crop.size.h),
    ),
  };
  const imageTransform: TokenImageTransform = {
    offset: {
      x: baseImage.offset.x - crop.offset.x,
      y: baseImage.offset.y - crop.offset.y,
    },
    size: { w: baseImage.size.w, h: baseImage.size.h },
  };
  const { outline } = scaleAppearanceBetweenFootprints(
    baseFootprint,
    footprint,
    {
      imageTransform: defaultImageTransform(baseFootprint),
      outline: baseOutline,
    },
  );
  return { footprint, imageTransform, outline };
}

/**
 * Rasterize the crop window out of the source image (cell-space crop over baseImage).
 * Returns a PNG blob of only the kept pixels.
 */
export async function bakeCroppedImageBlob(
  img: HTMLImageElement,
  baseImage: TokenImageTransform,
  crop: CellRect,
): Promise<Blob> {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (nw <= 0 || nh <= 0) {
    throw new Error('Image has no dimensions');
  }
  const bw = Math.max(baseImage.size.w, 1e-6);
  const bh = Math.max(baseImage.size.h, 1e-6);
  let sx = ((crop.offset.x - baseImage.offset.x) / bw) * nw;
  let sy = ((crop.offset.y - baseImage.offset.y) / bh) * nh;
  let sw = (crop.size.w / bw) * nw;
  let sh = (crop.size.h / bh) * nh;
  // Clamp to source bounds.
  if (sx < 0) {
    sw += sx;
    sx = 0;
  }
  if (sy < 0) {
    sh += sy;
    sy = 0;
  }
  sw = Math.min(sw, nw - sx);
  sh = Math.min(sh, nh - sy);
  const outW = Math.max(1, Math.round(sw));
  const outH = Math.max(1, Math.round(sh));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas context');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Crop encode failed'))),
      'image/png',
    );
  });
}

/** Center the crop box on the image (size unchanged), clamped inside the image. */
export function recenterCropRectOnImage(
  crop: CellRect,
  image: CellRect,
): CellRect {
  return clampCropRectInsideImage(
    {
      offset: {
        x: image.offset.x + image.size.w / 2 - crop.size.w / 2,
        y: image.offset.y + image.size.h / 2 - crop.size.h / 2,
      },
      size: { ...crop.size },
    },
    image,
  );
}

/** Relative |w−h|/max threshold for soft square snap while cropping. */
export const CROP_SQUARE_SNAP_RATIO = 0.08;

/**
 * Corner-scale a crop rectangle. Opposite corner stays put unless aspect is locked
 * (then scale uniformly from the opposite corner).
 * When unlocked, softly snaps to square once |w−h| / max(w,h) is within `squareSnapRatio`.
 */
export function scaleCropRectFromCorner(
  start: CellRect,
  corner: CropCorner,
  deltaCells: Point,
  maintainAspect: boolean,
  lockedAspect?: number,
  squareSnapRatio = CROP_SQUARE_SNAP_RATIO,
): CellRect {
  const pivot = cellRectCornerPoint(start, oppositeCropCorner(corner));
  let x0 = pivot.x;
  let y0 = pivot.y;
  let x1 = cellRectCornerPoint(start, corner).x + deltaCells.x;
  let y1 = cellRectCornerPoint(start, corner).y + deltaCells.y;

  if (maintainAspect) {
    const aspect =
      lockedAspect != null && lockedAspect > 0
        ? lockedAspect
        : start.size.w / Math.max(start.size.h, 1e-6);
    // Project free point onto aspect-correct size from pivot.
    let w = Math.abs(x1 - x0);
    let h = Math.abs(y1 - y0);
    if (w / Math.max(h, 1e-6) > aspect) h = w / aspect;
    else w = h * aspect;
    x1 = x0 + (x1 >= x0 ? w : -w);
    y1 = y0 + (y1 >= y0 ? h : -h);
  } else if (squareSnapRatio > 0) {
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    const maxSide = Math.max(w, h, 1e-6);
    if (Math.abs(w - h) / maxSide <= squareSnapRatio) {
      // Snap the shorter side up to the longer (one-axis catch), keep pivot.
      const side = maxSide;
      x1 = x0 + (x1 >= x0 ? side : -side);
      y1 = y0 + (y1 >= y0 ? side : -side);
    }
  }

  return normalizeRect({
    offset: { x: Math.min(x0, x1), y: Math.min(y0, y1) },
    size: { w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) },
  });
}

export function oppositeCropCorner(corner: CropCorner): CropCorner {
  switch (corner) {
    case 'nw':
      return 'se';
    case 'ne':
      return 'sw';
    case 'sw':
      return 'ne';
    case 'se':
      return 'nw';
  }
}

/** @deprecated footprint corner alias — prefer cellRectCornerPoint on the crop rect. */
export function footprintCornerPoint(
  footprint: { w: number; h: number },
  corner: CropCorner,
): Point {
  return cellRectCornerPoint(
    { offset: { x: 0, y: 0 }, size: { w: footprint.w, h: footprint.h } },
    corner,
  );
}

export function isDefaultImageTransform(
  footprint: { w: number; h: number },
  transform: TokenImageTransform,
  eps = 1e-6,
): boolean {
  const d = defaultImageTransform(footprint);
  return (
    Math.abs(transform.offset.x - d.offset.x) < eps &&
    Math.abs(transform.offset.y - d.offset.y) < eps &&
    Math.abs(transform.size.w - d.size.w) < eps &&
    Math.abs(transform.size.h - d.size.h) < eps
  );
}

/** True when the rect's center matches the footprint center. */
export function isCellRectCenteredOnFootprint(
  footprint: { w: number; h: number },
  rect: CellRect,
  eps = 1e-6,
): boolean {
  const cx = rect.offset.x + rect.size.w / 2;
  const cy = rect.offset.y + rect.size.h / 2;
  return (
    Math.abs(cx - footprint.w / 2) < eps &&
    Math.abs(cy - footprint.h / 2) < eps
  );
}

/** Keep size; move so the rect is centered on the footprint. */
export function recenterCellRectOnFootprint(
  footprint: { w: number; h: number },
  rect: CellRect,
): CellRect {
  return {
    offset: {
      x: footprint.w / 2 - rect.size.w / 2,
      y: footprint.h / 2 - rect.size.h / 2,
    },
    size: { ...rect.size },
  };
}

/** Convert opaque-pixel shape into an explicit outline in cell units. */
export function outlineFromOpaqueShape(
  shape: ImageOpaqueShape | null | undefined,
  footprint: { w: number; h: number },
): TokenOutlineStyle {
  if (shape?.kind === 'circle') {
    const scale = Math.min(footprint.w, footprint.h);
    const diameter = Math.max(TOKEN_IMAGE_FIT_MIN_CELLS, shape.radius * 2 * scale);
    const cx = shape.centerX * footprint.w;
    const cy = shape.centerY * footprint.h;
    return {
      shape: 'circle',
      offset: { x: cx - diameter / 2, y: cy - diameter / 2 },
      size: { w: diameter, h: diameter },
    };
  }
  if (shape?.kind === 'rect') {
    return {
      shape: 'rect',
      offset: {
        x: shape.bounds.x * footprint.w,
        y: shape.bounds.y * footprint.h,
      },
      size: {
        w: Math.max(TOKEN_IMAGE_FIT_MIN_CELLS, shape.bounds.width * footprint.w),
        h: Math.max(TOKEN_IMAGE_FIT_MIN_CELLS, shape.bounds.height * footprint.h),
      },
    };
  }
  return {
    shape: 'rect',
    offset: { x: 0, y: 0 },
    size: { w: footprint.w, h: footprint.h },
  };
}

export function resolveImageTransform(
  footprint: { w: number; h: number },
  transform?: TokenImageTransform | null,
): TokenImageTransform {
  return transform ?? defaultImageTransform(footprint);
}

/** Pixel rect of the image within the token local (footprint) space. */
export function imageTransformToLocalPx(
  footprint: { w: number; h: number },
  transform?: TokenImageTransform | null,
): { x: number; y: number; width: number; height: number } {
  const t = resolveImageTransform(footprint, transform);
  return {
    x: t.offset.x * GRID_SIZE_PX,
    y: t.offset.y * GRID_SIZE_PX,
    width: t.size.w * GRID_SIZE_PX,
    height: t.size.h * GRID_SIZE_PX,
  };
}

/** Pixel geometry for an explicit outline within footprint local space. */
export function outlineToLocalPx(
  _footprint: { w: number; h: number },
  outline: TokenOutlineStyle,
  pad = 2,
):
  | { kind: 'circle'; x: number; y: number; radius: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number } {
  const x = outline.offset.x * GRID_SIZE_PX;
  const y = outline.offset.y * GRID_SIZE_PX;
  const w = outline.size.w * GRID_SIZE_PX;
  const h = outline.size.h * GRID_SIZE_PX;
  if (outline.shape === 'circle') {
    const radius = Math.min(w, h) / 2 + pad;
    return {
      kind: 'circle',
      x: x + w / 2,
      y: y + h / 2,
      radius,
    };
  }
  return {
    kind: 'rect',
    x: x - pad,
    y: y - pad,
    width: w + pad * 2,
    height: h + pad * 2,
  };
}

function clampSize(n: number): number {
  return Math.max(
    TOKEN_IMAGE_FIT_MIN_CELLS,
    Math.min(TOKEN_IMAGE_FIT_MAX_CELLS, n),
  );
}

function normalizeRect(rect: CellRect): CellRect {
  const w = clampSize(Math.abs(rect.size.w));
  const h = clampSize(Math.abs(rect.size.h));
  let x = rect.offset.x;
  let y = rect.offset.y;
  if (rect.size.w < 0) x = rect.offset.x + rect.size.w;
  if (rect.size.h < 0) y = rect.offset.y + rect.size.h;
  return { offset: { x, y }, size: { w, h } };
}

/**
 * Mid-edge scale. Aspect on → uniform from center (same scale on both axes).
 * Aspect off → opposite edge anchored.
 * Optional `lockedAspect` (w/h) forces the result to that ratio when maintainAspect is true.
 */
export function scaleCellRectFromMidEdge(
  start: CellRect,
  edge: MidEdge,
  deltaCells: Point,
  maintainAspect: boolean,
  lockedAspect?: number,
): CellRect {
  if (maintainAspect) {
    const cx = start.offset.x + start.size.w / 2;
    const cy = start.offset.y + start.size.h / 2;
    const aspect =
      lockedAspect != null && lockedAspect > 0
        ? lockedAspect
        : start.size.w / Math.max(start.size.h, 1e-6);

    let nextW: number;
    let nextH: number;
    if (edge === 'e' || edge === 'w') {
      const dw = (edge === 'e' ? deltaCells.x : -deltaCells.x) * 2;
      nextW = start.size.w + dw;
      nextH = nextW / aspect;
      if (nextW > TOKEN_IMAGE_FIT_MAX_CELLS) {
        nextW = TOKEN_IMAGE_FIT_MAX_CELLS;
        nextH = nextW / aspect;
      } else if (nextH > TOKEN_IMAGE_FIT_MAX_CELLS) {
        nextH = TOKEN_IMAGE_FIT_MAX_CELLS;
        nextW = nextH * aspect;
      }
      if (nextW < TOKEN_IMAGE_FIT_MIN_CELLS) {
        nextW = TOKEN_IMAGE_FIT_MIN_CELLS;
        nextH = nextW / aspect;
      } else if (nextH < TOKEN_IMAGE_FIT_MIN_CELLS) {
        nextH = TOKEN_IMAGE_FIT_MIN_CELLS;
        nextW = nextH * aspect;
      }
    } else {
      const dh = (edge === 's' ? deltaCells.y : -deltaCells.y) * 2;
      nextH = start.size.h + dh;
      nextW = nextH * aspect;
      if (nextH > TOKEN_IMAGE_FIT_MAX_CELLS) {
        nextH = TOKEN_IMAGE_FIT_MAX_CELLS;
        nextW = nextH * aspect;
      } else if (nextW > TOKEN_IMAGE_FIT_MAX_CELLS) {
        nextW = TOKEN_IMAGE_FIT_MAX_CELLS;
        nextH = nextW / aspect;
      }
      if (nextH < TOKEN_IMAGE_FIT_MIN_CELLS) {
        nextH = TOKEN_IMAGE_FIT_MIN_CELLS;
        nextW = nextH * aspect;
      } else if (nextW < TOKEN_IMAGE_FIT_MIN_CELLS) {
        nextW = TOKEN_IMAGE_FIT_MIN_CELLS;
        nextH = nextW / aspect;
      }
    }

    return {
      offset: { x: cx - nextW / 2, y: cy - nextH / 2 },
      size: { w: nextW, h: nextH },
    };
  }

  const next = {
    offset: { ...start.offset },
    size: { ...start.size },
  };
  if (edge === 'e') {
    next.size.w = start.size.w + deltaCells.x;
  } else if (edge === 'w') {
    next.offset.x = start.offset.x + deltaCells.x;
    next.size.w = start.size.w - deltaCells.x;
  } else if (edge === 's') {
    next.size.h = start.size.h + deltaCells.y;
  } else {
    next.offset.y = start.offset.y + deltaCells.y;
    next.size.h = start.size.h - deltaCells.y;
  }
  return normalizeRect(next);
}

export function translateCellRect(rect: CellRect, deltaCells: Point): CellRect {
  return {
    offset: { x: rect.offset.x + deltaCells.x, y: rect.offset.y + deltaCells.y },
    size: { ...rect.size },
  };
}

export function nudgeCellRect(
  rect: CellRect,
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
  step = TOKEN_IMAGE_FIT_NUDGE,
): CellRect {
  const delta: Point =
    key === 'ArrowUp'
      ? { x: 0, y: -step }
      : key === 'ArrowDown'
        ? { x: 0, y: step }
        : key === 'ArrowLeft'
          ? { x: -step, y: 0 }
          : { x: step, y: 0 };
  return translateCellRect(rect, delta);
}

/** Grow footprint to cover image rect (ceil to whole cells, min 1). */
export function footprintCoveringImage(image: TokenImageTransform): { w: number; h: number } {
  const maxX = image.offset.x + image.size.w;
  const maxY = image.offset.y + image.size.h;
  const minX = Math.min(0, image.offset.x);
  const minY = Math.min(0, image.offset.y);
  return {
    w: Math.max(1, Math.ceil(maxX - minX - 1e-9)),
    h: Math.max(1, Math.ceil(maxY - minY - 1e-9)),
  };
}

export function midEdgeHandleLocalPx(
  rect: CellRect,
  edge: MidEdge,
): Point {
  const x0 = rect.offset.x * GRID_SIZE_PX;
  const y0 = rect.offset.y * GRID_SIZE_PX;
  const w = rect.size.w * GRID_SIZE_PX;
  const h = rect.size.h * GRID_SIZE_PX;
  switch (edge) {
    case 'n':
      return { x: x0 + w / 2, y: y0 };
    case 'e':
      return { x: x0 + w, y: y0 + h / 2 };
    case 's':
      return { x: x0 + w / 2, y: y0 + h };
    case 'w':
      return { x: x0, y: y0 + h / 2 };
  }
}

export function cellRectFromTransform(t: TokenImageTransform): CellRect {
  return { offset: { ...t.offset }, size: { ...t.size } };
}

export function cellRectFromOutline(o: TokenOutlineStyle): CellRect {
  return { offset: { ...o.offset }, size: { ...o.size } };
}

export function transformFromCellRect(rect: CellRect): TokenImageTransform {
  const n = normalizeRect(rect);
  return { offset: n.offset, size: n.size };
}

export function outlineFromCellRect(
  rect: CellRect,
  shape: TokenOutlineStyle['shape'],
): TokenOutlineStyle {
  const n = normalizeRect(rect);
  if (shape === 'circle') {
    const side = Math.max(n.size.w, n.size.h);
    const cx = n.offset.x + n.size.w / 2;
    const cy = n.offset.y + n.size.h / 2;
    return {
      shape: 'circle',
      offset: { x: cx - side / 2, y: cy - side / 2 },
      size: { w: side, h: side },
    };
  }
  return { shape: 'rect', offset: n.offset, size: n.size };
}
