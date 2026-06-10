import { GRID_SIZE_PX } from './fixedGrid';
import { nearestGridCornerForOffset } from './gridRecenter';
import type { MapTransform, Point } from './types';

const MIN_MAP_SCALE = 0.05;
const MAX_MAP_SCALE = 8;

function clampMapScale(scale: number): number {
  return Math.min(MAX_MAP_SCALE, Math.max(MIN_MAP_SCALE, scale));
}

function isWholeGridCells(worldPx: number): boolean {
  const cells = worldPx / GRID_SIZE_PX;
  return Math.abs(cells - Math.round(cells)) < 1e-6;
}

/** Snap the map image origin to the nearest grid corner. */
export function mapTransformAlignedToGridCorner(
  current: MapTransform,
  gridOffset: Point,
): MapTransform {
  const corner = nearestGridCornerForOffset(current.x, current.y, gridOffset);
  return {
    ...current,
    x: corner.x,
    y: corner.y,
  };
}

/**
 * Snap map scale so width (and height when possible) span whole grid cells.
 * Prefers rounding width to the nearest cell count at the current visual size.
 */
export function autoSizeMapScaleToGrid(
  imageWidth: number,
  imageHeight: number,
  currentScale: number,
): number {
  if (imageWidth <= 0 || imageHeight <= 0 || !Number.isFinite(currentScale) || currentScale <= 0) {
    return currentScale;
  }

  const worldW = imageWidth * currentScale;
  const baseCellsW = Math.max(1, Math.round(worldW / GRID_SIZE_PX));
  const horizontalScale = (baseCellsW * GRID_SIZE_PX) / imageWidth;

  let bestScale = horizontalScale;
  let bestScore = Infinity;

  for (let dw = -3; dw <= 3; dw++) {
    const cellsW = Math.max(1, baseCellsW + dw);
    const scale = (cellsW * GRID_SIZE_PX) / imageWidth;
    if (scale < MIN_MAP_SCALE || scale > MAX_MAP_SCALE) continue;

    const worldH = imageHeight * scale;
    if (!isWholeGridCells(worldH)) continue;

    const score =
      Math.abs(scale - currentScale) + Math.abs(cellsW - baseCellsW) * 0.001;
    if (score < bestScore) {
      bestScore = score;
      bestScale = scale;
    }
  }

  if (bestScore < Infinity) {
    return clampMapScale(bestScale);
  }

  return clampMapScale(horizontalScale);
}

export function loadImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Failed to load map image'));
    img.src = url;
  });
}
