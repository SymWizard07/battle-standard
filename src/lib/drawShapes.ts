import { GRID_SIZE_PX, DEFAULT_GRID_OFFSET, getGridOffset } from './fixedGrid';
import { ERASER_RADIUS_SCREEN_PX } from './drawConstants';
import { gridCellToWorldCenter, gridCellTopLeft, tokenFootprintWorldBounds, worldToGridCell } from './grid';
import {
  cone5eCellRects,
  cone5eIncludedCells,
  coneAxialLengthFromDrag,
  conePolygonPoints,
  cube5eIncludedCells,
  isPointInCone5e,
  isPointInConeVtt,
  line5eIncludedCells,
  measureDistanceCells,
  measureDistanceWorld,
  sphere5eIncludedCells,
} from './measure';
import { transformWorldPointBetweenMaps, type MapCorner } from './mapGeometry';
import { colorFromHue } from './playerColor';
import {
  drawTextBounds,
  isDrawTextParams,
  pointInDrawTextBounds,
} from './drawText';
import type {
  ConeMeasureParams,
  CubeMeasureParams,
  DrawPreview,
  DrawShapeKind,
  DrawStroke,
  LineMeasureParams,
  MapTransform,
  MeasureKind,
  MeasurementParams,
  Point,
  RectMeasureParams,
  SphereMeasureParams,
  MeasureDisplayStyle,
  Token,
} from './types';

export function constrainDrawRectEndToSquare(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  const sx = dx === 0 ? (dy >= 0 ? 1 : dy < 0 ? -1 : 1) : Math.sign(dx);
  const sy = dy === 0 ? (dx >= 0 ? 1 : dx < 0 ? -1 : 1) : Math.sign(dy);
  return { x: start.x + sx * size, y: start.y + sy * size };
}

export function drawRectParamsFromDrag(
  start: Point,
  end: Point,
  square = false,
): RectMeasureParams {
  return { from: start, to: square ? constrainDrawRectEndToSquare(start, end) : end, rotationDeg: 0 };
}

export function drawCircleParamsFromDrag(
  start: Point,
  end: Point,
  gridOffset = DEFAULT_GRID_OFFSET,
): SphereMeasureParams {
  const origin = start;
  const radiusWorld = Math.hypot(end.x - start.x, end.y - start.y);
  return {
    center: worldToGridCell(origin, gridOffset),
    radiusCells: Math.max(0, radiusWorld / GRID_SIZE_PX - 0.5),
    origin,
    radiusWorld,
  };
}

export function sphereCenterWorld(
  params: SphereMeasureParams,
  gridOffset = getGridOffset(),
): Point {
  return params.origin ?? gridCellToWorldCenter(params.center, gridOffset);
}

export function cubeCenterWorld(
  params: CubeMeasureParams,
  gridOffset = getGridOffset(),
): Point {
  return params.origin ?? gridCellToWorldCenter(params.center, gridOffset);
}

/** Drag start / anchor point for a measure shape. */
export function measureShapeOrigin(
  kind: MeasureKind,
  params: MeasurementParams,
  gridOffset = getGridOffset(),
): Point {
  if (kind === 'line') return (params as LineMeasureParams).from;
  if (kind === 'cube') return cubeCenterWorld(params as CubeMeasureParams, gridOffset);
  if (kind === 'sphere') return sphereCenterWorld(params as SphereMeasureParams, gridOffset);
  return (params as ConeMeasureParams).origin;
}

export function sphereRadiusWorld(params: SphereMeasureParams): number {
  return params.radiusWorld ?? (params.radiusCells + 0.5) * GRID_SIZE_PX;
}

function rectLocalBox(p: RectMeasureParams): {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
} {
  const x = Math.min(p.from.x, p.to.x);
  const y = Math.min(p.from.y, p.to.y);
  const w = Math.abs(p.to.x - p.from.x);
  const h = Math.abs(p.to.y - p.from.y);
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

function rectWorldCorners(p: RectMeasureParams): Point[] {
  const { cx, cy, w, h } = rectLocalBox(p);
  const rot = ((p.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const halfW = w / 2;
  const halfH = h / 2;
  const local = [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ];
  return local.map(({ x, y }) => ({
    x: cx + cos * x - sin * y,
    y: cy + sin * x + cos * y,
  }));
}

function pointInRotatedRect(world: Point, p: RectMeasureParams, pad = 0): boolean {
  const { cx, cy, w, h } = rectLocalBox(p);
  const rot = -((p.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const dx = world.x - cx;
  const dy = world.y - cy;
  const lx = cos * dx - sin * dy;
  const ly = sin * dx + cos * dy;
  return (
    lx >= -w / 2 - pad &&
    lx <= w / 2 + pad &&
    ly >= -h / 2 - pad &&
    ly <= h / 2 + pad
  );
}

export function measureParamsFromDrag(
  kind: MeasureKind,
  start: Point,
  end: Point,
  coneAngleDeg: number,
  displayStyle: MeasureDisplayStyle = 'vtt',
  gridOffset = getGridOffset(),
): MeasurementParams {
  if (kind === 'line') {
    return { from: start, to: end } satisfies LineMeasureParams;
  }
  if (kind === 'cube') {
    const radiusWorld = Math.max(
      Math.abs(end.x - start.x),
      Math.abs(end.y - start.y),
    );
    const radiusCells = measureDistanceCells(radiusWorld);
    return {
      center: worldToGridCell(start, gridOffset),
      radiusCells,
      origin: start,
    } satisfies CubeMeasureParams;
  }
  if (kind === 'sphere') {
    const radiusWorldRaw = Math.hypot(end.x - start.x, end.y - start.y);
    const radiusWorld = measureDistanceWorld(radiusWorldRaw);
    return {
      center: worldToGridCell(start, gridOffset),
      radiusCells: Math.max(0, radiusWorld / GRID_SIZE_PX - 0.5),
      origin: start,
      radiusWorld,
    } satisfies SphereMeasureParams;
  }
  const dir = Math.atan2(end.y - start.y, end.x - start.x);
  const lengthWorldRaw = coneAxialLengthFromDrag(start, end);
  const lengthCells = measureDistanceCells(lengthWorldRaw);
  const lengthWorld = measureDistanceWorld(lengthWorldRaw);
  return {
    origin: start,
    direction: dir,
    lengthCells,
    lengthWorld,
    angleDeg: coneAngleDeg,
    style: displayStyle,
  } satisfies ConeMeasureParams;
}

export function isValidMeasurePreview(
  kind: MeasureKind,
  params: MeasurementParams,
): boolean {
  if (kind === 'line') {
    const p = params as LineMeasureParams;
    return p.from.x !== p.to.x || p.from.y !== p.to.y;
  }
  if (kind === 'cube') {
    return (params as CubeMeasureParams).radiusCells > 0;
  }
  if (kind === 'sphere') {
    return ((params as SphereMeasureParams).radiusWorld ?? 0) > 0;
  }
  if (kind === 'cone') {
    const p = params as ConeMeasureParams;
    return p.lengthCells > 0 || (p.lengthWorld ?? 0) > 0;
  }
  return true;
}

function tokenFootprintSamples(
  token: Pick<Token, 'gridPos' | 'posOffset' | 'footprint'>,
  gridOffset: Point,
): Point[] {
  const b = tokenFootprintWorldBounds(token, gridOffset);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return [
    { x: cx, y: cy },
    { x: b.minX, y: b.minY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
    { x: b.minX, y: b.maxY },
  ];
}

function footprintOverlapsCells(
  token: Pick<Token, 'gridPos' | 'posOffset' | 'footprint'>,
  cells: { col: number; row: number }[],
  gridOffset: Point,
): boolean {
  const bounds = tokenFootprintWorldBounds(token, gridOffset);
  for (const cell of cells) {
    const tl = gridCellTopLeft(cell, gridOffset);
    const cellBounds = {
      minX: tl.x,
      minY: tl.y,
      maxX: tl.x + GRID_SIZE_PX,
      maxY: tl.y + GRID_SIZE_PX,
    };
    if (boundsIntersect(bounds, cellBounds)) return true;
  }
  return false;
}

/** True when any part of the token footprint lies inside the active measurement. */
export function isTokenInMeasurement(
  token: Pick<Token, 'gridPos' | 'posOffset' | 'footprint'>,
  kind: MeasureKind,
  params: MeasurementParams,
  displayStyle: MeasureDisplayStyle,
  gridOffset = getGridOffset(),
): boolean {
  const bounds = tokenFootprintWorldBounds(token, gridOffset);
  const samples = tokenFootprintSamples(token, gridOffset);
  const reach =
    Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2 + 3;

  if (kind === 'line') {
    const p = params as LineMeasureParams;
    if (displayStyle === '5e') {
      return footprintOverlapsCells(
        token,
        line5eIncludedCells(p.from, p.to, gridOffset),
        gridOffset,
      );
    }
    return samples.some((pt) => distancePointToSegment(pt, p.from, p.to) <= reach);
  }

  if (kind === 'cube') {
    const p = params as CubeMeasureParams;
    if (displayStyle === '5e') {
      return footprintOverlapsCells(
        token,
        cube5eIncludedCells(p.center, p.radiusCells),
        gridOffset,
      );
    }
    const center = cubeCenterWorld(p, gridOffset);
    const size = p.radiusCells * 2 * GRID_SIZE_PX + GRID_SIZE_PX;
    const x = center.x - size / 2;
    const y = center.y - size / 2;
    const cubeBounds = {
      minX: x,
      minY: y,
      maxX: x + size,
      maxY: y + size,
    };
    return boundsIntersect(bounds, cubeBounds);
  }

  if (kind === 'sphere') {
    const p = params as SphereMeasureParams;
    if (displayStyle === '5e') {
      return footprintOverlapsCells(
        token,
        sphere5eIncludedCells(p, gridOffset),
        gridOffset,
      );
    }
    const c = sphereCenterWorld(p, gridOffset);
    const r = sphereRadiusWorld(p);
    return circleIntersectsRect(c, r, bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  }

  if (kind === 'cone') {
    const p = params as ConeMeasureParams;
    const style = displayStyle ?? p.style ?? 'vtt';
    if (style === '5e') {
      return footprintOverlapsCells(
        token,
        cone5eIncludedCells(p.origin, p.direction, p.lengthCells, gridOffset),
        gridOffset,
      );
    }
    const length = p.lengthWorld ?? p.lengthCells * GRID_SIZE_PX;
    return samples.some((pt) =>
      isPointInConeVtt(pt, p.origin, p.direction, length, p.angleDeg),
    );
  }

  return false;
}

export function isValidDrawPreview(preview: DrawPreview): boolean {
  if (preview.kind === 'stroke') {
    return (preview.points?.length ?? 0) >= 2;
  }
  if (!preview.params) return false;
  if (preview.kind === 'text') {
    return isDrawTextParams(preview.params) && preview.params.text.length > 0;
  }
  if (preview.kind === 'line') {
    const p = preview.params as LineMeasureParams;
    return p.from.x !== p.to.x || p.from.y !== p.to.y;
  }
  if (preview.kind === 'rect') {
    const p = preview.params as RectMeasureParams;
    return p.from.x !== p.to.x || p.from.y !== p.to.y;
  }
  if (preview.kind === 'cone') {
    const p = preview.params as ConeMeasureParams;
    return p.lengthCells > 0 || (p.lengthWorld ?? 0) > 0;
  }
  return true;
}

export function resolveDrawColor(color: string | undefined): string {
  if (color && color.startsWith('#') && color.length === 7) return color;
  return colorFromHue(0);
}

export function drawFillColor(color: string | undefined, alpha = 0.22): string {
  const resolved = resolveDrawColor(color);
  if (resolved.startsWith('#') && resolved.length === 7) {
    const r = parseInt(resolved.slice(1, 3), 16);
    const g = parseInt(resolved.slice(3, 5), 16);
    const b = parseInt(resolved.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return resolved;
}

export function drawOutlineWidth(strokeWidth: number): number {
  return Math.max(1, strokeWidth);
}

export function eraserRadiusWorld(viewScale: number): number {
  return ERASER_RADIUS_SCREEN_PX / viewScale;
}

function shiftPoint(p: Point, delta: Point): Point {
  return { x: p.x + delta.x, y: p.y + delta.y };
}

function transformPointWithMap(
  world: Point,
  baseTransform: MapTransform,
  newTransform: MapTransform,
): Point {
  return transformWorldPointBetweenMaps(world, baseTransform, newTransform);
}

export function snapshotDrawStrokesForEdit(strokes: DrawStroke[]): DrawStroke[] {
  return strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points?.map((p) => ({ ...p })),
    params: stroke.params
      ? (JSON.parse(JSON.stringify(stroke.params)) as typeof stroke.params)
      : undefined,
  }));
}

export function shiftDrawStroke(
  stroke: DrawStroke,
  delta: Point,
  gridOffset = DEFAULT_GRID_OFFSET,
): DrawStroke {
  if (stroke.kind === 'stroke') {
    return {
      ...stroke,
      points: (stroke.points ?? []).map((p) => shiftPoint(p, delta)),
    };
  }
  if (!stroke.params) return stroke;
  if (stroke.kind === 'line') {
    const p = stroke.params as LineMeasureParams;
    return {
      ...stroke,
      params: { from: shiftPoint(p.from, delta), to: shiftPoint(p.to, delta) },
    };
  }
  if (stroke.kind === 'rect') {
    const p = stroke.params as RectMeasureParams;
    return {
      ...stroke,
      params: { from: shiftPoint(p.from, delta), to: shiftPoint(p.to, delta) },
    };
  }
  if (stroke.kind === 'cone') {
    const p = stroke.params as ConeMeasureParams;
    return { ...stroke, params: { ...p, origin: shiftPoint(p.origin, delta) } };
  }
  if (stroke.kind === 'text' && isDrawTextParams(stroke.params)) {
    const p = stroke.params;
    return {
      ...stroke,
      params: { ...p, origin: shiftPoint(p.origin, delta) },
    };
  }
  if (stroke.kind === 'sphere' && stroke.params) {
    const p = stroke.params as SphereMeasureParams;
    const shifted = shiftPoint(sphereCenterWorld(p, gridOffset), delta);
    return {
      ...stroke,
      params: {
        ...p,
        origin: shifted,
        center: worldToGridCell(shifted, gridOffset),
      },
    };
  }
  return stroke;
}

export function transformDrawStrokeForMap(
  stroke: DrawStroke,
  oldTransform: MapTransform,
  newTransform: MapTransform,
  gridOffset = DEFAULT_GRID_OFFSET,
): DrawStroke {
  if (stroke.kind === 'stroke') {
    return {
      ...stroke,
      points: (stroke.points ?? []).map((p) =>
        transformPointWithMap(p, oldTransform, newTransform),
      ),
    };
  }
  if (!stroke.params) return stroke;
  if (stroke.kind === 'line') {
    const p = stroke.params as LineMeasureParams;
    return {
      ...stroke,
      params: {
        from: transformPointWithMap(p.from, oldTransform, newTransform),
        to: transformPointWithMap(p.to, oldTransform, newTransform),
      },
    };
  }
  if (stroke.kind === 'rect') {
    const p = stroke.params as RectMeasureParams;
    return {
      ...stroke,
      params: {
        from: transformPointWithMap(p.from, oldTransform, newTransform),
        to: transformPointWithMap(p.to, oldTransform, newTransform),
        rotationDeg: p.rotationDeg,
      },
    };
  }
  if (stroke.kind === 'cone') {
    const p = stroke.params as ConeMeasureParams;
    return {
      ...stroke,
      params: {
        ...p,
        origin: transformPointWithMap(p.origin, oldTransform, newTransform),
      },
    };
  }
  if (stroke.kind === 'text' && isDrawTextParams(stroke.params)) {
    const p = stroke.params;
    const scale = newTransform.scale / (oldTransform.scale || 1);
    return {
      ...stroke,
      strokeWidth: Math.max(1, stroke.strokeWidth * scale),
      params: {
        ...p,
        origin: transformPointWithMap(p.origin, oldTransform, newTransform),
      },
    };
  }
  if (stroke.kind === 'sphere' && stroke.params) {
    const p = stroke.params as SphereMeasureParams;
    const centerWorld = sphereCenterWorld(p, gridOffset);
    const nextCenter = transformPointWithMap(centerWorld, oldTransform, newTransform);
    const scale = newTransform.scale / (oldTransform.scale || 1);
    return {
      ...stroke,
      params: {
        ...p,
        origin: nextCenter,
        center: worldToGridCell(nextCenter, gridOffset),
        radiusWorld: p.radiusWorld != null ? p.radiusWorld * scale : p.radiusWorld,
      },
    };
  }
  const mp = stroke.params as CubeMeasureParams;
  const centerWorld = cubeCenterWorld(mp, gridOffset);
  const nextCenter = transformPointWithMap(centerWorld, oldTransform, newTransform);
  return {
    ...stroke,
    params: {
      ...mp,
      origin: nextCenter,
      center: worldToGridCell(nextCenter, gridOffset),
    },
  };
}

export function drawStrokeAnchorWorld(
  stroke: DrawStroke,
  gridOffset = DEFAULT_GRID_OFFSET,
): Point | null {
  if (stroke.kind === 'stroke') {
    const pts = stroke.points ?? [];
    if (pts.length === 0) return null;
    return pts[Math.floor(pts.length / 2)]!;
  }
  if (!stroke.params) return null;
  if (stroke.kind === 'line') {
    const p = stroke.params as LineMeasureParams;
    return { x: (p.from.x + p.to.x) / 2, y: (p.from.y + p.to.y) / 2 };
  }
  if (stroke.kind === 'rect') {
    const { cx, cy } = rectLocalBox(stroke.params as RectMeasureParams);
    return { x: cx, y: cy };
  }
  if (stroke.kind === 'cone') {
    return (stroke.params as ConeMeasureParams).origin;
  }
  if (stroke.kind === 'text' && isDrawTextParams(stroke.params)) {
    return stroke.params.origin;
  }
  if (stroke.kind === 'sphere') {
    return sphereCenterWorld(stroke.params as SphereMeasureParams, gridOffset);
  }
  return cubeCenterWorld(stroke.params as CubeMeasureParams, gridOffset);
}

export function isParametricDrawShape(
  kind: DrawShapeKind,
): kind is Exclude<DrawShapeKind, 'stroke'> {
  return kind !== 'stroke';
}

function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function circleIntersectsRect(
  center: Point,
  radius: number,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  const closestX = Math.max(x, Math.min(center.x, x + w));
  const closestY = Math.max(y, Math.min(center.y, y + h));
  return Math.hypot(center.x - closestX, center.y - closestY) <= radius;
}

function pointInPolygon(point: Point, ring: number[]): boolean {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2]!;
    const yi = ring[i * 2 + 1]!;
    const xj = ring[j * 2]!;
    const yj = ring[j * 2 + 1]!;
    if ((yi > point.y) !== (yj > point.y)) {
      const xIntersect = ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
      if (point.x < xIntersect) inside = !inside;
    }
  }
  return inside;
}

function circleIntersectsPolygon(center: Point, radius: number, ring: number[]): boolean {
  if (pointInPolygon(center, ring)) return true;
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    const a = { x: ring[i * 2]!, y: ring[i * 2 + 1]! };
    const b = { x: ring[((i + 1) % n) * 2]!, y: ring[((i + 1) % n) * 2 + 1]! };
    if (Math.hypot(center.x - a.x, center.y - a.y) <= radius) return true;
    if (distancePointToSegment(center, a, b) <= radius) return true;
  }
  return false;
}

export function drawStrokeHitByEraser(
  stroke: DrawStroke,
  center: Point,
  eraserRadius: number,
  gridOffset = DEFAULT_GRID_OFFSET,
): boolean {
  const strokeHalf = drawOutlineWidth(stroke.strokeWidth) / 2;
  const reach = eraserRadius + strokeHalf;

  if (stroke.kind === 'stroke') {
    const pts = stroke.points ?? [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      if (Math.hypot(p.x - center.x, p.y - center.y) <= reach) return true;
      if (i > 0 && distancePointToSegment(center, pts[i - 1]!, p) <= reach) return true;
    }
    return false;
  }

  if (stroke.kind === 'line' && stroke.params) {
    const p = stroke.params as LineMeasureParams;
    return distancePointToSegment(center, p.from, p.to) <= reach;
  }

  if (stroke.kind === 'rect' && stroke.params) {
    const p = stroke.params as RectMeasureParams;
    if ((p.rotationDeg ?? 0) === 0) {
      const box = rectParamsBox(p);
      return circleIntersectsRect(center, eraserRadius + strokeHalf, box.x, box.y, box.w, box.h);
    }
    const ring: number[] = [];
    for (const corner of rectWorldCorners(p)) ring.push(corner.x, corner.y);
    return circleIntersectsPolygon(center, eraserRadius + strokeHalf, ring);
  }

  if (stroke.kind === 'cube' && stroke.params) {
    const p = stroke.params as CubeMeasureParams;
    const tl = gridCellTopLeft(
      { col: p.center.col - p.radiusCells, row: p.center.row - p.radiusCells },
      gridOffset,
    );
    const size = p.radiusCells * 2 * GRID_SIZE_PX + GRID_SIZE_PX;
    return circleIntersectsRect(center, eraserRadius + strokeHalf, tl.x, tl.y, size, size);
  }

  if (stroke.kind === 'sphere' && stroke.params) {
    const p = stroke.params as SphereMeasureParams;
    const c = sphereCenterWorld(p, gridOffset);
    const r = sphereRadiusWorld(p);
    return Math.hypot(center.x - c.x, center.y - c.y) <= eraserRadius + r + strokeHalf;
  }

  if (stroke.kind === 'cone' && stroke.params) {
    const p = stroke.params as ConeMeasureParams;
    if ((p.style ?? 'vtt') === 'vtt') {
      const length = p.lengthWorld ?? p.lengthCells * GRID_SIZE_PX;
      return isPointInConeVtt(center, p.origin, p.direction, length + strokeHalf, p.angleDeg);
    }
    return isPointInCone5e(center, p.origin, p.direction, p.lengthCells, gridOffset);
  }

  if (stroke.kind === 'text' && isDrawTextParams(stroke.params)) {
    const b = drawTextBounds(stroke.params, stroke.strokeWidth);
    return circleIntersectsRect(
      center,
      eraserRadius,
      b.minX,
      b.minY,
      b.maxX - b.minX,
      b.maxY - b.minY,
    );
  }

  return false;
}

export function drawStrokeIdsHitByEraser(
  strokes: DrawStroke[],
  center: Point,
  eraserRadius: number,
  skipIds?: ReadonlySet<string>,
  gridOffset = DEFAULT_GRID_OFFSET,
): string[] {
  const hits: string[] = [];
  for (const stroke of strokes) {
    if (skipIds?.has(stroke.id)) continue;
    if (drawStrokeHitByEraser(stroke, center, eraserRadius, gridOffset)) hits.push(stroke.id);
  }
  return hits;
}

export function hitDrawStrokeAt(
  world: Point,
  strokes: DrawStroke[],
  pickRadius = 8,
  gridOffset = getGridOffset(),
): DrawStroke | null {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const stroke = strokes[i]!;
    if (drawStrokeHitAtPoint(stroke, world, pickRadius, gridOffset)) return stroke;
  }
  return null;
}

function rectParamsBox(p: RectMeasureParams): { x: number; y: number; w: number; h: number } {
  const x = Math.min(p.from.x, p.to.x);
  const y = Math.min(p.from.y, p.to.y);
  return { x, y, w: Math.abs(p.to.x - p.from.x), h: Math.abs(p.to.y - p.from.y) };
}

function pointInRect(
  p: Point,
  x: number,
  y: number,
  w: number,
  h: number,
  pad = 0,
): boolean {
  return p.x >= x - pad && p.x <= x + w + pad && p.y >= y - pad && p.y <= y + h + pad;
}

function boundsIntersect(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

export function drawStrokeHitAtPoint(
  stroke: DrawStroke,
  world: Point,
  pickRadius = 8,
  gridOffset = getGridOffset(),
): boolean {
  const strokeHalf = drawOutlineWidth(stroke.strokeWidth) / 2;
  const reach = pickRadius + strokeHalf;

  if (stroke.kind === 'stroke') {
    const pts = stroke.points ?? [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      if (Math.hypot(p.x - world.x, p.y - world.y) <= reach) return true;
      if (i > 0 && distancePointToSegment(world, pts[i - 1]!, p) <= reach) return true;
    }
    return false;
  }

  if (stroke.kind === 'line' && stroke.params) {
    const p = stroke.params as LineMeasureParams;
    return distancePointToSegment(world, p.from, p.to) <= reach;
  }

  if (stroke.kind === 'rect' && stroke.params) {
    const p = stroke.params as RectMeasureParams;
    if ((p.rotationDeg ?? 0) === 0) {
      const box = rectParamsBox(p);
      return pointInRect(world, box.x, box.y, box.w, box.h, reach);
    }
    return pointInRotatedRect(world, p, reach);
  }

  if (stroke.kind === 'cube' && stroke.params) {
    const p = stroke.params as CubeMeasureParams;
    const tl = gridCellTopLeft(
      { col: p.center.col - p.radiusCells, row: p.center.row - p.radiusCells },
      gridOffset,
    );
    const size = p.radiusCells * 2 * GRID_SIZE_PX + GRID_SIZE_PX;
    return pointInRect(world, tl.x, tl.y, size, size, reach);
  }

  if (stroke.kind === 'sphere' && stroke.params) {
    const p = stroke.params as SphereMeasureParams;
    const c = sphereCenterWorld(p, gridOffset);
    const r = sphereRadiusWorld(p);
    return Math.hypot(world.x - c.x, world.y - c.y) <= r + reach;
  }

  if (stroke.kind === 'cone' && stroke.params) {
    const p = stroke.params as ConeMeasureParams;
    if ((p.style ?? 'vtt') === 'vtt') {
      const length = p.lengthWorld ?? p.lengthCells * GRID_SIZE_PX;
      return isPointInConeVtt(world, p.origin, p.direction, length + reach, p.angleDeg);
    }
    return isPointInCone5e(world, p.origin, p.direction, p.lengthCells, gridOffset);
  }

  if (stroke.kind === 'text' && isDrawTextParams(stroke.params)) {
    return pointInDrawTextBounds(world, stroke.params, stroke.strokeWidth, reach);
  }

  return false;
}

export function findDrawStrokesInScreenRect(
  strokes: DrawStroke[],
  a: Point,
  b: Point,
  stagePos: Point,
  scale: number,
  gridOffset = getGridOffset(),
): string[] {
  const minSx = Math.min(a.x, b.x);
  const maxSx = Math.max(a.x, b.x);
  const minSy = Math.min(a.y, b.y);
  const maxSy = Math.max(a.y, b.y);
  const sel = {
    minX: (minSx - stagePos.x) / scale,
    minY: (minSy - stagePos.y) / scale,
    maxX: (maxSx - stagePos.x) / scale,
    maxY: (maxSy - stagePos.y) / scale,
  };
  const hits: string[] = [];
  for (const stroke of strokes) {
    const bounds = drawStrokeBounds(stroke, gridOffset);
    if (!bounds) continue;
    const strokeBox = {
      minX: bounds.x,
      minY: bounds.y,
      maxX: bounds.x + bounds.width,
      maxY: bounds.y + bounds.height,
    };
    if (boundsIntersect(strokeBox, sel)) hits.push(stroke.id);
  }
  return hits;
}

export interface StrokeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_STROKE_BOUNDS = 4;
const MIN_STROKE_SCALE = 0.05;
const MAX_STROKE_SCALE = 8;

function strokePad(stroke: DrawStroke): number {
  return drawOutlineWidth(stroke.strokeWidth) / 2;
}

function expandBoundsFromPoints(points: Point[], pad: number): StrokeBounds | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return {
    x: minX - pad,
    y: minY - pad,
    width: Math.max(MIN_STROKE_BOUNDS, maxX - minX + pad * 2),
    height: Math.max(MIN_STROKE_BOUNDS, maxY - minY + pad * 2),
  };
}

export function drawStrokeBounds(
  stroke: DrawStroke,
  gridOffset = getGridOffset(),
): StrokeBounds | null {
  const pad = strokePad(stroke);

  if (stroke.kind === 'stroke') {
    return expandBoundsFromPoints(stroke.points ?? [], pad);
  }

  if (stroke.kind === 'line' && stroke.params) {
    const p = stroke.params as LineMeasureParams;
    return expandBoundsFromPoints([p.from, p.to], pad);
  }

  if (stroke.kind === 'rect' && stroke.params) {
    const p = stroke.params as RectMeasureParams;
    if ((p.rotationDeg ?? 0) === 0) {
      const box = rectParamsBox(p);
      return {
        x: box.x - pad,
        y: box.y - pad,
        width: Math.max(MIN_STROKE_BOUNDS, box.w + pad * 2),
        height: Math.max(MIN_STROKE_BOUNDS, box.h + pad * 2),
      };
    }
    return expandBoundsFromPoints(rectWorldCorners(p), pad);
  }

  if (stroke.kind === 'cube' && stroke.params) {
    const p = stroke.params as CubeMeasureParams;
    const tl = gridCellTopLeft(
      { col: p.center.col - p.radiusCells, row: p.center.row - p.radiusCells },
      gridOffset,
    );
    const size = p.radiusCells * 2 * GRID_SIZE_PX + GRID_SIZE_PX;
    return { x: tl.x - pad, y: tl.y - pad, width: size + pad * 2, height: size + pad * 2 };
  }

  if (stroke.kind === 'sphere' && stroke.params) {
    const p = stroke.params as SphereMeasureParams;
    const c = sphereCenterWorld(p, gridOffset);
    const r = sphereRadiusWorld(p) + pad;
    return { x: c.x - r, y: c.y - r, width: r * 2, height: r * 2 };
  }

  if (stroke.kind === 'cone' && stroke.params) {
    const p = stroke.params as ConeMeasureParams;
    const pts: Point[] =
      (p.style ?? 'vtt') === '5e'
        ? cone5eCellRects(p.origin, p.direction, p.lengthCells, gridOffset).flatMap((r) => [
            { x: r.x, y: r.y },
            { x: r.x + r.width, y: r.y + r.height },
          ])
        : (() => {
            const ring = conePolygonPoints(p, gridOffset);
            const out: Point[] = [];
            for (let i = 0; i < ring.length; i += 2) {
              out.push({ x: ring[i]!, y: ring[i + 1]! });
            }
            return out;
          })();
    if (pts.length === 0) return null;
    return expandBoundsFromPoints(pts, pad);
  }

  if (stroke.kind === 'text' && isDrawTextParams(stroke.params)) {
    const b = drawTextBounds(stroke.params, stroke.strokeWidth);
    return {
      x: b.minX - pad,
      y: b.minY - pad,
      width: Math.max(MIN_STROKE_BOUNDS, b.maxX - b.minX + pad * 2),
      height: Math.max(MIN_STROKE_BOUNDS, b.maxY - b.minY + pad * 2),
    };
  }

  return null;
}

export function drawStrokesGroupBounds(
  strokes: DrawStroke[],
  gridOffset = getGridOffset(),
): StrokeBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const stroke of strokes) {
    const b = drawStrokeBounds(stroke, gridOffset);
    if (!b) continue;
    any = true;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  if (!any) return null;
  return {
    x: minX,
    y: minY,
    width: Math.max(MIN_STROKE_BOUNDS, maxX - minX),
    height: Math.max(MIN_STROKE_BOUNDS, maxY - minY),
  };
}

export function shiftDrawStrokes(strokes: DrawStroke[], delta: Point): DrawStroke[] {
  return strokes.map((stroke) => shiftDrawStroke(stroke, delta));
}

/** Overlay scene strokes with in-progress edit preview (by stroke id). */
export function mergeDrawStrokeDragPreview(
  strokes: DrawStroke[],
  preview: DrawStroke[] | null,
): DrawStroke[] {
  if (!preview || preview.length === 0) return strokes;
  const byId = new Map(preview.map((stroke) => [stroke.id, stroke]));
  return strokes.map((stroke) => byId.get(stroke.id) ?? stroke);
}

export function scaleDrawStrokesFromCorner(
  strokes: DrawStroke[],
  corner: MapCorner,
  pointerWorld: Point,
  bounds: StrokeBounds,
  gridOffset = getGridOffset(),
): DrawStroke[] {
  return strokes.map((stroke) =>
    scaleDrawStrokeFromCorner(stroke, corner, pointerWorld, bounds, gridOffset),
  );
}

export function rotateDrawStrokes90(
  strokes: DrawStroke[],
  bounds: StrokeBounds,
  gridOffset = getGridOffset(),
): DrawStroke[] {
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  return rotateDrawStrokes(strokes, center, Math.PI / 2, gridOffset);
}

export function strokeCornerWorldPoints(bounds: StrokeBounds): Record<MapCorner, Point> {
  const { x, y, width, height } = bounds;
  return {
    nw: { x, y },
    ne: { x: x + width, y },
    se: { x: x + width, y: y + height },
    sw: { x, y: y + height },
  };
}

export function strokeBoundsOppositeCorner(corner: MapCorner, bounds: StrokeBounds): Point {
  const br = { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
  switch (corner) {
    case 'se':
      return { x: bounds.x, y: bounds.y };
    case 'nw':
      return br;
    case 'ne':
      return { x: bounds.x, y: br.y };
    case 'sw':
      return { x: br.x, y: bounds.y };
  }
}

export function uniformScaleFromCorner(
  corner: MapCorner,
  pointerWorld: Point,
  bounds: StrokeBounds,
): number {
  const anchor = strokeBoundsOppositeCorner(corner, bounds);
  let dx: number;
  let dy: number;
  switch (corner) {
    case 'se':
      dx = pointerWorld.x - anchor.x;
      dy = pointerWorld.y - anchor.y;
      break;
    case 'nw':
      dx = anchor.x - pointerWorld.x;
      dy = anchor.y - pointerWorld.y;
      break;
    case 'ne':
      dx = pointerWorld.x - anchor.x;
      dy = anchor.y - pointerWorld.y;
      break;
    case 'sw':
      dx = anchor.x - pointerWorld.x;
      dy = pointerWorld.y - anchor.y;
      break;
  }
  const scaleX = bounds.width > 0 ? dx / bounds.width : 1;
  const scaleY = bounds.height > 0 ? dy / bounds.height : 1;
  const scale = Math.min(scaleX, scaleY);
  return Math.max(MIN_STROKE_SCALE, Math.min(MAX_STROKE_SCALE, scale));
}

function scalePointFromAnchor(p: Point, anchor: Point, scale: number): Point {
  return {
    x: anchor.x + (p.x - anchor.x) * scale,
    y: anchor.y + (p.y - anchor.y) * scale,
  };
}

function rotatePoint(p: Point, center: Point, angleRad: number): Point {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: center.x + cos * dx - sin * dy,
    y: center.y + sin * dx + cos * dy,
  };
}

export function rotateDrawStroke(
  stroke: DrawStroke,
  center: Point,
  angleRad: number,
  gridOffset = DEFAULT_GRID_OFFSET,
): DrawStroke {
  if (angleRad === 0) return stroke;

  if (stroke.kind === 'stroke') {
    return {
      ...stroke,
      points: (stroke.points ?? []).map((p) => rotatePoint(p, center, angleRad)),
    };
  }

  if (stroke.kind === 'line' && stroke.params) {
    const p = stroke.params as LineMeasureParams;
    return {
      ...stroke,
      params: {
        from: rotatePoint(p.from, center, angleRad),
        to: rotatePoint(p.to, center, angleRad),
      },
    };
  }

  if (stroke.kind === 'rect' && stroke.params) {
    const p = stroke.params as RectMeasureParams;
    const { cx, cy, w, h } = rectLocalBox(p);
    const newC = rotatePoint({ x: cx, y: cy }, center, angleRad);
    const deltaDeg = (angleRad * 180) / Math.PI;
    return {
      ...stroke,
      params: {
        from: { x: newC.x - w / 2, y: newC.y - h / 2 },
        to: { x: newC.x + w / 2, y: newC.y + h / 2 },
        rotationDeg: (p.rotationDeg ?? 0) + deltaDeg,
      },
    };
  }

  if (stroke.kind === 'cone' && stroke.params) {
    const p = stroke.params as ConeMeasureParams;
    return {
      ...stroke,
      params: {
        ...p,
        origin: rotatePoint(p.origin, center, angleRad),
        direction: p.direction + angleRad,
      },
    };
  }

  if (stroke.kind === 'cube' && stroke.params) {
    const p = stroke.params as CubeMeasureParams;
    const cWorld = gridCellToWorldCenter(p.center, gridOffset);
    return {
      ...stroke,
      params: {
        ...p,
        center: worldToGridCell(rotatePoint(cWorld, center, angleRad), gridOffset),
      },
    };
  }

  if (stroke.kind === 'sphere' && stroke.params) {
    const p = stroke.params as SphereMeasureParams;
    const cWorld = sphereCenterWorld(p, gridOffset);
    const newCenter = rotatePoint(cWorld, center, angleRad);
    return {
      ...stroke,
      params: {
        ...p,
        origin: newCenter,
        center: worldToGridCell(newCenter, gridOffset),
      },
    };
  }

  if (stroke.kind === 'text' && isDrawTextParams(stroke.params)) {
    const p = stroke.params;
    return {
      ...stroke,
      params: {
        ...p,
        origin: rotatePoint(p.origin, center, angleRad),
      },
    };
  }

  return stroke;
}

export function rotateDrawStrokes(
  strokes: DrawStroke[],
  center: Point,
  angleRad: number,
  gridOffset = DEFAULT_GRID_OFFSET,
): DrawStroke[] {
  if (angleRad === 0) return strokes;
  return strokes.map((stroke) => rotateDrawStroke(stroke, center, angleRad, gridOffset));
}

export function scaleDrawStrokeFromCorner(
  stroke: DrawStroke,
  corner: MapCorner,
  pointerWorld: Point,
  bounds: StrokeBounds,
  gridOffset = DEFAULT_GRID_OFFSET,
): DrawStroke {
  const scale = uniformScaleFromCorner(corner, pointerWorld, bounds);
  const anchor = strokeBoundsOppositeCorner(corner, bounds);

  if (stroke.kind === 'stroke') {
    return {
      ...stroke,
      points: (stroke.points ?? []).map((p) => scalePointFromAnchor(p, anchor, scale)),
    };
  }

  if (stroke.kind === 'line' && stroke.params) {
    const p = stroke.params as LineMeasureParams;
    return {
      ...stroke,
      params: {
        from: scalePointFromAnchor(p.from, anchor, scale),
        to: scalePointFromAnchor(p.to, anchor, scale),
      },
    };
  }

  if (stroke.kind === 'rect' && stroke.params) {
    const p = stroke.params as RectMeasureParams;
    return {
      ...stroke,
      params: {
        ...p,
        from: scalePointFromAnchor(p.from, anchor, scale),
        to: scalePointFromAnchor(p.to, anchor, scale),
      },
    };
  }

  if (stroke.kind === 'cone' && stroke.params) {
    const p = stroke.params as ConeMeasureParams;
    return {
      ...stroke,
      params: {
        ...p,
        origin: scalePointFromAnchor(p.origin, anchor, scale),
        lengthCells: Math.max(0.25, p.lengthCells * scale),
        lengthWorld: p.lengthWorld != null ? Math.max(1, p.lengthWorld * scale) : undefined,
      },
    };
  }

  if (stroke.kind === 'cube' && stroke.params) {
    const p = stroke.params as CubeMeasureParams;
    const tl = gridCellTopLeft(
      { col: p.center.col - p.radiusCells, row: p.center.row - p.radiusCells },
      gridOffset,
    );
    const size = p.radiusCells * 2 * GRID_SIZE_PX + GRID_SIZE_PX;
    const newTl = scalePointFromAnchor(tl, anchor, scale);
    const newSize = Math.max(MIN_STROKE_BOUNDS, size * scale);
    const newCenterWorld = { x: newTl.x + newSize / 2, y: newTl.y + newSize / 2 };
    const newRadius = Math.max(0, (newSize - GRID_SIZE_PX) / (2 * GRID_SIZE_PX));
    return {
      ...stroke,
      params: {
        center: worldToGridCell(newCenterWorld, gridOffset),
        radiusCells: newRadius,
      },
    };
  }

  if (stroke.kind === 'sphere' && stroke.params) {
    const p = stroke.params as SphereMeasureParams;
    const c = sphereCenterWorld(p, gridOffset);
    const r = sphereRadiusWorld(p);
    const newCenter = scalePointFromAnchor(c, anchor, scale);
    const newRadius = Math.max(GRID_SIZE_PX / 4, r * scale);
    return {
      ...stroke,
      params: {
        ...p,
        origin: newCenter,
        center: worldToGridCell(newCenter, gridOffset),
        radiusWorld: newRadius,
        radiusCells: Math.max(0, newRadius / GRID_SIZE_PX - 0.5),
      },
    };
  }

  if (stroke.kind === 'text' && isDrawTextParams(stroke.params)) {
    const p = stroke.params;
    return {
      ...stroke,
      strokeWidth: Math.max(1, stroke.strokeWidth * scale),
      params: {
        ...p,
        origin: scalePointFromAnchor(p.origin, anchor, scale),
      },
    };
  }

  return stroke;
}

export function rotateDrawStroke90(
  stroke: DrawStroke,
  bounds: StrokeBounds,
  gridOffset = DEFAULT_GRID_OFFSET,
): DrawStroke {
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  return rotateDrawStroke(stroke, center, Math.PI / 2, gridOffset);
}
