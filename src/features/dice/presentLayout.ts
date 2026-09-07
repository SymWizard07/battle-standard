import type { DiceSides } from './diceTypes';
import { dieScale, TRAY_HALF_D, TRAY_HALF_W } from './diceTypes';
import { DIE_GRID_GAP } from './trayLayout';

export type PresentSlot = {
  id: string;
  sides: DiceSides;
  value: number;
  x: number;
  z: number;
};

/**
 * How many die centers fit across a tray axis.
 * `(count - 1) * gap + dieSpan` must stay inside the padded tray.
 */
export function maxDiceAlongAxis(
  halfExtent: number,
  dieSpan: number,
  gap: number,
  edgePad: number,
): number {
  const room = 2 * (halfExtent - edgePad) - dieSpan;
  if (!(room > 0) || !(gap > 0)) return 1;
  return Math.max(1, Math.floor(room / gap) + 1);
}

/** Footprint diameter used for present packing (largest die in the set). */
export function presentDieSpan(sidesList: readonly DiceSides[]): number {
  let max = dieScale(6);
  for (const s of sidesList) max = Math.max(max, dieScale(s));
  // Unit AABB meshes ≈ 1 across; small cushion so glyphs/edges don't kiss.
  return max * 1.08;
}

/**
 * Sort by sides ascending, then value ascending; pack into hover-plane rows
 * that actually fit the tray (column count computed before placement).
 */
export function computePresentLayout(
  dice: Array<{ id: string; sides: DiceSides; value: number }>,
  halfW: number = TRAY_HALF_W,
  halfD: number = TRAY_HALF_D,
): PresentSlot[] {
  const sorted = [...dice].sort((a, b) => {
    if (a.sides !== b.sides) return a.sides - b.sides;
    return a.value - b.value;
  });
  const n = sorted.length;
  if (n === 0) return [];

  const dieSpan = presentDieSpan(sorted.map((d) => d.sides));
  // Present sits at HOVER_Y — elevated dice project wider, so inset more than the rim.
  const edgePad = Math.max(0.28, dieSpan * 0.22);

  let gap = Math.max(DIE_GRID_GAP, dieSpan * 1.12);
  let maxCols = maxDiceAlongAxis(halfW, dieSpan, gap, edgePad);
  let maxRows = maxDiceAlongAxis(halfD, dieSpan, gap, edgePad);

  // Shrink spacing until the whole pool fits the tray grid (or gap hits a floor).
  const minGap = dieSpan * 1.02;
  while (maxCols * maxRows < n && gap > minGap + 1e-6) {
    gap = Math.max(minGap, gap * 0.92);
    maxCols = maxDiceAlongAxis(halfW, dieSpan, gap, edgePad);
    maxRows = maxDiceAlongAxis(halfD, dieSpan, gap, edgePad);
  }

  const cols = Math.min(maxCols, n);
  const rows = Math.ceil(n / cols) || 1;
  // Spread across rows as evenly as possible (e.g. 10 with max 7 → 5+5, not 7+3).
  const basePerRow = Math.floor(n / rows);
  const extra = n % rows;
  const slots: PresentSlot[] = [];

  let index = 0;
  for (let row = 0; row < rows; row++) {
    const rowCount = basePerRow + (row < extra ? 1 : 0);
    for (let col = 0; col < rowCount; col++) {
      const die = sorted[index++]!;
      const x = (col - (rowCount - 1) / 2) * gap;
      const z = ((rows - 1) / 2 - row) * gap;
      slots.push({
        id: die.id,
        sides: die.sides,
        value: die.value,
        x,
        z,
      });
    }
  }
  return slots;
}
