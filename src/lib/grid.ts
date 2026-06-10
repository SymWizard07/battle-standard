import { getGridOffset, GRID_SIZE_PX } from './fixedGrid';
import type { GridCell, Point, WorldBounds } from './types';

export function screenToWorld(
  screen: Point,
  stagePos: Point,
  scale: number,
): Point {
  return {
    x: (screen.x - stagePos.x) / scale,
    y: (screen.y - stagePos.y) / scale,
  };
}

export function worldToScreen(
  world: Point,
  stagePos: Point,
  scale: number,
): Point {
  return {
    x: world.x * scale + stagePos.x,
    y: world.y * scale + stagePos.y,
  };
}

export function worldToGridCell(world: Point, gridOffset = getGridOffset()): GridCell {
  const col = Math.floor((world.x - gridOffset.x) / GRID_SIZE_PX);
  const row = Math.floor((world.y - gridOffset.y) / GRID_SIZE_PX);
  return { col, row };
}

export function screenToGridCell(
  screen: Point,
  stagePos: Point,
  scale: number,
): GridCell {
  return worldToGridCell(screenToWorld(screen, stagePos, scale));
}

export function gridCellToWorldCenter(cell: GridCell, gridOffset = getGridOffset()): Point {
  return {
    x: gridOffset.x + (cell.col + 0.5) * GRID_SIZE_PX,
    y: gridOffset.y + (cell.row + 0.5) * GRID_SIZE_PX,
  };
}

export function gridCellTopLeft(cell: GridCell, gridOffset = getGridOffset()): Point {
  return {
    x: gridOffset.x + cell.col * GRID_SIZE_PX,
    y: gridOffset.y + cell.row * GRID_SIZE_PX,
  };
}

/** Decompose a world top-left into a grid cell plus sub-cell offset (no snapping). */
export function worldToSubGridTopLeft(
  world: Point,
  gridOffset = getGridOffset(),
): { gridPos: GridCell; posOffset: Point } {
  const localX = world.x - gridOffset.x;
  const localY = world.y - gridOffset.y;
  const col = Math.floor(localX / GRID_SIZE_PX);
  const row = Math.floor(localY / GRID_SIZE_PX);
  return {
    gridPos: { col, row },
    posOffset: {
      x: localX - col * GRID_SIZE_PX,
      y: localY - row * GRID_SIZE_PX,
    },
  };
}

export function tokenWorldTopLeft(
  token: { gridPos: GridCell; posOffset?: Point },
  gridOffset = getGridOffset(),
): Point {
  const tl = gridCellTopLeft(token.gridPos, gridOffset);
  const off = token.posOffset;
  if (!off) return tl;
  return { x: tl.x + off.x, y: tl.y + off.y };
}

export function posOffsetFromWorldTopLeft(posOffset: Point): Point | undefined {
  if (Math.abs(posOffset.x) < 1e-6 && Math.abs(posOffset.y) < 1e-6) return undefined;
  return posOffset;
}

export function getVisibleWorldBounds(
  stageWidth: number,
  stageHeight: number,
  stagePos: Point,
  scale: number,
  margin = 2,
): WorldBounds {
  const minX = (0 - stagePos.x) / scale;
  const minY = (0 - stagePos.y) / scale;
  const maxX = (stageWidth - stagePos.x) / scale;
  const maxY = (stageHeight - stagePos.y) / scale;
  const pad = margin * 50;
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

export function getCellSnapPoints(cell: GridCell): Point[] {
  const tl = gridCellTopLeft(cell);
  const s = GRID_SIZE_PX;
  return [
    { x: tl.x, y: tl.y },
    { x: tl.x + s / 2, y: tl.y },
    { x: tl.x + s, y: tl.y },
    { x: tl.x, y: tl.y + s / 2 },
    { x: tl.x + s / 2, y: tl.y + s / 2 },
    { x: tl.x + s, y: tl.y + s / 2 },
    { x: tl.x, y: tl.y + s },
    { x: tl.x + s / 2, y: tl.y + s },
    { x: tl.x + s, y: tl.y + s },
  ];
}

export function snapWorldToGrid(
  world: Point,
  thresholdPx: number,
): Point {
  const cell = worldToGridCell(world);
  const neighbors: GridCell[] = [
    cell,
    { col: cell.col - 1, row: cell.row },
    { col: cell.col + 1, row: cell.row },
    { col: cell.col, row: cell.row - 1 },
    { col: cell.col, row: cell.row + 1 },
  ];
  let best = world;
  let bestDist = thresholdPx;
  for (const c of neighbors) {
    for (const p of getCellSnapPoints(c)) {
      const d = Math.hypot(p.x - world.x, p.y - world.y);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
  }
  return best;
}

export function tokenOccupiesCell(
  token: { gridPos: GridCell; footprint: { w: number; h: number } },
  cell: GridCell,
): boolean {
  return (
    cell.col >= token.gridPos.col &&
    cell.col < token.gridPos.col + token.footprint.w &&
    cell.row >= token.gridPos.row &&
    cell.row < token.gridPos.row + token.footprint.h
  );
}

export function findTokenAtCell(
  tokens: { id: string; gridPos: GridCell; footprint: { w: number; h: number } }[],
  cell: GridCell,
): string | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokenOccupiesCell(tokens[i], cell)) return tokens[i].id;
  }
  return null;
}

export function tokenFootprintWorldBounds(
  token: { gridPos: GridCell; posOffset?: Point; footprint: { w: number; h: number } },
  gridOffset = getGridOffset(),
): WorldBounds {
  const tl = tokenWorldTopLeft(token, gridOffset);
  return {
    minX: tl.x,
    minY: tl.y,
    maxX: tl.x + token.footprint.w * GRID_SIZE_PX,
    maxY: tl.y + token.footprint.h * GRID_SIZE_PX,
  };
}

/** Topmost token whose footprint contains the world point (unsnapped pointer). */
export function findTokenAtWorld(
  world: Point,
  tokens: { id: string; gridPos: GridCell; posOffset?: Point; footprint: { w: number; h: number } }[],
  gridOffset = getGridOffset(),
): string | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const b = tokenFootprintWorldBounds(tokens[i], gridOffset);
    if (
      world.x >= b.minX &&
      world.x < b.maxX &&
      world.y >= b.minY &&
      world.y < b.maxY
    ) {
      return tokens[i].id;
    }
  }
  return null;
}

function boundsIntersect(a: WorldBounds, b: WorldBounds): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

/** Tokens whose footprint intersects a screen-space axis-aligned rectangle. */
export function findTokensInScreenRect(
  tokens: { id: string; gridPos: GridCell; footprint: { w: number; h: number } }[],
  a: Point,
  b: Point,
  stagePos: Point,
  scale: number,
): string[] {
  const minSx = Math.min(a.x, b.x);
  const maxSx = Math.max(a.x, b.x);
  const minSy = Math.min(a.y, b.y);
  const maxSy = Math.max(a.y, b.y);
  const sel: WorldBounds = {
    minX: (minSx - stagePos.x) / scale,
    minY: (minSy - stagePos.y) / scale,
    maxX: (maxSx - stagePos.x) / scale,
    maxY: (maxSy - stagePos.y) / scale,
  };
  const hits: string[] = [];
  for (const token of tokens) {
    if (boundsIntersect(tokenFootprintWorldBounds(token), sel)) hits.push(token.id);
  }
  return hits;
}

export function findMeasurementAtCell(
  measurements: { id: string; kind: string; params: unknown }[],
  cell: GridCell,
): string | null {
  for (let i = measurements.length - 1; i >= 0; i--) {
    const m = measurements[i];
    if (m.kind === 'cube' || m.kind === 'sphere') {
      const p = m.params as { center: GridCell; radiusCells: number };
      const dx = Math.abs(cell.col - p.center.col);
      const dy = Math.abs(cell.row - p.center.row);
      if (m.kind === 'cube' && Math.max(dx, dy) <= p.radiusCells) return m.id;
      if (m.kind === 'sphere' && Math.hypot(dx, dy) <= p.radiusCells + 0.5) return m.id;
    }
  }
  return null;
}

/** @deprecated use screenToWorld */
export const screenToMapPoint = screenToWorld;
