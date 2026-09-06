import {
  cloneLayout,
  createEmptyEditorLayout,
  ensureSettingsModule,
  layoutContainsModule,
  repairLayoutTree,
  sanitizeLayoutProfile,
  stripUnknownModules,
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

const withDeadHeader = {
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
    { type: 'module', id: 'tokens-pane', moduleId: 'tokens' },
  ],
} as LayoutNode;

const stripped = stripUnknownModules(cloneLayout(withDeadHeader));
assert(stripped != null, 'strip keeps tree');
assert(
  JSON.stringify(stripped).includes('sessionHeader') === false,
  'sessionHeader removed from tree',
);

const sanitized = sanitizeLayoutProfile(withDeadHeader, desktopDefault);
assert(validateLayout(sanitized) === null, 'sanitized dead-header layout validates');
assert(
  JSON.stringify(sanitized).includes('sessionHeader') === false,
  'sanitize drops dead header',
);
assert(layoutContainsModule(sanitized, 'settings'), 'sanitize keeps settings');

const fresh = sanitizeLayoutProfile(desktopDefault, desktopDefault);
assert(
  JSON.stringify(fresh) === JSON.stringify(sanitizeLayoutProfile(createDesktopDefaultLayout(), createDesktopDefaultLayout())),
  'new-user default matches reset sanitization of desktop default',
);

console.log('layoutSchema.test.ts: ok');
