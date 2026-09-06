import { newId } from './ids';
import type { FogOp, FogPaintMode, FogState, Point } from './types';

/** Legacy polygon fog shapes (pre-bitmask). */
type LegacyFogPolygon = {
  id: string;
  rings?: Point[][];
  points?: Point[];
};

type LegacyFogState = {
  defaultHidden?: boolean;
  ops?: FogOp[];
  unexploredMask?: LegacyFogPolygon[];
  revealedMask?: LegacyFogPolygon[];
};

function getRings(p: LegacyFogPolygon): Point[][] {
  if (Array.isArray(p.rings)) return p.rings;
  if (Array.isArray(p.points)) return [p.points];
  return [];
}

function polygonToOp(poly: LegacyFogPolygon, mode: FogPaintMode): FogOp | null {
  const rings = getRings(poly).filter((r) => r.length >= 3);
  if (rings.length === 0) return null;
  return {
    id: poly.id || newId(),
    kind: 'polygon',
    mode,
    rings: rings.map((r) => r.map((pt) => ({ x: pt.x, y: pt.y }))),
  };
}

/** Convert legacy dual-mask fog into an ops list. */
export function migrateLegacyFogState(raw: LegacyFogState): FogState {
  if (Array.isArray(raw.ops) && !raw.unexploredMask && !raw.revealedMask) {
    return {
      defaultHidden: !!raw.defaultHidden,
      ops: raw.ops,
    };
  }

  const defaultHidden = !!raw.defaultHidden;
  const ops: FogOp[] = Array.isArray(raw.ops) ? [...raw.ops] : [];

  const revealed = raw.revealedMask ?? [];
  const unexplored = raw.unexploredMask ?? [];

  if (defaultHidden) {
    for (const poly of revealed) {
      const rings = getRings(poly);
      const outer = rings[0];
      if (outer && outer.length >= 3) {
        const op = polygonToOp({ ...poly, rings: [outer] }, 'reveal');
        if (op) ops.push(op);
      }
      for (let i = 1; i < rings.length; i++) {
        const hole = rings[i];
        if (!hole || hole.length < 3) continue;
        ops.push({
          id: `${poly.id || newId()}:interior${i}`,
          kind: 'polygon',
          mode: 'hide',
          rings: [hole.map((pt) => ({ x: pt.x, y: pt.y }))],
        });
      }
    }
    for (const poly of unexplored) {
      const op = polygonToOp(poly, 'hide');
      if (op) ops.push(op);
    }
  } else {
    for (const poly of unexplored) {
      const op = polygonToOp(poly, 'hide');
      if (op) ops.push(op);
    }
    for (const poly of revealed) {
      const op = polygonToOp(poly, 'reveal');
      if (op) ops.push(op);
    }
  }

  return { defaultHidden, ops };
}

/** No fog overlay — map fully visible to GM and players. */
export function isFogFullyClear(fog: FogState): boolean {
  return !fog.defaultHidden && fog.ops.length === 0;
}

/** Entire scene is fogged with no paint ops (Full fog, no reveals/hides). */
export function isFogFullyCovered(fog: FogState): boolean {
  return !!fog.defaultHidden && fog.ops.length === 0;
}

/** Normalize fog state after load/edits (migrate legacy dual-mask → ops). */
export function normalizeFogState(fog: FogState | LegacyFogState): FogState {
  const migrated = migrateLegacyFogState(fog as LegacyFogState);
  return {
    defaultHidden: !!migrated.defaultHidden,
    ops: Array.isArray(migrated.ops) ? migrated.ops : [],
  };
}
