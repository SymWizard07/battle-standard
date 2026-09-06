import { DEFAULT_GRID_OFFSET } from './fixedGrid';
import { tokenFootprintWorldBounds } from './grid';
import type { FogState, Point, Scene, TokenGridPlacement } from './types';
import { isFogFullyClear, isFogFullyCovered } from './fog';
import { sampleFogMaskSet } from './fogMask';
import { getFogMaskSetForScene } from './fogMaskCache';

/** True when a player (or GM player-view preview) should not interact with map content at this point. */
export function isWorldPointHiddenFromPlayer(
  world: Point,
  fog: FogState,
  scene: Scene | null,
): boolean {
  if (isFogFullyClear(fog)) return false;
  // Full fog with no paint ops — no mask needed.
  if (isFogFullyCovered(fog)) return true;
  if (!scene) {
    return !!fog.defaultHidden;
  }
  const set = getFogMaskSetForScene(scene, fog);
  return sampleFogMaskSet(set, world);
}

function tokenFootprintSamplePoints(
  token: { gridPos: { col: number; row: number }; posOffset?: Point; footprint: { w: number; h: number } },
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

/** True when every sampled point on the token footprint is hidden from the player. */
export function isTokenCompletelyHiddenFromPlayer(
  token: {
    gridPos: { col: number; row: number };
    posOffset?: Point;
    footprint: { w: number; h: number };
  },
  fog: FogState,
  scene: Scene | null,
  gridOffset: Point = DEFAULT_GRID_OFFSET,
): boolean {
  if (isFogFullyClear(fog)) return false;
  return tokenFootprintSamplePoints(token, gridOffset).every((p) =>
    isWorldPointHiddenFromPlayer(p, fog, scene),
  );
}

export function isTokenPlacementCompletelyHiddenFromPlayer(
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
  return isTokenCompletelyHiddenFromPlayer(
    {
      ...token,
      gridPos: placement.gridPos,
      posOffset: placement.posOffset,
    },
    fog,
    scene,
    gridOffset,
  );
}
