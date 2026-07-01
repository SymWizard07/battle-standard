import {
  findActiveSeparatorIndex,
  highlightIdsForPanelSizeSnap,
  layoutWithBoundaryPercent,
  PANEL_DESIGN_RATIOS,
} from './panelResizeSnap';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(findActiveSeparatorIndex(['a', 'b', 'c'], { a: 20, b: 60, c: 20 }, { a: 25, b: 55, c: 20 }) === 0, 'first separator');

const snapped = layoutWithBoundaryPercent(['a', 'b'], { a: 18, b: 82 }, 0, 25);
assert(Math.abs(snapped.a! - 25) < 0.01, 'left panel grows to boundary');
assert(Math.abs(snapped.b! - 75) < 0.01, 'right panel shrinks to boundary');

assert(PANEL_DESIGN_RATIOS.includes(0.618), 'includes golden ratio');

const highlight = highlightIdsForPanelSizeSnap(
  { kind: 'panel-size', value: 180, panelId: 'tokens-pane', side: 'leading' },
  ['scenes-pane', 'center'],
  0,
);
assert(
  highlight.includes('tokens-pane') && highlight.includes('scenes-pane') && highlight.length === 2,
  'highlights source and resizing panel only',
);

console.log('panelResizeSnap.test.ts: ok');
