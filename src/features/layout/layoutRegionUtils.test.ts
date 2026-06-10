import { analyzeLayoutRegions } from './layoutRegionUtils';
import { createDesktopDefaultLayout } from './layoutDefaults';
import type { LayoutNode } from './schema/layoutSchema';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const desktop = createDesktopDefaultLayout();
const desktopRegions = analyzeLayoutRegions(desktop);
assert(!desktopRegions.right.vacant, 'desktop default should not show vacant right');
assert(!desktopRegions.left.vacant, 'desktop default should not show vacant left');

const innerRightPanel: LayoutNode = {
  type: 'split',
  id: 'root',
  direction: 'row',
  sizes: [18, 82],
  children: [
    { type: 'module', id: 'scenes-pane', moduleId: 'scenes' },
    {
      type: 'split',
      id: 'center',
      direction: 'col',
      sizes: [8, 84, 8],
      children: [
        { type: 'module', id: 'session-header', moduleId: 'sessionHeader' },
        {
          type: 'split',
          id: 'play-row',
          direction: 'row',
          sizes: [70, 30],
          children: [
            { type: 'playArea', id: 'play-area' },
            { type: 'module', id: 'tokens-pane', moduleId: 'tokens' },
          ],
        },
        { type: 'module', id: 'toolbar-pane', moduleId: 'toolbar' },
      ],
    },
  ],
};

const innerRegions = analyzeLayoutRegions(innerRightPanel);
assert(
  !innerRegions.right.vacant,
  'right strip should hide when tokens sit beside play in a nested row (no root right column)',
);

assert(!desktopRegions.top.vacant, 'desktop default should not show vacant top');
assert(!desktopRegions.bottom.vacant, 'desktop default should not show vacant bottom');

const headerAndPlayOnly: LayoutNode = {
  type: 'split',
  id: 'root',
  direction: 'row',
  sizes: [18, 82],
  children: [
    { type: 'module', id: 'scenes-pane', moduleId: 'scenes' },
    {
      type: 'split',
      id: 'center',
      direction: 'col',
      sizes: [12, 88],
      children: [
        { type: 'module', id: 'session-header', moduleId: 'sessionHeader' },
        { type: 'playArea', id: 'play-area' },
      ],
    },
  ],
};

const headerPlayRegions = analyzeLayoutRegions(headerAndPlayOnly);
assert(!headerPlayRegions.top.vacant, 'top strip hidden when header module exists above play');
assert(
  !headerPlayRegions.bottom.vacant,
  'bottom strip hidden when there is no vacant bottom restore slot in the center column',
);

/** Log line 18: play at root index 2 — no fourth column, so no right restore slot. */
const playAsThirdRootChild: LayoutNode = {
  type: 'split',
  id: 'root',
  direction: 'row',
  sizes: [18, 64, 18],
  children: [
    { type: 'module', id: 'scenes-pane', moduleId: 'scenes' },
    {
      type: 'split',
      id: 'center',
      direction: 'col',
      sizes: [12, 88],
      children: [
        { type: 'module', id: 'session-header', moduleId: 'sessionHeader' },
        { type: 'module', id: 'toolbar-pane', moduleId: 'toolbar' },
      ],
    },
    { type: 'playArea', id: 'play-area' },
  ],
};

const thirdChildRegions = analyzeLayoutRegions(playAsThirdRootChild);
assert(
  thirdChildRegions.right.vacant,
  'right restore available when play is the last root row child (sidebar can be added)',
);

const playFirstInCenter: LayoutNode = {
  type: 'split',
  id: 'root',
  direction: 'row',
  sizes: [100],
  children: [
    {
      type: 'split',
      id: 'center',
      direction: 'col',
      sizes: [70, 30],
      children: [
        { type: 'playArea', id: 'play-area' },
        { type: 'module', id: 'toolbar-pane', moduleId: 'toolbar' },
      ],
    },
  ],
};

const playFirstRegions = analyzeLayoutRegions(playFirstInCenter);
assert(!playFirstRegions.bottom.vacant, 'bottom strip hidden when toolbar is below play in center col');

/** Play in root row beside a sibling col that holds header/toolbar (log line 15 case). */
const playBesideChromeCol: LayoutNode = {
  type: 'split',
  id: 'root',
  direction: 'row',
  sizes: [40, 60],
  children: [
    {
      type: 'split',
      id: 'chrome-col',
      direction: 'col',
      sizes: [12, 88],
      children: [
        { type: 'module', id: 'session-header', moduleId: 'sessionHeader' },
        { type: 'module', id: 'toolbar-pane', moduleId: 'toolbar' },
      ],
    },
    { type: 'playArea', id: 'play-area' },
  ],
};

const besideChromeRegions = analyzeLayoutRegions(playBesideChromeCol);
assert(
  !besideChromeRegions.top.vacant,
  'top strip hidden when header lives in sibling col while play is a root-row child',
);
assert(
  !besideChromeRegions.bottom.vacant,
  'bottom strip hidden when toolbar lives in sibling col while play is a root-row child',
);

/** Scenes docked beside play inside center; root left sidebar slot is gone (log line 27 class). */
const scenesBesidePlayInCenter: LayoutNode = {
  type: 'split',
  id: 'root',
  direction: 'col',
  sizes: [75, 25],
  children: [
    {
      type: 'split',
      id: 'center',
      direction: 'col',
      sizes: [10, 80, 10],
      children: [
        { type: 'module', id: 'session-header', moduleId: 'sessionHeader' },
        {
          type: 'split',
          id: 'play-row',
          direction: 'row',
          sizes: [30, 70],
          children: [
            { type: 'module', id: 'scenes-pane', moduleId: 'scenes' },
            { type: 'playArea', id: 'play-area' },
          ],
        },
        { type: 'module', id: 'toolbar-pane', moduleId: 'toolbar' },
      ],
    },
    { type: 'module', id: 'tokens-pane', moduleId: 'tokens' },
  ],
};

const besidePlayRegions = analyzeLayoutRegions(scenesBesidePlayInCenter);
assert(
  besidePlayRegions.left.vacant,
  'left restore shows when sidebar module moved into center edge-split (no outer row shell)',
);

const centerColumnOnly: LayoutNode = {
  type: 'split',
  id: 'root',
  direction: 'row',
  sizes: [100],
  children: [
    {
      type: 'split',
      id: 'center',
      direction: 'col',
      sizes: [8, 84, 8],
      children: [
        { type: 'module', id: 'session-header', moduleId: 'sessionHeader' },
        { type: 'playArea', id: 'play-area' },
        { type: 'module', id: 'toolbar-pane', moduleId: 'toolbar' },
      ],
    },
  ],
};

const centerOnlyRegions = analyzeLayoutRegions(centerColumnOnly);
assert(centerOnlyRegions.left.vacant, 'left restore shows when sidebars were removed and center is the only root child');
assert(centerOnlyRegions.right.vacant, 'right restore shows when sidebars were removed and center is the only root child');

console.log('layoutRegionUtils.test.ts: ok');
