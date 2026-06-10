import { drawStrokeBounds, shiftDrawStroke } from './drawShapes';
import { tokenWorldTopLeft, worldToSubGridTopLeft } from './grid';
import type {
  ConeMeasureParams,
  CubeMeasureParams,
  DrawStroke,
  EphemeralMeasurement,
  LineMeasureParams,
  MeasurementParams,
  Point,
  SphereMeasureParams,
  TokenGridPlacement,
} from './types';
import { deepEqual } from './history/equal';

export const MOTION_INTERPOLATION_DELAY_MS = 110;
export const MOTION_CATCHUP_BLEND = 0.42;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

export function placementsEqual(
  a: TokenGridPlacement | null | undefined,
  b: TokenGridPlacement | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.gridPos.col === b.gridPos.col &&
    a.gridPos.row === b.gridPos.row &&
    (a.posOffset?.x ?? 0) === (b.posOffset?.x ?? 0) &&
    (a.posOffset?.y ?? 0) === (b.posOffset?.y ?? 0)
  );
}

export function interpolateTokenPlacement(
  from: TokenGridPlacement,
  to: TokenGridPlacement,
  t: number,
  gridOffset: Point,
): TokenGridPlacement {
  const wFrom = tokenWorldTopLeft(from, gridOffset);
  const wTo = tokenWorldTopLeft(to, gridOffset);
  const world = {
    x: lerp(wFrom.x, wTo.x, t),
    y: lerp(wFrom.y, wTo.y, t),
  };
  const decomposed = worldToSubGridTopLeft(world, gridOffset);
  return {
    gridPos: decomposed.gridPos,
    posOffset:
      Math.abs(decomposed.posOffset.x) < 1e-6 && Math.abs(decomposed.posOffset.y) < 1e-6
        ? undefined
        : decomposed.posOffset,
  };
}

export function interpolateFootprint(
  from: { w: number; h: number },
  to: { w: number; h: number },
  t: number,
): { w: number; h: number } {
  return {
    w: Math.max(1, Math.round(lerp(from.w, to.w, t))),
    h: Math.max(1, Math.round(lerp(from.h, to.h, t))),
  };
}

export function interpolateDrawStroke(
  from: DrawStroke,
  to: DrawStroke,
  t: number,
  gridOffset: Point,
): DrawStroke {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const boundsFrom = drawStrokeBounds(from, gridOffset);
  const boundsTo = drawStrokeBounds(to, gridOffset);
  if (!boundsFrom || !boundsTo) return t < 0.5 ? from : to;
  const centerFrom = {
    x: boundsFrom.x + boundsFrom.width / 2,
    y: boundsFrom.y + boundsFrom.height / 2,
  };
  const centerTo = {
    x: boundsTo.x + boundsTo.width / 2,
    y: boundsTo.y + boundsTo.height / 2,
  };
  const shift = {
    x: lerp(centerFrom.x, centerTo.x, t) - centerFrom.x,
    y: lerp(centerFrom.y, centerTo.y, t) - centerFrom.y,
  };
  return shiftDrawStroke(from, shift);
}

export function interpolateMeasurementParams(
  kind: EphemeralMeasurement['kind'],
  from: MeasurementParams,
  to: MeasurementParams,
  t: number,
): MeasurementParams {
  if (t <= 0) return from;
  if (t >= 1) return to;

  switch (kind) {
    case 'line': {
      const a = from as LineMeasureParams;
      const b = to as LineMeasureParams;
      return {
        from: lerpPoint(a.from, b.from, t),
        to: lerpPoint(a.to, b.to, t),
      };
    }
    case 'cone': {
      const a = from as ConeMeasureParams;
      const b = to as ConeMeasureParams;
      return {
        origin: lerpPoint(a.origin, b.origin, t),
        direction: lerp(a.direction, b.direction, t),
        lengthCells: lerp(a.lengthCells, b.lengthCells, t),
        angleDeg: a.angleDeg,
        style: b.style ?? a.style,
        lengthWorld:
          a.lengthWorld != null && b.lengthWorld != null
            ? lerp(a.lengthWorld, b.lengthWorld, t)
            : b.lengthWorld ?? a.lengthWorld,
      };
    }
    case 'cube': {
      const a = from as CubeMeasureParams;
      const b = to as CubeMeasureParams;
      return {
        center: {
          col: Math.round(lerp(a.center.col, b.center.col, t)),
          row: Math.round(lerp(a.center.row, b.center.row, t)),
        },
        radiusCells: lerp(a.radiusCells, b.radiusCells, t),
        origin:
          a.origin && b.origin ? lerpPoint(a.origin, b.origin, t) : b.origin ?? a.origin,
      };
    }
    case 'sphere': {
      const a = from as SphereMeasureParams;
      const b = to as SphereMeasureParams;
      return {
        center: {
          col: Math.round(lerp(a.center.col, b.center.col, t)),
          row: Math.round(lerp(a.center.row, b.center.row, t)),
        },
        radiusCells: lerp(a.radiusCells, b.radiusCells, t),
        origin:
          a.origin && b.origin ? lerpPoint(a.origin, b.origin, t) : b.origin ?? a.origin,
        radiusWorld:
          a.radiusWorld != null && b.radiusWorld != null
            ? lerp(a.radiusWorld, b.radiusWorld, t)
            : b.radiusWorld ?? a.radiusWorld,
      };
    }
    default:
      return to;
  }
}

export function interpolateEphemeralMeasurement(
  from: EphemeralMeasurement,
  to: EphemeralMeasurement,
  t: number,
): EphemeralMeasurement {
  if (from.kind !== to.kind) return to;
  return {
    kind: to.kind,
    params: interpolateMeasurementParams(to.kind, from.params, to.params, t),
    opacity: lerp(from.opacity, to.opacity, t),
    displayStyle: to.displayStyle ?? from.displayStyle,
  };
}

export function drawStrokesEqual(a: DrawStroke, b: DrawStroke): boolean {
  return deepEqual(a, b);
}
