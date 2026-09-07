import { TRAY_HALF_D, TRAY_HALF_W } from './diceTypes';

export type TraySize = {
  halfW: number;
  halfD: number;
};

export const DEFAULT_TRAY_SIZE: TraySize = {
  halfW: TRAY_HALF_W,
  halfD: TRAY_HALF_D,
};

/** Spacing between die centers on the reveal / present grid. */
export const DIE_GRID_GAP = 0.7;
/** Center-to-center spacing for the hover pickup cluster (hex-packed). */
export const DIE_CLUSTER_GAP = 0.48;

const TRAY_AREA = TRAY_HALF_W * TRAY_HALF_D;

/**
 * Shape the tray to the panel aspect while keeping roughly the original area
 * (dice stay the same world size; only the playfield grows/shrinks).
 */
export function traySizeFromAspect(aspect: number): TraySize {
  const a = Math.max(0.45, Math.min(3.5, aspect));
  const halfD = Math.sqrt(TRAY_AREA / a);
  const halfW = halfD * a;
  return {
    halfW: Math.max(1.35, halfW),
    halfD: Math.max(1.35, halfD),
  };
}

export function maxGridColumns(halfW: number, gap: number = DIE_GRID_GAP): number {
  const inset = 0.4;
  return Math.max(1, Math.floor((halfW * 2 - inset) / gap));
}

/** Axial hex neighbor walk order (matches redblobgames cube spiral). */
const AXIAL_DIRS: ReadonlyArray<readonly [number, number]> = [
  [+1, 0],
  [+1, -1],
  [0, -1],
  [-1, 0],
  [-1, +1],
  [0, +1],
];

/** Axial (q, r) for index in a filled hex spiral (0 = center). */
function axialFromSpiralIndex(index: number): { q: number; r: number } {
  if (index <= 0) return { q: 0, r: 0 };
  let first = 1;
  let ring = 1;
  while (index >= first + 6 * ring) {
    first += 6 * ring;
    ring += 1;
  }
  let left = index - first;
  // Start of ring: west of center.
  let q = -ring;
  let r = ring;
  if (left === 0) return { q, r };
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < ring; step++) {
      q += AXIAL_DIRS[side][0];
      r += AXIAL_DIRS[side][1];
      left -= 1;
      if (left === 0) return { q, r };
    }
  }
  return { q, r };
}

/**
 * Pack `count` dice into a tight circular hex cluster centered on the tray.
 * Used when dice are added or held on the hover plane.
 */
export function computeClusterSlot(
  index: number,
  count: number,
  halfW: number,
  halfD: number,
  gap: number = DIE_CLUSTER_GAP,
): { x: number; z: number } {
  const n = Math.max(1, count);
  const i = Math.max(0, Math.min(n - 1, index));
  const { q, r } = axialFromSpiralIndex(i);
  // Pointy-top hex → roughly circular footprint.
  const x = gap * Math.sqrt(3) * (q + r / 2);
  const z = gap * (1.5 * r);
  const pad = 0.35;
  return {
    x: Math.max(-halfW + pad, Math.min(halfW - pad, x)),
    z: Math.max(-halfD + pad, Math.min(halfD - pad, z)),
  };
}

/**
 * Pack `count` dice into rows that fill the tray width; return world XZ for `index`.
 * Kept for reveal/present layouts.
 */
export function computeGridSlot(
  index: number,
  count: number,
  halfW: number,
  halfD: number,
  gap: number = DIE_GRID_GAP,
): { x: number; z: number } {
  const n = Math.max(1, count);
  const cols = Math.min(maxGridColumns(halfW, gap), n);
  const row = Math.floor(index / cols);
  const col = index % cols;
  const rows = Math.ceil(n / cols) || 1;
  const rowCount = Math.min(cols, n - row * cols);
  const x = (col - (rowCount - 1) / 2) * gap;
  const z = ((rows - 1) / 2 - row) * gap * 0.9;
  const pad = 0.35;
  return {
    x: Math.max(-halfW + pad, Math.min(halfW - pad, x)),
    z: Math.max(-halfD + pad, Math.min(halfD - pad, z)),
  };
}
