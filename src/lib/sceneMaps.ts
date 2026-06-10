import { DEFAULT_GRID_OFFSET } from './fixedGrid';
import { mapLocalToWorld, worldToMapLocal } from './mapGeometry';
import { migrateObjectMapParents } from './mapObjectParent';
import { newId } from './ids';
import type { MapTransform, Point, Scene, SceneMapLayer } from './types';
import { DEFAULT_MAP_TRANSFORM } from './types';

export function migrateSceneMapLayers(scene: Scene): Scene {
  if (Array.isArray(scene.maps)) {
    return {
      ...scene,
      maps: scene.maps.map((m) => ({
        ...m,
        transform: m.transform ?? DEFAULT_MAP_TRANSFORM,
      })),
      gridOffset: scene.gridOffset ?? DEFAULT_GRID_OFFSET,
    };
  }

  const legacy = scene as Scene & { mapAssetId?: string; mapTransform?: MapTransform };
  if (legacy.mapAssetId) {
    return {
      ...scene,
      maps: [
        {
          id: newId(),
          assetId: legacy.mapAssetId,
          transform: legacy.mapTransform ?? DEFAULT_MAP_TRANSFORM,
        },
      ],
      mapAssetId: undefined,
      mapTransform: undefined,
      gridOffset: scene.gridOffset ?? DEFAULT_GRID_OFFSET,
    };
  }

  return { ...scene, maps: [], gridOffset: scene.gridOffset ?? DEFAULT_GRID_OFFSET };
}

/** Full scene migration including map layers and object map parents. */
export function migrateSceneMaps(scene: Scene): Scene {
  return migrateObjectMapParents(migrateSceneMapLayers(scene));
}

export function sceneMaps(scene: Scene): SceneMapLayer[] {
  return migrateSceneMapLayers(scene).maps;
}

export function mapLayerSize(layer: SceneMapLayer): { width: number; height: number } {
  return {
    width: layer.imageWidth ?? 800,
    height: layer.imageHeight ?? 600,
  };
}

/** Center of a map image in world space. */
export function mapLayerWorldCenter(layer: SceneMapLayer): Point {
  const { width, height } = mapLayerSize(layer);
  return mapLocalToWorld({ x: width / 2, y: height / 2 }, layer.transform);
}

export function pointInMapLayer(world: Point, layer: SceneMapLayer): boolean {
  const { width, height } = mapLayerSize(layer);
  const local = worldToMapLocal(world, layer.transform);
  return local.x >= 0 && local.y >= 0 && local.x <= width && local.y <= height;
}

/** Top-most map under the pointer (last in array wins). */
export function hitMapLayerAt(world: Point, maps: SceneMapLayer[]): SceneMapLayer | null {
  for (let i = maps.length - 1; i >= 0; i--) {
    if (pointInMapLayer(world, maps[i])) return maps[i];
  }
  return null;
}

/** Move a map to the end of the stack (top-most for render and hit tests). */
export function bringMapLayerToFront(
  maps: SceneMapLayer[],
  mapLayerId: string,
): SceneMapLayer[] {
  const idx = maps.findIndex((m) => m.id === mapLayerId);
  if (idx < 0 || idx === maps.length - 1) return maps;
  const layer = maps[idx]!;
  return [...maps.slice(0, idx), ...maps.slice(idx + 1), layer];
}

export function referenceMapLayer(
  scene: Scene,
  selectedId: string | null,
): SceneMapLayer | null {
  const maps = sceneMaps(scene);
  if (maps.length === 0) return null;
  return maps.find((m) => m.id === selectedId) ?? maps[maps.length - 1];
}
export function offsetMapTransform(index: number): MapTransform {
  const step = 50;
  return {
    ...DEFAULT_MAP_TRANSFORM,
    x: index * step,
    y: index * step,
  };
}
