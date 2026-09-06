import { GRID_SIZE_PX } from './fixedGrid';
import { computeMapBounds } from './sceneBounds';
import type { FogOp, FogState, Point, Scene, WorldBounds } from './types';

/** World units per mask pixel (higher = coarser / faster). */
export const MASK_WORLD_PER_PX = 4;

/** Fixed chunk size in mask pixels. */
export const CHUNK_MASK_PX = 256;

/** World size of one chunk edge. */
export const CHUNK_WORLD = CHUNK_MASK_PX * MASK_WORLD_PER_PX;

const MASK_PAD_CELLS = 8;
const HIDDEN_THRESHOLD = 127;

export type FogMask = {
  origin: Point;
  width: number;
  height: number;
  scale: number;
  /** 0 = clear, 255 = fogged. */
  data: Uint8ClampedArray;
  /** Browser paint surface (preferred for Konva); may be null in Node tests. */
  canvas: HTMLCanvasElement | null;
  /** When true, `data` is stale vs canvas — sync before sampling. */
  dataNeedsSync?: boolean;
  /** Pending dirty region for lazy data sync (`null` = full). */
  syncDirty?: { x: number; y: number; w: number; h: number } | null;
};

export type FogMaskChunk = FogMask & {
  cx: number;
  cy: number;
};

export type FogMaskSet = {
  scale: number;
  chunkWorld: number;
  chunkMaskPx: number;
  defaultHidden: boolean;
  chunks: Map<string, FogMaskChunk>;
};

export type FogMaskDirtyRect = { x: number; y: number; w: number; h: number };

export function expandWorldBounds(bounds: WorldBounds, pad: number): WorldBounds {
  return {
    minX: bounds.minX - pad,
    minY: bounds.minY - pad,
    maxX: bounds.maxX + pad,
    maxY: bounds.maxY + pad,
  };
}

/** Bounds covering maps (or grid origin) plus padding — for uniform Full fog rects. */
export function fogMaskWorldBounds(scene: Scene, fog: FogState): WorldBounds {
  const pad = GRID_SIZE_PX * MASK_PAD_CELLS;
  const mapBounds = computeMapBounds(scene);
  const grid = scene.gridOffset ?? { x: 0, y: 0 };

  let bounds: WorldBounds = mapBounds
    ? expandWorldBounds(mapBounds, pad)
    : {
        minX: grid.x - pad,
        minY: grid.y - pad,
        maxX: grid.x + pad * 2,
        maxY: grid.y + pad * 2,
      };

  for (const op of fog.ops) {
    const b = fogOpBounds(op);
    if (!b) continue;
    bounds = {
      minX: Math.min(bounds.minX, b.minX - pad * 0.1),
      minY: Math.min(bounds.minY, b.minY - pad * 0.1),
      maxX: Math.max(bounds.maxX, b.maxX + pad * 0.1),
      maxY: Math.max(bounds.maxY, b.maxY + pad * 0.1),
    };
  }

  return bounds;
}

export function fogOpBounds(op: FogOp): WorldBounds | null {
  if (op.kind === 'rect') {
    return {
      minX: op.x,
      minY: op.y,
      maxX: op.x + op.w,
      maxY: op.y + op.h,
    };
  }
  if (op.kind === 'stroke') {
    if (op.points.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of op.points) {
      minX = Math.min(minX, p.x - op.radius);
      minY = Math.min(minY, p.y - op.radius);
      maxX = Math.max(maxX, p.x + op.radius);
      maxY = Math.max(maxY, p.y + op.radius);
    }
    return { minX, minY, maxX, maxY };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const ring of op.rings) {
    for (const p of ring) {
      any = true;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  return any ? { minX, minY, maxX, maxY } : null;
}

export function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

export function worldToChunkCoord(world: number, chunkWorld: number = CHUNK_WORLD): number {
  return Math.floor(world / chunkWorld);
}

/** Inclusive chunk index range overlapping a world AABB. */
export function chunksOverlappingBounds(
  bounds: WorldBounds,
  chunkWorld: number = CHUNK_WORLD,
): { cx0: number; cy0: number; cx1: number; cy1: number } {
  // max edges are exclusive-ish for zero-size; treat max as inclusive of coverage.
  const maxX = Math.max(bounds.minX, bounds.maxX - 1e-6);
  const maxY = Math.max(bounds.minY, bounds.maxY - 1e-6);
  return {
    cx0: worldToChunkCoord(bounds.minX, chunkWorld),
    cy0: worldToChunkCoord(bounds.minY, chunkWorld),
    cx1: worldToChunkCoord(maxX, chunkWorld),
    cy1: worldToChunkCoord(maxY, chunkWorld),
  };
}

function canUseCanvas2d(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function createMaskBitmap(
  origin: Point,
  width: number,
  height: number,
  scale: number,
  fill: number,
): FogMask {
  const data = new Uint8ClampedArray(width * height);
  if (fill !== 0) data.fill(fill);

  let canvas: HTMLCanvasElement | null = null;
  if (canUseCanvas2d()) {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.clearRect(0, 0, width, height);
      if (fill > 127) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
      }
    }
  }

  return { origin, width, height, scale, data, canvas };
}

export function createEmptyFogChunk(
  cx: number,
  cy: number,
  fill: number,
  scale: number = MASK_WORLD_PER_PX,
  chunkMaskPx: number = CHUNK_MASK_PX,
): FogMaskChunk {
  const chunkWorld = chunkMaskPx * scale;
  const origin = { x: cx * chunkWorld, y: cy * chunkWorld };
  const mask = createMaskBitmap(origin, chunkMaskPx, chunkMaskPx, scale, fill);
  return { ...mask, cx, cy };
}

export function createEmptyFogMaskSet(defaultHidden: boolean): FogMaskSet {
  return {
    scale: MASK_WORLD_PER_PX,
    chunkWorld: CHUNK_WORLD,
    chunkMaskPx: CHUNK_MASK_PX,
    defaultHidden: !!defaultHidden,
    chunks: new Map(),
  };
}

/** Test helper: single contiguous mask for a world AABB (not used by scene cache). */
export function createEmptyFogMask(bounds: WorldBounds, fill: number): FogMask {
  const scale = MASK_WORLD_PER_PX;
  const width = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / scale));
  const height = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / scale));
  return createMaskBitmap(
    { x: bounds.minX, y: bounds.minY },
    width,
    height,
    scale,
    fill,
  );
}

function worldToMask(mask: FogMask, world: Point): { x: number; y: number } {
  return {
    x: (world.x - mask.origin.x) / mask.scale,
    y: (world.y - mask.origin.y) / mask.scale,
  };
}

function syncDataFromCanvas(mask: FogMask, dirty?: FogMaskDirtyRect) {
  if (!mask.canvas) return;
  const ctx = mask.canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  if (!dirty) {
    const image = ctx.getImageData(0, 0, mask.width, mask.height);
    const d = image.data;
    for (let i = 0, p = 0; i < mask.data.length; i++, p += 4) {
      mask.data[i] = d[p + 3]!;
    }
    mask.dataNeedsSync = false;
    mask.syncDirty = null;
    return;
  }

  const x0 = Math.max(0, Math.floor(dirty.x));
  const y0 = Math.max(0, Math.floor(dirty.y));
  const x1 = Math.min(mask.width, Math.ceil(dirty.x + dirty.w));
  const y1 = Math.min(mask.height, Math.ceil(dirty.y + dirty.h));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) {
    mask.dataNeedsSync = false;
    mask.syncDirty = null;
    return;
  }
  const image = ctx.getImageData(x0, y0, w, h);
  const d = image.data;
  for (let row = 0; row < h; row++) {
    const src = row * w * 4;
    const dst = (y0 + row) * mask.width + x0;
    for (let col = 0; col < w; col++) {
      mask.data[dst + col] = d[src + col * 4 + 3]!;
    }
  }
  mask.dataNeedsSync = false;
  mask.syncDirty = null;
}

export function ensureFogMaskDataSynced(mask: FogMask) {
  if (!mask.dataNeedsSync || !mask.canvas) return;
  syncDataFromCanvas(mask, mask.syncDirty ?? undefined);
}

function unionDirty(
  a: FogMaskDirtyRect | null | undefined,
  b: FogMaskDirtyRect | null,
): FogMaskDirtyRect | null {
  if (!b) return a ?? null;
  if (!a) return { ...b };
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.w, b.x + b.w);
  const y1 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function fogOpDirtyRect(mask: FogMask, op: FogOp): FogMaskDirtyRect | null {
  const b = fogOpBounds(op);
  if (!b) return null;
  const a = worldToMask(mask, { x: b.minX, y: b.minY });
  const c = worldToMask(mask, { x: b.maxX, y: b.maxY });
  const padPx = 2;
  const x = Math.min(a.x, c.x) - padPx;
  const y = Math.min(a.y, c.y) - padPx;
  return {
    x,
    y,
    w: Math.abs(c.x - a.x) + padPx * 2,
    h: Math.abs(c.y - a.y) + padPx * 2,
  };
}

function paintOpOnCanvas(mask: FogMask, op: FogOp) {
  const canvas = mask.canvas;
  if (!canvas) return false;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;

  if (op.mode === 'reveal') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
  }

  if (op.kind === 'rect') {
    const a = worldToMask(mask, { x: op.x, y: op.y });
    const b = worldToMask(mask, { x: op.x + op.w, y: op.y + op.h });
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    ctx.fillRect(x, y, w, h);
    return true;
  }

  if (op.kind === 'stroke') {
    if (op.points.length === 0) return true;
    const r = Math.max(0.5, op.radius / mask.scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = r * 2;
    ctx.beginPath();
    const first = worldToMask(mask, op.points[0]!);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < op.points.length; i++) {
      const p = worldToMask(mask, op.points[i]!);
      ctx.lineTo(p.x, p.y);
    }
    if (op.points.length === 1) {
      ctx.arc(first.x, first.y, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.stroke();
    }
    return true;
  }

  ctx.beginPath();
  for (const ring of op.rings) {
    if (ring.length < 3) continue;
    const p0 = worldToMask(mask, ring[0]!);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < ring.length; i++) {
      const p = worldToMask(mask, ring[i]!);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  }
  ctx.fill('evenodd');
  return true;
}

/** Pure-JS fallback for Node tests (no DOM canvas). */
function paintOpOnData(mask: FogMask, op: FogOp) {
  const value = op.mode === 'hide' ? 255 : 0;
  if (op.kind === 'rect') {
    const a = worldToMask(mask, { x: op.x, y: op.y });
    const b = worldToMask(mask, { x: op.x + op.w, y: op.y + op.h });
    const minX = Math.max(0, Math.floor(Math.min(a.x, b.x)));
    const maxX = Math.min(mask.width - 1, Math.ceil(Math.max(a.x, b.x)) - 1);
    const minY = Math.max(0, Math.floor(Math.min(a.y, b.y)));
    const maxY = Math.min(mask.height - 1, Math.ceil(Math.max(a.y, b.y)) - 1);
    for (let iy = minY; iy <= maxY; iy++) {
      const row = iy * mask.width;
      for (let ix = minX; ix <= maxX; ix++) mask.data[row + ix] = value;
    }
    return;
  }
  if (op.kind === 'stroke') {
    const step = Math.max(op.radius * 0.75, mask.scale * 2);
    for (let i = 0; i < op.points.length; i++) {
      const p = op.points[i]!;
      fillCircleData(mask, p.x, p.y, op.radius, value);
      if (i === 0) continue;
      const prev = op.points[i - 1]!;
      const dist = Math.hypot(p.x - prev.x, p.y - prev.y);
      const n = Math.floor(dist / step);
      for (let s = 1; s < n; s++) {
        const t = s / n;
        fillCircleData(
          mask,
          prev.x + (p.x - prev.x) * t,
          prev.y + (p.y - prev.y) * t,
          op.radius,
          value,
        );
      }
    }
    return;
  }
  fillPolygonData(mask, op.rings, value);
}

function fillCircleData(
  mask: FogMask,
  cx: number,
  cy: number,
  radiusWorld: number,
  value: number,
) {
  const c = worldToMask(mask, { x: cx, y: cy });
  const r = radiusWorld / mask.scale;
  const r2 = r * r;
  const minX = Math.max(0, Math.floor(c.x - r));
  const maxX = Math.min(mask.width - 1, Math.ceil(c.x + r));
  const minY = Math.max(0, Math.floor(c.y - r));
  const maxY = Math.min(mask.height - 1, Math.ceil(c.y + r));
  for (let y = minY; y <= maxY; y++) {
    const row = y * mask.width;
    for (let x = minX; x <= maxX; x++) {
      const dx = x + 0.5 - c.x;
      const dy = y + 0.5 - c.y;
      if (dx * dx + dy * dy <= r2) mask.data[row + x] = value;
    }
  }
}

function pointInRing(px: number, py: number, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if ((a.y > py) !== (b.y > py)) {
      const xIntersect = ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x;
      if (px < xIntersect) inside = !inside;
    }
  }
  return inside;
}

function fillPolygonData(mask: FogMask, rings: Point[][], value: number) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!Number.isFinite(minX)) return;
  const a = worldToMask(mask, { x: minX, y: minY });
  const b = worldToMask(mask, { x: maxX, y: maxY });
  const ix0 = Math.max(0, Math.floor(Math.min(a.x, b.x)));
  const ix1 = Math.min(mask.width - 1, Math.ceil(Math.max(a.x, b.x)));
  const iy0 = Math.max(0, Math.floor(Math.min(a.y, b.y)));
  const iy1 = Math.min(mask.height - 1, Math.ceil(Math.max(a.y, b.y)));
  for (let iy = iy0; iy <= iy1; iy++) {
    const row = iy * mask.width;
    for (let ix = ix0; ix <= ix1; ix++) {
      const wx = mask.origin.x + (ix + 0.5) * mask.scale;
      const wy = mask.origin.y + (iy + 0.5) * mask.scale;
      let crossings = 0;
      for (const ring of rings) {
        if (ring.length >= 3 && pointInRing(wx, wy, ring)) crossings++;
      }
      if (crossings % 2 === 1) mask.data[row + ix] = value;
    }
  }
}

export function applyFogOp(mask: FogMask, op: FogOp) {
  if (mask.canvas && paintOpOnCanvas(mask, op)) {
    return;
  }
  paintOpOnData(mask, op);
}

function markChunkDirtyAfterOp(chunk: FogMaskChunk, op: FogOp, syncData: boolean) {
  const dirty = fogOpDirtyRect(chunk, op);
  if (syncData) {
    if (chunk.canvas) syncDataFromCanvas(chunk, dirty ?? undefined);
  } else if (chunk.canvas) {
    chunk.dataNeedsSync = true;
    chunk.syncDirty = unionDirty(chunk.syncDirty, dirty);
  }
}

/** Ensure chunks covering ops exist (filled with set.defaultHidden). */
export function ensureChunksForOps(set: FogMaskSet, ops: FogOp[]): FogMaskChunk[] {
  const fill = set.defaultHidden ? 255 : 0;
  const touched: FogMaskChunk[] = [];
  const seen = new Set<string>();

  for (const op of ops) {
    const b = fogOpBounds(op);
    if (!b) continue;
    const { cx0, cy0, cx1, cy1 } = chunksOverlappingBounds(b, set.chunkWorld);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = chunkKey(cx, cy);
        let chunk = set.chunks.get(key);
        if (!chunk) {
          chunk = createEmptyFogChunk(cx, cy, fill, set.scale, set.chunkMaskPx);
          set.chunks.set(key, chunk);
        }
        if (!seen.has(key)) {
          seen.add(key);
          touched.push(chunk);
        }
      }
    }
  }
  return touched;
}

/** Paint ops into the sparse set, allocating chunks as needed. */
export function appendFogOpsToMaskSet(
  set: FogMaskSet,
  ops: FogOp[],
  opts?: { syncData?: boolean },
): void {
  if (ops.length === 0) return;
  ensureChunksForOps(set, ops);
  const syncData = !!opts?.syncData;

  for (const op of ops) {
    const b = fogOpBounds(op);
    if (!b) continue;
    const { cx0, cy0, cx1, cy1 } = chunksOverlappingBounds(b, set.chunkWorld);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const chunk = set.chunks.get(chunkKey(cx, cy));
        if (!chunk) continue;
        applyFogOp(chunk, op);
        markChunkDirtyAfterOp(chunk, op, syncData);
      }
    }
  }
}

/** Rebuild sparse mask set from fog ops (source of truth). */
export function createFogMaskSet(fog: FogState): FogMaskSet {
  const set = createEmptyFogMaskSet(!!fog.defaultHidden);
  appendFogOpsToMaskSet(set, fog.ops, { syncData: false });
  return set;
}

export function createFogMaskSetForScene(_scene: Scene, fog: FogState): FogMaskSet {
  return createFogMaskSet(fog);
}

/** Test helper: single contiguous mask. Prefer createFogMaskSet for scene paths. */
export function createFogMask(fog: FogState, bounds: WorldBounds): FogMask {
  const base = fog.defaultHidden ? 255 : 0;
  const mask = createEmptyFogMask(bounds, base);
  for (const op of fog.ops) applyFogOp(mask, op);
  if (mask.canvas) {
    mask.dataNeedsSync = true;
    mask.syncDirty = null;
  }
  return mask;
}

export function sampleFogMask(mask: FogMask, world: Point): boolean {
  ensureFogMaskDataSynced(mask);
  const m = worldToMask(mask, world);
  const ix = Math.floor(m.x);
  const iy = Math.floor(m.y);
  if (ix < 0 || iy < 0 || ix >= mask.width || iy >= mask.height) return false;
  return mask.data[iy * mask.width + ix]! > HIDDEN_THRESHOLD;
}

export function sampleFogMaskWithDefault(
  mask: FogMask,
  world: Point,
  defaultHidden: boolean,
): boolean {
  ensureFogMaskDataSynced(mask);
  const m = worldToMask(mask, world);
  const ix = Math.floor(m.x);
  const iy = Math.floor(m.y);
  if (ix < 0 || iy < 0 || ix >= mask.width || iy >= mask.height) {
    return defaultHidden;
  }
  return mask.data[iy * mask.width + ix]! > HIDDEN_THRESHOLD;
}

export function sampleFogMaskSet(set: FogMaskSet, world: Point): boolean {
  const cx = worldToChunkCoord(world.x, set.chunkWorld);
  const cy = worldToChunkCoord(world.y, set.chunkWorld);
  const chunk = set.chunks.get(chunkKey(cx, cy));
  if (!chunk) return set.defaultHidden;
  return sampleFogMaskWithDefault(chunk, world, set.defaultHidden);
}

export function shiftFogOps(ops: FogOp[], delta: Point): FogOp[] {
  if (delta.x === 0 && delta.y === 0) return ops;
  return ops.map((op) => {
    if (op.kind === 'rect') {
      return { ...op, x: op.x + delta.x, y: op.y + delta.y };
    }
    if (op.kind === 'stroke') {
      return {
        ...op,
        points: op.points.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y })),
      };
    }
    return {
      ...op,
      rings: op.rings.map((ring) => ring.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y }))),
    };
  });
}

/** Prefer the paint canvas; fall back to building from data. */
export function fogMaskToCanvas(mask: FogMask): HTMLCanvasElement {
  if (mask.canvas) return mask.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const image = ctx.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) {
    const a = mask.data[i]!;
    const o = i * 4;
    image.data[o] = 255;
    image.data[o + 1] = 255;
    image.data[o + 2] = 255;
    image.data[o + 3] = a;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Alpha-inverted mask for destination-out punches (opaque where fog is clear).
 */
export function fogMaskToClearPunchCanvas(mask: FogMask): HTMLCanvasElement {
  const source = fogMaskToCanvas(mask);
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, out.width, out.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255;
    d[i + 1] = 255;
    d[i + 2] = 255;
    d[i + 3] = 255 - d[i + 3]!;
  }
  ctx.putImageData(image, 0, 0);
  return out;
}

/** World AABB of all allocated chunks, or null if empty. */
export function fogMaskSetChunkBounds(set: FogMaskSet): WorldBounds | null {
  if (set.chunks.size === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const chunk of set.chunks.values()) {
    minX = Math.min(minX, chunk.origin.x);
    minY = Math.min(minY, chunk.origin.y);
    maxX = Math.max(maxX, chunk.origin.x + chunk.width * chunk.scale);
    maxY = Math.max(maxY, chunk.origin.y + chunk.height * chunk.scale);
  }
  return { minX, minY, maxX, maxY };
}

/** Stitch chunk alpha masks into one canvas covering `bounds` (for seamless destination-in). */
export function stitchFogMaskSetToCanvas(
  set: FogMaskSet,
  bounds: WorldBounds,
): HTMLCanvasElement {
  const scale = set.scale;
  const width = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / scale));
  const height = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  for (const chunk of set.chunks.values()) {
    const src = fogMaskToCanvas(chunk);
    const dx = Math.round((chunk.origin.x - bounds.minX) / scale);
    const dy = Math.round((chunk.origin.y - bounds.minY) / scale);
    ctx.drawImage(src, dx, dy);
  }
  return canvas;
}

export function fogOpsFingerprint(fog: FogState): string {
  const last = fog.ops[fog.ops.length - 1];
  return `${fog.defaultHidden ? 1 : 0}:${fog.ops.length}:${last?.id ?? ''}`;
}

/** Thin stroke points for storage/paint performance. */
export function decimateStrokePoints(points: Point[], minDist: number): Point[] {
  if (points.length <= 2) return points.map((p) => ({ ...p }));
  const out: Point[] = [{ ...points[0]! }];
  let last = points[0]!;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    if (Math.hypot(p.x - last.x, p.y - last.y) >= minDist) {
      out.push({ ...p });
      last = p;
    }
  }
  out.push({ ...points[points.length - 1]! });
  return out;
}
