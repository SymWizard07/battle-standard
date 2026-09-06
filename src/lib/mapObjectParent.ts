import { DEFAULT_GRID_OFFSET, GRID_SIZE_PX } from './fixedGrid';
import { posOffsetFromWorldTopLeft, tokenWorldTopLeft, worldToGridCell, worldToSubGridTopLeft } from './grid';
import { mapLocalToWorld, transformWorldPointBetweenMaps, worldToMapLocal } from './mapGeometry';
import { hitMapLayerAt, sceneMaps, sceneMapsForHitTest } from './sceneMaps';
import {
  drawStrokeAnchorWorld,
  cubeCenterWorld,
  sphereCenterWorld,
  transformDrawStrokeForMap,
} from './drawShapes';
import type {
  CubeMeasureParams,
  DrawStroke,
  MapTransform,
  MeasurementObject,
  Point,
  Scene,
  SphereMeasureParams,
  Token,
} from './types';

export function mergeMapTransform(
  transform: MapTransform,
  patch: Partial<MapTransform>,
): MapTransform {
  return { ...transform, ...patch };
}

export function tokenTopLeftWorld(token: Token, gridOffset = DEFAULT_GRID_OFFSET): Point {
  return tokenWorldTopLeft(token, gridOffset);
}

export function tokenAnchorWorld(token: Token, gridOffset = DEFAULT_GRID_OFFSET): Point {
  const tl = tokenTopLeftWorld(token, gridOffset);
  return {
    x: tl.x + (token.footprint.w * GRID_SIZE_PX) / 2,
    y: tl.y + (token.footprint.h * GRID_SIZE_PX) / 2,
  };
}

/** Top-most map containing the point (handles overlap). */
export function resolveMapLayerForWorldPoint(
  world: Point,
  scene: Scene,
): string | undefined {
  return hitMapLayerAt(world, sceneMapsForHitTest(scene))?.id;
}

export function measurementAnchorWorld(
  measurement: MeasurementObject,
  gridOffset = DEFAULT_GRID_OFFSET,
): Point | null {
  const p = measurement.params;
  if (measurement.kind === 'line') {
    const lp = p as { from: Point; to: Point };
    return { x: (lp.from.x + lp.to.x) / 2, y: (lp.from.y + lp.to.y) / 2 };
  }
  if (measurement.kind === 'cone') {
    return (p as { origin: Point }).origin;
  }
  if (measurement.kind === 'cube' || measurement.kind === 'sphere') {
    const mp = p as CubeMeasureParams | SphereMeasureParams;
    return measurement.kind === 'sphere'
      ? sphereCenterWorld(mp as SphereMeasureParams, gridOffset)
      : cubeCenterWorld(mp as CubeMeasureParams, gridOffset);
  }
  return null;
}

function transformPointWithMap(
  world: Point,
  baseTransform: MapTransform,
  newTransform: MapTransform,
): Point {
  return transformWorldPointBetweenMaps(world, baseTransform, newTransform);
}

function transformTokenForMap(
  token: Token,
  baseTransform: MapTransform,
  newTransform: MapTransform,
  gridOffset: Point,
): Token {
  const topLeft = tokenWorldTopLeft(token, gridOffset);
  const local = worldToMapLocal(topLeft, baseTransform);
  const nextTopLeft = mapLocalToWorld(local, newTransform);
  const { gridPos, posOffset } = worldToSubGridTopLeft(nextTopLeft, gridOffset);
  return {
    ...token,
    gridPos,
    posOffset: posOffsetFromWorldTopLeft(posOffset),
  };
}

function transformMeasurementForMap(
  measurement: MeasurementObject,
  baseTransform: MapTransform,
  newTransform: MapTransform,
  gridOffset: Point,
): MeasurementObject {
  if (measurement.kind === 'line') {
    const lp = measurement.params as { from: Point; to: Point };
    return {
      ...measurement,
      params: {
        from: transformPointWithMap(lp.from, baseTransform, newTransform),
        to: transformPointWithMap(lp.to, baseTransform, newTransform),
      },
    };
  }
  if (measurement.kind === 'cone') {
    const cp = measurement.params as {
      origin: Point;
      direction: number;
      lengthCells: number;
      angleDeg: number;
    };
    return {
      ...measurement,
      params: {
        ...cp,
        origin: transformPointWithMap(cp.origin, baseTransform, newTransform),
      },
    };
  }
  if (measurement.kind === 'cube' || measurement.kind === 'sphere') {
    const mp = measurement.params as CubeMeasureParams | SphereMeasureParams;
    const centerWorld =
      measurement.kind === 'sphere'
        ? sphereCenterWorld(mp as SphereMeasureParams, gridOffset)
        : cubeCenterWorld(mp as CubeMeasureParams, gridOffset);
    const nextCenter = transformPointWithMap(centerWorld, baseTransform, newTransform);
    return {
      ...measurement,
      params: {
        ...mp,
        origin: nextCenter,
        center: worldToGridCell(nextCenter, gridOffset),
      },
    };
  }
  return measurement;
}

export function applyMapTransformToSceneChildren(
  scene: Scene,
  mapLayerId: string,
  oldTransform: MapTransform,
  newTransform: MapTransform,
): Scene {
  const unchanged =
    oldTransform.x === newTransform.x &&
    oldTransform.y === newTransform.y &&
    oldTransform.scale === newTransform.scale &&
    oldTransform.rotation === newTransform.rotation;
  if (unchanged) return scene;

  const gridOffset = scene.gridOffset ?? DEFAULT_GRID_OFFSET;
  return {
    ...scene,
    tokens: scene.tokens.map((t) =>
      t.mapLayerId === mapLayerId
        ? transformTokenForMap(t, oldTransform, newTransform, gridOffset)
        : t,
    ),
    measurements: scene.measurements.map((m) =>
      m.mapLayerId === mapLayerId
        ? transformMeasurementForMap(m, oldTransform, newTransform, gridOffset)
        : m,
    ),
    drawStrokes: scene.drawStrokes.map((s) =>
      s.mapLayerId === mapLayerId
        ? transformDrawStrokeForMap(s, oldTransform, newTransform, gridOffset)
        : s,
    ),
  };
}

export function assignTokenMapLayer(token: Token, scene: Scene): Token {
  const gridOffset = scene.gridOffset ?? DEFAULT_GRID_OFFSET;
  const anchor = tokenAnchorWorld(token, gridOffset);
  return { ...token, mapLayerId: resolveMapLayerForWorldPoint(anchor, scene) };
}

export function assignMeasurementMapLayer(
  measurement: MeasurementObject,
  scene: Scene,
): MeasurementObject {
  const gridOffset = scene.gridOffset ?? DEFAULT_GRID_OFFSET;
  const anchor = measurementAnchorWorld(measurement, gridOffset);
  if (!anchor) return measurement;
  return { ...measurement, mapLayerId: resolveMapLayerForWorldPoint(anchor, scene) };
}

export function assignDrawStrokeMapLayer(stroke: DrawStroke, scene: Scene): DrawStroke {
  const gridOffset = scene.gridOffset ?? DEFAULT_GRID_OFFSET;
  const anchor = drawStrokeAnchorWorld(stroke, gridOffset);
  if (!anchor) return stroke;
  return { ...stroke, mapLayerId: resolveMapLayerForWorldPoint(anchor, scene) };
}

/** Assign map parents for objects missing one. */
export function assignMissingMapParents(scene: Scene): Scene {
  let next = scene;
  next = {
    ...next,
    tokens: next.tokens.map((t) => (t.mapLayerId ? t : assignTokenMapLayer(t, next))),
  };
  next = {
    ...next,
    measurements: next.measurements.map((m) =>
      m.mapLayerId ? m : assignMeasurementMapLayer(m, next),
    ),
    drawStrokes: (next.drawStrokes ?? []).map((s) =>
      s.mapLayerId ? s : assignDrawStrokeMapLayer(s, next),
    ),
  };
  return next;
}

/** Re-resolve map parent for every object from current stack order and positions. */
export function reassignAllObjectMapParents(scene: Scene): Scene {
  return {
    ...scene,
    tokens: scene.tokens.map((t) => assignTokenMapLayer(t, scene)),
    measurements: scene.measurements.map((m) => assignMeasurementMapLayer(m, scene)),
    drawStrokes: (scene.drawStrokes ?? []).map((s) => assignDrawStrokeMapLayer(s, scene)),
  };
}

export function reassignChildrenAfterMapRemoved(scene: Scene, removedMapId: string): Scene {
  const maps = sceneMaps(scene).filter((m) => m.id !== removedMapId);
  const gridOffset = scene.gridOffset ?? DEFAULT_GRID_OFFSET;

  const reassignToken = (token: Token): Token => {
    if (token.mapLayerId !== removedMapId) return token;
    const anchor = tokenAnchorWorld(token, gridOffset);
    return { ...token, mapLayerId: hitMapLayerAt(anchor, maps)?.id };
  };

  const reassignMeasurement = (measurement: MeasurementObject): MeasurementObject => {
    if (measurement.mapLayerId !== removedMapId) return measurement;
    const anchor = measurementAnchorWorld(measurement, gridOffset);
    if (!anchor) return { ...measurement, mapLayerId: undefined };
    return { ...measurement, mapLayerId: hitMapLayerAt(anchor, maps)?.id };
  };

  const reassignDrawStroke = (stroke: DrawStroke): DrawStroke => {
    if (stroke.mapLayerId !== removedMapId) return stroke;
    const anchor = drawStrokeAnchorWorld(stroke, gridOffset);
    if (!anchor) return { ...stroke, mapLayerId: undefined };
    return { ...stroke, mapLayerId: hitMapLayerAt(anchor, maps)?.id };
  };

  return {
    ...scene,
    tokens: scene.tokens.map(reassignToken),
    measurements: scene.measurements.map(reassignMeasurement),
    drawStrokes: (scene.drawStrokes ?? []).map(reassignDrawStroke),
  };
}
