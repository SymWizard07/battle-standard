/**
 * Runnable with: npx tsx src/lib/measure.test.ts
 */
import {
  cone5eIncludedCells,
  coneVttWedgePoints,
  cube5eIncludedCells,
  distanceFt5e,
  gridCellsUnionBoundarySegments,
  gridCellsUnionOutline,
  isPointInCone5e,
  isPointInConeVtt,
  line5eIncludedCells,
  sphere5eIncludedCells,
} from './measure';
import { GRID_SIZE_PX } from './fixedGrid';
import { gridCellToWorldCenter } from './grid';

function assertEqual(actual: number, expected: number, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${expected} but got ${actual}`);
  }
}

const cellFt = 5;
const origin = { col: 0, row: 0 };

assertEqual(distanceFt5e(origin, { col: 3, row: 0 }, cellFt, false), 15, 'chebyshev straight');
assertEqual(distanceFt5e(origin, { col: 3, row: 3 }, cellFt, false), 15, 'chebyshev diagonal');

assertEqual(distanceFt5e(origin, { col: 1, row: 1 }, cellFt, true), 5, 'alt 1 diagonal');
assertEqual(distanceFt5e(origin, { col: 2, row: 2 }, cellFt, true), 15, 'alt 2 diagonals');
assertEqual(distanceFt5e(origin, { col: 3, row: 3 }, cellFt, true), 20, 'alt 3 diagonals');
assertEqual(distanceFt5e(origin, { col: 4, row: 4 }, cellFt, true), 30, 'alt 4 diagonals');
assertEqual(distanceFt5e(origin, { col: 5, row: 2 }, cellFt, true), 30, 'alt 2 diag + 3 straight');

const coneOrigin = { x: 0, y: GRID_SIZE_PX / 2 };
assertEqual(
  cone5eIncludedCells(coneOrigin, 0, 3).length,
  12,
  '5e east cone length 3 (PHB center rule)',
);
function assertTrue(value: boolean, message?: string): void {
  if (!value) throw new Error(message ?? 'Assertion failed');
}

assertTrue(
  isPointInCone5e(gridCellToWorldCenter({ col: 2, row: 0 }), coneOrigin, 0, 3),
  'center of third row cell on axis',
);
assertTrue(
  isPointInCone5e(gridCellToWorldCenter({ col: 3, row: 2 }), coneOrigin, 0, 3),
  'corner cell in third row of 5e cone',
);
assertTrue(
  !isPointInCone5e(gridCellToWorldCenter({ col: 0, row: 0 }), { x: 25, y: 25 }, 0, 3),
  'caster cell excluded when origin is at its center',
);
const outline = gridCellsUnionOutline(cone5eIncludedCells(coneOrigin, 0, 2));
if (outline.length < 4) throw new Error('5e cone outline is closed polygon');

const vttOrigin = { x: 100, y: 100 };
const vttLen = 80;
const vttDir = Math.PI / 4;
const vttPts = coneVttWedgePoints(vttOrigin, vttDir, vttLen);
if (vttPts.length !== 6) throw new Error('VTT wedge is flat-base triangle');
if (vttPts[0] !== vttOrigin.x || vttPts[1] !== vttOrigin.y) {
  throw new Error('VTT wedge starts at origin');
}
const baseDx = vttPts[4]! - vttPts[2]!;
const baseDy = vttPts[5]! - vttPts[3]!;
const baseWidth = Math.hypot(baseDx, baseDy);
if (Math.abs(baseWidth - vttLen) > 0.01) {
  throw new Error(`VTT base width should equal height (${baseWidth} vs ${vttLen})`);
}
assertTrue(
  isPointInConeVtt({ x: 140, y: 140 }, vttOrigin, vttDir, vttLen),
  'point on VTT cone axis',
);
assertTrue(
  !isPointInConeVtt({ x: 60, y: 140 }, vttOrigin, vttDir, vttLen),
  'point outside VTT cone',
);

assertEqual(cube5eIncludedCells({ col: 0, row: 0 }, 1).length, 9, '3x3 cube');
assertEqual(
  line5eIncludedCells({ x: 25, y: 25 }, { x: 125, y: 25 }).length,
  3,
  'horizontal line cells',
);
assertTrue(
  sphere5eIncludedCells({
    center: { col: 0, row: 0 },
    radiusCells: 1,
    origin: { x: 25, y: 25 },
    radiusWorld: 75,
  }).length >= 9,
  'VTT-radius sphere includes all overlapped cells',
);

const vttSphere = {
  center: { col: 0, row: 0 },
  radiusCells: 0,
  origin: { x: 25, y: 25 },
  radiusWorld: 50,
};
const vttCells = sphere5eIncludedCells(vttSphere);
if (!vttCells.some((c) => c.col === 1 && c.row === 0)) {
  throw new Error('5e sphere should include east cell when VTT circle reaches it');
}

const cubeCells = cube5eIncludedCells({ col: 0, row: 0 }, 1);
assertEqual(
  gridCellsUnionBoundarySegments(cubeCells).length,
  12,
  '3x3 cube has 12 boundary edges',
);
for (const [a, b] of gridCellsUnionBoundarySegments(cubeCells)) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (Math.abs(len - GRID_SIZE_PX) > 0.01) {
    throw new Error(`cube segment length ${len} expected ${GRID_SIZE_PX}`);
  }
}

const lShape = [
  { col: 0, row: 0 },
  { col: 1, row: 0 },
  { col: 0, row: 1 },
];
assertEqual(
  gridCellsUnionBoundarySegments(lShape).length,
  8,
  'L-shape has 8 boundary edges',
);

const stairLine = line5eIncludedCells({ x: 25, y: 25 }, { x: 125, y: 75 });
const stairSegs = gridCellsUnionBoundarySegments(stairLine);
if (stairSegs.length < 8) {
  throw new Error(`diagonal line outline too short (${stairSegs.length})`);
}

console.log('measure.test.ts: all passed');
