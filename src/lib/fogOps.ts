import polygonClipping from 'polygon-clipping';
import { fogToMulti } from './fullMapFog';
import type { FogState } from './types';

type Pair = [number, number];
type Ring = Pair[];
type Polygon = Ring[];
export type FogMultiPolygon = Polygon[];

export function mergeFogWithShape(
  fog: FogState,
  shapeMp: FogMultiPolygon,
  mode: 'hide' | 'reveal',
): { unexploredMp: FogMultiPolygon; revealedMp: FogMultiPolygon } {
  const hiddenMp = fogToMulti(fog.unexploredMask);
  const revealedMp = fogToMulti(fog.revealedMask);

  if (fog.defaultHidden) {
    if (mode === 'hide') {
      return {
        unexploredMp: hiddenMp,
        revealedMp: polygonClipping.difference(revealedMp, shapeMp) as FogMultiPolygon,
      };
    }
    return {
      unexploredMp: hiddenMp,
      revealedMp: polygonClipping.union(revealedMp, shapeMp) as FogMultiPolygon,
    };
  }

  if (mode === 'hide') {
    return {
      unexploredMp: polygonClipping.union(hiddenMp, shapeMp) as FogMultiPolygon,
      revealedMp: polygonClipping.difference(revealedMp, shapeMp) as FogMultiPolygon,
    };
  }

  return {
    unexploredMp: polygonClipping.difference(hiddenMp, shapeMp) as FogMultiPolygon,
    revealedMp: polygonClipping.union(revealedMp, shapeMp) as FogMultiPolygon,
  };
}
