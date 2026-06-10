import { getGridOffset, GRID_SIZE_PX } from './fixedGrid';
import { gridCellTopLeft, gridCellToWorldCenter, worldToGridCell } from './grid';
import type {
  ConeMeasureParams,
  GridCell,
  MeasureDisplayStyle,
  Point,
  SphereMeasureParams,
} from './types';

export function chebyshevCells(from: GridCell, to: GridCell): number {
  return Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row));
}

export function distanceFt5e(
  from: GridCell,
  to: GridCell,
  cellFt: number,
  alternatingDiagonals: boolean,
): number {
  const dx = Math.abs(to.col - from.col);
  const dy = Math.abs(to.row - from.row);
  if (!alternatingDiagonals) {
    return chebyshevCells(from, to) * cellFt;
  }
  const diagonals = Math.min(dx, dy);
  const straights = Math.abs(dx - dy);
  const diagCost =
    Math.ceil(diagonals / 2) * cellFt + Math.floor(diagonals / 2) * 2 * cellFt;
  return diagCost + straights * cellFt;
}

export function distanceFtFromWorld(
  from: Point,
  to: Point,
  cellFt: number,
  _sizePx: number,
  alternatingDiagonals: boolean,
  gridOffset = getGridOffset(),
): number {
  const fromCell = worldToGridCell(from, gridOffset);
  const toCell = worldToGridCell(to, gridOffset);
  return distanceFt5e(fromCell, toCell, cellFt, alternatingDiagonals);
}

export function lineLengthFt(
  from: Point,
  to: Point,
  cellFt: number,
  _sizePx: number,
  alternatingDiagonals: boolean,
  gridOffset = getGridOffset(),
): number {
  return distanceFtFromWorld(from, to, cellFt, _sizePx, alternatingDiagonals, gridOffset);
}

/** PHB: width at distance d equals d → half-angle = atan(0.5) ≈ 26.57°, full ≈ 53.13°. */
export const PHB_CONE_ANGLE_DEG = (Math.atan(0.5) * 360) / Math.PI;

export function coneAxialLengthFromDrag(start: Point, end: Point): number {
  const dir = Math.atan2(end.y - start.y, end.x - start.x);
  const forward = (end.x - start.x) * Math.cos(dir) + (end.y - start.y) * Math.sin(dir);
  return Math.max(0, forward);
}

/** PHB cone in world space: height = axial length; base width equals height at the far edge. */
export function isPointInPhbConeWorld(
  point: Point,
  origin: Point,
  direction: number,
  lengthWorld: number,
): boolean {
  if (lengthWorld <= 0) return false;
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const cos = Math.cos(direction);
  const sin = Math.sin(direction);
  const forward = dx * cos + dy * sin;
  const lateral = Math.abs(-dx * sin + dy * cos);
  if (forward <= 0 || forward > lengthWorld + 1e-6) return false;
  return lateral <= forward / 2 + 1e-6;
}

/** Flat-base PHB wedge: origin → left base corner → right base corner (base width = height). */
export function coneVttWedgePoints(
  origin: Point,
  direction: number,
  length: number,
  _angleDeg?: number,
): number[] {
  if (length <= 0) return [];
  const cos = Math.cos(direction);
  const sin = Math.sin(direction);
  const px = -sin;
  const py = cos;
  const halfBase = length / 2;
  const baseCx = origin.x + cos * length;
  const baseCy = origin.y + sin * length;
  return [
    origin.x,
    origin.y,
    baseCx - px * halfBase,
    baseCy - py * halfBase,
    baseCx + px * halfBase,
    baseCy + py * halfBase,
  ];
}

/** @deprecated use coneVttWedgePoints */
export function coneArcPoints(
  origin: Point,
  direction: number,
  length: number,
  angleDeg: number,
  _segments?: number,
): number[] {
  return coneVttWedgePoints(origin, direction, length, angleDeg);
}

export function isPointInConeVtt(
  point: Point,
  origin: Point,
  direction: number,
  length: number,
  _angleDeg?: number,
): boolean {
  return isPointInPhbConeWorld(point, origin, direction, length);
}

/** PHB: include a square when its center is inside the cone (width at distance d equals d). */
function isCellCenterInPhbCone(
  center: Point,
  origin: Point,
  direction: number,
  lengthCells: number,
): boolean {
  const dx = center.x - origin.x;
  const dy = center.y - origin.y;
  const cos = Math.cos(direction);
  const sin = Math.sin(direction);
  const forward = (dx * cos + dy * sin) / GRID_SIZE_PX;
  const lateral = Math.abs(-dx * sin + dy * cos) / GRID_SIZE_PX;
  if (forward <= 0 || forward > lengthCells + 0.501) return false;
  return lateral <= forward / 2 + 0.501;
}

/** PHB grid cone: all squares whose centers fall inside the cone template. */
export function cone5eIncludedCells(
  origin: Point,
  direction: number,
  lengthCells: number,
  gridOffset = getGridOffset(),
): GridCell[] {
  if (lengthCells <= 0) return [];
  const reach = (lengthCells + 1) * GRID_SIZE_PX;
  const cos = Math.cos(direction);
  const sin = Math.sin(direction);
  const px = -sin;
  const py = cos;
  const samplePoints: Point[] = [
    origin,
    { x: origin.x + cos * reach, y: origin.y + sin * reach },
    { x: origin.x + cos * reach + px * reach, y: origin.y + sin * reach + py * reach },
    { x: origin.x + cos * reach - px * reach, y: origin.y + sin * reach - py * reach },
    { x: origin.x + px * reach, y: origin.y + py * reach },
    { x: origin.x - px * reach, y: origin.y - py * reach },
  ];
  let minCol = Infinity;
  let minRow = Infinity;
  let maxCol = -Infinity;
  let maxRow = -Infinity;
  for (const p of samplePoints) {
    const cell = worldToGridCell(p, gridOffset);
    minCol = Math.min(minCol, cell.col - 1);
    maxCol = Math.max(maxCol, cell.col + 1);
    minRow = Math.min(minRow, cell.row - 1);
    maxRow = Math.max(maxRow, cell.row + 1);
  }
  const included: GridCell[] = [];
  for (let col = minCol; col <= maxCol; col++) {
    for (let row = minRow; row <= maxRow; row++) {
      const center = gridCellToWorldCenter({ col, row }, gridOffset);
      if (isCellCenterInPhbCone(center, origin, direction, lengthCells)) {
        included.push({ col, row });
      }
    }
  }
  return included;
}

/** True when the point lies in a square whose center is inside the 5e grid cone. */
export function isPointInCone5e(
  point: Point,
  origin: Point,
  direction: number,
  lengthCells: number,
  gridOffset = getGridOffset(),
): boolean {
  if (lengthCells <= 0) return false;
  const cell = worldToGridCell(point, gridOffset);
  const included = cone5eIncludedCells(origin, direction, lengthCells, gridOffset);
  return included.some((c) => c.col === cell.col && c.row === cell.row);
}

function vertexKey(p: Point): string {
  return `${p.x},${p.y}`;
}

function uniquePoints(points: Point[]): Point[] {
  const seen = new Set<string>();
  const out: Point[] = [];
  for (const p of points) {
    const k = vertexKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function pickStartOutlineNeighbor(start: Point, neighbors: Point[]): Point {
  const rank = (n: Point): number => {
    const dx = n.x - start.x;
    const dy = n.y - start.y;
    if (dy === 0 && dx > 0) return 0;
    if (dx === 0 && dy > 0) return 1;
    if (dy === 0 && dx < 0) return 2;
    return 3;
  };
  return neighbors.reduce((best, n) => (rank(n) < rank(best) ? n : best));
}

function edgeUndirectedKey(a: Point, b: Point): string {
  const k1 = vertexKey(a);
  const k2 = vertexKey(b);
  return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
}

/** Boundary edges of a grid-cell union (shared internal edges removed). */
export function gridCellsUnionBoundarySegments(
  cells: GridCell[],
  gridOffset = getGridOffset(),
): Array<[Point, Point]> {
  if (cells.length === 0) return [];
  const cellSet = new Set(cells.map((c) => `${c.col},${c.row}`));
  const s = GRID_SIZE_PX;
  const has = (col: number, row: number) => cellSet.has(`${col},${row}`);

  const edgeMap = new Map<string, [Point, Point]>();

  const toggleEdge = (a: Point, b: Point) => {
    const key = edgeUndirectedKey(a, b);
    if (edgeMap.has(key)) edgeMap.delete(key);
    else edgeMap.set(key, [a, b]);
  };

  for (const cell of cells) {
    const tl = gridCellTopLeft(cell, gridOffset);
    const x = tl.x;
    const y = tl.y;
    const x2 = x + s;
    const y2 = y + s;
    const { col, row } = cell;

    if (!has(col + 1, row)) toggleEdge({ x: x2, y }, { x: x2, y: y2 });
    if (!has(col, row + 1)) toggleEdge({ x: x2, y: y2 }, { x, y: y2 });
    if (!has(col - 1, row)) toggleEdge({ x, y: y2 }, { x, y });
    if (!has(col, row - 1)) toggleEdge({ x, y }, { x: x2, y });
  }

  return [...edgeMap.values()];
}

function nextBoundaryNeighbor(prev: Point, curr: Point, neighbors: Point[]): Point {
  if (neighbors.length === 1) return neighbors[0]!;
  const inAngle = Math.atan2(curr.y - prev.y, curr.x - prev.x);
  let best = neighbors[0]!;
  let bestTurn = Infinity;
  for (const n of neighbors) {
    const outAngle = Math.atan2(n.y - curr.y, n.x - curr.x);
    let turn = outAngle - inAngle;
    while (turn <= 0) turn += 2 * Math.PI;
    while (turn > 2 * Math.PI) turn -= 2 * Math.PI;
    if (turn < bestTurn) {
      bestTurn = turn;
      best = n;
    }
  }
  return best;
}

/** Outer boundary of a union of grid cells (orthogonal polygon). */
export function gridCellsUnionOutline(
  cells: GridCell[],
  gridOffset = getGridOffset(),
): Point[] {
  const segments = gridCellsUnionBoundarySegments(cells, gridOffset);
  if (segments.length === 0) return [];

  const adj = new Map<string, Point[]>();
  const link = (a: Point, b: Point) => {
    adj.set(vertexKey(a), [...(adj.get(vertexKey(a)) ?? []), b]);
    adj.set(vertexKey(b), [...(adj.get(vertexKey(b)) ?? []), a]);
  };
  for (const [a, b] of segments) {
    link(a, b);
    link(b, a);
  }

  let start: Point | null = null;
  for (const key of adj.keys()) {
    const [x, y] = key.split(',').map(Number);
    const p = { x: x!, y: y! };
    if (!start || p.y < start.y || (p.y === start.y && p.x < start.x)) start = p;
  }
  if (!start) return [];

  const outline: Point[] = [start];
  let prev: Point | null = null;
  let curr = start;
  for (let step = 0; step <= segments.length + 4; step++) {
    const neighbors = uniquePoints(adj.get(vertexKey(curr)) ?? []).filter(
      (n) => !prev || n.x !== prev.x || n.y !== prev.y,
    );
    if (neighbors.length === 0) break;
    const next =
      prev === null
        ? neighbors.length > 1
          ? pickStartOutlineNeighbor(start, neighbors)
          : neighbors[0]!
        : nextBoundaryNeighbor(prev, curr, neighbors);
    if (next.x === start.x && next.y === start.y && outline.length > 2) break;
    outline.push(next);
    prev = curr;
    curr = next;
  }
  return outline;
}

export function cone5eOutlinePoints(
  origin: Point,
  direction: number,
  lengthCells: number,
  gridOffset = getGridOffset(),
): number[] {
  const cells = cone5eIncludedCells(origin, direction, lengthCells, gridOffset);
  const outline = gridCellsUnionOutline(cells, gridOffset);
  const flat: number[] = [];
  for (const p of outline) flat.push(p.x, p.y);
  return flat;
}

export function cone5eCellRects(
  origin: Point,
  direction: number,
  lengthCells: number,
  gridOffset = getGridOffset(),
): Array<{ x: number; y: number; width: number; height: number }> {
  const s = GRID_SIZE_PX;
  return cone5eIncludedCells(origin, direction, lengthCells, gridOffset).map((cell) => {
    const tl = gridCellTopLeft(cell, gridOffset);
    return { x: tl.x, y: tl.y, width: s, height: s };
  });
}

/** MultiPolygon rings for fog — one rect per affected cell. */
export function cone5eFogPolygons(
  origin: Point,
  direction: number,
  lengthCells: number,
  gridOffset = getGridOffset(),
): [number, number][][][] {
  const s = GRID_SIZE_PX;
  return cone5eIncludedCells(origin, direction, lengthCells, gridOffset).map((cell) => {
    const tl = gridCellTopLeft(cell, gridOffset);
    const ring: [number, number][] = [
      [tl.x, tl.y],
      [tl.x + s, tl.y],
      [tl.x + s, tl.y + s],
      [tl.x, tl.y + s],
      [tl.x, tl.y],
    ];
    return [ring];
  });
}

export function conePolygonPoints(
  params: ConeMeasureParams,
  gridOffset = getGridOffset(),
): number[] {
  const style: MeasureDisplayStyle = params.style ?? 'vtt';
  if (style === 'vtt') {
    const length = params.lengthWorld ?? params.lengthCells * GRID_SIZE_PX;
    return coneVttWedgePoints(params.origin, params.direction, length, params.angleDeg);
  }
  return cone5eOutlinePoints(params.origin, params.direction, params.lengthCells, gridOffset);
}

export function gridCellsToRects(
  cells: GridCell[],
  gridOffset = getGridOffset(),
): Array<{ x: number; y: number; width: number; height: number }> {
  const s = GRID_SIZE_PX;
  return cells.map((cell) => {
    const tl = gridCellTopLeft(cell, gridOffset);
    return { x: tl.x, y: tl.y, width: s, height: s };
  });
}

function bresenhamGridCells(from: GridCell, to: GridCell): GridCell[] {
  let col = from.col;
  let row = from.row;
  const endCol = to.col;
  const endRow = to.row;
  const cells: GridCell[] = [];
  const dCol = Math.abs(endCol - col);
  const dRow = Math.abs(endRow - row);
  const stepCol = col < endCol ? 1 : -1;
  const stepRow = row < endRow ? 1 : -1;
  let err = dCol - dRow;

  while (true) {
    cells.push({ col, row });
    if (col === endCol && row === endRow) break;
    const e2 = 2 * err;
    if (e2 > -dRow) {
      err -= dRow;
      col += stepCol;
    }
    if (e2 < dCol) {
      err += dCol;
      row += stepRow;
    }
  }
  return cells;
}

/** Grid cells along the ruler path (Bresenham between endpoint cells). */
export function line5eIncludedCells(
  from: Point,
  to: Point,
  gridOffset = getGridOffset(),
): GridCell[] {
  const start = worldToGridCell(from, gridOffset);
  const end = worldToGridCell(to, gridOffset);
  return bresenhamGridCells(start, end);
}

/** PHB cube: squares within Chebyshev radius of the center cell. */
export function cube5eIncludedCells(
  center: GridCell,
  radiusCells: number,
): GridCell[] {
  if (radiusCells < 0) return [];
  const cells: GridCell[] = [];
  for (let dc = -radiusCells; dc <= radiusCells; dc++) {
    for (let dr = -radiusCells; dr <= radiusCells; dr++) {
      if (Math.max(Math.abs(dc), Math.abs(dr)) <= radiusCells) {
        cells.push({ col: center.col + dc, row: center.row + dr });
      }
    }
  }
  return cells;
}

function circleIntersectsGridCell(
  origin: Point,
  radiusWorld: number,
  cell: GridCell,
  gridOffset: Point,
): boolean {
  if (radiusWorld <= 0) {
    const o = worldToGridCell(origin, gridOffset);
    return o.col === cell.col && o.row === cell.row;
  }
  const tl = gridCellTopLeft(cell, gridOffset);
  const s = GRID_SIZE_PX;
  const closestX = Math.max(tl.x, Math.min(origin.x, tl.x + s));
  const closestY = Math.max(tl.y, Math.min(origin.y, tl.y + s));
  const dx = origin.x - closestX;
  const dy = origin.y - closestY;
  return dx * dx + dy * dy <= radiusWorld * radiusWorld + 1e-6;
}

/** 5e sphere: every grid cell the VTT circle overlaps. */
export function sphere5eIncludedCells(
  params: SphereMeasureParams,
  gridOffset = getGridOffset(),
): GridCell[] {
  const origin =
    params.origin ?? gridCellToWorldCenter(params.center, gridOffset);
  const radiusWorld =
    params.radiusWorld ?? (params.radiusCells + 0.5) * GRID_SIZE_PX;

  if (radiusWorld <= 0) {
    return [worldToGridCell(origin, gridOffset)];
  }

  const margin = 1;
  const minCol =
    Math.floor((origin.x - radiusWorld - gridOffset.x) / GRID_SIZE_PX) - margin;
  const maxCol =
    Math.ceil((origin.x + radiusWorld - gridOffset.x) / GRID_SIZE_PX) + margin;
  const minRow =
    Math.floor((origin.y - radiusWorld - gridOffset.y) / GRID_SIZE_PX) - margin;
  const maxRow =
    Math.ceil((origin.y + radiusWorld - gridOffset.y) / GRID_SIZE_PX) + margin;

  const cells: GridCell[] = [];
  for (let col = minCol; col <= maxCol; col++) {
    for (let row = minRow; row <= maxRow; row++) {
      if (circleIntersectsGridCell(origin, radiusWorld, { col, row }, gridOffset)) {
        cells.push({ col, row });
      }
    }
  }
  return cells;
}

export function gridCellsOutlineFlat(
  cells: GridCell[],
  gridOffset = getGridOffset(),
): number[] {
  const flat: number[] = [];
  for (const [a, b] of gridCellsUnionBoundarySegments(cells, gridOffset)) {
    flat.push(a.x, a.y, b.x, b.y);
  }
  return flat;
}
