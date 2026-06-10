import { GRID_SIZE_PX } from './fixedGrid';
import {
  posOffsetFromWorldTopLeft,
  screenToWorld,
  snapWorldToGrid,
  tokenWorldTopLeft,
  worldToGridCell,
  worldToSubGridTopLeft,
} from './grid';
import type { GridCell, Point, TokenGridPlacement } from './types';

/** Preset snap strengths cycled with Space. */
export const GRID_SNAP_CYCLE = [0, 0.5, 1] as const;

const SNAP_VALUE_EPS = 1e-6;

export function isGridSnapCycleValue(strength: number): boolean {
  return GRID_SNAP_CYCLE.some((v) => Math.abs(v - strength) < SNAP_VALUE_EPS);
}

/** Next snap in 0 → 0.5 → 1 → 0; off-preset values step up to the next preset. */
export function nextGridSnapCycleValue(strength: number): number {
  const s = clampGridSnapStrength(strength);
  if (isGridSnapCycleValue(s)) {
    const idx = GRID_SNAP_CYCLE.findIndex((v) => Math.abs(v - s) < SNAP_VALUE_EPS);
    return GRID_SNAP_CYCLE[(idx + 1) % GRID_SNAP_CYCLE.length];
  }
  for (const v of GRID_SNAP_CYCLE) {
    if (v > s + SNAP_VALUE_EPS) return v;
  }
  return GRID_SNAP_CYCLE[0];
}

export const GRID_SNAP_STEP = 0.25;

/** Step snap alignment: cell corners (fog) or cell centers (measure). */
export type GridSnapAnchor = 'corner' | 'center';

export function clampGridSnapStrength(strength: number): number {
  return Math.max(0, Math.min(1, strength));
}

export function quantizeGridSnapStrength(strength: number): number {
  return Math.round(clampGridSnapStrength(strength) / GRID_SNAP_STEP) * GRID_SNAP_STEP;
}

/** Magnetic snap radius in world units; 0 when strength is 0. */
export function gridSnapThresholdWorld(strength: number): number {
  const s = clampGridSnapStrength(strength);
  if (s <= 0) return 0;
  return GRID_SIZE_PX * s;
}

function snapAnchorOffset(anchor: GridSnapAnchor): number {
  return anchor === 'center' ? GRID_SIZE_PX / 2 : 0;
}

/** Snap a world point to grid-aligned steps; strength is grid fraction (1 = full cell, 0 = free). */
export function snapWorldPointWithStrength(
  world: Point,
  strength: number,
  gridOffset: Point,
  anchor: GridSnapAnchor = 'corner',
): Point {
  const s = clampGridSnapStrength(strength);
  if (s <= 0) return world;
  const step = GRID_SIZE_PX * s;
  const anchorOffset = snapAnchorOffset(anchor);
  const localX = world.x - gridOffset.x - anchorOffset;
  const localY = world.y - gridOffset.y - anchorOffset;
  return {
    x: gridOffset.x + anchorOffset + Math.round(localX / step) * step,
    y: gridOffset.y + anchorOffset + Math.round(localY / step) * step,
  };
}

/** Minimum world distance between consecutive stroke points while drawing. */
export function gridSnapStrokeMinStep(strength: number, fallback = 2): number {
  const s = clampGridSnapStrength(strength);
  if (s <= 0) return fallback;
  return GRID_SIZE_PX * s;
}

export function snapScreenPointWithStrength(
  screen: Point,
  stagePos: Point,
  viewScale: number,
  strength: number,
  gridOffset: Point,
  anchor: GridSnapAnchor = 'corner',
): Point {
  const world = screenToWorld(screen, stagePos, viewScale);
  return snapWorldPointWithStrength(world, strength, gridOffset, anchor);
}

/** Snap a world point to grid corners/centers when within the strength threshold. */
export function snapWorldWithStrength(world: Point, strength: number): Point {
  const threshold = gridSnapThresholdWorld(strength);
  if (threshold <= 0) return world;
  return snapWorldToGrid(world, threshold);
}

export function snapScreenToWorld(
  screen: Point,
  stagePos: Point,
  viewScale: number,
  strength: number,
): Point {
  const world = screenToWorld(screen, stagePos, viewScale);
  return snapWorldWithStrength(world, strength);
}

/** Grid cell under the pointer; uses magnetic snap when strength > 0. */
export function snapScreenToGridCell(
  screen: Point,
  stagePos: Point,
  viewScale: number,
  strength: number,
): GridCell {
  const world = screenToWorld(screen, stagePos, viewScale);
  return worldToGridCell(snapWorldWithStrength(world, strength));
}

/** Snap a token top-left for select/transform moves; strength is grid fraction (1 = full cell, 0 = free). */
export function snapTokenTopLeftPlacement(
  worldTopLeft: Point,
  strength: number,
  gridOffset: Point,
): TokenGridPlacement {
  const s = clampGridSnapStrength(strength);
  if (s <= 0) {
    const { gridPos, posOffset } = worldToSubGridTopLeft(worldTopLeft, gridOffset);
    return { gridPos, posOffset: posOffsetFromWorldTopLeft(posOffset) };
  }
  const step = GRID_SIZE_PX * s;
  const localX = worldTopLeft.x - gridOffset.x;
  const localY = worldTopLeft.y - gridOffset.y;
  const snappedX = Math.round(localX / step) * step;
  const snappedY = Math.round(localY / step) * step;
  const col = Math.floor(snappedX / GRID_SIZE_PX);
  const row = Math.floor(snappedY / GRID_SIZE_PX);
  const offX = snappedX - col * GRID_SIZE_PX;
  const offY = snappedY - row * GRID_SIZE_PX;
  return {
    gridPos: { col, row },
    posOffset: posOffsetFromWorldTopLeft({ x: offX, y: offY }),
  };
}

/** Apply a world delta to a token placement, respecting snap strength. */
export function moveTokenPlacementByWorldDelta(
  start: TokenGridPlacement,
  dx: number,
  dy: number,
  strength: number,
  gridOffset: Point,
): TokenGridPlacement {
  const startTl = tokenWorldTopLeft(start, gridOffset);
  return snapTokenTopLeftPlacement(
    { x: startTl.x + dx, y: startTl.y + dy },
    strength,
    gridOffset,
  );
}

export const GRID_SNAP_KEYBOARD_TOOLS = [
  'select',
  'transform',
  'measure',
  'fog',
  'draw',
] as const;

export function showsGridSnapControl(
  activeTool: string,
  asPlayer: boolean,
): boolean {
  if (activeTool === 'fog' && asPlayer) return false;
  return (
    activeTool === 'select' ||
    activeTool === 'transform' ||
    activeTool === 'draw' ||
    activeTool === 'measure' ||
    activeTool === 'fog'
  );
}
