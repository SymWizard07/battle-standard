import polygonClipping from 'polygon-clipping';
import { assignFogPolygonMapLayer } from './mapObjectParent';
import { mapCornerWorldPoints } from './mapGeometry';
import { newId } from './ids';
import { mapLayerSize, sceneMaps } from './sceneMaps';
import type { FogPolygon, Point, Scene, SceneMapLayer } from './types';

type Pair = [number, number];
type Ring = Pair[];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

function closeRing(points: Point[]): Ring {
  const ring: Ring = points.map((p) => [p.x, p.y]);
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
  return ring;
}

function mapLayerFootprintPolygon(layer: SceneMapLayer): Polygon {
  const { width, height } = mapLayerSize(layer);
  const corners = mapCornerWorldPoints(layer.transform, width, height);
  return [closeRing([corners.nw, corners.ne, corners.se, corners.sw])];
}

export function fogToMulti(polys: FogPolygon[]): MultiPolygon {
  const out: MultiPolygon = [];
  for (const p of polys) {
    const anyP = p as FogPolygon & { points?: Point[] };
    const ringsSrc: Point[][] = Array.isArray(anyP.rings)
      ? anyP.rings
      : Array.isArray(anyP.points)
        ? [anyP.points]
        : [];
    if (ringsSrc.length === 0) continue;
    const poly: Polygon = [];
    for (const r of ringsSrc) {
      if (r.length < 3) continue;
      poly.push(closeRing(r));
    }
    if (poly.length) out.push(poly);
  }
  return out;
}

function multiToFog(mp: MultiPolygon, scene: Scene): FogPolygon[] {
  const polys: FogPolygon[] = [];
  for (const poly of mp) {
    if (!poly || poly.length === 0) continue;
    const rings: Point[][] = [];
    for (const ring of poly) {
      if (!ring || ring.length < 4) continue;
      rings.push(ring.slice(0, -1).map(([x, y]) => ({ x, y })));
    }
    if (rings.length === 0) continue;
    polys.push({ id: newId(), rings });
  }
  return polys.map((p) => assignFogPolygonMapLayer(p, scene));
}

/** Union of exact map image footprints (merged where maps overlap). */
export function allMapsFootprintMulti(scene: Scene): MultiPolygon {
  const maps = sceneMaps(scene);
  let merged: MultiPolygon = [];
  for (const layer of maps) {
    const footprint = mapLayerFootprintPolygon(layer);
    merged =
      merged.length === 0
        ? [footprint]
        : (polygonClipping.union(merged, footprint) as MultiPolygon);
  }
  return merged;
}

export function applyFullMapFog(scene: Scene): Scene {
  const mapsMp = allMapsFootprintMulti(scene);
  if (mapsMp.length === 0) {
    return { ...scene, fog: { ...scene.fog, defaultHidden: true } };
  }

  const hiddenMp = fogToMulti(scene.fog.unexploredMask);
  const revealedMp = fogToMulti(scene.fog.revealedMask);
  const nextHidden = polygonClipping.union(hiddenMp, mapsMp) as MultiPolygon;
  const nextRevealed = polygonClipping.difference(revealedMp, mapsMp) as MultiPolygon;

  return {
    ...scene,
    fog: {
      ...scene.fog,
      defaultHidden: true,
      unexploredMask: multiToFog(nextHidden, scene),
      revealedMask: multiToFog(nextRevealed, scene),
    },
  };
}

export function removeFullMapFog(scene: Scene): Scene {
  const mapsMp = allMapsFootprintMulti(scene);
  if (mapsMp.length === 0) {
    return { ...scene, fog: { ...scene.fog, defaultHidden: false } };
  }

  const hiddenMp = fogToMulti(scene.fog.unexploredMask);
  const nextHidden = polygonClipping.difference(hiddenMp, mapsMp) as MultiPolygon;

  return {
    ...scene,
    fog: {
      ...scene.fog,
      defaultHidden: false,
      unexploredMask: multiToFog(nextHidden, scene),
    },
  };
}
