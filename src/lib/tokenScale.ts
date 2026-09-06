import { GRID_SIZE_PX } from './fixedGrid';
import { tokenWorldTopLeft, worldToScreen } from './grid';
import {
  getCachedOpaqueShape,
  selectionCircleFromOpaqueShape,
  selectionRectFromOpaqueBounds,
  type ImageOpaqueShape,
} from './imageOpaqueBounds';
import {
  defaultImageTransform,
  defaultOutline,
  outlineToLocalPx,
  scaleAppearanceBetweenFootprints,
} from './tokenImageFit';
import type { MapCorner } from './mapGeometry';
import { clampGridSnapStrength, snapTokenTopLeftPlacement } from './gridSnap';
import type {
  Point,
  Token,
  TokenGridPlacement,
  TokenImageTransform,
  TokenOutlineStyle,
} from './types';

export const MAX_TOKEN_FOOTPRINT_CELLS = 12;
const MAX_CELLS = MAX_TOKEN_FOOTPRINT_CELLS;
/** Minimum footprint when snap is off (quarter-cell). */
const MIN_CELLS_FREE = 0.25;

export type TokenFootprint = { w: number; h: number };
export type TokenScaleCorner = MapCorner;

export type TokenScalePreview = {
  footprint: TokenFootprint;
  placement: TokenGridPlacement;
  imageTransform?: TokenImageTransform;
  outline?: TokenOutlineStyle;
};

/** Scale stored appearance cell-units when the token footprint changes. */
export function scaleTokenAppearanceForFootprint(
  from: TokenFootprint,
  to: TokenFootprint,
  appearance: {
    imageTransform?: TokenImageTransform | null;
    outline?: TokenOutlineStyle | null;
  },
): Pick<TokenScalePreview, 'imageTransform' | 'outline'> {
  const hasImg = Boolean(appearance.imageTransform);
  const hasOutline = Boolean(appearance.outline);
  if (!hasImg && !hasOutline) return {};
  const scaled = scaleAppearanceBetweenFootprints(from, to, {
    imageTransform: appearance.imageTransform ?? defaultImageTransform(from),
    outline: appearance.outline ?? defaultOutline(from),
  });
  return {
    ...(hasImg ? { imageTransform: scaled.imageTransform } : {}),
    ...(hasOutline ? { outline: scaled.outline } : {}),
  };
}

function minFootprintCells(snap: number): number {
  return snap > 0 ? snap : MIN_CELLS_FREE;
}

function quantizeFootprintCells(cells: number, snap: number): number {
  if (snap <= 0) return cells;
  const q = Math.round(cells / snap) * snap;
  return Math.round(q * 1000) / 1000;
}

function clampFootprint(w: number, h: number, snap: number): TokenFootprint {
  const min = minFootprintCells(snap);
  const qw = snap > 0 ? quantizeFootprintCells(w, snap) : w;
  const qh = snap > 0 ? quantizeFootprintCells(h, snap) : h;
  return {
    w: Math.max(min, Math.min(MAX_CELLS, qw)),
    h: Math.max(min, Math.min(MAX_CELLS, qh)),
  };
}

/** Local selection marquee rect (matches TokenLayer outline). */
export function tokenSelectionMarqueeLocalRect(
  displayW: number,
  displayH: number,
  imgUrl: string | undefined,
  opaqueShape: ImageOpaqueShape | null | undefined,
  outline?: TokenOutlineStyle | null,
  footprint?: TokenFootprint,
): { x: number; y: number; width: number; height: number } {
  if (outline && footprint) {
    const local = outlineToLocalPx(footprint, outline, 2);
    if (local.kind === 'circle') {
      return {
        x: local.x - local.radius,
        y: local.y - local.radius,
        width: local.radius * 2,
        height: local.radius * 2,
      };
    }
    return {
      x: local.x,
      y: local.y,
      width: local.width,
      height: local.height,
    };
  }
  const hasImageShape = Boolean(imgUrl && opaqueShape);
  const selectionCircle = selectionCircleFromOpaqueShape(
    hasImageShape ? opaqueShape : null,
    displayW,
    displayH,
    2,
  );
  if (selectionCircle) {
    return {
      x: selectionCircle.x - selectionCircle.radius,
      y: selectionCircle.y - selectionCircle.radius,
      width: selectionCircle.radius * 2,
      height: selectionCircle.radius * 2,
    };
  }
  return selectionRectFromOpaqueBounds(
    hasImageShape && opaqueShape?.kind === 'rect' ? opaqueShape.bounds : null,
    displayW,
    displayH,
    imgUrl ? 2 : 4,
  );
}

export type TokenWorldBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export function tokenSelectionMarqueeWorldBounds(
  gridOffset: Point,
  footprint: TokenFootprint,
  placement: Pick<Token, 'gridPos' | 'posOffset'>,
  imageUrl?: string,
  outline?: TokenOutlineStyle | null,
): TokenWorldBounds {
  const w = footprint.w * GRID_SIZE_PX;
  const h = footprint.h * GRID_SIZE_PX;
  const opaqueShape = imageUrl ? getCachedOpaqueShape(imageUrl) : undefined;
  const local = tokenSelectionMarqueeLocalRect(
    w,
    h,
    imageUrl,
    opaqueShape,
    outline,
    footprint,
  );
  const tl = tokenWorldTopLeft(placement, gridOffset);
  return {
    minX: tl.x + local.x,
    minY: tl.y + local.y,
    maxX: tl.x + local.x + local.width,
    maxY: tl.y + local.y + local.height,
  };
}

export function unionWorldBounds(bounds: TokenWorldBounds[]): TokenWorldBounds | null {
  if (bounds.length === 0) return null;
  let minX = bounds[0]!.minX;
  let minY = bounds[0]!.minY;
  let maxX = bounds[0]!.maxX;
  let maxY = bounds[0]!.maxY;
  for (let i = 1; i < bounds.length; i++) {
    const b = bounds[i]!;
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  return { minX, minY, maxX, maxY };
}

/** Width / height from opaque image bounds (or null if unknown). */
export function tokenImageAspectRatio(imageUrl?: string): number | null {
  if (!imageUrl) return null;
  const shape = getCachedOpaqueShape(imageUrl);
  if (!shape || shape.bounds.height <= 0) return null;
  return shape.bounds.width / shape.bounds.height;
}

export function oppositeScaleCorner(corner: TokenScaleCorner): TokenScaleCorner {
  const pairs: Record<TokenScaleCorner, TokenScaleCorner> = {
    nw: 'se',
    se: 'nw',
    ne: 'sw',
    sw: 'ne',
  };
  return pairs[corner];
}

function fitPixelSizeToAspect(
  wPx: number,
  hPx: number,
  aspect: number,
  minPx: number,
): { wPx: number; hPx: number } {
  let w = Math.max(minPx, wPx);
  let h = Math.max(minPx, hPx);
  if (w / h > aspect) {
    w = h * aspect;
  } else {
    h = w / aspect;
  }
  return {
    wPx: Math.max(minPx, w),
    hPx: Math.max(minPx, h),
  };
}

type MarqueeFractions = {
  bx: number;
  by: number;
  bw: number;
  bh: number;
  pad: number;
};

function marqueeFractions(
  imageUrl: string | undefined,
  refFootprint: TokenFootprint,
  outline?: TokenOutlineStyle | null,
): MarqueeFractions {
  // Prefer explicit Appearance outline so drag math matches selection handles.
  if (outline && refFootprint.w > 0 && refFootprint.h > 0) {
    return {
      bx: outline.offset.x / refFootprint.w,
      by: outline.offset.y / refFootprint.h,
      bw: Math.max(1e-6, outline.size.w / refFootprint.w),
      bh: Math.max(1e-6, outline.size.h / refFootprint.h),
      pad: 2,
    };
  }
  const shape = imageUrl ? getCachedOpaqueShape(imageUrl) : undefined;
  const hasImage = Boolean(imageUrl && shape);
  if (hasImage && shape?.kind === 'rect') {
    return { bx: shape.bounds.x, by: shape.bounds.y, bw: shape.bounds.width, bh: shape.bounds.height, pad: 2 };
  }
  if (hasImage && shape) {
    const w = refFootprint.w * GRID_SIZE_PX;
    const h = refFootprint.h * GRID_SIZE_PX;
    const local = tokenSelectionMarqueeLocalRect(w, h, imageUrl, shape);
    return {
      bx: local.x / w,
      by: local.y / h,
      bw: local.width / w,
      bh: local.height / h,
      pad: 2,
    };
  }
  return { bx: 0, by: 0, bw: 1, bh: 1, pad: 4 };
}

function topLeftFromMarqueeBox(
  draggedCorner: TokenScaleCorner,
  fixedMarqueeWorld: Point,
  wPx: number,
  hPx: number,
  frac: MarqueeFractions,
): Point {
  const { bx, by, bw, bh, pad } = frac;
  switch (draggedCorner) {
    case 'se':
      return { x: fixedMarqueeWorld.x + pad - bx * wPx, y: fixedMarqueeWorld.y + pad - by * hPx };
    case 'nw':
      return {
        x: fixedMarqueeWorld.x - pad - (bx + bw) * wPx,
        y: fixedMarqueeWorld.y - pad - (by + bh) * hPx,
      };
    case 'ne':
      return {
        x: fixedMarqueeWorld.x + pad - bx * wPx,
        y: fixedMarqueeWorld.y - pad - (by + bh) * hPx,
      };
    case 'sw':
      return {
        x: fixedMarqueeWorld.x - pad - (bx + bw) * wPx,
        y: fixedMarqueeWorld.y + pad - by * hPx,
      };
  }
}

/**
 * Resize from a dragged marquee corner; the opposite marquee corner stays fixed.
 * Preserves image aspect when known.
 */
export function footprintAndPlacementFromCornerDrag(
  draggedCorner: TokenScaleCorner,
  fixedMarqueeWorld: Point,
  pointerWorld: Point,
  imageUrl: string | undefined,
  startFootprint: TokenFootprint,
  imageAspect: number | null,
  selectSnap: number,
  gridOffset: Point,
  outline?: TokenOutlineStyle | null,
): { footprint: TokenFootprint; placement: TokenGridPlacement } {
  const snap = clampGridSnapStrength(selectSnap);
  const minCells = minFootprintCells(snap);
  const minPx = minCells * GRID_SIZE_PX;
  const aspect = imageAspect && imageAspect > 0 ? imageAspect : null;
  const frac = marqueeFractions(imageUrl, startFootprint, outline);
  const { bw, bh, pad } = frac;

  let minX: number;
  let minY: number;
  let maxX: number;
  let maxY: number;

  switch (draggedCorner) {
    case 'se':
      minX = fixedMarqueeWorld.x;
      minY = fixedMarqueeWorld.y;
      maxX = pointerWorld.x;
      maxY = pointerWorld.y;
      break;
    case 'nw':
      maxX = fixedMarqueeWorld.x;
      maxY = fixedMarqueeWorld.y;
      minX = pointerWorld.x;
      minY = pointerWorld.y;
      break;
    case 'ne':
      minX = fixedMarqueeWorld.x;
      maxY = fixedMarqueeWorld.y;
      maxX = pointerWorld.x;
      minY = pointerWorld.y;
      break;
    case 'sw':
      maxX = fixedMarqueeWorld.x;
      minY = fixedMarqueeWorld.y;
      minX = pointerWorld.x;
      maxY = pointerWorld.y;
      break;
  }

  if (minX > maxX) {
    const mid = (minX + maxX) / 2;
    minX = mid;
    maxX = mid;
  }
  if (minY > maxY) {
    const mid = (minY + maxY) / 2;
    minY = mid;
    maxY = mid;
  }

  let wPx = Math.max(minPx, (maxX - minX - 2 * pad) / Math.max(bw, 1e-6));
  let hPx = Math.max(minPx, (maxY - minY - 2 * pad) / Math.max(bh, 1e-6));

  if (aspect) {
    ({ wPx, hPx } = fitPixelSizeToAspect(wPx, hPx, aspect, minPx));
  }

  let w = wPx / GRID_SIZE_PX;
  let h = hPx / GRID_SIZE_PX;
  if (snap > 0) {
    w = Math.max(minCells, quantizeFootprintCells(w, snap));
    h = Math.max(minCells, quantizeFootprintCells(h, snap));
    if (aspect) {
      if (w / h > aspect) {
        w = Math.max(minCells, quantizeFootprintCells(h * aspect, snap));
      } else {
        h = Math.max(minCells, quantizeFootprintCells(w / aspect, snap));
      }
    }
  }

  const footprint = clampFootprint(w, h, snap);
  wPx = footprint.w * GRID_SIZE_PX;
  hPx = footprint.h * GRID_SIZE_PX;
  const topLeft = topLeftFromMarqueeBox(draggedCorner, fixedMarqueeWorld, wPx, hPx, frac);
  const placement = snapTokenTopLeftPlacement(topLeft, selectSnap, gridOffset);
  return { footprint, placement };
}

export function cornerHandleWorld(
  corner: TokenScaleCorner,
  bounds: TokenWorldBounds,
): Point {
  switch (corner) {
    case 'nw':
      return { x: bounds.minX, y: bounds.minY };
    case 'ne':
      return { x: bounds.maxX, y: bounds.minY };
    case 'se':
      return { x: bounds.maxX, y: bounds.maxY };
    case 'sw':
      return { x: bounds.minX, y: bounds.maxY };
  }
}

export function boundsToScreen(
  bounds: TokenWorldBounds,
  stagePos: Point,
  viewScale: number,
): { left: number; top: number; width: number; height: number } {
  const tl = worldToScreen({ x: bounds.minX, y: bounds.minY }, stagePos, viewScale);
  const br = worldToScreen({ x: bounds.maxX, y: bounds.maxY }, stagePos, viewScale);
  return {
    left: tl.x,
    top: tl.y,
    width: br.x - tl.x,
    height: br.y - tl.y,
  };
}

export function cornerHandleScreen(
  corner: TokenScaleCorner,
  bounds: TokenWorldBounds,
  stagePos: Point,
  viewScale: number,
): Point {
  return worldToScreen(cornerHandleWorld(corner, bounds), stagePos, viewScale);
}

export function cornerCursor(corner: TokenScaleCorner): string {
  return corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize';
}
