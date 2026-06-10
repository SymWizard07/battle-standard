import type { CSSProperties } from 'react';
import { GRID_SIZE_PX } from '../../lib/fixedGrid';

const GRID_LINE = 'rgba(148, 163, 184, 0.52)';

/** SVG tile — integer cell size avoids gradient subpixel seams when repeated. */
function gridPatternDataUrl(lineColor: string, cellPx: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cellPx}" height="${cellPx}">` +
    `<path d="M ${cellPx} 0 L 0 0 0 ${cellPx}" fill="none" stroke="${lineColor}" stroke-width="1" shape-rendering="crispEdges"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export const playAreaGridBackgroundStyle: CSSProperties = {
  backgroundColor: '#020617',
  backgroundImage: gridPatternDataUrl(GRID_LINE, GRID_SIZE_PX),
  backgroundSize: `${GRID_SIZE_PX}px ${GRID_SIZE_PX}px`,
  backgroundPosition: '0 0',
  backgroundRepeat: 'repeat',
};
