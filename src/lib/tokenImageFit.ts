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
