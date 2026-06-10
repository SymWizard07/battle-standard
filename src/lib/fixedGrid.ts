import type { Point } from './types';

// Fixed global grid cell size. Grid origin is per-scene (see Scene.gridOffset).
export const GRID_CELL_FT = 5;
export const GRID_SIZE_PX = 50;
export const DEFAULT_GRID_OFFSET: Point = { x: 0, y: 0 };

let activeGridOffset: Point = { ...DEFAULT_GRID_OFFSET };

/** World position of grid cell (0,0) top-left for the active scene. */
export function getGridOffset(): Point {
  return activeGridOffset;
}

export function setGridOffset(offset: Point): void {
  activeGridOffset = { x: offset.x, y: offset.y };
}
