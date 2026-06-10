/**
 * Runnable with: npx tsx src/lib/cone5e.test.ts
 */
import {
  cone5eIncludedCells,
  cone5eOutlinePoints,
  gridCellsUnionOutline,
} from './measure';

const origin = { x: 25, y: 25 };

for (const deg of [0, 30, 45, 60, 90, 120, 135, 180, 225, 270]) {
  const dir = (deg * Math.PI) / 180;
  const t0 = Date.now();
  const cells = cone5eIncludedCells(origin, dir, 4);
  const outline = gridCellsUnionOutline(cells);
  const pts = cone5eOutlinePoints(origin, dir, 4);
  const ms = Date.now() - t0;
  if (cells.length === 0) throw new Error(`${deg}°: no cells`);
  if (outline.length < 3) throw new Error(`${deg}°: outline too short (${outline.length})`);
  if (pts.length < 6) throw new Error(`${deg}°: flat outline too short`);
  if (ms > 500) throw new Error(`${deg}°: too slow (${ms}ms)`);
  console.log(`${deg}° ok — cells=${cells.length} outline=${outline.length} (${ms}ms)`);
}

console.log('cone5e.test.ts: all passed');
