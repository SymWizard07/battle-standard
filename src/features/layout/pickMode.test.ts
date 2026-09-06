import {
  layoutPickModeFromFlags,
  pickPanelRole,
} from './pickMode';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const libraryPick = layoutPickModeFromFlags({
  initiativeTokenPickActive: true,
  importsTokenPickActive: true,
  libraryEntryPickActive: true,
});
assert(libraryPick.sourceModuleId === 'tokens', 'library pick preferred');
assert(libraryPick.hostModuleId === 'imports', 'library pick hosts in imports');

const playPick = layoutPickModeFromFlags({
  initiativeTokenPickActive: false,
  importsTokenPickActive: true,
  libraryEntryPickActive: false,
});
assert(playPick.sourceModuleId === 'canvas', 'play pick sources canvas');
assert(playPick.hostModuleId === 'imports', 'play pick hosts in imports');

assert(pickPanelRole(['tokens', 'scenes'], libraryPick) === 'source', 'source panel');
assert(pickPanelRole(['imports'], libraryPick) === 'host', 'host panel');
assert(pickPanelRole(['settings', 'toolbar'], libraryPick) === 'locked', 'locked panel');
assert(
  pickPanelRole(['imports', 'tokens'], libraryPick) === 'source',
  'shared tabs with source stay interactive',
);

console.log('pickMode.test.ts: ok');
