/** Bottom toolbar height (`h-[80px]` on nav). */
export const TOOLBAR_HEIGHT_PX = 80;

/**
 * Fog strata icon width — matches nominal toolbar cell proportions.
 * The PNG is stretched with `object-fill` to the live button size.
 */
export const FOG_ICON_WIDTH_PX = 108;

export const FOG_STRATA_LINE_WIDTH_PX = 8;
export const FOG_LINE_GAP_PX = 12;
export const FOG_ROW_COUNT = 6;

export type FogStrataLine = { y: number; x0: number; x1: number };

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Split `total` into three segment lengths (px), each at least `minLen`. */
function threeSegmentLengths(rand: () => number, total: number, minLen: number): [number, number, number] {
  let a = minLen + rand() * (total - 3 * minLen);
  let b = minLen + rand() * (total - 3 * minLen);
  let c = total - a - b;
  if (c < minLen) {
    const slack = minLen - c;
    a = Math.max(minLen, a - slack / 2);
    b = Math.max(minLen, b - slack / 2);
    c = total - a - b;
  }
  return [a, b, c];
}

/**
 * Brick rows with variable segment lengths; each row bleeds past both icon edges.
 * Even rows start at -bleed; odd rows shift right by half a pitch (still past the left edge).
 */
function buildFogStrataLines(): FogStrataLine[] {
  const w = FOG_ICON_WIDTH_PX;
  const h = TOOLBAR_HEIGHT_PX;
  const lineW = FOG_STRATA_LINE_WIDTH_PX;
  const gap = FOG_LINE_GAP_PX;
  const rowCount = FOG_ROW_COUNT;
  const avgSeg = (w - 2 * gap) / 3;
  const brickOffset = (avgSeg + gap) / 2;
  const bleed = brickOffset + 4;
  const segTotal = w - 2 * gap + 2 * bleed;
  const edgeY = 4;
  const firstY = edgeY + lineW / 2;
  const lastY = h - edgeY - lineW / 2;
  const rowPitch = rowCount > 1 ? (lastY - firstY) / (rowCount - 1) : 0;
  const minSeg = segTotal * 0.16;
  const rand = mulberry32(0xf06f0a97);
  const lines: FogStrataLine[] = [];

  for (let row = 0; row < rowCount; row++) {
    const y = firstY + row * rowPitch;
    const xStart = -bleed + (row % 2 === 1 ? brickOffset : 0);
    const [len0, len1, len2] = threeSegmentLengths(rand, segTotal, minSeg);
    const lengths = [len0, len1, len2];
    let x = xStart;
    for (const len of lengths) {
      lines.push({ y, x0: x, x1: x + len });
      x += len + gap;
    }
  }
  return lines;
}

export const FOG_STRATA_LINES = buildFogStrataLines();
