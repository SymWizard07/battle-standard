import {
  cloneLayout,
  createEmptyEditorLayout,
  ensureSettingsModule,
  layoutContainsModule,
  repairLayoutTree,
  validateLayout,
  validateLayoutProfiles,
  type LayoutNode,
} from './layoutSchema';
import { createDesktopDefaultLayout } from '../layoutDefaults';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const desktopDefault = createDesktopDefaultLayout();

assert(layoutContainsModule(desktopDefault, 'settings'), 'desktop default includes settings');
assert(validateLayout(desktopDefault) === null, 'desktop default validates');

const withoutSettings: LayoutNode = {
  type: 'split',
  id: 'root',
  direction: 'row',
  sizes: [18, 82],
  children: [
    { type: 'module', id: 'scenes-pane', moduleId: 'scenes' },
    { type: 'playArea', id: 'play-area' },
  ],
};

assert(
  validateLayout(withoutSettings) === 'Layout must include a settings module',
  'missing settings fails validation',
);

const migrated = repairLayoutTree(ensureSettingsModule(cloneLayout(withoutSettings)));
assert(layoutContainsModule(migrated, 'settings'), 'migration injects settings');
assert(validateLayout(migrated) === null, 'migrated layout validates');

const profiles = {
  desktop: withoutSettings,
  tablet: withoutSettings,
  mobile: withoutSettings,
};
assert(
  validateLayoutProfiles(profiles)?.startsWith('desktop:') === true,
  'validateLayoutProfiles reports device errors',
);

assert(validateLayout(createEmptyEditorLayout()) === null, 'empty editor layout is allowed');

console.log('layoutSchema.test.ts: ok');
