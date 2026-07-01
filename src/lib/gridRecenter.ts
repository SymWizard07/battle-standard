import { DEFAULT_GRID_OFFSET, GRID_SIZE_PX } from './fixedGrid';
import { normalizeScene, mapLayerWorldCenter, sceneMaps } from './sceneMaps';
import { shiftDrawStroke } from './drawShapes';
import type { MeasurementObject, Point, Scene } from './types';

export function nearestGridCornerForOffset(
  x: number,
  y: number,
  gridOffset: Point,
): Point {
  const col = Math.round((x - gridOffset.x) / GRID_SIZE_PX);
  const row = Math.round((y - gridOffset.y) / GRID_SIZE_PX);
  return {
    x: gridOffset.x + col * GRID_SIZE_PX,
    y: gridOffset.y + row * GRID_SIZE_PX,
  };
}

/** Average center of all map image bounds in world space. */
export function computeMapsCentroid(scene: Scene): Point | null {
  const maps = sceneMaps(scene);
  if (maps.length === 0) return null;

  let sumX = 0;
  let sumY = 0;
  for (const layer of maps) {
    const center = mapLayerWorldCenter(layer);
    sumX += center.x;
    sumY += center.y;
  }
  return { x: sumX / maps.length, y: sumY / maps.length };
}

export function computeGridRecenter(
  scene: Scene,
): { delta: Point; newOffset: Point } | null {
  const maps = sceneMaps(scene);
  if (maps.length === 0) return null;

  const oldOffset = scene.gridOffset ?? DEFAULT_GRID_OFFSET;
  const centroid = computeMapsCentroid(scene);
  if (!centroid) return null;

  const newOffset = nearestGridCornerForOffset(centroid.x, centroid.y, oldOffset);
  const delta = { x: newOffset.x - oldOffset.x, y: newOffset.y - oldOffset.y };
  if (Math.abs(delta.x) < 1e-6 && Math.abs(delta.y) < 1e-6) return null;

  return { delta, newOffset };
}

function shiftPoint(p: Point, delta: Point): Point {
  return { x: p.x + delta.x, y: p.y + delta.y };
}

function shiftFogPolygons(
  polygons: { id: string; rings: Point[][]; mapLayerId?: string }[],
  delta: Point,
) {
  return polygons.map((poly) => ({
    ...poly,
    rings: poly.rings.map((ring) => ring.map((p) => shiftPoint(p, delta))),
  }));
}

function shiftMeasurement(m: MeasurementObject, delta: Point): MeasurementObject {
  if (m.kind === 'line') {
    const p = m.params as { from: Point; to: Point };
    return {
      ...m,
      params: { from: shiftPoint(p.from, delta), to: shiftPoint(p.to, delta) },
    };
  }
  if (m.kind === 'cone') {
    const p = m.params as { origin: Point; direction: number; lengthCells: number; angleDeg: number };
    return { ...m, params: { ...p, origin: shiftPoint(p.origin, delta) } };
  }
  if (m.kind === 'cube') {
    const p = m.params as { center: { col: number; row: number }; radiusCells: number; origin?: Point };
    return {
      ...m,
      params: {
        ...p,
        origin: p.origin ? shiftPoint(p.origin, delta) : undefined,
      },
    };
  }
  if (m.kind === 'sphere') {
    const p = m.params as {
      center: { col: number; row: number };
      radiusCells: number;
      origin?: Point;
      radiusWorld?: number;
    };
    return {
      ...m,
      params: {
        ...p,
        origin: p.origin ? shiftPoint(p.origin, delta) : undefined,
      },
    };
  }
  return m;
}

/** Shift world content by delta and store the new grid origin. Preserves on-screen positions when the camera is adjusted inversely. */
export function shiftSceneForGridRecenter(
  scene: Scene,
  delta: Point,
  newGridOffset: Point,
): Scene {
  return {
    ...scene,
    gridOffset: newGridOffset,
    maps: sceneMaps(scene).map((m) => ({
      ...m,
      transform: {
        ...m.transform,
        x: m.transform.x + delta.x,
        y: m.transform.y + delta.y,
      },
    })),
    fog: {
      ...scene.fog,
      unexploredMask: shiftFogPolygons(scene.fog.unexploredMask, delta),
      revealedMask: shiftFogPolygons(scene.fog.revealedMask, delta),
    },
    measurements: scene.measurements.map((m) => shiftMeasurement(m, delta)),
    drawStrokes: (scene.drawStrokes ?? []).map((s) => shiftDrawStroke(s, delta)),
    // Tokens stay on the map via gridOffset change (gridPos unchanged).
  };
}

/** Snap the grid origin to the map centroid; shift maps and world objects together. */
export function recenterSceneGrid(scene: Scene): {
  scene: Scene;
  delta: Point;
  newOffset: Point;
} | null {
  const normalized = normalizeScene(scene);
  const recenter = computeGridRecenter(normalized);
  if (!recenter) return null;
  const { delta, newOffset } = recenter;
  return {
    scene: shiftSceneForGridRecenter(normalized, delta, newOffset),
    delta,
    newOffset,
  };
}
