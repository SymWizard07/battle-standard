import { GRID_SIZE_PX } from './fixedGrid';
import { tokenWorldTopLeft } from './grid';
import { mapAxisBounds } from './mapGeometry';
import { mapLayerSize, sceneMaps } from './sceneMaps';
import type { Point, Scene, SceneMapLayer, WorldBounds } from './types';

function layerBounds(layer: SceneMapLayer): WorldBounds {
  const { width, height } = mapLayerSize(layer);
  const b = mapAxisBounds(layer.transform, width, height);
  return { minX: b.x, minY: b.y, maxX: b.x + b.width, maxY: b.y + b.height };
}

/** Axis-aligned world bounds of a single map layer image. */
export function mapLayerWorldBounds(layer: SceneMapLayer): WorldBounds {
  return layerBounds(layer);
}

/** World bounds of all map images (for preview framing). */
export function computeMapBounds(scene: Scene): WorldBounds | null {
  const maps = sceneMaps(scene);
  if (maps.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const layer of maps) {
    const b = layerBounds(layer);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  return { minX, minY, maxX, maxY };
}

export function computeSceneContentBounds(scene: Scene): WorldBounds {
  const pad = 48;
  let minX = 0;
  let minY = 0;
  let maxX = 800;
  let maxY = 600;

  for (const layer of sceneMaps(scene)) {
    const b = layerBounds(layer);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }

  for (const t of scene.tokens) {
    const tl = tokenWorldTopLeft(t);
    const w = t.footprint.w * GRID_SIZE_PX;
    const h = t.footprint.h * GRID_SIZE_PX;
    minX = Math.min(minX, tl.x);
    minY = Math.min(minY, tl.y);
    maxX = Math.max(maxX, tl.x + w);
    maxY = Math.max(maxY, tl.y + h);
  }

  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

export function expandBounds(
  bounds: WorldBounds,
  fraction: number,
  minPadWorld = 0,
): WorldBounds {
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxY - bounds.minY;
  const padX = Math.max(bw * fraction, minPadWorld);
  const padY = Math.max(bh * fraction, minPadWorld);
  return {
    minX: bounds.minX - padX,
    minY: bounds.minY - padY,
    maxX: bounds.maxX + padX,
    maxY: bounds.maxY + padY,
  };
}

/** Frame map bounds in a viewport with comfortable margin (home / scene load). */
export function frameMapBoundsInViewport(
  bounds: WorldBounds,
  width: number,
  height: number,
  centerWorld?: Point,
): { x: number; y: number; scale: number } {
  const expanded = expandBounds(bounds, 0.15, GRID_SIZE_PX * 2);
  const edgePadding = Math.max(80, Math.min(width, height) * 0.12);
  const bw = expanded.maxX - expanded.minX;
  const bh = expanded.maxY - expanded.minY;
  if (bw <= 0 || bh <= 0) return { x: edgePadding, y: edgePadding, scale: 1 };
  const scale = Math.min((width - edgePadding * 2) / bw, (height - edgePadding * 2) / bh);
  const center = centerWorld ?? {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
  return {
    x: width / 2 - center.x * scale,
    y: height / 2 - center.y * scale,
    scale,
  };
}

export function fitBoundsToRect(
  bounds: WorldBounds,
  width: number,
  height: number,
  padding = 8,
): { x: number; y: number; scale: number } {
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxY - bounds.minY;
  if (bw <= 0 || bh <= 0) return { x: padding, y: padding, scale: 1 };
  const scale = Math.min((width - padding * 2) / bw, (height - padding * 2) / bh);
  const contentW = bw * scale;
  const contentH = bh * scale;
  return {
    x: (width - contentW) / 2 - bounds.minX * scale,
    y: (height - contentH) / 2 - bounds.minY * scale,
    scale,
  };
}
