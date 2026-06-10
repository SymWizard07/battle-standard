import type { MapTransform, Point } from './types';

export type MapCorner = 'nw' | 'ne' | 'se' | 'sw';

const MIN_MAP_SCALE = 0.05;
const MAX_MAP_SCALE = 8;

function clampMapScale(scale: number): number {
  return Math.min(MAX_MAP_SCALE, Math.max(MIN_MAP_SCALE, scale));
}

export function worldToScreen(world: Point, stagePos: Point, viewScale: number): Point {
  return {
    x: world.x * viewScale + stagePos.x,
    y: world.y * viewScale + stagePos.y,
  };
}

/** Map-local image coords → world (matches Konva Group: translate, scale, rotate). */
export function mapLocalToWorld(local: Point, mt: MapTransform): Point {
  const s = mt.scale;
  const rad = (mt.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: mt.x + s * (cos * local.x - sin * local.y),
    y: mt.y + s * (sin * local.x + cos * local.y),
  };
}

/** World → map-local image coords (inverse of mapLocalToWorld). */
export function worldToMapLocal(world: Point, mt: MapTransform): Point {
  const dx = world.x - mt.x;
  const dy = world.y - mt.y;
  const rad = (mt.rotation * Math.PI) / 180;
  const cos = Math.cos(-rad);
  const sin = Math.sin(-rad);
  const s = mt.scale || 1;
  return {
    x: (cos * dx - sin * dy) / s,
    y: (sin * dx + cos * dy) / s,
  };
}

/** Re-express a world point when the map transform changes but map-local coords stay fixed. */
export function transformWorldPointBetweenMaps(
  world: Point,
  fromTransform: MapTransform,
  toTransform: MapTransform,
): Point {
  return mapLocalToWorld(worldToMapLocal(world, fromTransform), toTransform);
}

export function mapCornerWorldPoints(
  mt: MapTransform,
  imageWidth: number,
  imageHeight: number,
): Record<MapCorner, Point> {
  return {
    nw: mapLocalToWorld({ x: 0, y: 0 }, mt),
    ne: mapLocalToWorld({ x: imageWidth, y: 0 }, mt),
    se: mapLocalToWorld({ x: imageWidth, y: imageHeight }, mt),
    sw: mapLocalToWorld({ x: 0, y: imageHeight }, mt),
  };
}

/** Axis-aligned world bounds enclosing the rotated map image. */
export function mapAxisBounds(
  mt: MapTransform,
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number; width: number; height: number } {
  const c = mapCornerWorldPoints(mt, imageWidth, imageHeight);
  const minX = Math.min(c.nw.x, c.ne.x, c.se.x, c.sw.x);
  const minY = Math.min(c.nw.y, c.ne.y, c.se.y, c.sw.y);
  const maxX = Math.max(c.nw.x, c.ne.x, c.se.x, c.sw.x);
  const maxY = Math.max(c.nw.y, c.ne.y, c.se.y, c.sw.y);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Screen positions for map edit controls (axis-aligned, rotation-independent). */
export function mapControlAnchorsScreen(
  mt: MapTransform,
  imageWidth: number,
  imageHeight: number,
  stagePos: Point,
  viewScale: number,
): { rotate: Point; delete: Point } {
  const c = mapCornerWorldPoints(mt, imageWidth, imageHeight);
  const xs = [c.nw, c.ne, c.se, c.sw].map((p) => worldToScreen(p, stagePos, viewScale).x);
  const ys = [c.nw, c.ne, c.se, c.sw].map((p) => worldToScreen(p, stagePos, viewScale).y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  return {
    rotate: { x: (minX + maxX) / 2, y: minY },
    delete: { x: maxX, y: minY },
  };
}

/** Uniform scale from a dragged corner; opposite corner stays fixed. */
export function resizeMapFromCorner(
  corner: MapCorner,
  pointerWorld: Point,
  mt: MapTransform,
  imageWidth: number,
  imageHeight: number,
): MapTransform {
  const bounds = mapAxisBounds(mt, imageWidth, imageHeight);
  const br = { x: bounds.x + bounds.width, y: bounds.y + bounds.height };

  let anchor: Point;
  let dx: number;
  let dy: number;

  switch (corner) {
    case 'se':
      anchor = { x: bounds.x, y: bounds.y };
      dx = pointerWorld.x - anchor.x;
      dy = pointerWorld.y - anchor.y;
      break;
    case 'nw':
      anchor = br;
      dx = anchor.x - pointerWorld.x;
      dy = anchor.y - pointerWorld.y;
      break;
    case 'ne':
      anchor = { x: bounds.x, y: br.y };
      dx = pointerWorld.x - anchor.x;
      dy = anchor.y - pointerWorld.y;
      break;
    case 'sw':
      anchor = { x: br.x, y: bounds.y };
      dx = anchor.x - pointerWorld.x;
      dy = pointerWorld.y - anchor.y;
      break;
  }

  const scaleW = dx / imageWidth;
  const scaleH = dy / imageHeight;
  const newScale = clampMapScale(Math.max(scaleW, scaleH));

  switch (corner) {
    case 'se':
      return { ...mt, scale: newScale };
    case 'nw':
      return {
        ...mt,
        x: br.x - imageWidth * newScale,
        y: br.y - imageHeight * newScale,
        scale: newScale,
      };
    case 'ne':
      return {
        ...mt,
        x: bounds.x,
        y: br.y - imageHeight * newScale,
        scale: newScale,
      };
    case 'sw':
      return {
        ...mt,
        x: br.x - imageWidth * newScale,
        y: bounds.y,
        scale: newScale,
      };
  }
}

function mapPivotCenterWorld(
  mt: MapTransform,
  imageWidth: number,
  imageHeight: number,
): Point {
  return mapLocalToWorld({ x: imageWidth / 2, y: imageHeight / 2 }, mt);
}

/** Set map rotation (degrees) around its image center; pivot stays fixed in world space. */
export function rotateMapTransformTo(
  mt: MapTransform,
  imageWidth: number,
  imageHeight: number,
  rotationDeg: number,
): MapTransform {
  const center = mapPivotCenterWorld(mt, imageWidth, imageHeight);
  const s = mt.scale;
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = (imageWidth * s) / 2;
  const hh = (imageHeight * s) / 2;
  return {
    ...mt,
    rotation: rotationDeg,
    x: center.x - cos * hw + sin * hh,
    y: center.y - sin * hw - cos * hh,
  };
}

/** Rotate map 90° clockwise around its center (Konva rotation, degrees). */
export function rotateMapTransform90(
  mt: MapTransform,
  imageWidth: number,
  imageHeight: number,
): MapTransform {
  return rotateMapTransformTo(mt, imageWidth, imageHeight, mt.rotation + 90);
}

export function mapRotationHandleArmLengthScreen(
  mt: MapTransform,
  imageWidth: number,
  imageHeight: number,
  stagePos: Point,
  viewScale: number,
  extraPx = 14,
): { centerScreen: Point; armLengthPx: number } {
  const centerWorld = mapPivotCenterWorld(mt, imageWidth, imageHeight);
  const topWorld = mapLocalToWorld({ x: imageWidth / 2, y: 0 }, mt);
  const centerScreen = worldToScreen(centerWorld, stagePos, viewScale);
  const topScreen = worldToScreen(topWorld, stagePos, viewScale);
  const armLengthPx =
    Math.hypot(topScreen.x - centerScreen.x, topScreen.y - centerScreen.y) + extraPx;
  return { centerScreen, armLengthPx };
}
