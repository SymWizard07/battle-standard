import type { FogPolygon, Point, Scene } from './types';

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

/** Full-grid fog: hide everything by default; revealed areas are cut out (negative mask). */
export function applyFullMapFog(scene: Scene): Scene {
  return {
    ...scene,
    fog: { ...scene.fog, defaultHidden: true },
  };
}

export function removeFullMapFog(scene: Scene): Scene {
  return {
    ...scene,
    fog: { ...scene.fog, defaultHidden: false },
  };
}
