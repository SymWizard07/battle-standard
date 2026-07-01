/**
 * Run: npx tsx src/features/layout/layoutPanelChrome.test.ts
 */
import {
  layoutAfterExpandingOnePanel,
  resolveCollapseAssignmentPath,
} from './layoutPanelChrome';
import type { LayoutNode } from './schema/layoutSchema';

function assertClose(actual: number, expected: number, message?: string): void {
  if (Math.abs(actual - expected) > 0.1) {
    throw new Error(message ?? `Expected ~${expected} but got ${actual}`);
  }
}

function testExpandRestoresStoredSizes() {
  const children: LayoutNode[] = [
    { type: 'module', id: 'left', moduleId: 'scenes', collapse: 'left' },
    { type: 'playArea', id: 'center' },
    { type: 'module', id: 'right', moduleId: 'tokens', collapse: 'right' },
  ];
  const storedSizes = [18, 64, 18];
  const collapsedLayout = { left: 0, center: 82, right: 18 };

  const next = layoutAfterExpandingOnePanel(
    children,
    collapsedLayout,
    'left',
    storedSizes,
  );

  assertClose(next.left!, 18, 'left panel');
  assertClose(next.center!, 64, 'center panel');
  assertClose(next.right!, 18, 'right panel');
}

function testExpandKeepsOtherCollapsedPanelAtZero() {
  const children: LayoutNode[] = [
    { type: 'module', id: 'left', moduleId: 'scenes', collapse: 'left' },
    { type: 'playArea', id: 'center' },
    { type: 'module', id: 'right', moduleId: 'tokens', collapse: 'right' },
  ];
  const storedSizes = [18, 64, 18];
  const bothCollapsedLayout = { left: 0, center: 100, right: 0 };

  const next = layoutAfterExpandingOnePanel(
    children,
    bothCollapsedLayout,
    'left',
    storedSizes,
  );

  assertClose(next.left!, (18 / 82) * 100, 'left panel scaled');
  assertClose(next.center!, (64 / 82) * 100, 'center panel scaled');
  assertClose(next.right!, 0, 'right panel stays collapsed');
}

function testResolveCollapseAssignmentPath() {
  const tree: LayoutNode = {
    type: 'split',
    id: 'root',
    direction: 'row',
    sizes: [18, 64, 18],
    children: [
      {
        type: 'split',
        id: 'scenes-column',
        direction: 'col',
        sizes: [86, 14],
        children: [
          { type: 'module', id: 'scenes-pane', moduleId: 'scenes' },
          { type: 'module', id: 'settings-pane', moduleId: 'settings' },
        ],
      },
      { type: 'playArea', id: 'play-area' },
      { type: 'module', id: 'tokens-pane', moduleId: 'tokens' },
    ],
  };

  const scenesPanePath = resolveCollapseAssignmentPath(tree, [0, 0]);
  if (scenesPanePath.join('.') !== '0') {
    throw new Error(`Expected collapse on scenes-column split, got ${scenesPanePath.join('.')}`);
  }

  const tokensPath = resolveCollapseAssignmentPath(tree, [2]);
  if (tokensPath.join('.') !== '2') {
    throw new Error(`Expected collapse on tokens pane, got ${tokensPath.join('.')}`);
  }
}

function runTests() {
  testExpandRestoresStoredSizes();
  testExpandKeepsOtherCollapsedPanelAtZero();
  testResolveCollapseAssignmentPath();
  console.log('[automated] layoutPanelChrome tests passed');
}

runTests();
