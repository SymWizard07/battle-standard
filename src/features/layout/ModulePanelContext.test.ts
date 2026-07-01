import { mergeSharedEdges, sharedEdgesInSplit } from './ModulePanelContext';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// Default desktop: settings is bottom of left column, right of root row split.
const leftColumnInRootRow = sharedEdgesInSplit('row', 0, 3);
assert(leftColumnInRootRow.right, 'left column touches center on the right');

const settingsInScenesColumn = sharedEdgesInSplit('col', 1, 2);
assert(settingsInScenesColumn.top, 'settings touches scenes above');

const settingsEdges = mergeSharedEdges(leftColumnInRootRow, settingsInScenesColumn);
assert(settingsEdges.top && settingsEdges.right, 'settings has top and right borders');
assert(!settingsEdges.left && !settingsEdges.bottom, 'settings has no outer viewport borders');

const scenesEdges = mergeSharedEdges(leftColumnInRootRow, sharedEdgesInSplit('col', 0, 2));
assert(scenesEdges.right && scenesEdges.bottom, 'scenes has right and bottom borders');

console.log('ModulePanelContext.test.ts: ok');
