import type { DeviceClass, LayoutNode, LayoutProfiles } from './schema/layoutSchema';
import { createEmptyEditorLayout } from './schema/layoutSchema';

export { createEmptyEditorLayout };

function id(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Stable ids for default presets (re-created on reset). */
export function createDesktopDefaultLayout(): LayoutNode {
  return {
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
        sizes: [8, 84, 8],
        children: [
          {
            type: 'split',
            id: 'header-row',
            direction: 'row',
            sizes: [35, 65],
            children: [
              { type: 'module', id: 'session-header', moduleId: 'sessionHeader' },
              { type: 'module', id: 'tool-options', moduleId: 'toolOptions' },
            ],
          },
          { type: 'playArea', id: 'play-area' },
          { type: 'module', id: 'toolbar-pane', moduleId: 'toolbar' },
        ],
      },
      { type: 'module', id: 'tokens-pane', moduleId: 'tokens' },
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
        type: 'tabs',
        id: 'left-tabs',
        activeTabId: 'tab-scenes',
        tabs: [
          { id: 'tab-scenes', moduleId: 'scenes', title: 'Scenes' },
          { id: 'tab-tokens', moduleId: 'tokens', title: 'Tokens' },
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
        type: 'tabs',
        id: 'top-tabs',
        activeTabId: 'tab-scenes',
        tabs: [
          { id: 'tab-scenes', moduleId: 'scenes', title: 'Scenes' },
          { id: 'tab-tokens', moduleId: 'tokens', title: 'Tokens' },
          { id: 'tab-info', moduleId: 'info', title: 'Help' },
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

export function createDefaultLayoutProfiles(): LayoutProfiles {
  return {
    desktop: createDesktopDefaultLayout(),
    tablet: createTabletDefaultLayout(),
    mobile: createMobileDefaultLayout(),
  };
}

/** Apply legacy sidebar collapse flags to desktop layout. */
export function applyLegacyCollapse(
  layout: LayoutNode,
  leftCollapsed: boolean,
  rightCollapsed: boolean,
): LayoutNode {
  if (!leftCollapsed && !rightCollapsed) return layout;
  const root = layout;
  if (root.type !== 'split' || root.direction !== 'row' || root.children.length !== 3) {
    return layout;
  }
  const sizes = [...root.sizes];
  if (leftCollapsed) {
    sizes[0] = 0;
    sizes[1] += root.sizes[0] ?? 0;
  }
  if (rightCollapsed) {
    sizes[2] = 0;
    sizes[1] += root.sizes[2] ?? 0;
  }
  return { ...root, sizes };
}

export { id as newLayoutNodeId };
