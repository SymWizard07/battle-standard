import { migrateSceneMaps } from '../sceneMaps';
import type {
  Campaign,
  DrawStroke,
  FogState,
  MeasurementObject,
  Scene,
  SceneDeckNode,
  SceneMapLayer,
  Token,
  TokenLibraryLayout,
} from '../types';
import type { ObjectRef, ObjectSnapshot, SceneMetaSnapshot } from './types';

function updateSceneInCampaign(
  campaign: Campaign,
  sceneId: string,
  updater: (scene: Scene) => Scene,
): Campaign {
  const scene = campaign.scenes[sceneId];
  if (!scene) return campaign;
  return {
    ...campaign,
    scenes: { ...campaign.scenes, [sceneId]: updater(scene) },
    updatedAt: Date.now(),
  };
}

export function getObjectSnapshot(
  campaign: Campaign,
  ref: ObjectRef,
): ObjectSnapshot | null | undefined {
  switch (ref.kind) {
    case 'token':
    case 'measurement':
    case 'drawStroke':
    case 'mapLayer':
    case 'fog':
    case 'sceneMeta': {
      if (!ref.sceneId) return undefined;
      const scene = campaign.scenes[ref.sceneId];
      if (!scene) return undefined;
      switch (ref.kind) {
        case 'token': {
          const token = scene.tokens.find((t) => t.id === ref.id);
          return token ? structuredClone(token) : null;
        }
        case 'measurement': {
          const m = scene.measurements.find((x) => x.id === ref.id);
          return m ? structuredClone(m) : null;
        }
        case 'drawStroke': {
          const s = (scene.drawStrokes ?? []).find((x) => x.id === ref.id);
          return s ? structuredClone(s) : null;
        }
        case 'mapLayer': {
          const migrated = migrateSceneMaps(scene);
          const layer = migrated.maps.find((m) => m.id === ref.id);
          return layer ? structuredClone(layer) : null;
        }
        case 'fog':
          return structuredClone(scene.fog);
        case 'sceneMeta':
          return {
            name: scene.name,
            gridOffset: scene.gridOffset ?? { x: 0, y: 0 },
          };
      }
      break;
    }
    case 'scene': {
      const scene = campaign.scenes[ref.id];
      return scene ? structuredClone(scene) : null;
    }
    case 'sceneDeck':
      return structuredClone(campaign.sceneDeck);
    case 'tokenLibrary':
      return campaign.tokenLibrary ? structuredClone(campaign.tokenLibrary) : null;
    default:
      return undefined;
  }
}

function upsertInArray<T extends { id: string }>(items: T[], item: T): T[] {
  const idx = items.findIndex((x) => x.id === item.id);
  if (idx < 0) return [...items, item];
  const next = [...items];
  next[idx] = item;
  return next;
}

function removeFromArray<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((x) => x.id !== id);
}

export function applyObjectSnapshot(
  campaign: Campaign,
  ref: ObjectRef,
  snapshot: ObjectSnapshot | null,
): Campaign {
  switch (ref.kind) {
    case 'token':
      if (!ref.sceneId) return campaign;
      return updateSceneInCampaign(campaign, ref.sceneId, (scene) => {
        if (snapshot === null) {
          return { ...scene, tokens: removeFromArray(scene.tokens, ref.id) };
        }
        return {
          ...scene,
          tokens: upsertInArray(scene.tokens, snapshot as Token),
        };
      });
    case 'measurement':
      if (!ref.sceneId) return campaign;
      return updateSceneInCampaign(campaign, ref.sceneId, (scene) => {
        if (snapshot === null) {
          return {
            ...scene,
            measurements: removeFromArray(scene.measurements, ref.id),
          };
        }
        return {
          ...scene,
          measurements: upsertInArray(scene.measurements, snapshot as MeasurementObject),
        };
      });
    case 'drawStroke':
      if (!ref.sceneId) return campaign;
      return updateSceneInCampaign(campaign, ref.sceneId, (scene) => {
        const strokes = scene.drawStrokes ?? [];
        if (snapshot === null) {
          return { ...scene, drawStrokes: removeFromArray(strokes, ref.id) };
        }
        return {
          ...scene,
          drawStrokes: upsertInArray(strokes, snapshot as DrawStroke),
        };
      });
    case 'mapLayer':
      if (!ref.sceneId) return campaign;
      return updateSceneInCampaign(campaign, ref.sceneId, (scene) => {
        const migrated = migrateSceneMaps(scene);
        const maps = migrated.maps;
        if (snapshot === null) {
          return { ...scene, maps: removeFromArray(maps, ref.id) };
        }
        return {
          ...scene,
          maps: upsertInArray(maps, snapshot as SceneMapLayer),
        };
      });
    case 'fog':
      if (!ref.sceneId || snapshot === null) return campaign;
      return updateSceneInCampaign(campaign, ref.sceneId, (scene) => ({
        ...scene,
        fog: snapshot as FogState,
      }));
    case 'sceneMeta':
      if (!ref.sceneId || snapshot === null) return campaign;
      return updateSceneInCampaign(campaign, ref.sceneId, (scene) => {
        const meta = snapshot as SceneMetaSnapshot;
        return { ...scene, name: meta.name, gridOffset: meta.gridOffset };
      });
    case 'scene': {
      if (snapshot === null) {
        const { [ref.id]: _, ...scenes } = campaign.scenes;
        return { ...campaign, scenes, updatedAt: Date.now() };
      }
      return {
        ...campaign,
        scenes: { ...campaign.scenes, [ref.id]: snapshot as Scene },
        updatedAt: Date.now(),
      };
    }
    case 'sceneDeck':
      if (snapshot === null) return campaign;
      return {
        ...campaign,
        sceneDeck: snapshot as SceneDeckNode[],
        updatedAt: Date.now(),
      };
    case 'tokenLibrary':
      return {
        ...campaign,
        tokenLibrary: snapshot as TokenLibraryLayout | undefined,
        updatedAt: Date.now(),
      };
    default:
      return campaign;
  }
}

export function applyPatchesToCampaign(
  campaign: Campaign,
  patches: { ref: ObjectRef; snapshot: ObjectSnapshot | null }[],
): Campaign {
  let next = campaign;
  for (const { ref, snapshot } of patches) {
    next = applyObjectSnapshot(next, ref, snapshot);
  }
  return next;
}
