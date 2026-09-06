import type { DeviceClass, LayoutNode, LayoutProfiles, SplitLayoutNode } from './schema/layoutSchema';
import { createEmptyEditorLayout, sanitizeLayoutProfile } from './schema/layoutSchema';

export { createEmptyEditorLayout };

function id(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function createScenesColumn(collapse?: 'left' | 'right' | 'top' | 'bottom'): SplitLayoutNode {
  return {
    type: 'split',
    id: 'scenes-column',
    direction: 'col',
    sizes: [86, 14],
    ...(collapse != null ? { collapse } : {}),
    children: [
      {
        type: 'tabs',
        id: 'scenes-tabs',
        activeTabId: 'tab-scenes',
        tabs: [
          { id: 'tab-scenes', moduleId: 'scenes', title: 'Scenes' },
          { id: 'tab-initiative', moduleId: 'initiative', title: 'Initiative' },
        ],
      },
      { type: 'module', id: 'settings-pane', moduleId: 'settings' },
    ],
  };
}

/**
 * Canonical desktop preset — sole source of truth for new users and Reset desktop.
 * Campaigns navigation lives in the settings module (not a separate top-bar module).
 */
export function createDesktopDefaultLayout(): LayoutNode {
  return {
    type: 'split',
    id: 'root',
    direction: 'row',
    sizes: [18, 64, 18],
    children: [
      createScenesColumn('left'),
      {
        type: 'split',
        id: 'center',
        direction: 'col',
        sizes: [8, 84, 8],
        children: [
          { type: 'module', id: 'tool-options', moduleId: 'toolOptions' },
          { type: 'playArea', id: 'play-area' },
          { type: 'module', id: 'toolbar-pane', moduleId: 'toolbar' },
        ],
      },
      {
        type: 'tabs',
        id: 'tokens-tabs',
        activeTabId: 'tab-tokens',
        collapse: 'right',
        tabs: [
          { id: 'tab-tokens', moduleId: 'tokens', title: 'Tokens' },
          { id: 'tab-imports', moduleId: 'imports', title: 'Appearance' },
        ],
      },
    ],
  };
}

export function createTabletDefaultLayout(): LayoutNode {
  return {
    type: 'split',
    id: 'root',
    direction: 'row',
    sizes: [28, 72],
    children: [
      {
        type: 'split',
        id: 'left-column',
        direction: 'col',
        sizes: [90, 10],
        children: [
          {
            type: 'tabs',
            id: 'left-tabs',
            activeTabId: 'tab-scenes',
            tabs: [
              { id: 'tab-scenes', moduleId: 'scenes', title: 'Scenes' },
              { id: 'tab-initiative', moduleId: 'initiative', title: 'Initiative' },
              { id: 'tab-tokens', moduleId: 'tokens', title: 'Tokens' },
              { id: 'tab-imports', moduleId: 'imports', title: 'Appearance' },
            ],
          },
          { type: 'module', id: 'settings-pane', moduleId: 'settings' },
        ],
      },
      {
        type: 'split',
        id: 'center',
        direction: 'col',
        sizes: [10, 82, 8],
        children: [
          { type: 'module', id: 'tool-options', moduleId: 'toolOptions' },
          { type: 'playArea', id: 'play-area' },
          { type: 'module', id: 'toolbar-pane', moduleId: 'toolbar' },
        ],
      },
    ],
  };
}

export function createMobileDefaultLayout(): LayoutNode {
  return {
    type: 'split',
    id: 'root',
    direction: 'col',
    sizes: [22, 70, 8],
    children: [
      {
        type: 'split',
        id: 'top-stack',
        direction: 'col',
        sizes: [88, 12],
        children: [
          {
            type: 'tabs',
            id: 'top-tabs',
            activeTabId: 'tab-scenes',
            tabs: [
              { id: 'tab-scenes', moduleId: 'scenes', title: 'Scenes' },
              { id: 'tab-initiative', moduleId: 'initiative', title: 'Initiative' },
              { id: 'tab-tokens', moduleId: 'tokens', title: 'Tokens' },
              { id: 'tab-imports', moduleId: 'imports', title: 'Appearance' },
              { id: 'tab-info', moduleId: 'info', title: 'Help' },
            ],
          },
          { type: 'module', id: 'settings-pane', moduleId: 'settings' },
        ],
      },
      { type: 'playArea', id: 'play-area' },
      { type: 'module', id: 'toolbar-pane', moduleId: 'toolbar' },
    ],
  };
}

export function defaultLayoutForDevice(device: DeviceClass): LayoutNode {
  switch (device) {
    case 'desktop':
      return createDesktopDefaultLayout();
    case 'tablet':
      return createTabletDefaultLayout();
    case 'mobile':
      return createMobileDefaultLayout();
  }
}

/** Fresh profiles for first launch — same trees Reset desktop/tablet/mobile restore. */
export function createDefaultLayoutProfiles(): LayoutProfiles {
  return {
    desktop: sanitizeLayoutProfile(
      createDesktopDefaultLayout(),
      createDesktopDefaultLayout(),
    ),
    tablet: sanitizeLayoutProfile(
      createTabletDefaultLayout(),
      createTabletDefaultLayout(),
    ),
    mobile: sanitizeLayoutProfile(
      createMobileDefaultLayout(),
      createMobileDefaultLayout(),
    ),
  };
}

export { id as newLayoutNodeId };
