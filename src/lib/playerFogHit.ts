import { DEFAULT_GRID_OFFSET } from './fixedGrid';
import { GRID_SIZE_PX } from './fixedGrid';
import { tokenWorldTopLeft } from './grid';
import type { FogState, Point, Scene, TokenGridPlacement } from './types';
import { isFogFullyClear } from './fog';
import { fogToMulti } from './fullMapFog';

type Pair = [number, number];
type Ring = Pair[];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

function pointInRing(point: Point, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if ((yi > point.y) !== (yj > point.y)) {
      const xIntersect = ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
      if (point.x < xIntersect) inside = !inside;
    }
  }
  return inside;
}

function pointInPolygonWithHoles(point: Point, poly: Polygon): boolean {
  const outer = poly[0];
  if (!outer || !pointInRing(point, outer)) return false;
  for (let i = 1; i < poly.length; i++) {
    if (pointInRing(point, poly[i]!)) return false;
  }
  return true;
}

function pointInMultiPolygon(point: Point, mp: MultiPolygon): boolean {
  for (const poly of mp) {
    if (pointInPolygonWithHoles(point, poly)) return true;
  }
  return false;
}

/** True when a player (or GM player-view preview) should not interact with map content at this point. */
export function isWorldPointHiddenFromPlayer(
  world: Point,
  fog: FogState,
  _scene: Scene | null,
): boolean {
  if (isFogFullyClear(fog)) return false;

  const revealedMp = fogToMulti(fog.revealedMask);
  if (revealedMp.length > 0 && pointInMultiPolygon(world, revealedMp)) return false;

  if (fog.defaultHidden) return true;

  const hiddenMp = fogToMulti(fog.unexploredMask);
  return pointInMultiPolygon(world, hiddenMp);
}

export function isTokenPlacementHiddenFromPlayer(
  token: {
    gridPos: { col: number; row: number };
    posOffset?: Point;
    footprint: { w: number; h: number };
  },
  placement: TokenGridPlacement,
  fog: FogState,
  scene: Scene | null,
  gridOffset: Point = DEFAULT_GRID_OFFSET,
): boolean {
  const tl = tokenWorldTopLeft(
    {
      ...token,
      gridPos: placement.gridPos,
      posOffset: placement.posOffset,
    },
    gridOffset,
  );
  const anchor = {
    x: tl.x + (token.footprint.w * GRID_SIZE_PX) / 2,
    y: tl.y + (token.footprint.h * GRID_SIZE_PX) / 2,
  };
  return isWorldPointHiddenFromPlayer(anchor, fog, scene);
}
