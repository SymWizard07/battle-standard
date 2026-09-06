export const MODULE_IDS = [
  'scenes',
  'initiative',
  'tokens',
  'imports',
  'settings',
  'toolbar',
  'toolOptions',
  'canvas',
  'info',
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export type DeviceClass = 'desktop' | 'tablet' | 'mobile';

/** Direction the panel collapses; the control is placed on the opposite edge. */
export type CollapseDirection = 'left' | 'right' | 'top' | 'bottom';

export type LayoutTab = {
  id: string;
  moduleId: ModuleId;
  title: string;
};

export type SplitLayoutNode = {
  type: 'split';
  id: string;
  direction: 'row' | 'col';
  sizes: number[];
  children: LayoutNode[];
  collapse?: CollapseDirection;
};

export type TabsLayoutNode = {
  type: 'tabs';
  id: string;
  activeTabId: string;
  tabs: LayoutTab[];
  collapse?: CollapseDirection;
};

export type ModuleLayoutNode = {
  type: 'module';
  id: string;
  moduleId: ModuleId;
  collapse?: CollapseDirection;
};

export type PlayAreaLayoutNode = {
  type: 'playArea';
  id: string;
};

/** Layout editor placeholder before any modules are placed. */
export type EmptyLayoutNode = {
  type: 'empty';
  id: string;
};

export type LayoutNode =
  | SplitLayoutNode
  | TabsLayoutNode
  | ModuleLayoutNode
  | PlayAreaLayoutNode
  | EmptyLayoutNode;

export function createEmptyEditorLayout(): LayoutNode {
  return { type: 'empty', id: 'layout-empty' };
}

export type LayoutProfiles = Record<DeviceClass, LayoutNode>;

export const MODULE_LABELS: Record<ModuleId, string> = {
  scenes: 'Scenes',
  initiative: 'Initiative',
  tokens: 'Tokens',
  imports: 'Appearance',
  settings: 'Settings',
  toolbar: 'Toolbar',
  toolOptions: 'Tool options',
  canvas: 'Play area',
  info: 'Help',
};

export function isModuleId(value: string): value is ModuleId {
  return (MODULE_IDS as readonly string[]).includes(value);
}

/** When a tab group has one tab left, expand it back to a full module panel. */
export function collapseTabsIfAlone(node: LayoutNode): LayoutNode {
  if (node.type !== 'tabs') return node;
  if (node.tabs.length === 0) {
    return { type: 'module', id: node.id, moduleId: 'info' };
  }
  if (node.tabs.length === 1) {
    const tab = node.tabs[0]!;
    if (tab.moduleId === 'canvas') {
      return { type: 'playArea', id: node.id };
    }
    return {
      type: 'module',
      id: node.id,
      moduleId: tab.moduleId,
      ...(node.collapse != null ? { collapse: node.collapse } : {}),
    };
  }
  return node;
}

export function countPlayAreas(node: LayoutNode): number {
  if (node.type === 'empty') return 0;
  if (node.type === 'playArea') return 1;
  if (node.type === 'module') return node.moduleId === 'canvas' ? 1 : 0;
  if (node.type === 'tabs') {
    return node.tabs.reduce((n, t) => n + (t.moduleId === 'canvas' ? 1 : 0), 0);
  }
  return node.children.reduce((n, c) => n + countPlayAreas(c), 0);
}

export function layoutContainsModule(node: LayoutNode, moduleId: ModuleId): boolean {
  if (node.type === 'empty') return false;
  if (node.type === 'module') return node.moduleId === moduleId;
  if (node.type === 'playArea') return moduleId === 'canvas';
  if (node.type === 'tabs') {
    return node.tabs.some((tab) => tab.moduleId === moduleId);
  }
  return node.children.some((child) => layoutContainsModule(child, moduleId));
}

const SETTINGS_PANE: ModuleLayoutNode = {
  type: 'module',
  id: 'settings-pane',
  moduleId: 'settings',
};

function wrapWithSettingsBelow(
  node: LayoutNode,
  scenesSizes: [number, number] = [86, 14],
): SplitLayoutNode {
  const collapse =
    node.type === 'module' || node.type === 'tabs' || node.type === 'split'
      ? node.collapse
      : undefined;
  const inner =
    node.type === 'module' && node.collapse != null
      ? ({ type: 'module', id: node.id, moduleId: node.moduleId } satisfies ModuleLayoutNode)
      : node.type === 'tabs' && node.collapse != null
        ? { ...node, collapse: undefined }
        : node.type === 'split' && node.collapse != null
          ? { ...node, collapse: undefined }
          : node;

  return {
    type: 'split',
    id: `${node.id}-column`,
    direction: 'col',
    sizes: [...scenesSizes],
    ...(collapse != null ? { collapse } : {}),
    children: [inner, { ...SETTINGS_PANE }],
  };
}

/** Inject a settings module below scenes (or scene tabs) when missing from saved layouts. */
export function ensureSettingsModule(node: LayoutNode): LayoutNode {
  if (node.type === 'empty' || layoutContainsModule(node, 'settings')) {
    return node;
  }

  if (node.type === 'module' && node.moduleId === 'scenes') {
    return wrapWithSettingsBelow(node);
  }

  if (node.type === 'tabs' && node.tabs.some((tab) => tab.moduleId === 'scenes')) {
    return wrapWithSettingsBelow(node, [90, 10]);
  }

  if (node.type === 'split') {
    return {
      ...node,
      children: node.children.map((child) => ensureSettingsModule(child)),
    };
  }

  return node;
}

export function validateLayout(node: LayoutNode, isRoot = true): string | null {
  if (node.type === 'empty') {
    if (!isRoot) return 'Empty layout node must be at root';
    return null;
  }
  if (isRoot) {
    const playAreas = countPlayAreas(node);
    if (playAreas > 1) {
      return `Layout must contain at most one play area (found ${playAreas})`;
    }
    if (!layoutContainsModule(node, 'settings')) {
      return 'Layout must include a settings module';
    }
  }
  if (node.type === 'split') {
    if (node.children.length < 1) return 'Split must have at least one child';
    if (node.sizes.length !== node.children.length) {
      return 'Split sizes must match child count';
    }
    for (const child of node.children) {
      const err = validateLayout(child, false);
      if (err) return err;
    }
  }
  if (node.type === 'tabs') {
    if (node.tabs.length < 1) return 'Tab group must have at least one tab';
    if (!node.tabs.some((t) => t.id === node.activeTabId)) {
      return 'Active tab id must exist in tabs';
    }
    for (const tab of node.tabs) {
      if (!isModuleId(tab.moduleId)) return `Invalid module id: ${tab.moduleId}`;
    }
  }
  if (node.type === 'module' && !isModuleId(node.moduleId)) {
    return `Invalid module id: ${node.moduleId}`;
  }
  return null;
}

export function cloneLayout(node: LayoutNode): LayoutNode {
  if (node.type === 'split') {
    return {
      ...node,
      sizes: [...node.sizes],
      children: node.children.map(cloneLayout),
    };
  }
  if (node.type === 'tabs') {
    return { ...node, tabs: node.tabs.map((t) => ({ ...t })) };
  }
  return { ...node };
}

/**
 * Drop modules/tabs whose ids are no longer in MODULE_IDS (removed “dead” modules).
 * Returns null when the node itself should be removed from its parent.
 */
export function stripUnknownModules(node: LayoutNode): LayoutNode | null {
  if (node.type === 'empty' || node.type === 'playArea') return node;

  if (node.type === 'module') {
    return isModuleId(node.moduleId) ? node : null;
  }

  if (node.type === 'tabs') {
    const tabs = node.tabs
      .filter((tab) => isModuleId(tab.moduleId))
      .map((tab) => ({
        ...tab,
        title: MODULE_LABELS[tab.moduleId],
      }));
    if (tabs.length === 0) return null;
    const activeTabId = tabs.some((t) => t.id === node.activeTabId)
      ? node.activeTabId
      : tabs[0]!.id;
    return collapseTabsIfAlone({ ...node, tabs, activeTabId });
  }

  const children: LayoutNode[] = [];
  for (const child of node.children) {
    const next = stripUnknownModules(child);
    if (next) children.push(next);
  }
  if (children.length === 0) return null;
  if (children.length === 1) return children[0]!;
  return {
    ...node,
    children,
    sizes: normalizeSplitSizes(node.sizes, children.length),
  };
}

/**
 * Normalize a saved or draft tree: strip dead modules, inject settings if needed,
 * repair structure, validate. Falls back to `fallback` when the result is unusable.
 */
export function sanitizeLayoutProfile(node: LayoutNode, fallback: LayoutNode): LayoutNode {
  const stripped = stripUnknownModules(cloneLayout(node));
  if (!stripped || stripped.type === 'empty') {
    return cloneLayout(fallback);
  }
  const repaired = repairLayoutTree(ensureSettingsModule(stripped));
  const err = validateLayout(repaired);
  if (err) {
    console.warn(`Layout sanitization failed (${err}); using default`);
    return cloneLayout(fallback);
  }
  return repaired;
}

function normalizeSplitSizes(sizes: number[], count: number): number[] {
  if (count < 1) return [];
  if (sizes.length !== count) {
    return Array.from({ length: count }, () => 100 / count);
  }
  const total = sizes.reduce((a, b) => a + b, 0) || 1;
  return sizes.map((s) => (s / total) * 100);
}

/** Count module, play-area, or tab-group panels in the tree. */
export function countLayoutPanels(node: LayoutNode): number {
  if (node.type === 'empty') return 0;
  if (node.type === 'module' || node.type === 'playArea' || node.type === 'tabs') return 1;
  if (node.type === 'split') {
    return node.children.reduce((n, child) => n + countLayoutPanels(child), 0);
  }
  return 0;
}

function findOnlyPanelNode(node: LayoutNode): LayoutNode | null {
  if (node.type === 'module' || node.type === 'playArea' || node.type === 'tabs') {
    return node;
  }
  if (node.type === 'split') {
    for (const child of node.children) {
      const found = findOnlyPanelNode(child);
      if (found) return found;
    }
  }
  return null;
}

/** When the layout is a single panel, store it at the root so the live shell fills the viewport. */
export function hoistSolePanelLayout(node: LayoutNode): LayoutNode {
  if (countLayoutPanels(node) !== 1) return node;
  const panel = findOnlyPanelNode(node);
  return panel ?? node;
}

export function repairLayoutTree(node: LayoutNode): LayoutNode {
  let repaired: LayoutNode;
  if (node.type === 'empty') {
    repaired = node;
  } else if (node.type === 'split') {
    const children = node.children.map(repairLayoutTree);
    if (children.length === 0) repaired = createEmptyEditorLayout();
    else if (children.length === 1) repaired = children[0]!;
    else {
      repaired = {
        ...node,
        children,
        sizes: normalizeSplitSizes(node.sizes, children.length),
      };
    }
  } else if (node.type === 'tabs') {
    const tabs = node.tabs.map((t) => ({ ...t }));
    const activeTabId = tabs.some((t) => t.id === node.activeTabId)
      ? node.activeTabId
      : tabs[0]?.id ?? node.activeTabId;
    repaired = collapseTabsIfAlone({ ...node, tabs, activeTabId });
  } else {
    repaired = { ...node };
  }
  return hoistSolePanelLayout(repaired);
}

export function validateLayoutProfiles(profiles: LayoutProfiles): string | null {
  for (const device of ['desktop', 'tablet', 'mobile'] as const) {
    const err = validateLayout(repairLayoutTree(cloneLayout(profiles[device])));
    if (err) return `${device}: ${err}`;
  }
  return null;
}
