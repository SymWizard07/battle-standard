import { newId } from './ids';
import { decimateStrokePoints, MASK_WORLD_PER_PX } from './fogMask';
import { invalidateFogMaskCache } from './fogMaskCache';
import type { FogOp, FogPaintMode, FogState, Point } from './types';

/** polygon-clipping style: MultiPolygon = Polygon[] = Ring[][] = [x,y][][] */
export type FogCoordRing = [number, number][];
export type FogCoordPolygon = FogCoordRing[];
export type FogCoordMultiPolygon = FogCoordPolygon[];

export function appendFogOp(fog: FogState, op: FogOp): FogState {
  // Keep mask cache so getFogMaskSetForScene can paint only the new op.
  return normalizeOpsFog({
    ...fog,
    ops: [...fog.ops, op],
  });
}

function normalizeOpsFog(fog: FogState): FogState {
  return {
    defaultHidden: !!fog.defaultHidden,
    ops: Array.isArray(fog.ops) ? fog.ops : [],
  };
}

export function fogWithClearedOps(defaultHidden: boolean): FogState {
  invalidateFogMaskCache();
  return { defaultHidden, ops: [] };
}

export function makeFogRectOp(
  rect: { x: number; y: number; w: number; h: number },
  mode: FogPaintMode,
): FogOp {
  return {
    id: newId(),
    kind: 'rect',
    mode,
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
  };
}

export function makeFogStrokeOp(
  points: Point[],
  radius: number,
  mode: FogPaintMode,
): FogOp {
  // Match mask resolution — denser points do not improve the coarse alpha mask.
  const minDist = Math.max(MASK_WORLD_PER_PX * 2, radius * 0.55);
  return {
    id: newId(),
    kind: 'stroke',
    mode,
    points: decimateStrokePoints(points, minDist),
    radius,
  };
}

function ringToPoints(ring: FogCoordRing): Point[] {
  // polygon-clipping rings are often closed (last == first)
  const pts = ring.map(([x, y]) => ({ x, y }));
  if (pts.length >= 2) {
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    if (a.x === b.x && a.y === b.y) pts.pop();
  }
  return pts;
}

/** Convert a multipolygon into one polygon FogOp per outer polygon. */
export function fogOpsFromMultiPolygon(
  mp: FogCoordMultiPolygon,
  mode: FogPaintMode,
): FogOp[] {
  const ops: FogOp[] = [];
  for (const poly of mp) {
    if (!poly || poly.length === 0) continue;
    const rings: Point[][] = [];
    for (const ring of poly) {
      if (!ring || ring.length < 3) continue;
      const pts = ringToPoints(ring);
      if (pts.length >= 3) rings.push(pts);
    }
    if (rings.length === 0) continue;
    ops.push({ id: newId(), kind: 'polygon', mode, rings });
  }
  return ops;
}

export function appendFogOps(fog: FogState, ops: FogOp[]): FogState {
  if (ops.length === 0) return fog;
  // Keep mask cache so getFogMaskSetForScene can paint only the new ops.
  return normalizeOpsFog({
    ...fog,
    ops: [...fog.ops, ...ops],
  });
}
