import type { Campaign, FogPolygon, FogState, Point, Scene } from './types';
import { migrateSceneMaps } from './sceneMaps';

const LEGACY_MAP_W = 2400;
const LEGACY_MAP_H = 1600;

function isNormalized(points: Point[]): boolean {
  return points.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
}

function toWorldPolygon(points: Point[]): Point[] {
  if (points.length === 0) return points;
  if (!isNormalized(points)) return points;
  return points.map((p) => ({
    x: p.x * LEGACY_MAP_W,
    y: p.y * LEGACY_MAP_H,
  }));
}

function migrateFog(fog: unknown): FogState {
  const f = fog as Record<string, unknown>;
  if (f && 'unexploredMask' in f) {
    const state = f as unknown as FogState;
    return {
      defaultHidden: state.defaultHidden ?? false,
      unexploredMask: state.unexploredMask.map((p) => ({
        ...p,
        rings: Array.isArray((p as any).rings)
          ? (p as any).rings.map((r: Point[]) => toWorldPolygon(r))
          : [toWorldPolygon((p as any).points ?? [])],
      })),
      revealedMask: state.revealedMask.map((p) => ({
        ...p,
        rings: Array.isArray((p as any).rings)
          ? (p as any).rings.map((r: Point[]) => toWorldPolygon(r))
          : [toWorldPolygon((p as any).points ?? [])],
      })),
    };
  }
  const hidden = (f?.hiddenPolygons as FogPolygon[] | undefined) ?? [];
  const revealed = (f?.revealedToPlayers as FogPolygon[] | undefined) ?? [];
  return {
    defaultHidden: false,
    unexploredMask: hidden.map((p) => ({
      ...p,
      rings: Array.isArray((p as any).rings)
        ? (p as any).rings.map((r: Point[]) => toWorldPolygon(r))
        : [toWorldPolygon((p as any).points ?? [])],
    })),
    revealedMask: revealed.map((p) => ({
      ...p,
      rings: Array.isArray((p as any).rings)
        ? (p as any).rings.map((r: Point[]) => toWorldPolygon(r))
        : [toWorldPolygon((p as any).points ?? [])],
    })),
  };
}

function migrateScene(scene: Scene): Scene {
  return migrateSceneMaps({
    ...scene,
    measurements: scene.measurements ?? [],
    drawStrokes: scene.drawStrokes ?? [],
    fog: migrateFog(scene.fog),
    tokens: scene.tokens.map((t) => ({
      ...t,
      rotation: typeof t.rotation === 'number' ? t.rotation : 0,
    })),
  });
}

export function migrateCampaign(campaign: Campaign): Campaign {
  const scenes: Record<string, Scene> = {};
  for (const [id, scene] of Object.entries(campaign.scenes)) {
    scenes[id] = migrateScene(scene);
  }
  return {
    ...campaign,
    version: 2,
    scenes,
  };
}
